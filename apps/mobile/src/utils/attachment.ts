import { APP_CONFIG } from '../constants/config';

/**
 * Resolves a displayable attachment or media URL.
 * Automatically normalizes legacy or development mock-storage URLs,
 * misconfigured private chat-attachment URLs, or localhost URLs
 * to point to the active backend API server endpoint or valid signed/public URL.
 */
export function resolveAttachmentDisplayUrl(url?: string | null): string {
  if (!url) return '';

  const cleanUrl = url.trim();

  // 1. Direct local file or blob/data schemes
  if (
    cleanUrl.startsWith('file:') ||
    cleanUrl.startsWith('content:') ||
    cleanUrl.startsWith('blob:') ||
    cleanUrl.startsWith('data:')
  ) {
    return cleanUrl;
  }

  // 2. If already a valid signed URL from Supabase, return directly
  if (cleanUrl.includes('/storage/v1/object/sign/')) {
    return cleanUrl;
  }

  const apiOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');

  // 3. If a legacy mock-storage URL was returned in dev/testing environments
  if (cleanUrl.includes('mock-storage.apnasamaj.local')) {
    // If it's a private chat attachment
    if (cleanUrl.includes('/chat-attachments/')) {
      const rawPath = cleanUrl.split('/chat-attachments/')[1]?.split('?')[0];
      if (rawPath) {
        return `${apiOrigin}/api/v1/chat/attachments/raw/${rawPath}`;
      }
    }

    // For any other mock-storage path (e.g. community-media/posts/...)
    const match = cleanUrl.match(/mock-storage\.apnasamaj\.local\/[^/]+\/(.+)$/);
    if (match && match[1]) {
      const cleanPath = match[1].split('?')[0];
      return `${apiOrigin}/api/v1/chat/attachments/raw/${cleanPath}`;
    }
  }

  // 4. If an unauthenticated public Supabase URL was generated specifically for the PRIVATE chat-attachments bucket
  if (cleanUrl.includes('/storage/v1/object/public/chat-attachments/')) {
    const rawPath = cleanUrl.split('/storage/v1/object/public/chat-attachments/')[1]?.split('?')[0];
    if (rawPath) {
      return `${apiOrigin}/api/v1/chat/attachments/raw/${rawPath}`;
    }
  }

  // 5. Rewrite any localhost / 127.0.0.1 port to active apiOrigin on mobile devices/emulators
  if (/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(cleanUrl)) {
    if (!apiOrigin.includes('localhost') && !apiOrigin.includes('127.0.0.1')) {
      return cleanUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, apiOrigin);
    }
    return cleanUrl;
  }

  // 6. If already a valid absolute HTTP/HTTPS URL
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return cleanUrl;
  }

  // 7. Relative storage paths (e.g. "direct/tenant/..." or "groups/tenant/...")
  if (cleanUrl.startsWith('direct/') || cleanUrl.startsWith('groups/')) {
    return `${apiOrigin}/api/v1/chat/attachments/raw/${cleanUrl}`;
  }

  // 8. Relative raw chat attachment path
  if (cleanUrl.startsWith('/uploads/chat-attachments/') || cleanUrl.startsWith('uploads/chat-attachments/')) {
    const rawPath = cleanUrl.replace(/^\/?uploads\/chat-attachments\//, '');
    return `${apiOrigin}/api/v1/chat/attachments/raw/${rawPath}`;
  }

  if (cleanUrl.startsWith('/api/v1/chat/attachments/raw/')) {
    return `${apiOrigin}${cleanUrl}`;
  }

  return cleanUrl;
}
