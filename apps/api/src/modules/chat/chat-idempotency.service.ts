/**
 * Chat Idempotency Service
 *
 * Provides a two-layer idempotency defense for Group and Personal Chat:
 * 1. In-flight Promise locking: Collapses concurrent duplicate requests with the same tempId into a single execution.
 * 2. Short-term completion cache: Caches confirmed message results (5-minute TTL) to instantly return existing records on network timeout retries.
 *
 * Idempotency keys are strictly scoped to:
 * `${tenantSlug}:${contextType}:${contextId}:${senderId}:${tempId}`
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class ChatIdempotencyService {
  private inFlightMap = new Map<string, Promise<any>>();
  private completedCache = new Map<string, CacheEntry<any>>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Constructs a strictly scoped idempotency key.
   */
  public buildKey(
    tenantSlug: string,
    contextType: 'GROUP' | 'DIRECT',
    contextId: string,
    senderId: string,
    tempId: string
  ): string {
    return `${tenantSlug.trim()}:${contextType}:${contextId.trim()}:${senderId.trim()}:${tempId.trim()}`;
  }

  /**
   * Executes an asynchronous operation idempotently.
   * If key is undefined or empty, executes without idempotency guards.
   */
  public async executeIdempotent<T>(
    key: string | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!key) {
      return operation();
    }

    this.pruneExpired();

    // 1. Check if a completed result is already cached
    const cached = this.completedCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    // 2. Check if the same request is currently in-flight
    const inFlight = this.inFlightMap.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    // 3. Execute the operation and track in-flight promise
    const promise = (async () => {
      try {
        const result = await operation();
        this.completedCache.set(key, {
          value: result,
          expiresAt: Date.now() + this.ttlMs,
        });
        return result;
      } finally {
        this.inFlightMap.delete(key);
      }
    })();

    this.inFlightMap.set(key, promise);
    return promise;
  }

  /**
   * Directly stores a confirmed message into the cache (e.g. from DB lookup).
   */
  public setCompleted<T>(key: string, value: T): void {
    if (!key) return;
    this.completedCache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Retrieves a completed message from the cache if available.
   */
  public getCompleted<T>(key: string): T | undefined {
    if (!key) return undefined;
    const entry = this.completedCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as T;
    }
    return undefined;
  }

  /**
   * Prunes expired cache entries to prevent memory leaks.
   */
  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.completedCache.entries()) {
      if (entry.expiresAt <= now) {
        this.completedCache.delete(key);
      }
    }
  }

  /**
   * Clears all in-flight promises and cached results. Used in unit tests.
   */
  public clearForTesting(): void {
    this.inFlightMap.clear();
    this.completedCache.clear();
  }
}

export const chatIdempotencyService = new ChatIdempotencyService();

