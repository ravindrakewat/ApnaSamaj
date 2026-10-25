import { z } from 'zod';

/**
 * Reserved subdomains and system routes that cannot be used as community slugs.
 */
export const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'www',
  'mail',
  'support',
  'staging',
  'dev',
  'app',
  'portal',
  'dashboard',
  'static',
  'assets',
  'cdn',
  'auth',
  'samaz',
] as const;

/**
 * Validates a community slug:
 * - 2 to 30 characters
 * - lowercase alphanumeric with optional single hyphens
 * - not a reserved system subdomain
 */
export const communitySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Community slug must be at least 2 characters long.')
  .max(30, 'Community slug must be at most 30 characters long.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug can only contain lowercase letters, numbers, and hyphens (no leading, trailing, or consecutive hyphens).'
  )
  .refine(
    (slug) => !RESERVED_SUBDOMAINS.includes(slug as (typeof RESERVED_SUBDOMAINS)[number]),
    {
      message: 'This community slug is a reserved system identifier.',
    }
  );

/**
 * Extracts and normalizes the community subdomain slug from a raw hostname.
 * Examples:
 * - "kewat.samaz.in" -> "kewat"
 * - "gupta.samaz.in:4000" -> "gupta"
 * - "admin.samaz.in" -> null (reserved system domain)
 * - "api.samaz.in" -> null (reserved system domain)
 * - "samaz.in" -> null (apex portal)
 * - "localhost" -> null
 */
export function extractCommunitySubdomain(
  hostname: string,
  baseDomain: string = 'samaz.in'
): string | null {
  if (!hostname) return null;

  // Strip port if present (e.g. "kewat.samaz.in:5173" -> "kewat.samaz.in")
  const hostWithoutPort = hostname.split(':')[0].toLowerCase().trim();

  // Handle local development simulation (e.g. "kewat.localhost")
  if (hostWithoutPort.endsWith('.localhost')) {
    const sub = hostWithoutPort.replace('.localhost', '');
    if (sub && !RESERVED_SUBDOMAINS.includes(sub as (typeof RESERVED_SUBDOMAINS)[number])) {
      return sub;
    }
    return null;
  }

  // Handle production / staging subdomain resolution
  const normalizedBase = baseDomain.toLowerCase().trim();
  if (hostWithoutPort === normalizedBase || hostWithoutPort === `www.${normalizedBase}`) {
    return null; // Apex portal or www
  }

  if (hostWithoutPort.endsWith(`.${normalizedBase}`)) {
    const subdomain = hostWithoutPort.slice(0, -(normalizedBase.length + 1));
    // Support single-level subdomains: kewat.samaz.in -> "kewat"
    if (
      subdomain &&
      !subdomain.includes('.') &&
      !RESERVED_SUBDOMAINS.includes(subdomain as (typeof RESERVED_SUBDOMAINS)[number])
    ) {
      return subdomain;
    }
  }

  return null;
}

/**
 * Extracts a community subdomain from a full URL string (Origin or Referer).
 * Returns null if the URL is invalid, an apex domain, or a reserved subdomain.
 */
export function extractCommunityFromUrl(
  rawUrl?: string | null,
  baseDomain: string = 'samaz.in'
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl);
    return extractCommunitySubdomain(parsed.hostname, baseDomain);
  } catch {
    return null;
  }
}

/**
 * Checks if a hostname belongs to the central platform administration console.
 */
export function isCentralAdminHostname(
  hostname?: string | null,
  baseDomain: string = 'samaz.in'
): boolean {
  if (!hostname) return false;
  const clean = hostname.split(':')[0].toLowerCase().trim();
  const normalizedBase = baseDomain.toLowerCase().trim();

  return (
    clean === `admin.${normalizedBase}` ||
    clean === 'admin.localhost' ||
    clean === 'apna-samaj-admin.vercel.app'
  );
}

/**
 * Checks if a URL originates from the central platform administration console.
 */
export function isCentralAdminUrl(
  rawUrl?: string | null,
  baseDomain: string = 'samaz.in'
): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    // Port 5174 is the standard local dev port for apps/admin
    if (parsed.port === '5174') return true;
    return isCentralAdminHostname(parsed.hostname, baseDomain);
  } catch {
    return false;
  }
}

export type ResolutionSource = 'hostname' | 'origin' | 'referer' | 'header' | 'query' | 'admin_switch' | 'none';

export interface TenantConflict {
  expected: string;
  actual: string;
  expectedSource: ResolutionSource;
  actualSource: ResolutionSource;
  message: string;
}

export interface ResolvedTenantIdentifier {
  slug: string | null;
  source: ResolutionSource;
  conflict?: TenantConflict | null;
  isCentralAdmin?: boolean;
}

export interface ResolveCommunityParams {
  hostname?: string | null;
  origin?: string | null;
  referer?: string | null;
  headerSlug?: string | null;
  querySlug?: string | null;
  baseDomain?: string;
  isProduction?: boolean;
}

/**
 * Resolves community identifier from HTTP request attributes with strict security hardening:
 * 1. Request Hostname & verified Origin take strict precedence.
 * 2. If client-supplied X-Community-Slug conflicts with verified Hostname or Origin, a TenantConflict
 *    is returned so the request can be rejected with HTTP 400.
 * 3. Client headers from the central admin console (admin.samaz.in) cannot select a tenant database
 *    without going through a separate, authenticated SUPER_ADMIN authorization flow.
 * 4. Query parameter (?community=slug) fallback is strictly disabled in production.
 */
export function resolveCommunityFromRequest(params: ResolveCommunityParams): ResolvedTenantIdentifier {
  const baseDomain = params.baseDomain || 'samaz.in';

  // 1. Extract verified community from Hostname
  const hostSlug = params.hostname ? extractCommunitySubdomain(params.hostname, baseDomain) : null;

  // 2. Extract verified community from Origin
  const originSlug = extractCommunityFromUrl(params.origin, baseDomain);

  // 3. Extract community from Referer (fallback if Origin not present)
  const refererSlug = !params.origin ? extractCommunityFromUrl(params.referer, baseDomain) : null;

  // 4. Verify Hostname vs Origin consistency (if both are present and community-scoped)
  if (originSlug && hostSlug && originSlug !== hostSlug) {
    return {
      slug: null,
      source: 'none',
      conflict: {
        expected: originSlug,
        actual: hostSlug,
        expectedSource: 'origin',
        actualSource: 'hostname',
        message: `Tenant mismatch detected: request hostname "${hostSlug}" conflicts with request origin "${originSlug}".`,
      },
    };
  }

  // The verified community context established by the request domain / origin
  const verifiedSlug = originSlug || hostSlug || refererSlug || null;
  const verifiedSource: ResolutionSource = originSlug
    ? 'origin'
    : hostSlug
    ? 'hostname'
    : refererSlug
    ? 'referer'
    : 'none';

  // 5. Clean client-supplied header slug (if present)
  let cleanHeaderSlug: string | null = null;
  if (params.headerSlug && typeof params.headerSlug === 'string') {
    const raw = params.headerSlug.toLowerCase().trim();
    if (raw && !RESERVED_SUBDOMAINS.includes(raw as (typeof RESERVED_SUBDOMAINS)[number])) {
      cleanHeaderSlug = raw;
    }
  }

  // 6. Hardening Rule: Client header CANNOT override or conflict with verified community domain/origin
  if (verifiedSlug && cleanHeaderSlug) {
    if (cleanHeaderSlug === verifiedSlug) {
      // Header and domain/origin are in full agreement
      return { slug: verifiedSlug, source: verifiedSource };
    }
    // Conflict! Client header contradicts verified request origin or hostname
    return {
      slug: null,
      source: 'none',
      conflict: {
        expected: verifiedSlug,
        actual: cleanHeaderSlug,
        expectedSource: verifiedSource,
        actualSource: 'header',
        message: `Tenant mismatch detected: client header "${cleanHeaderSlug}" conflicts with verified request ${verifiedSource} "${verifiedSlug}".`,
      },
    };
  }

  // 7. If verified community domain/origin is present (and no conflicting header was passed)
  if (verifiedSlug) {
    // Check if query parameter conflicts with verified domain/origin (in dev)
    if (params.querySlug && !params.isProduction && typeof params.querySlug === 'string') {
      const cleanQuery = params.querySlug.toLowerCase().trim();
      if (cleanQuery && cleanQuery !== verifiedSlug && !RESERVED_SUBDOMAINS.includes(cleanQuery as (typeof RESERVED_SUBDOMAINS)[number])) {
        return {
          slug: null,
          source: 'none',
          conflict: {
            expected: verifiedSlug,
            actual: cleanQuery,
            expectedSource: verifiedSource,
            actualSource: 'query',
            message: `Tenant mismatch detected: query parameter "${cleanQuery}" conflicts with verified request ${verifiedSource} "${verifiedSlug}".`,
          },
        };
      }
    }
    return { slug: verifiedSlug, source: verifiedSource };
  }

  // 8. Central Admin Origin Security Guard:
  // If request originates from central admin console (admin.samaz.in, apna-samaj-admin.vercel.app, or dev admin),
  // explicit community switching via X-Community-Slug requires a verified SUPER_ADMIN auth flow.
  // The header ALONE cannot grant tenant database access here.
  const isFromAdmin =
    isCentralAdminUrl(params.origin, baseDomain) ||
    isCentralAdminUrl(params.referer, baseDomain) ||
    isCentralAdminHostname(params.hostname, baseDomain);

  if (isFromAdmin) {
    return {
      slug: null,
      source: 'none',
      isCentralAdmin: true,
    };
  }

  // 9. Client header fallback for direct API/mobile/curl requests where no community domain is present
  if (cleanHeaderSlug) {
    return { slug: cleanHeaderSlug, source: 'header' };
  }

  // 10. Development query parameter fallback (?community=slug)
  // Strictly disabled in production mode to prevent query injection
  if (params.querySlug && !params.isProduction && typeof params.querySlug === 'string') {
    const raw = params.querySlug.toLowerCase().trim();
    if (raw && !RESERVED_SUBDOMAINS.includes(raw as (typeof RESERVED_SUBDOMAINS)[number])) {
      return { slug: raw, source: 'query' };
    }
  }

  return { slug: null, source: 'none' };
}

export const createCommunitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Community name must be at least 2 characters long.')
    .max(100, 'Community name must be at most 100 characters long.'),
  slug: communitySlugSchema,
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters.').optional().nullable(),
  logoUrl: z.string().url('Invalid logo URL format.').optional().nullable(),
  bannerUrl: z.string().url('Invalid banner URL format.').optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Primary color must be a valid hex color code (e.g. #E65100).')
    .optional()
    .nullable(),
});

export const updateCommunitySchema = createCommunitySchema.partial();

export const resolveCommunityQuerySchema = z.object({
  slug: z.string().trim().optional(),
  hostname: z.string().trim().optional(),
});

export const updateCommunityMemberRoleSchema = z.object({
  role: z.enum(['COMMUNITY_ADMIN', 'MODERATOR', 'MEMBER']),
});

export const updateCommunityMemberStatusSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
});

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type ResolveCommunityQueryInput = z.infer<typeof resolveCommunityQuerySchema>;
