/**
 * Base URL for the Apna Samaj API.
 * Uses VITE_API_URL if configured, otherwise defaults to local dev server at http://localhost:4000.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';
