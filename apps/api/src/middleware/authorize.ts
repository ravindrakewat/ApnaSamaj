import { Response, NextFunction } from 'express';
import { ApiResponse, UserRole, UserStatus } from '@apnasamaj/shared-types';
import { AuthenticatedRequest } from './authenticate';

/**
 * Ensures that the authenticated user has ACTIVE status.
 * PENDING accounts are blocked from community access with an explanatory 403.
 */
export function requireActiveUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  if (req.user.status !== UserStatus.ACTIVE) {
    const response: ApiResponse = {
      success: false,
      error:
        req.user.status === UserStatus.PENDING
          ? 'Account is pending verification. Community access is restricted.'
          : 'Account is not active.',
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
    return;
  }

  next();
}

/**
 * Restricts access to users holding one of the specified roles.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      const response: ApiResponse = {
        success: false,
        error: 'Forbidden: Insufficient role permissions.',
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
}
