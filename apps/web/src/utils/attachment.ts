import { API_BASE_URL } from '../config/api.config';

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export interface ParsedYouTubeVideo {
  videoId: string;
  thumbnailUrl: string;
  cleanUrl: string;
}

/**
 * Parses a YouTube URL and extracts its videoId and official thumbnail URL.
 */
export function parseYouTubeVideoUrl(rawUrl: string): ParsedYouTubeVideo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[<>]/.test(trimmed) || /javascript:/i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) return null;

  let candidateId: string | null = null;
  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    candidateId = parsed.pathname.slice(1).split('/')[0] || null;
  } else if (parsed.pathname === '/watch') {
    candidateId = parsed.searchParams.get('v');
  } else if (parsed.pathname.startsWith('/embed/')) {
    candidateId = parsed.pathname.slice('/embed/'.length).split('/')[0] || null;
  } else if (parsed.pathname.startsWith('/shorts/')) {
    candidateId = parsed.pathname.slice('/shorts/'.length).split('/')[0] || null;
  }

  if (!candidateId || !YOUTUBE_VIDEO_ID_REGEX.test(candidateId)) return null;

  return {
    videoId: candidateId,
    thumbnailUrl: `https://img.youtube.com/vi/${candidateId}/hqdefault.jpg`,
    cleanUrl: `https://www.youtube.com/watch?v=${candidateId}`,
  };
}

/**
 * Extracts and parses YouTube video details from plain text or a direct URL.
 */
export function extractYouTubeVideoDetails(text?: string | null): ParsedYouTubeVideo | null {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}[^\s<>"']*/i);
  if (match) {
    return parseYouTubeVideoUrl(match[0]);
  }
  return parseYouTubeVideoUrl(text.trim());
}

/**
 * Resolves a displayable media or attachment URL for the Web application.
 * Normalizes legacy dev mock-storage URLs, local upload paths, and relative paths
 * to absolute URLs pointing to the active backend API server or CDN.
 */
export function resolveAttachmentDisplayUrl(url?: string | null): string {
  if (!url) return '';

  const cleanUrl = url.trim();

  // 1. If already a valid absolute Supabase signed or CDN URL
  if (
    cleanUrl.startsWith('http://') ||
    cleanUrl.startsWith('https://') ||
    cleanUrl.startsWith('blob:') ||
    cleanUrl.startsWith('data:')
  ) {
    // If it's a legacy mock-storage URL from dev/staging
    if (cleanUrl.includes('mock-storage.apnasamaj.local')) {
      if (cleanUrl.includes('/chat-attachments/')) {
        const rawPath = cleanUrl.split('/chat-attachments/')[1]?.split('?')[0];
        if (rawPath) {
          return `${API_BASE_URL}/api/v1/chat/attachments/raw/${rawPath}`;
        }
      }
    }

    // If an unauthenticated public URL was mistakenly generated for the private chat-attachments bucket
    if (cleanUrl.includes('/storage/v1/object/public/chat-attachments/')) {
      const rawPath = cleanUrl.split('/storage/v1/object/public/chat-attachments/')[1]?.split('?')[0];
      if (rawPath) {
        return `${API_BASE_URL}/api/v1/chat/attachments/raw/${rawPath}`;
      }
    }

    // If pointing to localhost:4000 in production, replace with API_BASE_URL
    if (cleanUrl.includes('localhost:4000') && !API_BASE_URL.includes('localhost:4000')) {
      return cleanUrl.replace(/https?:\/\/localhost:4000/, API_BASE_URL);
    }

    return cleanUrl;
  }

  // 2. Relative raw chat attachment path
  if (cleanUrl.startsWith('/uploads/chat-attachments/') || cleanUrl.startsWith('uploads/chat-attachments/')) {
    const rawPath = cleanUrl.replace(/^\/?uploads\/chat-attachments\//, '');
    return `${API_BASE_URL}/api/v1/chat/attachments/raw/${rawPath}`;
  }

  // 3. Any other relative API path
  if (cleanUrl.startsWith('/')) {
    return `${API_BASE_URL}${cleanUrl}`;
  }

  return `${API_BASE_URL}/${cleanUrl}`;
}
