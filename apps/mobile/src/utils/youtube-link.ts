/**
 * YouTube Link Utility for Apna Samaj Mobile App.
 *
 * WhatsApp-style YouTube URL detection, parsing, thumbnail resolution,
 * and safe client-side oEmbed metadata retrieval with in-memory caching.
 *
 * Preserves multi-tenant safety: zero secrets, no backend SSRF risk,
 * sanitized string extraction, strict host and 11-char video ID enforcement.
 */

export interface ParsedYouTubeLink {
  videoId: string;
  originalUrl: string;
  canonicalUrl: string;
  thumbnailUrl: string;
  embedUrl: string;
  startTimeSeconds?: number;
}

export interface YouTubePreviewMetadata {
  videoId: string;
  title: string;
  authorName?: string;
  thumbnailUrl: string;
  provider: 'YouTube';
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

/**
 * Regex for matching potential URLs in plain text messages.
 * Matches http or https links, ignoring surrounding punctuation.
 */
const URL_EXTRACTION_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;

/**
 * Parses optional YouTube start time parameters (e.g. ?t=120, ?t=120s, ?t=1m30s, ?start=120).
 */
export function parseYouTubeStartTime(tParam?: string | null): number | undefined {
  if (!tParam) return undefined;
  const clean = tParam.trim().toLowerCase();

  // Pure digits or digits with 's' suffix
  if (/^\d+s?$/.test(clean)) {
    const num = parseInt(clean.replace('s', ''), 10);
    return isNaN(num) || num <= 0 ? undefined : num;
  }

  // Format like 1h2m30s or 2m30s
  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (match && (match[1] || match[2] || match[3])) {
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    const secs = match[3] ? parseInt(match[3], 10) : 0;
    const total = hours * 3600 + mins * 60 + secs;
    return total > 0 ? total : undefined;
  }

  return undefined;
}

/**
 * Resolves standard YouTube thumbnail URL with customizable quality.
 */
export function getYouTubeThumbnail(
  videoId: string,
  quality: 'maxres' | 'hq' | 'mq' | 'default' = 'hq'
): string {
  if (!videoId || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return '';
  }

  switch (quality) {
    case 'maxres':
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    case 'mq':
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    case 'default':
      return `https://img.youtube.com/vi/${videoId}/default.jpg`;
    case 'hq':
    default:
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
}

/**
 * Validates and parses a single candidate YouTube URL.
 * Strictly verifies hostname and 11-character video ID.
 * Returns structured ParsedYouTubeLink or null.
 */
export function parseYouTubeLink(rawUrl: string | null | undefined): ParsedYouTubeLink | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  // Reject strings containing HTML tags or scripts
  if (/[<>]/.test(trimmed) || /javascript:/i.test(trimmed)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Strictly enforce HTTP or HTTPS (canonicalize to HTTPS for embedding)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  let candidateId: string | null = null;

  // Extract start time from t or start query parameters
  const tParam = parsed.searchParams.get('t') || parsed.searchParams.get('start');
  const startTimeSeconds = parseYouTubeStartTime(tParam);

  if (hostname === 'youtu.be') {
    // Format: https://youtu.be/VIDEO_ID
    const pathnameParts = parsed.pathname.split('/').filter(Boolean);
    if (pathnameParts.length >= 1) {
      candidateId = pathnameParts[0];
    }
  } else if (hostname === 'www.youtube-nocookie.com') {
    // Format: https://www.youtube-nocookie.com/embed/VIDEO_ID
    const pathnameParts = parsed.pathname.split('/').filter(Boolean);
    if (pathnameParts.length >= 2 && pathnameParts[0] === 'embed') {
      candidateId = pathnameParts[1];
    }
  } else {
    // Hostname is youtube.com, www.youtube.com, or m.youtube.com
    if (parsed.pathname === '/watch') {
      // Format: https://www.youtube.com/watch?v=VIDEO_ID
      candidateId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      // Format: https://www.youtube.com/shorts/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'shorts') {
        candidateId = pathnameParts[1];
      }
    } else if (parsed.pathname.startsWith('/live/')) {
      // Format: https://www.youtube.com/live/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'live') {
        candidateId = pathnameParts[1];
      }
    } else if (parsed.pathname.startsWith('/embed/')) {
      // Format: https://www.youtube.com/embed/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'embed') {
        candidateId = pathnameParts[1];
      }
    }
  }

  if (!candidateId || !YOUTUBE_VIDEO_ID_REGEX.test(candidateId)) {
    return null;
  }

  const embedUrl = startTimeSeconds
    ? `https://www.youtube-nocookie.com/embed/${candidateId}?start=${startTimeSeconds}`
    : `https://www.youtube-nocookie.com/embed/${candidateId}`;

  const canonicalUrl = startTimeSeconds
    ? `https://www.youtube.com/watch?v=${candidateId}&t=${startTimeSeconds}`
    : `https://www.youtube.com/watch?v=${candidateId}`;

  const thumbnailUrl = getYouTubeThumbnail(candidateId, 'hq');

  return {
    videoId: candidateId,
    originalUrl: trimmed,
    canonicalUrl,
    thumbnailUrl,
    embedUrl,
    startTimeSeconds,
  };
}

/**
 * Scans a plain text message for any valid YouTube URLs.
 * Returns an array of matched valid URLs in order of appearance.
 */
export function extractYouTubeUrls(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const matches = text.match(URL_EXTRACTION_REGEX);
  if (!matches || matches.length === 0) {
    return [];
  }

  const validUrls: string[] = [];
  const seenVideoIds = new Set<string>();

  for (const rawCandidate of matches) {
    // Strip trailing punctuation like period, comma, semicolon, closing paren
    const cleanCandidate = rawCandidate.replace(/[.,;:!?)]+$/, '');
    const parsed = parseYouTubeLink(cleanCandidate);
    if (parsed && !seenVideoIds.has(parsed.videoId)) {
      seenVideoIds.add(parsed.videoId);
      validUrls.push(cleanCandidate);
    }
  }

  return validUrls;
}

/**
 * Finds the first valid YouTube link in a chat message.
 * Predictable WhatsApp/Telegram-style behavior: previews the first valid link in the message.
 */
export function findFirstYouTubeLink(text: string | null | undefined): ParsedYouTubeLink | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const matches = text.match(URL_EXTRACTION_REGEX);
  if (!matches || matches.length === 0) {
    return null;
  }

  for (const rawCandidate of matches) {
    const cleanCandidate = rawCandidate.replace(/[.,;:!?)]+$/, '');
    const parsed = parseYouTubeLink(cleanCandidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

// In-memory LRU-like cache for YouTube oEmbed metadata to prevent duplicate network calls across re-renders
const metadataCache = new Map<string, YouTubePreviewMetadata>();
const MAX_CACHE_ENTRIES = 200;

/**
 * Clears in-memory metadata cache (useful for automated testing).
 */
export function clearYouTubeMetadataCache(): void {
  metadataCache.clear();
}

/**
 * Manually primes metadata cache (useful for automated testing or mock data).
 */
export function setCachedYouTubeMetadata(videoId: string, metadata: YouTubePreviewMetadata): void {
  if (metadataCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = metadataCache.keys().next().value;
    if (firstKey) metadataCache.delete(firstKey);
  }
  metadataCache.set(videoId, metadata);
}

/**
 * Retrieves cached metadata if already available.
 */
export function getCachedYouTubeMetadata(videoId: string): YouTubePreviewMetadata | null {
  return metadataCache.get(videoId) || null;
}

/**
 * Fetches video metadata (title and author) using YouTube's public no-auth oEmbed endpoint.
 *
 * Security:
 * - Requires no API keys or credentials.
 * - Zero backend SSRF risk (direct client request to official youtube.com/oembed endpoint).
 * - Extracts and sanitizes plain text strings only (never evaluates HTML or scripts).
 * - Implements a 3.5s timeout.
 * - Always falls back safely to default "YouTube Video" upon network failure, offline, or invalid response.
 */
export async function fetchYouTubeMetadata(
  videoId: string,
  originalUrl?: string
): Promise<YouTubePreviewMetadata> {
  const defaultFallback: YouTubePreviewMetadata = {
    videoId,
    title: 'YouTube Video',
    authorName: 'YouTube',
    thumbnailUrl: getYouTubeThumbnail(videoId, 'hq'),
    provider: 'YouTube',
  };

  if (!videoId || !YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    return defaultFallback;
  }

  const cached = metadataCache.get(videoId);
  if (cached) {
    return cached;
  }

  const targetUrl = originalUrl || `https://www.youtube.com/watch?v=${videoId}`;
  const oembedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const response = await fetch(oembedEndpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller ? controller.signal : undefined,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      // In case of 404/401/403 or unavailable, cache the safe fallback so we don't repeat the request
      setCachedYouTubeMetadata(videoId, defaultFallback);
      return defaultFallback;
    }

    const data = await response.json();

    // Sanitize string title and authorName
    const cleanTitle =
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim().replace(/[<>]/g, '')
        : 'YouTube Video';

    const cleanAuthor =
      typeof data.author_name === 'string' && data.author_name.trim()
        ? data.author_name.trim().replace(/[<>]/g, '')
        : 'YouTube';

    const cleanThumbnail =
      typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://')
        ? data.thumbnail_url
        : getYouTubeThumbnail(videoId, 'hq');

    const result: YouTubePreviewMetadata = {
      videoId,
      title: cleanTitle,
      authorName: cleanAuthor,
      thumbnailUrl: cleanThumbnail,
      provider: 'YouTube',
    };

    setCachedYouTubeMetadata(videoId, result);
    return result;
  } catch {
    // Network failure, timeout, or aborted - return fallback and cache briefly
    setCachedYouTubeMetadata(videoId, defaultFallback);
    return defaultFallback;
  }
}

