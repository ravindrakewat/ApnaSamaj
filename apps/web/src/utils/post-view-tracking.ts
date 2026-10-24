/**
 * Post View Tracking Utilities & Session Cache
 * Ensures reliable deduplication, retry safety on failures,
 * concurrent in-flight suppression, and accurate visibility measurement.
 */

// Module-level session cache: tracks posts that have completed a verified view recording in this active browser session
export const viewedPostsSession = new Set<string>();

// In-flight locking: tracks active API dispatches to suppress simultaneous duplicate requests
export const inFlightViewRequests = new Set<string>();

// In-flight count locking: tracks active GET dispatches to suppress simultaneous duplicate count requests
export const inFlightCountRequests = new Set<string>();

// In-memory cache for aggregate post view counts (persists across re-renders in the session)
export const cachedPostViewCounts = new Map<string, { totalViews: number; uniqueMembers: number }>();

/**
 * Evaluates whether a post card has attained genuine, meaningful visibility.
 * - Standard/compact cards: passes when intersectionRatio >= 0.5 (50% or more visible).
 * - Tall cards (e.g. multi-image posts exceeding viewport height): passes when
 *   visible height >= Math.min(200, viewportHeight * 0.35).
 */
export function isCardSubstantiallyVisible(
  entry: {
    isIntersecting: boolean;
    intersectionRatio: number;
    intersectionRect?: { height: number };
  },
  customViewportHeight?: number
): boolean {
  if (!entry.isIntersecting) return false;

  // Standard/compact cards
  if (entry.intersectionRatio >= 0.5) return true;

  // Tall cards that exceed screen or container bounds
  const visibleHeight = entry.intersectionRect ? entry.intersectionRect.height : 0;
  const viewportHeight =
    customViewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const heightThreshold = Math.min(200, viewportHeight * 0.35);

  return visibleHeight >= heightThreshold;
}

/**
 * Triggers a view record API call with:
 * - Session-level deduplication check
 * - In-flight concurrency suppression
 * - Retry safety (only caches upon confirmed valid server response)
 * - Support for legitimate zero-count responses
 */
export async function triggerPostViewRecord<T extends { totalViews: number; uniqueMembers: number }>(
  postId: string,
  userId: string | undefined,
  recordApiCall: (postId: string) => Promise<T | null | undefined>
): Promise<{ success: boolean; data?: T }> {
  // Feed retrieval alone or unauthenticated users must not record views
  if (!userId) {
    return { success: false };
  }

  // Deduplication check: already confirmed in this session
  if (viewedPostsSession.has(postId)) {
    return { success: false };
  }

  // Concurrency check: already in-flight for this post
  if (inFlightViewRequests.has(postId)) {
    return { success: false };
  }

  inFlightViewRequests.add(postId);
  try {
    const res = await recordApiCall(postId);

    // Treat a successful response with valid aggregate numeric fields as success, even if counts are zero
    if (
      res &&
      typeof res.totalViews === 'number' &&
      typeof res.uniqueMembers === 'number'
    ) {
      viewedPostsSession.add(postId);
      cachedPostViewCounts.set(postId, {
        totalViews: res.totalViews,
        uniqueMembers: res.uniqueMembers,
      });
      return { success: true, data: res };
    }

    // Invalid response format -> allow later retry
    return { success: false };
  } catch (err) {
    // On failure/timeout/network error: do NOT mark as viewed in session, allowing future retry
    return { success: false };
  } finally {
    // Release in-flight lock
    inFlightViewRequests.delete(postId);
  }
}

/**
 * Loads aggregate view counts for a post via GET without recording a view.
 * - Suppresses simultaneous in-flight duplicate requests for the same post.
 * - If the server indicates the current user has already viewed the post (hasViewed: true),
 *   caches the post in viewedPostsSession so future view recordings in this session are skipped.
 * - Updates cachedPostViewCounts.
 */
export async function fetchPostViewCounts<
  T extends { totalViews: number; uniqueMembers: number; hasViewed?: boolean }
>(
  postId: string,
  userId: string | undefined,
  getApiCall: (postId: string) => Promise<T | null | undefined>
): Promise<{ success: boolean; data?: T }> {
  if (!userId) {
    return { success: false };
  }

  if (inFlightCountRequests.has(postId)) {
    return { success: false };
  }

  inFlightCountRequests.add(postId);
  try {
    const res = await getApiCall(postId);

    if (
      res &&
      typeof res.totalViews === 'number' &&
      typeof res.uniqueMembers === 'number'
    ) {
      if (res.hasViewed) {
        viewedPostsSession.add(postId);
      }
      cachedPostViewCounts.set(postId, {
        totalViews: res.totalViews,
        uniqueMembers: res.uniqueMembers,
      });
      return { success: true, data: res };
    }

    return { success: false };
  } catch (err) {
    return { success: false };
  } finally {
    inFlightCountRequests.delete(postId);
  }
}
