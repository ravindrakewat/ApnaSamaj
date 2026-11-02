import crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaClient, Role as DbRole, UserStatus as DbUserStatus, Gender } from '@apnasamaj/database';
import { AuthUser, LoginResponseData, RefreshResponseData, UserRole, UserStatus } from '@apnasamaj/shared-types';
import { RegisterInput, normalizeIndianPhone } from '@apnasamaj/validation';
import { verifyPassword, hashPassword } from './auth.password';
import {
  generateAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
  calculateRefreshTokenExpiry,
  generatePasswordResetToken,
  calculatePasswordResetTokenExpiry,
  generateClaimOtp,
  calculateClaimOtpExpiry,
  hashClaimOtp,
} from './auth.tokens';
import {
  getResetDeliveryService,
  IResetDeliveryService,
  getClaimOtpDeliveryService,
  IClaimOtpDeliveryService,
} from './auth.delivery';

export class AuthError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export class DuplicatePhoneError extends AuthError {
  constructor(message: string = 'An account with this phone number already exists.') {
    super(message, 409);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    // Generic error message for both unknown phone and wrong password
    super('Invalid phone number or password', 401);
  }
}

export class AccountSuspendedError extends AuthError {
  constructor() {
    super('Account is suspended. Please contact community support.', 403);
  }
}

export class InvalidRefreshTokenError extends AuthError {
  constructor(message: string = 'Invalid or expired refresh token') {
    super(message, 401);
  }
}

export class InvalidClaimError extends AuthError {
  constructor(message: string = 'Invalid or expired claim verification code.') {
    super(message, 400);
    this.name = 'InvalidClaimError';
  }
}

export class InvalidResetTokenError extends AuthError {
  constructor(message: string = 'Invalid, expired, or already used reset token.') {
    super(message, 400);
  }
}

export class ReplayAttackError extends AuthError {
  constructor(
    message: string = 'Security alert: Token reuse detected. All sessions in this family have been revoked. Please log in again.'
  ) {
    super(message, 401);
  }
}

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

/**
 * Validates that an active tenant PrismaClient instance is provided.
 */
function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new AuthError('Tenant database connection is required for authentication operations.', 500);
  }
  return db;
}

/**
 * Authenticates user with phone and password, issues access token and creates
 * a new refresh token family session in the specified tenant database.
 */
export async function loginWithPhonePassword(
  phone: string,
  password: string,
  userAgent?: string,
  ipAddress?: string,
  db?: PrismaClient,
  communitySlug?: string
): Promise<AuthSessionResult> {
  const activeDb = assertDb(db);

  // 1. Look up user by normalized phone number
  const user = await activeDb.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      passwordHash: true,
      role: true,
      status: true,
      isPhoneVerified: true,
      profile: {
        select: {
          fullName: true,
        },
      },
    },
  });

  // 2. Return generic error if user does not exist
  if (!user) {
    throw new InvalidCredentialsError();
  }

  // 3. Verify Argon2id password hash
  const isMatch = await verifyPassword(user.passwordHash, password);
  if (!isMatch) {
    throw new InvalidCredentialsError();
  }

  // 4. Block SUSPENDED accounts
  if (user.status === DbUserStatus.SUSPENDED) {
    throw new AccountSuspendedError();
  }

  // 5. Generate short-lived JWT access token
  const accessToken = generateAccessToken({
    id: user.id,
    phone: user.phone,
    role: user.role,
    status: user.status,
    communitySlug,
  });

  // 6. Generate cryptographically secure refresh token and new familyId
  const rawRefreshToken = generateOpaqueRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const familyId = crypto.randomUUID();
  const refreshExpiresAt = calculateRefreshTokenExpiry();

  // 7. Store SHA-256 hash in database
  await activeDb.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    },
  });

  // 8. Build sanitized user object (never exposing passwordHash)
  const authUser: AuthUser = {
    id: user.id,
    phone: user.phone,
    fullName: user.profile?.fullName || '',
    role: user.role as unknown as UserRole,
    status: user.status as unknown as UserStatus,
    isPhoneVerified: user.isPhoneVerified,
  };

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    refreshExpiresAt,
    user: authUser,
  };
}

/**
 * Registers a new member account with safe defaults:
 * - Role: MEMBER (least privileged, no administrative escalation possible)
 * - Status: PENDING (restricted community access until active)
 * - isPhoneVerified: false
 * - Password hashed with Argon2id
 * - Profile created in same atomic transaction
 */
export async function registerMember(
  data: RegisterInput,
  userAgent?: string,
  ipAddress?: string,
  db?: PrismaClient,
  communitySlug?: string
): Promise<AuthSessionResult> {
  const activeDb = assertDb(db);

  // 1. Check if an account with this normalized phone already exists
  const existingUser = await activeDb.user.findUnique({
    where: { phone: data.phone },
    select: { id: true },
  });

  if (existingUser) {
    throw new DuplicatePhoneError();
  }

  // 2. Hash password securely with Argon2id
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  // 3. Prepare initial session tokens
  const rawRefreshToken = generateOpaqueRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const familyId = crypto.randomUUID();
  const refreshExpiresAt = calculateRefreshTokenExpiry();

  // 4. Create User, Profile, and RefreshToken atomically
  const newUser = await activeDb.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone: data.phone,
        passwordHash,
        role: DbRole.MEMBER, // Strict least-privileged role
        status: DbUserStatus.PENDING, // Pending verification
        isPhoneVerified: false,
        profile: {
          create: {
            fullName: data.fullName,
            gender: data.gender ? (data.gender as Gender) : null,
            city: data.city || null,
            state: data.state || null,
            subCaste: data.subCaste || null,
            gotra: data.gotra || null,
          },
        },
      },
      select: {
        id: true,
        phone: true,
        role: true,
        status: true,
        isPhoneVerified: true,
        profile: {
          select: {
            fullName: true,
          },
        },
      },
    });

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      },
    });

    return user;
  });

  // 5. Generate short-lived access token
  const accessToken = generateAccessToken({
    id: newUser.id,
    phone: newUser.phone,
    role: newUser.role,
    status: newUser.status,
    communitySlug,
  });

  const authUser: AuthUser = {
    id: newUser.id,
    phone: newUser.phone,
    fullName: newUser.profile?.fullName || '',
    role: newUser.role as unknown as UserRole,
    status: newUser.status as unknown as UserStatus,
    isPhoneVerified: newUser.isPhoneVerified,
  };

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    refreshExpiresAt,
    user: authUser,
  };
}

/**
 * Refreshes an active session:
 * 1. Hashes incoming raw token and looks up DB record.
 * 2. Detects replay attacks: if an already-revoked token is presented, revokes entire family.
 * 3. Checks expiry and user active status.
 * 4. Rotates refresh token (marks old revoked with replacedBy, issues new token under same familyId).
 * 5. Returns new access token and rotated refresh token.
 */
export async function refreshSession(
  rawRefreshToken: string,
  userAgent?: string,
  ipAddress?: string,
  db?: PrismaClient,
  communitySlug?: string
): Promise<AuthSessionResult> {
  const activeDb = assertDb(db);

  if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
    throw new InvalidRefreshTokenError('Refresh token is required');
  }

  const tokenHash = hashToken(rawRefreshToken);

  // 1. Find token record with associated user
  const tokenRecord = await activeDb.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          role: true,
          status: true,
          isPhoneVerified: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (!tokenRecord) {
    throw new InvalidRefreshTokenError('Invalid or expired refresh token');
  }

  // 2. REPLAY DETECTION:
  // If the token is already revoked, an attacker or compromised client is reusing a rotated token.
  // Immediately invalidate the ENTIRE token family.
  if (tokenRecord.isRevoked) {
    await activeDb.refreshToken.updateMany({
      where: { familyId: tokenRecord.familyId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    throw new ReplayAttackError();
  }

  // 3. Expiration Check
  if (tokenRecord.expiresAt < new Date()) {
    await activeDb.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    throw new InvalidRefreshTokenError('Refresh token has expired. Please log in again.');
  }

  // 4. User Status & Role Verification
  const user = tokenRecord.user;
  if (!user) {
    throw new InvalidRefreshTokenError('User not found.');
  }

  if (user.status === DbUserStatus.SUSPENDED) {
    await activeDb.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    throw new AccountSuspendedError();
  }

  if (user.status !== DbUserStatus.ACTIVE) {
    await activeDb.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    throw new AuthError('Account is not active.', 403);
  }

  // 5. Token Rotation: generate new token, same family
  const newRawRefreshToken = generateOpaqueRefreshToken();
  const newTokenHash = hashToken(newRawRefreshToken);
  const newExpiresAt = calculateRefreshTokenExpiry();

  await activeDb.$transaction([
    // Mark current token as revoked and rotated
    activeDb.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        replacedBy: newTokenHash,
      },
    }),
    // Create new rotated token maintaining the same familyId
    activeDb.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        familyId: tokenRecord.familyId,
        expiresAt: newExpiresAt,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      },
    }),
  ]);

  // 6. Generate fresh access token
  const newAccessToken = generateAccessToken({
    id: user.id,
    phone: user.phone,
    role: user.role,
    status: user.status,
    communitySlug,
  });

  const authUser: AuthUser = {
    id: user.id,
    phone: user.phone,
    fullName: user.profile?.fullName || '',
    role: user.role as unknown as UserRole,
    status: user.status as unknown as UserStatus,
    isPhoneVerified: user.isPhoneVerified,
  };

  return {
    accessToken: newAccessToken,
    refreshToken: newRawRefreshToken,
    refreshExpiresAt: newExpiresAt,
    user: authUser,
  };
}

/**
 * Revokes the server-side refresh session for the provided token.
 * Safe and idempotent.
 */
/**
 * Initiates the password reset workflow:
 * 1. Checks if member exists with the given phone in target tenant database.
 * 2. Anti-enumeration: Returns generic success if user does not exist or is not ACTIVE.
 * 3. Fail-Closed Production Guard: If in production without configured SMS provider, fails closed.
 * 4. In a transaction, invalidates any existing unused reset tokens for this user.
 * 5. Generates high-entropy 256-bit token, hashes with SHA-256, and stores with 15-minute expiry.
 * 6. Dispatches reset link via delivery service (console in dev, SMS in prod).
 */
export async function requestPasswordReset(
  phone: string,
  db?: PrismaClient,
  communitySlug?: string,
  clientUrl?: string,
  deliveryService?: IResetDeliveryService
): Promise<{ success: boolean; delivered: boolean }> {
  const activeDb = assertDb(db);
  const delivery = deliveryService || getResetDeliveryService();

  // 1. Look up user by normalized phone number
  const user = await activeDb.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      status: true,
    },
  });

  // 2. Anti-enumeration: If user does not exist or is suspended/inactive, silently return
  if (!user || user.status !== DbUserStatus.ACTIVE) {
    return { success: true, delivered: false };
  }

  // 3. Fail-closed production guard:
  // If in production and no SMS delivery provider is configured, do NOT create a usable token.
  const isProduction = process.env.NODE_ENV === 'production';
  const hasSmsConfig = Boolean(
    process.env.SMS_API_KEY || process.env.FAST2SMS_API_KEY || process.env.MSG91_AUTH_KEY
  );
  if (isProduction && !hasSmsConfig) {
    console.error(
      '[Auth Service] Operational error: In production, no SMS delivery provider is configured. Reset token delivery failed closed.'
    );
    return { success: true, delivered: false };
  }

  // 4. Generate cryptographically secure token & 15-minute expiry
  const rawToken = generatePasswordResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = calculatePasswordResetTokenExpiry();

  // 5. In a transaction, retire prior unused tokens and create the new record
  await activeDb.$transaction(async (tx) => {
    // Retire all previous active/unused reset tokens for this user
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create new reset token
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  // 6. Deliver the token
  const deliveryResult = await delivery.deliverResetLink({
    phone: user.phone,
    rawToken,
    communitySlug,
    clientUrl,
  });

  return { success: true, delivered: deliveryResult.success };
}

/**
 * Validates a reset token as a preflight usability check:
 * Checks whether token exists, is unexpired, is unused, and belongs to an ACTIVE user.
 * Never returns user identifiers or hashes.
 */
export async function verifyResetToken(
  rawToken: string,
  db?: PrismaClient
): Promise<boolean> {
  const activeDb = assertDb(db);

  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new InvalidResetTokenError('Reset token is required.');
  }

  const tokenHash = hashToken(rawToken);

  const tokenRecord = await activeDb.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    throw new InvalidResetTokenError('Invalid or expired reset token.');
  }

  if (tokenRecord.usedAt !== null) {
    throw new InvalidResetTokenError('This reset token has already been used.');
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new InvalidResetTokenError('This reset token has expired. Please request a new one.');
  }

  if (!tokenRecord.user || tokenRecord.user.status !== DbUserStatus.ACTIVE) {
    throw new InvalidResetTokenError('Invalid or expired reset token.');
  }

  return true;
}

/**
 * Atomically redeems a reset token and updates the user password:
 * 1. Checks that the token is still valid, unused, and unexpired using a conditional update.
 * 2. Handles concurrent requests safely (atomic single-use).
 * 3. Hashes the new password with Argon2id.
 * 4. Updates User.passwordHash.
 * 5. Revokes all active refresh-token sessions for this user.
 * 6. Retires all other outstanding reset tokens for this user.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
  db?: PrismaClient
): Promise<void> {
  const activeDb = assertDb(db);

  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new InvalidResetTokenError('Reset token is required.');
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 400);
  }

  const tokenHash = hashToken(rawToken);

  // Hash new password using Argon2id helper
  const passwordHash = await hashPassword(newPassword);

  // Execute atomic single-use conditional update and password reset transaction
  await activeDb.$transaction(async (tx) => {
    // 1. Atomically consume token only if it is unused and unexpired
    const updateTokenResult = await tx.passwordResetToken.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (updateTokenResult.count !== 1) {
      // Either token does not exist, was already used, has expired, or lost a race condition
      throw new InvalidResetTokenError('Invalid, expired, or already used reset token.');
    }

    // 2. Fetch userId of this token
    const tokenRecord = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        userId: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new InvalidResetTokenError('Invalid, expired, or already used reset token.');
    }

    if (tokenRecord.user?.status === DbUserStatus.SUSPENDED) {
      throw new AccountSuspendedError();
    }

    const userId = tokenRecord.userId;

    // 3. Update User passwordHash
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 4. Revoke all active refresh tokens for this user
    await tx.refreshToken.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // 5. Retire any other outstanding password reset tokens for this user
    await tx.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });
  });
}

export async function logoutSession(rawRefreshToken?: string, db?: PrismaClient): Promise<void> {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
    return;
  }

  const activeDb = assertDb(db);
  const tokenHash = hashToken(rawRefreshToken);

  await activeDb.refreshToken.updateMany({
    where: {
      tokenHash,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
    },
  });
}

// -----------------------------------------------------------------------------
// ACCOUNT CLAIMING & SELF-SERVICE PASSWORD SETUP (BATCH 15F.3)
// -----------------------------------------------------------------------------

export const claimTokenAttempts = new Map<string, number>();

export function resetClaimTokenAttempts(): void {
  claimTokenAttempts.clear();
}

/**
 * Requests an SMS OTP for an imported member to claim their account and set their password.
 * 
 * SECURITY INVARIANTS:
 * 1. Anti-enumeration: Always returns { success: true, delivered: boolean } even if
 *    the account does not exist, is suspended, or is ineligible.
 * 2. Eligibility boundary: Strictly limited to imported members (PENDING, MEMBER role,
 *    unverified phone, and zero refresh tokens). Normal pending registrations requiring
 *    admin approval are rejected silently via anti-enumeration.
 * 3. 60-second cooldown per user to prevent SMS spamming.
 * 4. Fail-closed in production if no valid SMS provider is configured.
 */
export async function requestAccountClaimOtp(
  phone: string,
  db?: PrismaClient,
  communitySlug?: string,
  deliveryService?: IClaimOtpDeliveryService
): Promise<{ success: boolean; delivered: boolean }> {
  const activeDb = assertDb(db);

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { success: true, delivered: false };
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeIndianPhone(phone);
  } catch {
    return { success: true, delivered: false };
  }

  // 1. Look up user with session count to distinguish imported vs self-registered
  const user = await activeDb.user.findUnique({
    where: { phone: normalizedPhone },
    select: {
      id: true,
      phone: true,
      status: true,
      role: true,
      isPhoneVerified: true,
      _count: {
        select: {
          refreshTokens: true,
        },
      },
    },
  });

  // 2. Anti-enumeration: Check eligibility silently
  // Must be PENDING, MEMBER role, unverified phone, and 0 refresh tokens
  if (
    !user ||
    user.status !== DbUserStatus.PENDING ||
    user.role !== DbRole.MEMBER ||
    user.isPhoneVerified !== false ||
    user._count.refreshTokens > 0
  ) {
    return { success: true, delivered: false };
  }

  // 3. 60-second cooldown check to prevent SMS flooding
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const recentToken = await activeDb.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: {
        gte: oneMinuteAgo,
      },
    },
  });

  if (recentToken) {
    // Cooldown active; silently return without generating new OTP
    return { success: true, delivered: false };
  }

  // 4. Fail-closed production guard:
  const isProduction = process.env.NODE_ENV === 'production';
  const hasSmsConfig = Boolean(
    process.env.SMS_API_KEY || process.env.FAST2SMS_API_KEY || process.env.MSG91_AUTH_KEY
  );
  if (isProduction && !hasSmsConfig) {
    console.error(
      '[Auth Service] Operational error: In production, no SMS delivery provider is configured. Claim OTP delivery failed closed.'
    );
    return { success: true, delivered: false };
  }

  // 5. Generate secure 6-digit OTP and salted hash
  const rawOtp = generateClaimOtp();
  const tokenHash = hashClaimOtp(user.id, rawOtp);
  const expiresAt = calculateClaimOtpExpiry();

  // 6. In a transaction, retire prior unused tokens and create new claim token
  await activeDb.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  // 7. Deliver OTP
  const delivery = deliveryService || getClaimOtpDeliveryService();
  const deliveryResult = await delivery.deliverOtp({
    phone: user.phone,
    otp: rawOtp,
    communitySlug,
  });

  return { success: true, delivered: deliveryResult.success };
}

/**
 * Verifies claim OTP and sets a personal password for imported members.
 * Upon successful verification:
 * - Marks OTP token as consumed atomically (single use)
 * - Updates user password hash with Argon2id
 * - Transitions user status from PENDING to ACTIVE
 * - Sets isPhoneVerified to true
 * - Retires all remaining reset tokens
 * - Writes an audit log record
 */
export async function verifyClaimOtpAndSetPassword(
  phone: string,
  otp: string,
  newPassword: string,
  db?: PrismaClient,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const activeDb = assertDb(db);

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    throw new InvalidClaimError('Phone number is required.');
  }

  if (!otp || typeof otp !== 'string' || !otp.trim()) {
    throw new InvalidClaimError('Verification code is required.');
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new AuthError('Password must be at least 8 characters long.', 400);
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeIndianPhone(phone);
  } catch {
    throw new InvalidClaimError('Invalid phone number format.');
  }

  // 1. Fetch user to verify identity and eligibility
  const user = await activeDb.user.findUnique({
    where: { phone: normalizedPhone },
    select: {
      id: true,
      phone: true,
      status: true,
      role: true,
      isPhoneVerified: true,
      _count: {
        select: {
          refreshTokens: true,
        },
      },
    },
  });

  if (!user) {
    throw new InvalidClaimError('Invalid verification code or ineligible account.');
  }

  if (user.status === DbUserStatus.SUSPENDED) {
    throw new AccountSuspendedError();
  }

  if (user.status === DbUserStatus.ACTIVE) {
    throw new InvalidClaimError('This account is already active. Please log in or use forgot password.');
  }

  if (
    user.status !== DbUserStatus.PENDING ||
    user.role !== DbRole.MEMBER ||
    user.isPhoneVerified !== false ||
    user._count.refreshTokens > 0
  ) {
    throw new InvalidClaimError('Account is not eligible for self-service claim. Please contact support.');
  }

  // 2. Retrieve the latest unconsumed token for this user
  const tokenRecord = await activeDb.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!tokenRecord) {
    throw new InvalidClaimError('No active claim verification code found. Please request a new code.');
  }

  // 3. Expiration check
  if (tokenRecord.expiresAt < new Date()) {
    throw new InvalidClaimError('Verification code has expired. Please request a new code.');
  }

  // 4. Rate-limit invalid attempts per token record (max 5)
  const currentAttempts = (claimTokenAttempts.get(tokenRecord.id) || 0) + 1;
  claimTokenAttempts.set(tokenRecord.id, currentAttempts);

  const expectedHash = hashClaimOtp(user.id, otp);
  if (tokenRecord.tokenHash !== expectedHash) {
    if (currentAttempts >= 5) {
      // Burn token after 5 failed attempts
      await activeDb.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
      claimTokenAttempts.delete(tokenRecord.id);
      throw new InvalidClaimError(
        'Too many invalid attempts. This verification code has been invalidated. Please request a new code.'
      );
    }
    throw new InvalidClaimError('Invalid verification code.');
  }

  // 5. Hash new password with Argon2id
  const passwordHash = await hashPassword(newPassword);

  // 6. Execute atomic single-use conditional transaction
  await activeDb.$transaction(async (tx) => {
    // Atomically burn token
    const updateResult = await tx.passwordResetToken.updateMany({
      where: {
        id: tokenRecord.id,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (updateResult.count !== 1) {
      throw new InvalidClaimError('Verification code has already been used or expired.');
    }

    // Activate member
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: DbUserStatus.ACTIVE,
        isPhoneVerified: true,
      },
    });

    // Retire any other unused tokens
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create AuditLog
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'ACCOUNT_CLAIM_AND_ACTIVATE',
        targetType: 'USER',
        targetId: user.id,
        details: {
          previousStatus: 'PENDING',
          newStatus: 'ACTIVE',
          phoneVerified: true,
          method: 'BULK_IMPORT_CLAIM_OTP',
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  });

  // Clean up attempt counter on successful consumption
  claimTokenAttempts.delete(tokenRecord.id);
}

