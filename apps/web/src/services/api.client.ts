import { ApiResponse, RefreshResponseData } from '@apnasamaj/shared-types';
import { extractCommunitySubdomain } from '@apnasamaj/validation';
import { API_BASE_URL } from '../config/api.config';

let inMemoryAccessToken: string | null = null;
let activeRefreshPromise: Promise<RefreshResponseData> | null = null;
let activeCommunitySlug: string | null = null;

export function setInMemoryToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getInMemoryToken(): string | null {
  return inMemoryAccessToken;
}

export function clearAuthSession(): void {
  inMemoryAccessToken = null;
  activeRefreshPromise = null;
}

export function setActiveCommunitySlug(slug: string | null): void {
  activeCommunitySlug = slug ? slug.toLowerCase().trim() : null;
  if (typeof window !== 'undefined') {
    if (activeCommunitySlug) {
      try {
        localStorage.setItem('apnasamaj_community_slug', activeCommunitySlug);
      } catch {
        // Ignore storage errors in restricted contexts
      }
    } else {
      try {
        localStorage.removeItem('apnasamaj_community_slug');
      } catch {
        // Ignore storage errors
      }
    }
  }
}

export function getActiveCommunitySlug(): string | null {
  if (activeCommunitySlug) {
    return activeCommunitySlug;
  }

  if (typeof window !== 'undefined') {
    // 1. Resolve from hostname (production or kewat.localhost)
    const hostSlug = extractCommunitySubdomain(window.location.hostname);
    if (hostSlug) {
      activeCommunitySlug = hostSlug;
      return hostSlug;
    }

    // 2. Resolve from URL search param (?community=slug)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const querySlug = urlParams.get('community');
      if (querySlug) {
        const clean = querySlug.toLowerCase().trim();
        activeCommunitySlug = clean;
        try {
          localStorage.setItem('apnasamaj_community_slug', clean);
        } catch {}
        return clean;
      }
    } catch {}

    // 3. Resolve from persisted selection in localStorage
    try {
      const stored = localStorage.getItem('apnasamaj_community_slug');
      if (stored) {
        activeCommunitySlug = stored.toLowerCase().trim();
        return activeCommunitySlug;
      }
    } catch {}
  }

  return null;
}

/**
 * Executes or joins an in-flight token refresh request.
 * Coalesces concurrent refresh calls into a single shared HTTP request to prevent
 * duplicate refresh token rotation and accidental replay-detection triggers.
 */
export async function executeTokenRefresh(): Promise<RefreshResponseData> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const communitySlug = getActiveCommunitySlug();
      if (communitySlug) {
        headers['X-Community-Slug'] = communitySlug;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });

      const data: ApiResponse<RefreshResponseData> = await response.json();

      if (!response.ok || !data.success || !data.data) {
        setInMemoryToken(null);
        throw new Error(data.error || 'Session expired. Please log in again.');
      }

      setInMemoryToken(data.data.accessToken);
      return data.data;
    } catch (err) {
      setInMemoryToken(null);
      throw err;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Custom fetch wrapper with credentials: 'include', in-memory bearer token,
 * and automatic 401 token refresh coalescing and retry.
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

  const communitySlug = getActiveCommunitySlug();
  if (communitySlug && !headers.has('X-Community-Slug')) {
    headers.set('X-Community-Slug', communitySlug);
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

  // If 401 Unauthorized and not already calling auth endpoints, attempt automatic refresh & retry
  if (
    response.status === 401 &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/register') &&
    !endpoint.includes('/auth/refresh') &&
    !endpoint.includes('/auth/forgot-password') &&
    !endpoint.includes('/auth/verify-reset-token') &&
    !endpoint.includes('/auth/reset-password')
  ) {
    try {
      const refreshData = await executeTokenRefresh();
      if (refreshData && refreshData.accessToken) {
        headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        const retryResponse = await fetch(url, { ...fetchOptions, headers });
        return retryResponse.json();
      }
    } catch {
      // Refresh failed; return original 401 response without looping
      return response.json();
    }
  }

  return response.json();
}
