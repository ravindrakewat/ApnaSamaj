import { Request, Response, NextFunction } from 'express';
import { prisma, UserStatus as DbUserStatus, PrismaClient, tenantDbManager } from '@apnasamaj/database';
import { ApiResponse, AuthUser, UserRole, UserStatus } from '@apnasamaj/shared-types';
import { verifyAccessToken } from '../modules/auth/auth.tokens';
import { TenantRequestInfo } from './tenant.middleware';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenant?: TenantRequestInfo;
  db?: PrismaClient;
  isCentralAdmin?: boolean;
}

/**
 * Authentication middleware:
 * 1. Verifies Bearer JWT signature and expiration.
 * 2. Reloads user's real-time role and status from the database so suspended
 *    or deleted users do not retain access until token expiration.
 */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required. Missing or malformed Bearer token.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required. Token is empty.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err: unknown) {
    const isExpired = (err as { name?: string })?.name === 'TokenExpiredError';
    const response: ApiResponse = {
      success: false,
      error: isExpired ? 'Access token has expired.' : 'Invalid access token.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  // Cross-tenant token boundary check:
  // If the access token was issued for a specific community, and the current request
  // is targeting a different community, reject with HTTP 403 Forbidden.
  if (
    payload.communitySlug &&
    req.tenant?.isResolved &&
    req.tenant.slug &&
    req.tenant.slug !== payload.communitySlug
  ) {
    const response: ApiResponse = {
      success: false,
      error: 'Forbidden: Access token was issued for a different community.',
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
    return;
  }

  try {
    // Reload user status/role from active tenant database (or fallback to default prisma)
    let activeDb = req.db || prisma;
    if (payload.communitySlug && (!req.tenant || !req.tenant.isResolved)) {
      if (tenantDbManager.hasCommunity(payload.communitySlug)) {
        activeDb = tenantDbManager.getClient(payload.communitySlug);
      }
    }

    const dbUser = await activeDb.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        role: true,
        status: true,
        isPhoneVerified: true,
      },
    });

    if (!dbUser) {
      const response: ApiResponse = {
        success: false,
        error: 'User account not found or deactivated.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (dbUser.status === DbUserStatus.SUSPENDED) {
      const response: ApiResponse = {
        success: false,
        error: 'Account is suspended. Access denied.',
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
      return;
    }

    req.user = {
      id: dbUser.id,
      phone: dbUser.phone,
      fullName: '',
      role: dbUser.role as unknown as UserRole,
      status: dbUser.status as unknown as UserStatus,
      isPhoneVerified: dbUser.isPhoneVerified,
      communitySlug: payload.communitySlug,
    };

    next();
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Failed to verify user credentials.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}
