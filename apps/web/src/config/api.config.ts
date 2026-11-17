/**
 * Base URL for the Apna Samaj API.
 * Uses VITE_API_URL if configured, otherwise falls back to production domain in production
 * or local dev server in development.
 */
function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env?.VITE_API_URL as string)?.trim();
  if (envUrl) {
    // Strip trailing slash and trailing /api/v1 if present to maintain origin consistency
    return envUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
  }
  return import.meta.env?.PROD ? 'https://api.samaz.in' : 'http://localhost:4000';
}

export const API_BASE_URL = resolveApiBaseUrl();
