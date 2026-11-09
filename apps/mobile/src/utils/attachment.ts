import { APP_CONFIG } from '../constants/config';

/**
 * Resolves a displayable attachment URL.
 * Automatically normalizes legacy or development mock-storage URLs
 * (e.g. `https://mock-storage.apnasamaj.local/chat-attachments/...`)
 * to point to the active backend API server endpoint (`/api/v1/chat/attachments/raw/...`).
 */
export function resolveAttachmentDisplayUrl(url?: string | null): string {
  if (!url) return '';
  if (url.includes('mock-storage.apnasamaj.local')) {
    const rawPath = url.split('mock-storage.apnasamaj.local/chat-attachments/')[1]?.split('?')[0];
    if (rawPath) {
      return `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/${rawPath}`;
    }
  }
  return url;
}

