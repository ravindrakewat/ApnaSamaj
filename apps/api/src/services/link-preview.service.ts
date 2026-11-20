import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { LinkPreviewMetadata, LinkPreviewProvider } from '@apnasamaj/shared-types';
import {
  detectLinkProvider,
  extractAmazonAsin,
  parseYouTubeUrl,
} from '@apnasamaj/validation';

export class LinkPreviewError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'LinkPreviewError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// 1. SSRF Protection: IP and Hostname Validation
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '169.254.169.254', // AWS/GCP/Azure link-local metadata
  'metadata.google.internal',
  'instance-data',
  'metadata.local',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
]);

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat invalid IPv4 as blocked
  }

  // 0.0.0.0/8 (Current network)
  if (parts[0] === 0) return true;

  // 10.0.0.0/8 (Private)
  if (parts[0] === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;

  // 100.64.0.0/10 (Shared / Carrier-Grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Instance Metadata)
  if (parts[0] === 169 && parts[1] === 254) return true;

  // 172.16.0.0/12 (Private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (parts[0] === 192 && parts[1] === 168) return true;

  // 198.18.0.0/15 (Benchmark testing)
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;

  // 224.0.0.0/4 (Multicast)
  if (parts[0] >= 224 && parts[0] <= 239) return true;

  // 240.0.0.0/4 (Reserved)
  if (parts[0] >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private, loopback, or unique local range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim();

  // Loopback
  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;

  // Unspecified
  if (clean === '::' || clean === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:') || clean.startsWith('0:0:0:0:0:ffff:')) {
    const v4Part = clean.replace(/^.*ffff:/, '');
    if (net.isIPv4(v4Part)) {
      return isPrivateIPv4(v4Part);
    }
    return true;
  }

  // Unique local addresses (fc00::/7 -> starts with fc or fd)
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;

  // Link-local addresses (fe80::/10 -> starts with fe8, fe9, fea, feb)
  if (/^fe[89ab]/i.test(clean)) return true;

  return false;
}

/**
 * Validates an IP address (v4 or v6) against private, loopback, and cloud metadata restrictions.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  return true; // Unknown IP format is blocked
}

/**
 * Validates target URL against SSRF threats:
 * 1. Protocol must be http or https (prefer https).
 * 2. Hostname must not be a known internal/cloud-metadata name.
 * 3. Resolves DNS and validates ALL returned IPs against private/reserved CIDRs (Anti-DNS-Rebinding).
 */
export async function validateUrlForSsrf(targetUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl.trim());
  } catch {
    throw new LinkPreviewError('Invalid URL format.', 400);
  }

  // 1. Enforce HTTP/HTTPS only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new LinkPreviewError('Only HTTP and HTTPS protocols are supported for link previews.', 400);
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject blocked hostnames and suffixes
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new LinkPreviewError('Access to internal, loopback, or metadata endpoints is forbidden.', 403);
  }

  for (const ext of BLOCKED_EXTENSIONS) {
    if (hostname.endsWith(ext)) {
      throw new LinkPreviewError('Access to local or internal domain names is forbidden.', 403);
    }
  }

  // 3. If hostname is an IP literal, validate immediately
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new LinkPreviewError('Access to private or reserved IP addresses is forbidden.', 403);
    }
    return parsed;
  }

  // 4. DNS Resolution check (Anti-DNS Rebinding)
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new LinkPreviewError('Could not resolve hostname for link preview.', 404);
    }

    for (const record of addresses) {
      if (isPrivateOrBlockedIp(record.address)) {
        throw new LinkPreviewError(
          'Target hostname resolved to a private or restricted IP address.',
          403
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof LinkPreviewError) throw err;
    throw new LinkPreviewError(`DNS resolution failed for hostname: ${hostname}`, 404);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// 2. In-Memory Link Preview Cache (TTL 1 hour, Max 1000 items)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: LinkPreviewMetadata;
  expiresAt: number;
}

const previewCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 1000;

function getCachedPreview(url: string): LinkPreviewMetadata | null {
  const entry = previewCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    previewCache.delete(url);
    return null;
  }
  return entry.data;
}

function setCachedPreview(url: string, data: LinkPreviewMetadata): void {
  if (previewCache.size >= MAX_CACHE_ENTRIES) {
    // Evict first 100 oldest entries
    const keys = Array.from(previewCache.keys()).slice(0, 100);
    keys.forEach((k) => previewCache.delete(k));
  }
  previewCache.set(url, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// 3. Safe HTTP Stream Fetcher (Max 512KB, 4s timeout, Safe Redirect Hops)
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 512 * 1024; // 512KB
const REQUEST_TIMEOUT_MS = 4000;       // 4 seconds
const MAX_REDIRECTS = 4;

interface SafeFetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
}

/**
 * Performs an SSRF-safe GET request to fetch the HTML content of a public web page.
 * Follows redirects securely by re-validating DNS and IP at every hop.
 */
export async function safeFetchHtml(
  targetUrl: string,
  redirectCount: number = 0
): Promise<SafeFetchResult> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new LinkPreviewError('Too many redirects encountered while fetching link preview.', 400);
  }

  const parsedUrl = await validateUrlForSsrf(targetUrl);
  const client = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise<SafeFetchResult>((resolve, reject) => {
    let resolved = false;

    const req = client.get(
      parsedUrl.toString(),
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8,hi;q=0.7',
          'Connection': 'close',
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const statusCode = res.statusCode || 200;

        // Handle Redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          res.destroy();
          try {
            const redirectTarget = new URL(res.headers.location, parsedUrl.toString()).toString();
            resolved = true;
            resolve(safeFetchHtml(redirectTarget, redirectCount + 1));
          } catch (redErr) {
            reject(new LinkPreviewError('Invalid redirect location URL.', 400));
          }
          return;
        }

        const contentType = res.headers['content-type'] || '';
        let receivedBytes = 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          chunks.push(chunk);

          // Stop streaming if size limit exceeded or if closing body reached
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            res.destroy();
            if (!resolved) {
              resolved = true;
              const html = Buffer.concat(chunks).toString('utf-8');
              resolve({
                html,
                finalUrl: parsedUrl.toString(),
                statusCode,
                contentType,
              });
            }
          }
        });

        res.on('end', () => {
          if (resolved) return;
          resolved = true;
          const html = Buffer.concat(chunks).toString('utf-8');
          resolve({
            html,
            finalUrl: parsedUrl.toString(),
            statusCode,
            contentType,
          });
        });

        res.on('close', () => {
          if (resolved) return;
          resolved = true;
          const html = Buffer.concat(chunks).toString('utf-8');
          resolve({
            html,
            finalUrl: parsedUrl.toString(),
            statusCode,
            contentType,
          });
        });

        res.on('error', (err) => {
          if (resolved) return;
          resolved = true;
          reject(err);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      if (!resolved) {
        resolved = true;
        reject(new LinkPreviewError('Connection timed out while fetching link metadata.', 408));
      }
    });

    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 4. HTML Metadata & Open Graph Extractor
// ---------------------------------------------------------------------------

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function cleanText(raw?: string | null, maxLen: number = 300): string | null {
  if (!raw || typeof raw !== 'string') return null;
  // Remove HTML tags, control chars, collapse multiple spaces
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  const decoded = decodeHtmlEntities(stripped);
  if (!decoded) return null;
  return decoded.length > maxLen ? decoded.slice(0, maxLen).trim() + '…' : decoded;
}

export function parseHtmlMetadata(html: string, baseUrl: string): Partial<LinkPreviewMetadata> {
  const result: Partial<LinkPreviewMetadata> = {};

  // Extract <head>...</head> portion to avoid scanning massive body
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html.slice(0, 50000);

  // Meta tag extractor helper
  const getMeta = (prop: string): string | null => {
    // Matches property="og:..." or name="og:..." with content="..."
    const regex = new RegExp(
      `<meta[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`,
      'i'
    );
    const m = headHtml.match(regex);
    if (m && m[1]) return m[1].trim();

    // Sometimes content comes before property/name
    const reverseRegex = new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
      'i'
    );
    const revM = headHtml.match(reverseRegex);
    if (revM && revM[1]) return revM[1].trim();

    return null;
  };

  // 1. Title
  const ogTitle = getMeta('og:title') || getMeta('twitter:title');
  if (ogTitle) {
    result.title = cleanText(ogTitle, 500) || undefined;
  }
  if (!result.title) {
    const titleTagMatch = headHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) {
      result.title = cleanText(titleTagMatch[1], 500) || undefined;
    }
  }

  // 2. Description
  const ogDesc = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
  if (ogDesc) {
    result.description = cleanText(ogDesc, 400);
  }

  // 3. Site Name
  const ogSite = getMeta('og:site_name') || getMeta('twitter:site');
  if (ogSite) {
    result.siteName = cleanText(ogSite, 80);
  }

  // 4. Image
  const ogImage = getMeta('og:image') || getMeta('twitter:image') || getMeta('thumbnail');
  if (ogImage) {
    try {
      const absImage = new URL(ogImage, baseUrl).toString();
      if (absImage.startsWith('http://') || absImage.startsWith('https://')) {
        result.thumbnailUrl = absImage;
      }
    } catch {
      // Ignore invalid image URL
    }
  }

  // 4b. Secondary image extraction for product pages without standard og:image in head
  if (!result.thumbnailUrl) {
    const landingMatch =
      html.match(/id=["']landingImage["'][^>]*src=["']([^"']*)["']/i) ||
      html.match(/data-old-hires=["']([^"']*)["']/i);
    if (landingMatch && landingMatch[1] && (landingMatch[1].startsWith('http://') || landingMatch[1].startsWith('https://'))) {
      result.thumbnailUrl = landingMatch[1];
    }
  }

  // 5. Favicon
  const iconMatch = headHtml.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i);
  if (iconMatch && iconMatch[1]) {
    try {
      const absIcon = new URL(iconMatch[1], baseUrl).toString();
      if (absIcon.startsWith('http://') || absIcon.startsWith('https://')) {
        result.favIcon = absIcon;
      }
    } catch {
      // Ignore invalid icon URL
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. Provider Handlers (YouTube, Amazon, General)
// ---------------------------------------------------------------------------

/**
 * Extracts rich metadata for YouTube videos without requiring an API key.
 * Leverages YouTube oEmbed endpoint with automatic fallback.
 */
async function fetchYouTubePreview(urlStr: string): Promise<LinkPreviewMetadata> {
  const parsed = parseYouTubeUrl(urlStr);
  const videoId = parsed?.videoId;
  const canonicalUrl = parsed?.watchUrl || urlStr;
  const defaultThumb = parsed?.thumbnailUrl || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null);

  let title = 'YouTube Video';
  let authorName = 'YouTube';

  if (videoId) {
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
      const res = await safeFetchHtml(oEmbedUrl);
      if (res.statusCode === 200 && res.html) {
        const data = JSON.parse(res.html);
        if (data.title) title = data.title;
        if (data.author_name) authorName = data.author_name;
      }
    } catch {
      // Gracefully fall back to video ID default thumbnail
    }
  }

  return {
    url: urlStr,
    normalizedUrl: canonicalUrl,
    provider: 'youtube',
    title,
    description: authorName ? `Watch on YouTube • Channel: ${authorName}` : 'Watch video on YouTube',
    thumbnailUrl: defaultThumb,
    siteName: 'YouTube',
    authorName,
    mediaType: 'video',
    favIcon: 'https://www.youtube.com/s/desktop/favicon.ico',
  };
}

/**
 * Extracts product name slug from Amazon URL path if present (e.g. /Product-Name-Here/dp/ASIN).
 */
function extractAmazonSlugTitle(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const match = parsed.pathname.match(/^\/([^/]+)\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]).replace(/[-_+]+/g, ' ').trim();
      if (decoded && !/^(dp|gp|product)$/i.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Ignore URL parse error
  }
  return null;
}

/**
 * Cleans marketing boilerplates from Amazon page titles.
 */
function cleanAmazonTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  title = title.replace(/^Buy\s+/i, '');
  title = title.replace(/\s+Online\s+at\s+Low\s+Prices\s+in\s+.*$/i, '');
  title = title.replace(/\s+Online\s+at\s+Low.*$/i, '');
  title = title.replace(/\s*[-:|]\s*Amazon\.[a-z.]+\s*$/i, '');
  title = title.replace(/\s*[-:|]\s*Amazon\s*$/i, '');
  title = title.replace(/[….]+$/, '').trim();
  return title.length > 200 ? title.slice(0, 200).trim() + '…' : title;
}

/**
 * Cleans marketing boilerplates from Amazon meta descriptions.
 */
function cleanAmazonDescription(rawDesc: string): string {
  let desc = rawDesc.trim();
  desc = desc.replace(/^Amazon\.[a-z]+:\s*(?:Buy\s+)?/i, '');
  return desc.trim() || rawDesc.trim();
}

/**
 * Extracts metadata for Amazon products safely without unauthorized scraping or bot-bypassing.
 * Supports direct authentic product images from Amazon CDN using ASIN and Open Graph HTML extraction.
 */
async function fetchAmazonPreview(urlStr: string): Promise<LinkPreviewMetadata> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    throw new LinkPreviewError('Invalid Amazon URL format.', 400);
  }

  const asin = extractAmazonAsin(urlStr);
  const host = parsed.hostname.toLowerCase();
  const canonicalUrl = asin ? `https://${host}/dp/${asin}` : urlStr;

  // Authentic Amazon global CDN product image directly from ASIN
  const cdnThumbnail = asin
    ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`
    : null;

  const slugTitle = extractAmazonSlugTitle(urlStr);
  const defaultTitle =
    slugTitle || (asin ? `Amazon Product (${asin})` : host.includes('.in') ? 'Amazon India' : 'Amazon');

  const fallbackData: LinkPreviewMetadata = {
    url: urlStr,
    normalizedUrl: canonicalUrl,
    provider: 'amazon',
    title: defaultTitle,
    description: `View product details on Amazon (${host.replace(/^www\./i, '')})`,
    thumbnailUrl: cdnThumbnail,
    siteName: 'Amazon',
    productId: asin || null,
    mediaType: 'product',
    favIcon: 'https://www.amazon.in/favicon.ico',
  };

  try {
    const res = await safeFetchHtml(urlStr);
    if (res.statusCode === 200 && res.html) {
      const meta = parseHtmlMetadata(res.html, res.finalUrl);
      if (
        meta.title &&
        !meta.title.toLowerCase().includes('robot check') &&
        !meta.title.toLowerCase().includes('automated access')
      ) {
        const cleanTitle = cleanAmazonTitle(meta.title);
        const cleanDesc = meta.description
          ? cleanAmazonDescription(meta.description)
          : fallbackData.description;
        return {
          ...fallbackData,
          title: cleanTitle || defaultTitle,
          description: cleanDesc,
          thumbnailUrl: meta.thumbnailUrl || cdnThumbnail,
          siteName: meta.siteName || 'Amazon',
        };
      }
    }
  } catch {
    // If Amazon bot-block/503/timeout occurs, return clean fallback preview safely
  }

  return fallbackData;
}

/**
 * Extracts Open Graph and standard metadata for general websites with SSRF protection.
 */
async function fetchGeneralPreview(urlStr: string): Promise<LinkPreviewMetadata> {
  const parsed = await validateUrlForSsrf(urlStr);
  const host = parsed.hostname;

  const fallbackData: LinkPreviewMetadata = {
    url: urlStr,
    normalizedUrl: parsed.toString(),
    provider: 'general',
    title: host,
    description: null,
    thumbnailUrl: null,
    siteName: host,
    mediaType: 'website',
    favIcon: `https://${host}/favicon.ico`,
  };

  try {
    const res = await safeFetchHtml(urlStr);
    if (res.statusCode >= 200 && res.statusCode < 400 && res.html) {
      const meta = parseHtmlMetadata(res.html, res.finalUrl);
      return {
        ...fallbackData,
        normalizedUrl: res.finalUrl,
        title: meta.title || host,
        description: meta.description || null,
        thumbnailUrl: meta.thumbnailUrl || null,
        siteName: meta.siteName || host,
        favIcon: meta.favIcon || fallbackData.favIcon,
        mediaType: meta.thumbnailUrl ? 'article' : 'website',
      };
    }
  } catch (err: unknown) {
    if (err instanceof LinkPreviewError && err.statusCode === 403) {
      // Re-throw SSRF/403 security blocks immediately
      throw err;
    }
    // Network or parse failure returns minimal fallback card
  }

  return fallbackData;
}

// ---------------------------------------------------------------------------
// 6. Main Link Preview Service Entrypoint
// ---------------------------------------------------------------------------

/**
 * Fetches and canonicalizes link preview metadata for a given URL.
 * Automatically selects the appropriate provider (YouTube, Amazon, or General Website).
 * Enforces strict SSRF protections and caches results for 1 hour.
 */
export async function getLinkPreviewMetadata(urlStr: string): Promise<LinkPreviewMetadata> {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new LinkPreviewError('URL is required for preview generation.', 400);
  }

  const trimmed = urlStr.trim();
  const cached = getCachedPreview(trimmed);
  if (cached) {
    return cached;
  }

  const provider = detectLinkProvider(trimmed);
  let metadata: LinkPreviewMetadata;

  switch (provider) {
    case 'youtube':
      metadata = await fetchYouTubePreview(trimmed);
      break;
    case 'amazon':
      metadata = await fetchAmazonPreview(trimmed);
      break;
    case 'general':
    default:
      metadata = await fetchGeneralPreview(trimmed);
      break;
  }

  // Cache result
  setCachedPreview(trimmed, metadata);
  if (metadata.normalizedUrl && metadata.normalizedUrl !== trimmed) {
    setCachedPreview(metadata.normalizedUrl, metadata);
  }

  return metadata;
}

/**
 * Clears the in-memory preview cache (useful for testing).
 */
export function clearLinkPreviewCache(): void {
  previewCache.clear();
}

/**
 * Convenient alias for getLinkPreviewMetadata.
 */
export const fetchLinkPreview = getLinkPreviewMetadata;
