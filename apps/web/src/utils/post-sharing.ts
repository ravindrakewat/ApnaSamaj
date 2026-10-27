/**
 * Utilities for Post Sharing, WhatsApp formatting, and Web Share API.
 * Ensures the canonical post URL is never duplicated across native share or WhatsApp links.
 */

export interface ShareFormatOptions {
  authorName: string;
  content?: string | null;
  canonicalUrl: string;
  isPrivateGroup?: boolean;
}

export interface FormattedSharePayload {
  title: string;
  nativeShareText: string;
  canonicalUrl: string;
  whatsappMessage: string;
  whatsappUrl: string;
}

/**
 * Extracts a clean excerpt from the post content, stripping any embedded duplicate
 * of the canonical URL so it never appears twice.
 */
export function getCleanShareSnippet(content?: string | null, canonicalUrl?: string): string {
  if (!content) return '';
  let cleaned = content.trim();

  // If content contains the canonical URL, strip it to prevent duplicate URL display
  if (canonicalUrl && cleaned.includes(canonicalUrl)) {
    cleaned = cleaned.replace(canonicalUrl, '').trim();
  }

  if (!cleaned) return '';
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
}

/**
 * Formats sharing payload for both Native Web Share and WhatsApp URL sharing.
 * Guarantees that canonicalUrl appears EXACTLY ONCE in both targets.
 */
export function buildSharePayload({
  authorName,
  content,
  canonicalUrl,
  isPrivateGroup = false,
}: ShareFormatOptions): FormattedSharePayload {
  const title = isPrivateGroup
    ? `${authorName} on Apna Samaj (Private Group)`
    : `${authorName} on Apna Samaj`;
  const snippet = getCleanShareSnippet(content, canonicalUrl);

  // Native Web Share:
  // When passing `url: canonicalUrl`, `text` MUST NOT contain `canonicalUrl`
  // because native share targets (WhatsApp, Slack, Twitter, etc.) append the URL to the text.
  const nativeShareText = snippet
    ? `*${title}*:\n"${snippet}"`
    : `*${title}*`;

  // WhatsApp Message (direct URL parameter):
  // WhatsApp direct API uses a single text string. Include the author header,
  // excerpt (if present and not just the URL), and canonical URL exactly once.
  const whatsappMessage = snippet
    ? `*${title}*:\n"${snippet}"\n\n${canonicalUrl}`
    : `*${title}*:\n${canonicalUrl}`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;

  return {
    title,
    nativeShareText,
    canonicalUrl,
    whatsappMessage,
    whatsappUrl,
  };
}
