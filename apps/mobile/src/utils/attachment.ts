import { APP_CONFIG } from '../constants/config';

/**
 * Resolves a displayable attachment URL.
 * Automatically normalizes legacy or development mock-storage URLs,
 * misconfigured public Supabase URLs, or localhost URLs
 * to point to the active backend API server endpoint or valid signed URL.
 */
export function resolveAttachmentDisplayUrl(url?: string | null): string {
  if (!url) return '';

  // 1. If already a valid signed URL from Supabase, return directly
  if (url.includes('/storage/v1/object/sign/')) {
    return url;
  }

  // 2. If a legacy mock-storage URL was returned
  if (url.includes('mock-storage.apnasamaj.local')) {
    const rawPath = url.split('mock-storage.apnasamaj.local/chat-attachments/')[1]?.split('?')[0];
    if (rawPath) {
      return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${rawPath}`;
    }
  }

  // 3. If an unauthenticated public Supabase URL was generated for a private bucket
  if (url.includes('/storage/v1/object/public/')) {
    const match = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (match && match[1]) {
      const cleanPath = match[1].split('?')[0];
      return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${cleanPath}`;
    }
  }

  // 4. Rewrite localhost:4000 to active apiBaseUrl on mobile devices/emulators
  if (url.includes('localhost:4000/api/v1') && !APP_CONFIG.apiBaseUrl.includes('localhost:4000')) {
    return url.replace('http://localhost:4000/api/v1', APP_CONFIG.apiBaseUrl);
  }

  return url;
}

