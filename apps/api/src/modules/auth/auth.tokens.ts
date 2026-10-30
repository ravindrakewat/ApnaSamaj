import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { CookieOptions } from 'express';
import { config } from '../../config/env';
import { AccessTokenPayload } from '@apnasamaj/shared-types';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Generates a short-lived JWT access token with minimal necessary claims.
 */
export function generateAccessToken(user: {
  id: string;
  phone: string;
  role: string;
  status: string;
  communitySlug?: string;
}): string {
  const jti = crypto.randomUUID();
  const options: SignOptions = {
    expiresIn: config.jwtAccessExpiresIn as SignOptions['expiresIn'],
    jwtid: jti,
    subject: user.id,
  };

  const claims: Record<string, unknown> = {
    role: user.role,
    status: user.status,
    phone: user.phone,
  };

  if (user.communitySlug) {
    claims.communitySlug = user.communitySlug;
  }

  return jwt.sign(claims, config.jwtAccessSecret, options);
}

/**
 * Verifies and decodes a JWT access token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret) as jwt.JwtPayload;

  if (!decoded.sub) {
    throw new Error('Invalid token payload: missing subject claim');
  }

  return {
    sub: decoded.sub,
    phone: (decoded.phone as string) || '',
    role: decoded.role,
    status: decoded.status,
    communitySlug: typeof decoded.communitySlug === 'string' ? decoded.communitySlug : undefined,
    jti: decoded.jti,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

/**
 * Generates a cryptographically secure, opaque random refresh token.
 * Uses 40 random bytes (320 bits of entropy), hex-encoded (80 chars).
 */
export function generateOpaqueRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Generates a cryptographically secure, high-entropy password reset token.
 * Uses 32 random bytes (256 bits of entropy), hex-encoded (64 chars).
 */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes the expiration date for a password reset token (15 minutes).
 */
export function calculatePasswordResetTokenExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

/**
 * Computes the SHA-256 hash of a refresh token for safe database storage.
 * The raw token is never stored or logged.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Computes the expiration date for a new refresh token based on config.
 */
export function calculateRefreshTokenExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiresDays);
  return expiresAt;
}

/**
 * Returns cookie options for setting the HttpOnly refresh token cookie.
 */
export function getRefreshCookieOptions(expiresAt: Date): CookieOptions {
  const isProduction = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
    expires: expiresAt,
  };
}

/**
 * Returns cookie options for clearing the refresh token cookie.
 */
export function getClearRefreshCookieOptions(): CookieOptions {
  const isProduction = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/v1/auth',
  };
}
