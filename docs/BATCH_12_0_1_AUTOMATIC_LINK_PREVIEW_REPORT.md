# Batch 12.0.1: Automatic Link Preview & Thumbnail Generation (Mobile + Website)

## Executive Summary

| Attribute | Specification |
|:---|:---|
| **Batch Identifier** | Batch 12.0.1 |
| **Feature Name** | Automatic Link Preview & Thumbnail Generation |
| **Platforms Covered** | Mobile App (`apps/mobile`), Member Web Portal (`apps/web`), Backend API (`apps/api`), Shared Packages (`packages/shared-types`, `packages/validation`) |
| **Database Migration** | **None (Zero Migrations)** — Fully backward-compatible inline content metadata envelope (`<!--apnasamaj:link-preview:${b64}-->`) |
| **Security Controls** | Anti-SSRF, RFC 1918 private IP rejection, Cloud metadata rejection, Anti-DNS-Rebinding inspection, Hop-by-hop redirect re-validation, 512KB stream cut-off, Rate limiting |
| **Automated Tests** | 67 / 67 Tests Passed (`apps/api/src/tests/link-preview.test.ts`) |
| **TypeScript Status** | 0 Typecheck Errors across all 10 workspaces (`npm run typecheck`) |
| **Production Builds** | `@apnasamaj/web` (Vite) clean, `@apnasamaj/admin` (Vite) clean |
| **Final Verdict** | **READY FOR PRODUCTION TESTING** |

---

## 1. Scope & Architectural Overview

When community members paste or type links into post composers across the **Mobile App** or **Web Portal**, the application automatically identifies supported URLs, extracts rich metadata (title, description, thumbnail image, provider branding, site name), and presents an interactive preview card.

### Key Architectural Invariants Preserved
1. **Multi-Tenant Context:** `req.db` tenant-specific Prisma context and `assertDb(req.db)` are strictly preserved.
2. **Zero Schema Alterations:** Stored without adding new Prisma models or database migrations. Metadata is serialized into a resilient Base64 HTML comment at the end of `post.content`:
   ```text
   Original user post text here.
   
   <!--apnasamaj:link-preview:eyJ1cmwiOiJodHRwczovL3d3dy55b3V0dWJlLmNvbS93YXRjaD92PWRRd...-->
   ```
   Older clients render the post text cleanly while ignoring the comment; new mobile and web clients decode and strip the comment in `mapToPostItem` and display the rich preview card.
3. **SSRF Guard:** Backend never touches private subnets, cloud metadata IP (`169.254.169.254`), loopbacks, or local services. DNS resolutions are validated before socket connections to prevent DNS rebinding attacks.

---

## 2. Supported Link Types & Extraction Strategy

### A. YouTube
- **URL Patterns Detected:**
  - `youtube.com/watch?v=VIDEO_ID`
  - `youtu.be/VIDEO_ID`
  - `youtube.com/shorts/VIDEO_ID`
  - `youtube.com/embed/VIDEO_ID`
- **Extraction Mechanism:**
  - YouTube public oEmbed endpoint (`https://www.youtube.com/oembed?url=...&format=json`) is queried with high-speed timeout (3.5s).
  - Fast thumbnail fallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` if oEmbed is unavailable.
  - Zero API key dependency for basic public YouTube video previews.

### B. Amazon
- **Supported Domains:** `amazon.in`, `amazon.com`, `www.amazon.in`, `www.amazon.com`.
- **URL Patterns:** `/dp/ASIN`, `/gp/product/ASIN`, slugged product URLs with ref parameters.
- **Extraction & Enhancement Mechanism:**
  - Standard browser-compatible headers (`Chrome/124.0.0.0`) are supplied, allowing Amazon to return standard HTTP 200 responses with full `<title>` and `<meta name="description">`.
  - **Authentic Product Images via Amazon CDN:** Because Amazon omits `og:image` from HTML `<head>` in favor of JavaScript carousels, the system leverages Amazon's official global CloudFront image CDN (`https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`) plus HTML `landingImage` / `data-old-hires` extraction to render authentic high-resolution product photos.
  - **Boilerplate Stripping (`cleanAmazonTitle`):** Automatically cleans marketing boilerplate prefixes and suffixes (`Buy ... Online at Low Prices in India - Amazon.in`), leaving clean, readable product titles (e.g. `ANCHARA Butter Paper, Burger Patty Paper, Non-Stick Squares Wax Paper Sheets for Seperating Patty, Cookies, Baking, Wrapping Candies Parchment Paper, Size-10x10 inch, Pack of 100 pcs`).
  - **URL Slug Fallback:** Extracts product name directly from the URL path slug (e.g. `ANCHARA-Seperating-inch-100-pcs`) if network timeouts or challenges occur.
  - **Clean Branded Fallback Card:** If Amazon returns a challenge or 503, the system renders a clean branded fallback preview showing Amazon branding, product ASIN (`Amazon Product (B08N5WRWNW)`), domain, and direct link to the authentic Amazon store.
  - *Future Enhancement Note:* Full automated price and inventory extraction can be enabled by connecting the Amazon Product Advertising API (PA-API) with official seller/associate credentials.

### C. General Websites
- **Supported Standards:**
  - Open Graph (`og:title`, `og:description`, `og:image`, `og:site_name`)
  - Twitter Cards (`twitter:title`, `twitter:description`, `twitter:image`)
  - Fallback HTML (`<title>`, `<meta name="description">`, `<link rel="icon">`)
- **Relative URL Resolution:** Relative image and favicon paths (`/assets/banner.jpg`) are automatically resolved against the page's base URL.
- **HTML Entity Decoding:** All extracted strings are sanitized and decoded (`&amp;` &rarr; `&`, `&#39;` &rarr; `'`).

---

## 3. Security & Anti-SSRF Protections

| Threat Vector | Mitigation Strategy | Implementation |
|:---|:---|:---|
| **Localhost / Loopback Access** | Reject `localhost`, `127.0.0.0/8`, `::1` | `isPrivateIPv4`, `isPrivateIPv6`, `BLOCKED_HOSTNAMES` |
| **Intranet / Private CIDR Probing** | Reject `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`, `fe80::/10` | IP parser & bitmask boundary verification |
| **Cloud Metadata Theft** | Reject `169.254.169.254`, `metadata.google.internal`, `instance-data` | Hard-coded blocklist + CIDR check |
| **DNS Rebinding Attacks** | Pre-resolve DNS via `dns.promises.lookup({ all: true })` and inspect **all** returned IP records before establishing HTTP socket | `validateUrlForSsrf` |
| **Redirect Exploits (Hop SSRF)** | Custom redirect follower (max 3 hops); every redirect `Location` header passes the full SSRF pipeline before the next hop is requested | `safeFetchHtml` hop loop |
| **Denial of Service / OOM** | 4-second socket timeout, 512KB max response stream cutoff (`res.destroy()`) | Stream chunk counter |
| **Abuse & Scraping Spikes** | In-memory LRU TTL Cache (1 hour, 1,000 items) + Express Rate Limiter (30 requests/minute per IP) | `linkPreviewRateLimiter`, `previewCache` |

---

## 4. User Experience & Composer Parity

### Mobile App (`apps/mobile`)
- **Composer (`app/(app)/post/create.tsx`):**
  - Debounced (500ms) URL detection scanning `content`.
  - Horizontal scroll chips for URL selection when multiple URLs are pasted.
  - Loading banner with spinner while fetching preview.
  - Error banner with **Retry** button on network timeouts.
  - Preview card displayed below content with top-right 'X' remove button.
  - Respects user removal so dismissed previews do not re-appear while editing the same URL.
- **Feed (`src/components/feed/PostCard.tsx`):**
  - Renders `<LinkPreviewCard />` below post content.
  - Tapping opens the authentic URL via native `Linking.openURL()`.

### Member Web Portal (`apps/web`)
- **Composer (`src/components/CreatePostComposer.tsx`):**
  - Debounced URL extraction and multi-link chip selector.
  - Interactive preview card below post content with remove chip and loading state.
  - Integrated into form reset and submission payload.
- **Feed & Detail Pages (`src/components/PostCard.tsx`, `PostDetailPage.tsx`):**
  - Renders `<LinkPreviewCard />` with 16:9 thumbnail, domain chip, provider icon, title, description, and external open action (`target="_blank" rel="noopener noreferrer"`).

---

## 5. Files Changed & Added

### Shared Packages
- **`packages/shared-types/src/post.ts`**:
  - Added `LinkPreviewProvider` (`'youtube' | 'amazon' | 'general'`).
  - Added `LinkPreviewMetadata` interface.
  - Added optional `linkPreview?: LinkPreviewMetadata | null` to `PostItem`, `CreatePostRequest`, and `UpdatePostRequest`.
- **`packages/validation/src/post.ts`**:
  - Added `linkPreviewSchema` and `getLinkPreviewQuerySchema`.
  - Added regex URL extraction utility: `extractUrlsFromText(text)`.
  - Added provider classification: `detectLinkProvider(url)` and `extractAmazonAsin(url)`.
  - Updated `createPostSchema` and `updatePostSchema`.

### Backend API (`apps/api`)
- **`apps/api/src/services/link-preview.service.ts`** *(NEW)*:
  - Core link preview engine: SSRF validator, HTTP streaming client, Open Graph parser, YouTube oEmbed handler, Amazon fallback handler, and in-memory TTL cache.
- **`apps/api/src/middleware/rate-limiter.ts`**:
  - Exported `linkPreviewRateLimiter` (30 requests/min).
- **`apps/api/src/modules/link-preview/`** *(NEW MODULE)*:
  - `linkPreview.controller.ts`, `linkPreview.routes.ts`, `index.ts`.
- **`apps/api/src/app.ts` & `apps/api/src/modules/posts/posts.routes.ts`**:
  - Mounted `/api/v1/link-preview` and alias `/api/v1/posts/link-preview`.
- **`apps/api/src/modules/posts/posts.service.ts`**:
  - Added `encodeLinkPreviewInContent` and `extractLinkPreviewFromContent`.
  - Updated `mapToPostItem`, `createPost`, and `updatePost` for metadata roundtripping.
- **`apps/api/src/tests/link-preview.test.ts`** *(NEW)*:
  - Comprehensive automated test suite (67 test assertions).

### Member Web Portal (`apps/web`)
- **`apps/web/src/services/posts.service.ts`**:
  - Added `fetchLinkPreviewApi(url: string)`.
- **`apps/web/src/components/LinkPreviewCard.tsx`** *(NEW)*:
  - Responsive preview card with image fallback, provider badges, domain chip, and external link action.
- **`apps/web/src/components/CreatePostComposer.tsx`**:
  - Debounced URL extraction, preview loading, URL selector chips, and preview removal.
- **`apps/web/src/components/PostCard.tsx`**:
  - Renders `LinkPreviewCard` below post content.

### Mobile App (`apps/mobile`)
- **`apps/mobile/src/api/posts.api.ts`**:
  - Added `fetchLinkPreview(url: string)`.
- **`apps/mobile/src/components/feed/LinkPreviewCard.tsx`** *(NEW)*:
  - Native card with 16:9 thumbnail, loading overlay, YouTube play badge, Amazon/General badge, domain row, and composer remove button.
- **`apps/mobile/src/components/feed/index.ts`**:
  - Exported `LinkPreviewCard`.
- **`apps/mobile/app/(app)/post/create.tsx`**:
  - Added URL detection, multi-link chips, debounced preview fetching, retry button, remove preview, and `linkPreview` payload integration.
- **`apps/mobile/src/components/feed/PostCard.tsx`**:
  - Renders `LinkPreviewCard` below `post.content`.

---

## 6. Verification Results

### 1. Automated Link Preview Test Suite
Command: `npx tsx apps/api/src/tests/link-preview.test.ts`
```text
================================================================
   Apna Samaj — Batch 12.0.1: Automatic Link Preview Tests
================================================================

--- 1. URL Detection & Provider Identification Tests ---
✅ PASS: Extracts exact 3 URLs from mixed text (found: 3)
✅ PASS: Extracts Amazon URL without trailing punctuation
✅ PASS: Extracts YouTube URL without exclamation mark
✅ PASS: Extracts general website URL without trailing dot
✅ PASS: Deduplicates identical URLs in post text
✅ PASS: Returns empty array when no URLs present
✅ PASS: Rejects non-HTTP(S) URLs in extraction
✅ PASS: Identifies standard YouTube watch URL
✅ PASS: Identifies youtu.be short URL
✅ PASS: Identifies YouTube Shorts URL
✅ PASS: Identifies YouTube embed URL
✅ PASS: Identifies Amazon.in product URL
✅ PASS: Identifies Amazon.com product URL with query params
✅ PASS: Identifies general news site as general provider
✅ PASS: Identifies GitHub URL as general provider
✅ PASS: Extracts 10-char ASIN from /dp/ URL
✅ PASS: Extracts ASIN from slugged /dp/ URL
✅ PASS: Extracts ASIN from /gp/product/ URL
✅ PASS: Returns null for non-product Amazon URL

--- 2. SSRF Protection & Security Invariant Tests ---
✅ PASS: Blocks IPv4 loopback (127.0.0.1)
✅ PASS: Blocks full 127.0.0.0/8 loopback subnet
✅ PASS: Blocks Class A private IP (10.0.0.1)
✅ PASS: Blocks full 10.0.0.0/8 subnet
✅ PASS: Blocks Class B private IP start (172.16.0.1)
✅ PASS: Blocks Class B private IP end (172.31.255.254)
✅ PASS: Allows public IP outside Class B private (172.32.0.1)
✅ PASS: Blocks Class C private IP (192.168.1.1)
✅ PASS: Blocks Cloud metadata link-local IP (169.254.169.254)
✅ PASS: Blocks 0.0.0.0
✅ PASS: Allows valid public IP (8.8.8.8)
✅ PASS: Allows valid public IP (1.1.1.1)
✅ PASS: Blocks IPv6 loopback (::1)
✅ PASS: Blocks IPv6 link-local (fe80::1)
✅ PASS: Blocks IPv6 unique local (fc00::1)
✅ PASS: Blocks IPv6 unique local fd::
✅ PASS: Blocks IPv4-mapped loopback in IPv6 (::ffff:127.0.0.1)
✅ PASS: Blocks IPv4-mapped private in IPv6
✅ PASS: Allows valid public IPv6 address
✅ PASS: Rejects localhost with 400 or 403 Forbidden status code
✅ PASS: validateUrlForSsrf throws on localhost
✅ PASS: validateUrlForSsrf throws on direct 127.0.0.1 IP
✅ PASS: validateUrlForSsrf throws on cloud metadata IP
✅ PASS: validateUrlForSsrf throws on unsupported non-HTTP protocol
✅ PASS: validateUrlForSsrf throws on javascript: pseudo-protocol

--- 3. HTML Metadata & Open Graph Extractor Tests ---
✅ PASS: Prefers og:title and decodes HTML entities
✅ PASS: Extracts og:description
✅ PASS: Resolves relative og:image against baseUrl
✅ PASS: Resolves relative favicon against baseUrl
✅ PASS: Extracts og:site_name
✅ PASS: Falls back to standard <title> tag
✅ PASS: Falls back to <meta name="description">

--- 4. Cache & Post Content Encoding Tests ---
✅ PASS: fetchLinkPreview identifies YouTube provider
✅ PASS: fetchLinkPreview provides thumbnail for YouTube
✅ PASS: fetchLinkPreview provides title for YouTube
✅ PASS: fetchLinkPreview identifies Amazon provider
✅ PASS: fetchLinkPreview extracts ASIN for Amazon
✅ PASS: fetchLinkPreview sets siteName to Amazon

--- 5. Content Base64 Envelope & Extraction Tests ---
✅ PASS: Encodes link preview comment in content
✅ PASS: Strips HTML comment leaving clean post content
✅ PASS: Decodes link preview object successfully
✅ PASS: Preserves title across encode/decode roundtrip
✅ PASS: Preserves URL across encode/decode roundtrip
✅ PASS: Preserves provider across encode/decode roundtrip
✅ PASS: Leaves plain content unchanged
✅ PASS: Returns null preview when comment absent

--- 6. Schema Validation Tests ---
✅ PASS: linkPreviewSchema successfully validates LinkPreviewMetadata
✅ PASS: createPostSchema validates payload containing linkPreview

================================================================
   Tests Completed: 67 PASSED, 0 FAILED
================================================================
```

### 2. Monorepo Typecheck
Command: `npm run typecheck`
- `@apnasamaj/admin`: 0 errors
- `@apnasamaj/api`: 0 errors
- `@apnasamaj/mobile`: 0 errors
- `@apnasamaj/web`: 0 errors
- `@apnasamaj/database`: 0 errors
- `@apnasamaj/i18n`: 0 errors
- `@apnasamaj/shared-types`: 0 errors
- `@apnasamaj/ui-config`: 0 errors
- `@apnasamaj/validation`: 0 errors
- **Result:** Exit code 0 (Clean).

### 3. Production Builds
- `npm run build -w @apnasamaj/web`: **Success** (`dist/` generated, 14.99s).
- `npm run build -w @apnasamaj/admin`: **Success** (`dist/` generated, 11.79s).

---

## 7. Manual Testing Instructions

1. **YouTube Preview:**
   - Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` or Shorts link in post composer.
   - Verify loading spinner displays for < 1s, followed by thumbnail, title, and YouTube badge.
   - Publish post; verify card renders in feed. Click card to verify video plays or opens.
2. **Amazon Preview:**
   - Paste `https://www.amazon.in/dp/B08N5WRWNW` in composer.
   - Verify card displays Amazon branding, extracted ASIN, and product page link without errors.
3. **General Open Graph Preview:**
   - Paste `https://github.com` or `https://news.ycombinator.com`.
   - Verify site title, description, and domain pill display properly.
4. **Multiple Links:**
   - Paste text with two URLs: `Look at https://youtu.be/dQw4w9WgXcQ and also check https://example.com`.
   - Verify chips appear allowing switching between the two links.
5. **Dismissal & Publish:**
   - Tap 'X' button on preview card; verify card disappears while URL stays in text.
   - Publish post; verify post renders without preview card.

---

## 8. Final Status & Mandatory Halt Notice

- **Verdict:** **READY FOR PRODUCTION TESTING**
- **Git Safety Rule:** STOPPED. As required by user guidelines, no Git commit, push, database migration, or deployment has been executed. Awaiting user review and authorization.
