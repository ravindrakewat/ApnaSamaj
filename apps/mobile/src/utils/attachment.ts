import { APP_CONFIG } from '../constants/config';

/**
 * Resolves a displayable attachment or media URL.
 * Automatically normalizes legacy or development mock-storage URLs,
 * misconfigured private chat-attachment URLs, or localhost URLs
 * to point to the active backend API server endpoint or valid signed/public URL.
 */
export function resolveAttachmentDisplayUrl(url?: string | null): string {
  if (!url) return '';

  // 1. If already a valid signed URL from Supabase, return directly
  if (url.includes('/storage/v1/object/sign/')) {
    return url;
  }

  // 2. If a legacy mock-storage URL was returned in dev/testing environments
  if (url.includes('mock-storage.apnasamaj.local')) {
    // If it's a private chat attachment
    if (url.includes('/chat-attachments/')) {
      const rawPath = url.split('/chat-attachments/')[1]?.split('?')[0];
      if (rawPath) {
        return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${rawPath}`;
      }
    }

    // For any other mock-storage path (e.g. community-media/posts/...)
    const match = url.match(/mock-storage\.apnasamaj\.local\/[^/]+\/(.+)$/);
    if (match && match[1]) {
      const cleanPath = match[1].split('?')[0];
      return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${cleanPath}`;
    }
  }

  // 3. If an unauthenticated public Supabase URL was generated specifically for the PRIVATE chat-attachments bucket
  // (Note: public buckets like community-media must NOT be rewritten to /chat/attachments/raw/ as that endpoint
  // strictly serves private chat attachments from uploads/chat-attachments and returns 404 for post media)
  if (url.includes('/storage/v1/object/public/chat-attachments/')) {
    const rawPath = url.split('/storage/v1/object/public/chat-attachments/')[1]?.split('?')[0];
    if (rawPath) {
      return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${rawPath}`;
    }
  }

  // 4. Rewrite localhost:4000 to active apiBaseUrl origin on mobile devices/emulators
  if (url.includes('localhost:4000')) {
    const apiOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
    if (!apiOrigin.includes('localhost:4000')) {
      return url.replace(/https?:\/\/localhost:4000/, apiOrigin);
    }
  }

  return url;
}
