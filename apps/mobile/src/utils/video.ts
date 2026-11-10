import { parseYouTubeUrl } from '@apnasamaj/validation';
import { resolveAttachmentDisplayUrl } from './attachment';

export type VideoSourceType = 'YOUTUBE' | 'UPLOADED_VIDEO' | 'UNKNOWN';

export interface VideoSourceDetails {
  sourceType: VideoSourceType;
  playbackUrl: string;
  thumbnailUrl: string | null;
  youtubeId: string | null;
  startTimeSeconds?: number;
}

/**
 * Checks if a URL points to a YouTube video.
 */
export function isYouTubeUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  return Boolean(parseYouTubeUrl(rawUrl));
}

/**
 * Extracts YouTube video ID from any supported YouTube URL format.
 */
export function extractYouTubeVideoId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const parsed = parseYouTubeUrl(rawUrl);
  return parsed?.videoId || null;
}

/**
 * Generates an official, privacy-enhanced YouTube embed URL.
 * Enables JS API, modest branding, inline playback, and disables related videos from other channels.
 */
export function getYouTubeEmbedUrl(
  rawUrl: string | null | undefined,
  options?: { autoplay?: boolean; startTime?: number }
): string | null {
  if (!rawUrl) return null;
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed) return null;

  const autoplay = options?.autoplay !== false ? 1 : 0;
  const startTime = options?.startTime ?? parsed.startTimeSeconds ?? 0;
  const startParam = startTime > 0 ? `&start=${startTime}` : '';

  return `https://www.youtube-nocookie.com/embed/${parsed.videoId}?autoplay=${autoplay}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=https://apnasamaj.app${startParam}`;
}

/**
 * Gets high-quality thumbnail for YouTube video.
 */
export function getYouTubeThumbnailUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const parsed = parseYouTubeUrl(rawUrl);
  return parsed?.thumbnailUrl || null;
}

/**
 * Identifies whether a video URL is a YouTube video, uploaded direct video, or unknown.
 */
export function identifyVideoSource(rawUrl: string | null | undefined): VideoSourceType {
  if (!rawUrl || typeof rawUrl !== 'string') return 'UNKNOWN';

  if (isYouTubeUrl(rawUrl)) {
    return 'YOUTUBE';
  }

  // Common direct video extensions and storage patterns
  const isDirectVideo =
    /\.(mp4|webm|mov|m3u8|ogg)($|\?)/i.test(rawUrl) ||
    rawUrl.includes('/storage/v1/object/') ||
    rawUrl.includes('/chat-attachments/') ||
    rawUrl.includes('/attachments/raw/');

  if (isDirectVideo) {
    return 'UPLOADED_VIDEO';
  }

  // If rawUrl is HTTP/HTTPS and not clearly invalid, default to UPLOADED_VIDEO for streaming
  if (/^https?:\/\//i.test(rawUrl)) {
    return 'UPLOADED_VIDEO';
  }

  return 'UNKNOWN';
}

/**
 * Resolves playback URL, converting storage keys and local media paths if needed.
 */
export function resolveVideoPlaybackUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return resolveAttachmentDisplayUrl(rawUrl);
}

/**
 * Inspects media item and returns parsed playback and thumbnail details.
 */
export function getVideoSourceDetails(
  rawUrl: string,
  providedThumbnail?: string | null
): VideoSourceDetails {
  const sourceType = identifyVideoSource(rawUrl);

  if (sourceType === 'YOUTUBE') {
    const parsed = parseYouTubeUrl(rawUrl);
    return {
      sourceType: 'YOUTUBE',
      playbackUrl: getYouTubeEmbedUrl(rawUrl, { autoplay: true }) || rawUrl,
      thumbnailUrl: providedThumbnail || (parsed?.thumbnailUrl ?? null),
      youtubeId: parsed?.videoId || null,
      startTimeSeconds: parsed?.startTimeSeconds,
    };
  }

  return {
    sourceType,
    playbackUrl: resolveVideoPlaybackUrl(rawUrl),
    thumbnailUrl: providedThumbnail || null,
    youtubeId: null,
  };
}

/**
 * Formats milliseconds into mm:ss or hh:mm:ss.
 */
export function formatVideoDuration(millis: number): string {
  if (!millis || isNaN(millis) || millis < 0) return '00:00';

  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMin = String(minutes).padStart(2, '0');
  const paddedSec = String(seconds).padStart(2, '0');

  if (hours > 0) {
    const paddedHour = String(hours).padStart(2, '0');
    return `${paddedHour}:${paddedMin}:${paddedSec}`;
  }

  return `${paddedMin}:${paddedSec}`;
}

