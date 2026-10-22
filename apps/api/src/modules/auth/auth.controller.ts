import { Request, Response } from 'express';
import { prisma } from '@apnasamaj/database';
import { loginSchema, registerSchema, refreshTokenSchema } from '@apnasamaj/validation';
import {
  ApiResponse,
  LoginResponseData,
  RegisterResponseData,
  RefreshResponseData,
  AuthUser,
} from '@apnasamaj/shared-types';
import {
  loginWithPhonePassword,
  registerMember,
  refreshSession,
  logoutSession,
  AuthError,
  InvalidCredentialsError,
  DuplicatePhoneError,
  AccountSuspendedError,
  InvalidRefreshTokenError,
  ReplayAttackError,
} from './auth.service';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
} from './auth.tokens';
import { AuthenticatedRequest } from '../../middleware/authenticate';

/**
 * Extracts the refresh token from either HttpOnly cookie or request body.
 */
function extractRefreshToken(req: Request): string | undefined {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return req.cookies[REFRESH_COOKIE_NAME];
  }
  if (req.body && typeof req.body.refreshToken === 'string') {
    return req.body.refreshToken;
  }
  return undefined;
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    // 1. Validate request body against Zod login schema
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid input credentials.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const { phone, password } = parsed.data;

    // 2. Authenticate user and issue tokens
    const result = await loginWithPhonePassword(
      phone,
      password,
      req.headers['user-agent'],
      req.ip
    );

    // 3. Set secure HttpOnly cookie for browser sessions
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions(result.refreshExpiresAt)
    );

    // 4. Respond with access token, non-sensitive user profile, and refresh token
    const responseData: LoginResponseData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };

    const response: ApiResponse<LoginResponseData> = {
      success: true,
      message: 'Login successful.',
      data: responseData,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof InvalidCredentialsError || err instanceof AccountSuspendedError || err instanceof AuthError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Auth Controller] Unexpected login error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'An unexpected authentication error occurred. Please try again later.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * Handles public member registration:
 * Validates phone, password, full name, creates user with MEMBER role and PENDING status,
 * sets HttpOnly refresh cookie, and returns access token + sanitized user profile.
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid registration input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await registerMember(
      parsed.data,
      req.headers['user-agent'],
      req.ip
    );

    // Set secure HttpOnly cookie for session
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions(result.refreshExpiresAt)
    );

    const responseData: RegisterResponseData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };

    const response: ApiResponse<RegisterResponseData> = {
      success: true,
      message: 'Registration successful! Welcome to Apna Samaj.',
      data: responseData,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof DuplicatePhoneError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    if (err instanceof AuthError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Auth Controller] Unexpected register error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'An unexpected error occurred during registration. Please try again later.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * Handles refresh token rotation:
 * Validates token, detects replay, rotates session, sets new cookie, and returns fresh access token.
 */
export async function refreshHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawToken = extractRefreshToken(req);

    if (!rawToken) {
      const response: ApiResponse = {
        success: false,
        error: 'Refresh token is required. Provide via cookie or request body.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const result = await refreshSession(
      rawToken,
      req.headers['user-agent'],
      req.ip
    );

    // Set rotated refresh token in HttpOnly cookie
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions(result.refreshExpiresAt)
    );

    const responseData: RefreshResponseData = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };

    const response: ApiResponse<RefreshResponseData> = {
      success: true,
      message: 'Token refreshed successfully.',
      data: responseData,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    // Clear refresh cookie on any refresh failure or security event
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    if (
      err instanceof ReplayAttackError ||
      err instanceof InvalidRefreshTokenError ||
      err instanceof AccountSuspendedError ||
      err instanceof AuthError
    ) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Auth Controller] Unexpected refresh error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to refresh authentication session.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * Handles logout:
 * Revokes refresh token in database and clears the HttpOnly cookie.
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawToken = extractRefreshToken(req);

    if (rawToken) {
      await logoutSession(rawToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully.',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Auth Controller] Logout error:', err);
    res.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());

    const response: ApiResponse = {
      success: true,
      message: 'Logged out successfully.',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  }
}

/**
 * Returns current authenticated user details from the verified token and DB state.
 */
export async function getMeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required.',
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
    return;
  }

  // If fullName was not loaded by middleware, populate it for /auth/me contract
  let authUser = req.user;
  if (!authUser.fullName) {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
      select: { fullName: true },
    });
    if (profile?.fullName) {
      authUser = { ...authUser, fullName: profile.fullName };
    }
  }

  const response: ApiResponse<AuthUser> = {
    success: true,
    data: authUser,
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(response);
}
