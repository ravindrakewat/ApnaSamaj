import { APP_CONFIG } from '../constants/config';
import { ApiError, HttpMethod, RequestOptions } from './types';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
} from '../services/storage.service';

export type TokenUpdateListener = (tokens: { accessToken: string; refreshToken: string }) => void;
export type SessionPurgeListener = () => void;

let tokenUpdateListeners: TokenUpdateListener[] = [];
let sessionPurgeListeners: SessionPurgeListener[] = [];

export function onTokenUpdated(listener: TokenUpdateListener): () => void {
  tokenUpdateListeners.push(listener);
  return () => {
    tokenUpdateListeners = tokenUpdateListeners.filter((l) => l !== listener);
  };
}

export function onSessionPurged(listener: SessionPurgeListener): () => void {
  sessionPurgeListeners.push(listener);
  return () => {
    sessionPurgeListeners = sessionPurgeListeners.filter((l) => l !== listener);
  };
}

function notifyTokenUpdated(tokens: { accessToken: string; refreshToken: string }) {
  tokenUpdateListeners.forEach((l) => l(tokens));
}

function notifySessionPurged() {
  sessionPurgeListeners.forEach((l) => l());
}

type RefreshSubscriber = (newToken: string | null, error?: unknown) => void;
let isRefreshing = false;
let refreshSubscribers: RefreshSubscriber[] = [];

function onTokenRefreshed(newToken: string | null, error?: unknown) {
  refreshSubscribers.forEach((cb) => cb(newToken, error));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: RefreshSubscriber) {
  refreshSubscribers.push(cb);
}

/**
 * Lightweight, centralized fetch-based API client for Apna Samaj Mobile.
 * Built without heavy external libraries for maximum performance on Android.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = APP_CONFIG.apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Executes a typed HTTP request with timeouts, auth injection, and error formatting.
   */
  public async request<T = unknown>(
    endpoint: string,
    method: HttpMethod = 'GET',
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(endpoint, options.params);
    const timeout = options.timeoutMs || APP_CONFIG.requestTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
      const headers = await this.buildHeaders(options);
      if (isFormData) {
        delete headers['Content-Type'];
      }

      let body: any;
      if (options.body && method !== 'GET') {
        body = isFormData ? options.body : JSON.stringify(options.body);
      }

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 Unauthorized with automatic refresh token rotation (max 1 retry)
      if (response.status === 401 && !options.skipAuth && !options._isRetry) {
        return this.handleUnauthorizedRetry<T>(endpoint, method, { ...options, _isRetry: true });
      }

      const rawJson = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          rawJson?.error ||
          rawJson?.message ||
          `Request failed with status code ${response.status}`;
        throw new ApiError(errorMessage, response.status, rawJson);
      }

      return rawJson as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(
          'Network request timed out. Please check your connection.',
          408
        );
      }

      const message =
        err instanceof Error ? err.message : 'A network error occurred. Please try again.';
      throw new ApiError(message, 0);
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'GET', options);
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'POST', { ...options, body });
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'PUT', { ...options, body });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'PATCH', { ...options, body });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'DELETE', options);
  }

  public upload<T>(endpoint: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, 'POST', { ...options, body: formData });
  }

  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let fullUrl = `${this.baseUrl}${cleanEndpoint}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      });
      const query = searchParams.toString();
      if (query) {
        fullUrl += `?${query}`;
      }
    }
    return fullUrl;
  }

  private async buildHeaders(options: RequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Inject community tenant context
    const communitySlug = options.communitySlug || (await getStoredCommunitySlug());
    if (communitySlug) {
      headers['x-community-slug'] = communitySlug;
    }

    // Inject authentication bearer token
    if (!options.skipAuth) {
      const { accessToken } = await getAuthTokens();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    }

    return headers;
  }

  /**
   * Concurrency-safe token refresh handler.
   * If a request gets a 401, queues callers until refresh completes, then retries.
   */
  private async handleUnauthorizedRetry<T>(
    endpoint: string,
    method: HttpMethod,
    options: RequestOptions
  ): Promise<T> {
    const { refreshToken } = await getAuthTokens();
    if (!refreshToken) {
      await clearAuthTokens();
      notifySessionPurged();
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const communitySlug = await getStoredCommunitySlug();
        const timeout = options.timeoutMs || APP_CONFIG.requestTimeoutMs;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let refreshResponse: Response;
        let refreshData: any = null;

        try {
          refreshResponse = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-community-slug': communitySlug,
            },
            body: JSON.stringify({ refreshToken }),
            signal: controller.signal,
          });
          refreshData = await refreshResponse.json().catch(() => null);
        } finally {
          clearTimeout(timeoutId);
        }

        if (refreshResponse.ok && refreshData?.data?.accessToken) {
          const newAccess = refreshData.data.accessToken;
          const newRefresh = refreshData.data.refreshToken || refreshToken;
          await setAuthTokens({ accessToken: newAccess, refreshToken: newRefresh });
          isRefreshing = false;
          notifyTokenUpdated({ accessToken: newAccess, refreshToken: newRefresh });
          onTokenRefreshed(newAccess);

          // Retry initiating request with rotated access token
          return this.request<T>(endpoint, method, { ...options, _isRetry: true });
        } else if (
          refreshResponse.status === 401 ||
          refreshResponse.status === 403
        ) {
          // Explicit session rejection from auth backend (expired/revoked/suspended)
          isRefreshing = false;
          await clearAuthTokens();
          notifySessionPurged();
          const authError = new ApiError(
            'Session renewal failed. Please log in again.',
            401,
            refreshData
          );
          onTokenRefreshed(null, authError);
          throw authError;
        } else {
          // Status 400 (validation), 5xx (server error), or other errors: do NOT wipe session tokens!
          isRefreshing = false;
          const serverError = new ApiError(
            refreshData?.error || `Refresh failed with status ${refreshResponse.status}`,
            refreshResponse.status,
            refreshData
          );
          onTokenRefreshed(null, serverError);
          throw serverError;
        }
      } catch (refreshErr) {
        isRefreshing = false;
        // If it's already an ApiError with 401/403, tokens are already purged
        // If it's a network error (abort/fetch fail), do NOT wipe tokens!
        if (
          refreshErr instanceof ApiError &&
          (refreshErr.status === 401 || refreshErr.status === 403)
        ) {
          await clearAuthTokens();
          notifySessionPurged();
        }
        onTokenRefreshed(null, refreshErr);
        throw refreshErr;
      }
    }

    // Concurrent callers await the active refresh attempt
    return new Promise<T>((resolve, reject) => {
      addRefreshSubscriber((newToken: string | null, error?: unknown) => {
        if (newToken) {
          // Retry concurrent request with new token
          resolve(this.request<T>(endpoint, method, { ...options, _isRetry: true }));
        } else {
          reject(
            error instanceof Error
              ? error
              : new ApiError('Authentication expired.', 401)
          );
        }
      });
    });
  }
}

export const apiClient = new ApiClient();


