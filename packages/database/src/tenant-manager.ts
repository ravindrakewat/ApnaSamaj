import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export class TenantDatabaseError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'TenantDatabaseError';
    this.statusCode = statusCode;
  }
}

export class UnknownCommunityTenantError extends TenantDatabaseError {
  constructor(slug: string) {
    super(`No configured database found for community tenant: "${slug}". Access denied.`, 404);
    this.name = 'UnknownCommunityTenantError';
  }
}

export class TenantConfigurationError extends TenantDatabaseError {
  constructor(message: string) {
    super(message, 500);
    this.name = 'TenantConfigurationError';
  }
}

export interface TenantCommunityConfig {
  slug: string;
  name: string;
  databaseUrl: string;
  directUrl?: string;
  connectionLimit?: number;
}

export interface TenantSafeMetadata {
  slug: string;
  name: string;
  isConfigured: boolean;
  host: string;
  port: string;
  protocol: string;
}

/**
 * Sanitizes any database connection string by stripping credentials.
 * Prevents passwords from leaking into application logs, error traces, or reports.
 */
export function sanitizeDatabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '[EMPTY_DATABASE_URL]';
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = parsed.pathname || '';
    return `${parsed.protocol}//[REDACTED_CREDENTIALS]@${host}${port}${pathname}`;
  } catch {
    return '[MALFORMED_DATABASE_URL]';
  }
}

/**
 * Extracts safe, non-sensitive connection metadata from a database URL.
 */
export function extractSafeMetadata(slug: string, name: string, rawUrl: string): TenantSafeMetadata {
  try {
    const parsed = new URL(rawUrl);
    return {
      slug,
      name,
      isConfigured: true,
      host: parsed.hostname || 'unknown',
      port: parsed.port || '5432',
      protocol: parsed.protocol || 'postgresql:',
    };
  } catch {
    return {
      slug,
      name,
      isConfigured: false,
      host: 'invalid',
      port: '',
      protocol: '',
    };
  }
}

/**
 * Manages independent PrismaClient instances for multiple community databases.
 * Guarantees:
 * 1. Only preconfigured, trusted community connections are accessible.
 * 2. Never accepts arbitrary database URLs or connection credentials from client parameters.
 * 3. Caches Prisma clients per community to prevent connection pool exhaustion.
 * 4. Gracefully disconnects all pooled connections on shutdown.
 */
export class TenantDatabaseManager {
  private registry = new Map<string, TenantCommunityConfig>();
  private clients = new Map<string, PrismaClient>();
  private clientFactory?: (url: string) => PrismaClient;

  constructor(clientFactory?: (url: string) => PrismaClient) {
    this.clientFactory = clientFactory;
    this.loadFromEnvironment();
  }

  /**
   * Loads trusted community configurations from preconfigured environment variables.
   */
  public loadFromEnvironment(): void {
    // 1. Default Kewat community: uses COMMUNITY_KEWAT_DATABASE_URL or falls back to DATABASE_URL
    const kewatDbUrl =
      process.env.COMMUNITY_KEWAT_DATABASE_URL ||
      process.env.DATABASE_URL;

    if (kewatDbUrl && kewatDbUrl.trim().length > 0) {
      this.registerCommunity({
        slug: 'kewat',
        name: 'Kewat Samaj',
        databaseUrl: kewatDbUrl.trim(),
        directUrl: process.env.COMMUNITY_KEWAT_DIRECT_URL || process.env.DIRECT_URL,
        connectionLimit: 10,
      });
    }

    // 2. Gupta community: uses COMMUNITY_GUPTA_DATABASE_URL
    const guptaDbUrl = process.env.COMMUNITY_GUPTA_DATABASE_URL;
    if (guptaDbUrl && guptaDbUrl.trim().length > 0) {
      this.registerCommunity({
        slug: 'gupta',
        name: 'Gupta Samaj',
        databaseUrl: guptaDbUrl.trim(),
        directUrl: process.env.COMMUNITY_GUPTA_DIRECT_URL,
        connectionLimit: 10,
      });
    }

    // 3. Scan for any other COMMUNITY_<SLUG>_DATABASE_URL
    for (const [key, value] of Object.entries(process.env)) {
      if (
        key.startsWith('COMMUNITY_') &&
        key.endsWith('_DATABASE_URL') &&
        key !== 'COMMUNITY_KEWAT_DATABASE_URL' &&
        key !== 'COMMUNITY_GUPTA_DATABASE_URL'
      ) {
        const rawSlug = key
          .replace('COMMUNITY_', '')
          .replace('_DATABASE_URL', '')
          .toLowerCase();
        if (value && value.trim().length > 0 && !this.registry.has(rawSlug)) {
          this.registerCommunity({
            slug: rawSlug,
            name: `${rawSlug.toUpperCase()} Samaj`,
            databaseUrl: value.trim(),
            connectionLimit: 10,
          });
        }
      }
    }
  }

  /**
   * Registers a trusted community database configuration.
   * Throws if the configuration is invalid.
   */
  public registerCommunity(config: TenantCommunityConfig): void {
    const normalizedSlug = config.slug.toLowerCase().trim();

    if (!normalizedSlug || normalizedSlug.length < 2) {
      throw new TenantConfigurationError('Invalid community slug for database registration.');
    }

    if (!config.databaseUrl || typeof config.databaseUrl !== 'string') {
      throw new TenantConfigurationError(
        `Invalid database URL provided for community tenant "${normalizedSlug}".`
      );
    }

    try {
      const parsed = new URL(config.databaseUrl);
      if (!parsed.protocol.startsWith('postgres')) {
        throw new TenantConfigurationError(
          `Invalid protocol "${parsed.protocol}" for community tenant "${normalizedSlug}". Expected postgresql:`
        );
      }
    } catch (err: unknown) {
      if (err instanceof TenantConfigurationError) throw err;
      throw new TenantConfigurationError(
        `Malformed database connection string for community tenant "${normalizedSlug}".`
      );
    }

    this.registry.set(normalizedSlug, {
      ...config,
      slug: normalizedSlug,
      connectionLimit: config.connectionLimit || 10,
    });
  }

  /**
   * Checks whether a community tenant is configured in the trusted registry.
   */
  public hasCommunity(slug: string): boolean {
    if (!slug) return false;
    return this.registry.has(slug.toLowerCase().trim());
  }

  /**
   * Returns configuration for an individual community tenant.
   */
  public getCommunityConfig(slug: string): TenantCommunityConfig | undefined {
    return this.registry.get(slug.toLowerCase().trim());
  }

  /**
   * Returns configurations for all registered communities.
   */
  public getAllCommunityConfigs(): TenantCommunityConfig[] {
    return Array.from(this.registry.values());
  }

  /**
   * Returns a cached PrismaClient for the specified community slug.
   * If not already connected, lazily instantiates a new client with tuned connection pooling.
   * Never accepts unverified client connection parameters.
   */
  public getClient(slug: string): PrismaClient {
    if (!slug) {
      throw new UnknownCommunityTenantError('empty');
    }

    const normalizedSlug = slug.toLowerCase().trim();
    let client = this.clients.get(normalizedSlug);

    if (client) {
      return client;
    }

    const config = this.registry.get(normalizedSlug);
    if (!config) {
      throw new UnknownCommunityTenantError(normalizedSlug);
    }

    // Tune pool limit to prevent exhausting database connection limits
    let finalUrl = config.databaseUrl;
    if (config.connectionLimit && !finalUrl.includes('connection_limit=')) {
      finalUrl += finalUrl.includes('?')
        ? `&connection_limit=${config.connectionLimit}`
        : `?connection_limit=${config.connectionLimit}`;
    }

    if (this.clientFactory) {
      client = this.clientFactory(finalUrl);
    } else {
      client = new PrismaClient({
        datasources: {
          db: { url: finalUrl },
        },
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      });
    }

    (client as any)._tenantSlug = normalizedSlug;
    this.clients.set(normalizedSlug, client);
    return client;
  }

  /**
   * Sets a cached PrismaClient for a community slug (useful for testing or connection injection).
   */
  public setClient(slug: string, client: PrismaClient, name?: string): void {
    const normalizedSlug = slug.toLowerCase().trim();
    if (!this.registry.has(normalizedSlug)) {
      this.registry.set(normalizedSlug, {
        slug: normalizedSlug,
        name: name || `${normalizedSlug.toUpperCase()} Samaj`,
        databaseUrl: `postgresql://mock:mock@localhost:5432/${normalizedSlug}`,
      });
    }
    (client as any)._tenantSlug = normalizedSlug;
    this.clients.set(normalizedSlug, client);
  }

  /**
   * Finds the tenant slug associated with an instantiated PrismaClient instance.
   */
  public getCommunitySlugForClient(client?: PrismaClient): string | null {
    if (!client) return null;
    if ((client as any)._tenantSlug) return (client as any)._tenantSlug;
    for (const [slug, c] of this.clients.entries()) {
      if (c === client) return slug;
    }
    return null;
  }

  /**
   * Returns non-sensitive connection metadata for a single community.
   */
  public getSafeMetadata(slug: string): TenantSafeMetadata | null {
    const config = this.registry.get(slug.toLowerCase().trim());
    if (!config) return null;
    return extractSafeMetadata(config.slug, config.name, config.databaseUrl);
  }

  /**
   * Returns non-sensitive connection metadata for all registered communities.
   */
  public getAllSafeMetadata(): TenantSafeMetadata[] {
    return Array.from(this.registry.values()).map((config) =>
      extractSafeMetadata(config.slug, config.name, config.databaseUrl)
    );
  }

  /**
   * Lists all approved, preconfigured community slugs.
   */
  public listConfiguredSlugs(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Gracefully disconnects a specific tenant's PrismaClient and evicts it from cache.
   */
  public async disconnect(slug: string): Promise<void> {
    const normalizedSlug = slug.toLowerCase().trim();
    const client = this.clients.get(normalizedSlug);
    if (client) {
      await client.$disconnect();
      this.clients.delete(normalizedSlug);
    }
  }

  /**
   * Gracefully disconnects all active tenant clients and flushes the connection pool.
   * Crucial for graceful server shutdown and testing.
   */
  public async disconnectAll(): Promise<void> {
    for (const [slug, client] of this.clients.entries()) {
      try {
        await client.$disconnect();
      } catch (err: unknown) {
        console.warn(`[TenantDatabaseManager] Error disconnecting tenant "${slug}":`, err);
      }
    }
    this.clients.clear();
  }

  /**
   * Clears all registrations and cached clients (strictly for test isolation).
   */
  public clearRegistry(): void {
    this.registry.clear();
    this.clients.clear();
  }
}

/**
 * Singleton instance of the TenantDatabaseManager.
 */
export const tenantDbManager = new TenantDatabaseManager();
