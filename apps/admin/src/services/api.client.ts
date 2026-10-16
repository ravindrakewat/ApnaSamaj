import { ApiResponse, LoginResponseData, RefreshResponseData } from '@apnasamaj/shared-types';
import { API_BASE_URL } from '../config/api.config';

let inMemoryAccessToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

export function setInMemoryToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getInMemoryToken(): string | null {
  return inMemoryAccessToken;
}

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string | null) => void) {
  refreshSubscribers.push(callback);
}

/**
 * Custom fetch wrapper with credentials: 'include', in-memory bearer token,
 * and automatic 401 token refresh queueing.
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensures HttpOnly cookies are attached
  };

  const response = await fetch(url, fetchOptions);

  // If 401 Unauthorized and not already calling auth endpoints, attempt automatic refresh
  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/refresh')
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (refreshResponse.ok) {
          const refreshData: ApiResponse<RefreshResponseData> = await refreshResponse.json();
          const newToken = refreshData.data?.accessToken || null;
          setInMemoryToken(newToken);
          isRefreshing = false;
          onRefreshed(newToken);
        } else {
          setInMemoryToken(null);
          isRefreshing = false;
          onRefreshed(null);
        }
      } catch {
        setInMemoryToken(null);
        isRefreshing = false;
        onRefreshed(null);
      }
    }

    // Wait for ongoing refresh to complete, then retry or reject
    const retryToken = await new Promise<string | null>((resolve) => {
      addRefreshSubscriber((token) => resolve(token));
    });

    if (retryToken) {
      headers.set('Authorization', `Bearer ${retryToken}`);
      const retryResponse = await fetch(url, { ...fetchOptions, headers });
      return retryResponse.json();
    }
  }

  return response.json();
}
