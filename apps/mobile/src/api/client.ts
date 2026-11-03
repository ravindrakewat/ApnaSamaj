import { APP_CONFIG } from '../constants/config';
import { ApiError, HttpMethod, RequestOptions } from './types';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
} from '../services/storage.service';

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string | null) => void) {
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
      throw new ApiError('Session expired. Please log in again.', 401);
    }

    if (!isRefreshing) {
      isRefreshing = true;

      try {
        const communitySlug = await getStoredCommunitySlug();
        const refreshResponse = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-community-slug': communitySlug,
          },
          body: JSON.stringify({ refreshToken }),
        });

        const refreshData = await refreshResponse.json().catch(() => null);

        if (refreshResponse.ok && refreshData?.data?.accessToken) {
          const newAccess = refreshData.data.accessToken;
          const newRefresh = refreshData.data.refreshToken || refreshToken;
          await setAuthTokens({ accessToken: newAccess, refreshToken: newRefresh });
          isRefreshing = false;
          onTokenRefreshed(newAccess);

          // Retry initiating request with rotated access token
          return this.request<T>(endpoint, method, { ...options, _isRetry: true });
        } else {
          isRefreshing = false;
          await clearAuthTokens();
          onTokenRefreshed(null);
          throw new ApiError('Session renewal failed. Please log in again.', 401);
        }
      } catch (refreshErr) {
        isRefreshing = false;
        await clearAuthTokens();
        onTokenRefreshed(null);
        throw refreshErr;
      }
    }

    // Concurrent callers await the active refresh attempt
    return new Promise<T>((resolve, reject) => {
      addRefreshSubscriber((newToken: string | null) => {
        if (newToken) {
          // Retry concurrent request with new token
          resolve(this.request<T>(endpoint, method, { ...options, _isRetry: true }));
        } else {
          reject(new ApiError('Authentication expired.', 401));
        }
      });
    });
  }
}

export const apiClient = new ApiClient();

