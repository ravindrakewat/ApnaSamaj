import { Request, Response, NextFunction } from 'express';
import {
  tenantDbManager,
  prisma,
  PrismaClient,
} from '@apnasamaj/database';
import {
  resolveCommunityFromRequest,
  ResolutionSource,
} from '@apnasamaj/validation';
import { ApiResponse, UserRole } from '@apnasamaj/shared-types';
import { AuthenticatedRequest } from './authenticate';

export interface TenantRequestInfo {
  slug: string;
  name: string;
  isResolved: boolean;
  source: ResolutionSource;
}

export interface TenantRequest extends Request {
  tenant?: TenantRequestInfo;
  db?: PrismaClient;
  isCentralAdmin?: boolean;
}

/**
 * Tenant Resolution Middleware (Soft Resolution):
 * 1. Inspects incoming request headers in strict priority order:
 *    a) Origin header (CORS request origin URL)
 *    b) Hostname (Host header / req.hostname)
 *    c) Referer header (Navigation/fetch referer URL)
 *    d) X-Community-Slug header (explicit client declaration from trusted frontends / API clients)
 *    e) Query parameter (?community=slug, development fallback only, disabled in production)
 * 2. Conflict Mismatch Check (Security Hardening):
 *    - If client-supplied X-Community-Slug conflicts with verified Hostname or Origin,
 *      strictly REJECTS with HTTP 400 Bad Request. Client headers CANNOT override verified domains.
 * 3. Central Admin Domain Guard:
 *    - Requests from central admin (admin.samaz.in, apna-samaj-admin.vercel.app, or dev admin)
 *      CANNOT select a community database via the header alone.
 *    - Leaves context undefined for SUPER_ADMIN authentication & authorization in admin routes.
 * 4. If a community subdomain is targeted:
 *    - Validates it against preconfigured, trusted databases in TenantDatabaseManager.
 *    - If configured: attaches resolved metadata to req.tenant and cached client to req.db.
 *    - If unconfigured/unknown: REJECTS with 404 (NEVER silently falls back to Kewat).
 * 5. If apex/admin/api domain or no community is targeted:
 *    - Leaves req.tenant undefined and assigns legacy prisma singleton to req.db.
 *    - Preserves 100% backward compatibility for platform health checks and legacy routes.
 * 6. SECURITY INVARIANT: Never accepts arbitrary database connection strings from the client.
 * 7. SECURITY INVARIANT: Hostname resolution establishes database routing only; it does NOT
 *    substitute for user authentication or role-based authorization.
 */
export function resolveTenantContext(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  const headerSlug = typeof req.headers['x-community-slug'] === 'string'
    ? req.headers['x-community-slug']
    : null;

  const origin = typeof req.headers['origin'] === 'string'
    ? req.headers['origin']
    : null;

  const referer = typeof req.headers['referer'] === 'string'
    ? req.headers['referer']
    : null;

  const hostname = req.hostname || (req.headers['host'] ? req.headers['host'].split(':')[0] : null);

  const querySlug = typeof req.query?.community === 'string'
    ? req.query.community
    : null;

  const isProduction = process.env.NODE_ENV === 'production';

  const resolved = resolveCommunityFromRequest({
    hostname,
    origin,
    referer,
    headerSlug,
    querySlug,
    isProduction,
  });

  // 1. Conflict Mismatch: Reject immediately with HTTP 400 if header contradicts verified domain/origin
  if (resolved.conflict) {
    const response: ApiResponse = {
      success: false,
      error: resolved.conflict.message,
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
    return;
  }

  // 2. Central Admin Security Guard:
  // Community switching from the central admin console is NOT trusted from header alone.
  // It must be authorized through a verified SUPER_ADMIN session in authorizeAdminCommunitySwitch.
  if (resolved.isCentralAdmin || req.path?.startsWith('/api/v1/admin')) {
    req.isCentralAdmin = true;
    req.tenant = undefined;
    req.db = prisma;
    next();
    return;
  }

  req.isCentralAdmin = false;

  // 3. If a community was explicitly targeted by the caller
  if (resolved.slug) {
    // Check against preconfigured trusted registry
    if (tenantDbManager.hasCommunity(resolved.slug)) {
      try {
        const client = tenantDbManager.getClient(resolved.slug);
        const metadata = tenantDbManager.getSafeMetadata(resolved.slug);

        req.tenant = {
          slug: resolved.slug,
          name: metadata?.name || `${resolved.slug.toUpperCase()} Samaj`,
          isResolved: true,
          source: resolved.source,
        };
        req.db = client;
        next();
        return;
      } catch (err: unknown) {
        const response: ApiResponse = {
          success: false,
          error: `Failed to initialize database connection for community "${resolved.slug}".`,
          timestamp: new Date().toISOString(),
        };
        res.status(500).json(response);
        return;
      }
    } else {
      // Unconfigured or unknown community: strictly reject with 404.
      // Do NOT silently fall back to Kewat or any other community!
      const response: ApiResponse = {
        success: false,
        error: `Unknown community tenant "${resolved.slug}". This community is not registered or has no active database.`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }
  }

  // 4. No community targeted (e.g. samaz.in, admin.samaz.in, api.samaz.in, /health)
  // Fall back to legacy prisma singleton to preserve current platform behavior
  req.tenant = undefined;
  req.db = prisma;
  next();
}

/**
 * Strict Tenant Guard Middleware:
 * Rejects requests with HTTP 400 if no valid, approved community tenant is resolved.
 * Use on community-specific routers (e.g. feed, groups, matrimonial).
 */
export function requireTenantContext(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.tenant || !req.tenant.isResolved) {
    const response: ApiResponse = {
      success: false,
      error: 'Community context required. Please access via a valid community subdomain or specify X-Community-Slug header.',
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
    return;
  }
  next();
}

/**
 * Admin Community Switching & Context Binding Guard:
 * 1. For COMMUNITY_ADMIN:
 *    - Strictly binds req.tenant and req.db to their assigned community database.
 *    - If an X-Community-Slug header declaring a DIFFERENT community is supplied,
 *      strictly REJECTS with HTTP 403 Forbidden. Cross-community administration is blocked.
 * 2. For SUPER_ADMIN:
 *    - Allows explicit community database switching via X-Community-Slug to any preconfigured community.
 *    - If X-Community-Slug is absent, retains default central database context (prisma).
 * 3. Rejects unauthenticated or unauthorized roles with 401/403.
 */
export function authorizeAdminCommunitySwitch(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Must be authenticated
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required to access administrative operations.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  const headerSlug = typeof req.headers['x-community-slug'] === 'string'
    ? req.headers['x-community-slug'].toLowerCase().trim()
    : null;

  // 1. COMMUNITY_ADMIN and MODERATOR Roles: Strictly bound to assigned community database
  if (req.user.role === UserRole.COMMUNITY_ADMIN || req.user.role === UserRole.MODERATOR) {
    const assignedSlug = req.user.communitySlug;

    // Cross-community switch attempt by COMMUNITY_ADMIN or MODERATOR is strictly forbidden
    if (headerSlug && (!assignedSlug || headerSlug !== assignedSlug)) {
      const roleName = req.user.role === UserRole.MODERATOR ? 'Community Moderator' : 'Community Admin';
      const response: ApiResponse = {
        success: false,
        error: `Forbidden: Only SUPER_ADMIN is authorized to switch community context. ${roleName} is restricted to their assigned community.`,
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
      return;
    }


    if (!assignedSlug || !tenantDbManager.hasCommunity(assignedSlug)) {
      const response: ApiResponse = {
        success: false,
        error: `Assigned community "${assignedSlug || 'unassigned'}" is not registered or has no active database.`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    try {
      const client = tenantDbManager.getClient(assignedSlug);
      const metadata = tenantDbManager.getSafeMetadata(assignedSlug);

      req.tenant = {
        slug: assignedSlug,
        name: metadata?.name || `${assignedSlug.toUpperCase()} Samaj`,
        isResolved: true,
        source: 'admin_switch',
      };
      req.db = client;
      next();
      return;
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: `Failed to initialize database connection for assigned community "${assignedSlug}".`,
        timestamp: new Date().toISOString(),
      };
      res.status(500).json(response);
      return;
    }
  }

  // 2. SUPER_ADMIN Role: Authorized to switch community context or access central database
  if (req.user.role === UserRole.SUPER_ADMIN) {
    if (!headerSlug) {
      // No community switch requested; proceed with default central database
      next();
      return;
    }

    // Validate community slug against preconfigured registry
    if (!tenantDbManager.hasCommunity(headerSlug)) {
      const response: ApiResponse = {
        success: false,
        error: `Unknown community tenant "${headerSlug}". This community is not registered or has no active database.`,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    try {
      const client = tenantDbManager.getClient(headerSlug);
      const metadata = tenantDbManager.getSafeMetadata(headerSlug);

      req.tenant = {
        slug: headerSlug,
        name: metadata?.name || `${headerSlug.toUpperCase()} Samaj`,
        isResolved: true,
        source: 'admin_switch',
      };
      req.db = client;
      next();
      return;
    } catch (err: unknown) {
      const response: ApiResponse = {
        success: false,
        error: `Failed to initialize database connection for community "${headerSlug}".`,
        timestamp: new Date().toISOString(),
      };
      res.status(500).json(response);
      return;
    }
  }

  // 3. Any other role is forbidden
  const response: ApiResponse = {
    success: false,
    error: 'Forbidden: Insufficient privileges for administrative operations.',
    timestamp: new Date().toISOString(),
  };
  res.status(403).json(response);
}

