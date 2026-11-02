import assert from 'node:assert';
import * as argon2 from 'argon2';
import { Role as DbRole, UserStatus as DbUserStatus } from '@apnasamaj/database';
import {
  requestAccountClaimOtp,
  verifyClaimOtpAndSetPassword,
  InvalidClaimError,
  AccountSuspendedError,
  AuthError,
  resetClaimTokenAttempts,
} from '../modules/auth/auth.service';
import {
  requestClaimOtpHandler,
  verifyClaimOtpHandler,
} from '../modules/auth/auth.controller';
import {
  generateClaimOtp,
  calculateClaimOtpExpiry,
  hashClaimOtp,
} from '../modules/auth/auth.tokens';
import {
  MockClaimOtpDeliveryAdapter,
  ConsoleClaimOtpDeliveryAdapter,
  SmsClaimOtpDeliveryAdapter,
} from '../modules/auth/auth.delivery';
import { verifyPassword } from '../modules/auth/auth.password';
import { TenantRequest } from '../../src/middleware/tenant.middleware';

console.log('================================================================');
console.log('   Apna Samaj — Batch 15F.3 Account Claiming Verification Suite ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, testId: string, description: string, detail: string = '') {
  if (condition) {
    console.log(`✅ [${testId}] PASS: ${description} ${detail ? '(' + detail + ')' : ''}`);
    passedTests++;
  } else {
    console.error(`❌ [${testId}] FAIL: ${description} ${detail ? '(' + detail + ')' : ''}`);
    failedTests++;
    throw new Error(`Test failed: [${testId}] ${description}`);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Mock Store & Prisma Client for Hermetic Multi-Tenant Testing
// ---------------------------------------------------------------------------
interface MockUser {
  id: string;
  phone: string;
  passwordHash: string;
  role: DbRole;
  status: DbUserStatus;
  isPhoneVerified: boolean;
  profile?: { fullName: string };
  refreshTokens?: any[];
}

interface MockPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  user?: MockUser;
}

interface MockAuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

function createMockDatabase(slug: string = 'kewat') {
  const users: MockUser[] = [];
  const passwordResetTokens: MockPasswordResetToken[] = [];
  const auditLogs: MockAuditLog[] = [];

  const db: any = {
    slug,
    users,
    passwordResetTokens,
    auditLogs,

    user: {
      findUnique: async ({ where, select }: any) => {
        const found = users.find(
          (u) => (where.id && u.id === where.id) || (where.phone && u.phone === where.phone)
        );
        if (!found) return null;
        const res: any = { ...found };
        if (select?._count?.select?.refreshTokens) {
          res._count = { refreshTokens: found.refreshTokens?.length || 0 };
        }
        return res;
      },
      update: async ({ where, data }: any) => {
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error('User not found');
        Object.assign(found, data);
        return { ...found };
      },
    },

    passwordResetToken: {
      findFirst: async ({ where, orderBy }: any) => {
        let matches = passwordResetTokens.filter((t) => {
          if (where.userId && t.userId !== where.userId) return false;
          if (where.usedAt === null && t.usedAt !== null) return false;
          if (where.createdAt?.gte && t.createdAt < where.createdAt.gte) return false;
          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return matches[0] ? { ...matches[0] } : null;
      },
      findUnique: async ({ where }: any) => {
        const found = passwordResetTokens.find(
          (t) => (where.id && t.id === where.id) || (where.tokenHash && t.tokenHash === where.tokenHash)
        );
        return found ? { ...found } : null;
      },
      create: async ({ data }: any) => {
        const record: MockPasswordResetToken = {
          id: `prt_${passwordResetTokens.length + 1}_${Date.now()}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        passwordResetTokens.push(record);
        return { ...record };
      },
      update: async ({ where, data }: any) => {
        const item = passwordResetTokens.find((t) => t.id === where.id);
        if (item) {
          Object.assign(item, data);
          return { ...item };
        }
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        const now = new Date();
        for (const item of passwordResetTokens) {
          if (where.id && item.id !== where.id) continue;
          if (where.userId && item.userId !== where.userId) continue;
          if (where.tokenHash && item.tokenHash !== where.tokenHash) continue;
          if (where.usedAt === null && item.usedAt !== null) continue;
          if (where.expiresAt?.gt && item.expiresAt <= now) continue;

          Object.assign(item, data);
          count++;
        }
        return { count };
      },
    },

    auditLog: {
      create: async ({ data }: any) => {
        const record: MockAuditLog = {
          id: `audit_${auditLogs.length + 1}`,
          actorId: data.actorId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          details: data.details,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          createdAt: new Date(),
        };
        auditLogs.push(record);
        return { ...record };
      },
    },

    $transaction: async (callback: (tx: any) => Promise<any>) => {
      return callback(db);
    },
  };

  return db;
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------
async function runAccountClaimingTests() {
  const dummyPasswordHash = await argon2.hash('DUMMY_UNUSABLE_PASSWORD_IMPORT');

  // Test 1: Eligible Imported Member Requests OTP
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();

    // Create an imported member (PENDING, MEMBER, isPhoneVerified: false, 0 refreshTokens)
    db.users.push({
      id: 'user_imported_1',
      phone: '+919876543210',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    const result = await requestAccountClaimOtp('9876543210', db, 'kewat', mockDelivery);
    assertTest(result.success === true, 'TEST-01A', 'Eligible claim request returns success: true');
    assertTest(result.delivered === true, 'TEST-01B', 'Eligible claim request delivers OTP');
    assertTest(mockDelivery.lastParams !== null, 'TEST-01C', 'Mock delivery adapter received payload');
    assertTest(mockDelivery.lastParams?.phone === '+919876543210', 'TEST-01D', 'Delivery phone is normalized');
    assertTest(
      /^\d{6}$/.test(mockDelivery.lastParams?.otp || ''),
      'TEST-01E',
      'Generated OTP is a 6-digit numeric string'
    );
    assertTest(db.passwordResetTokens.length === 1, 'TEST-01F', 'Stored exactly 1 token record in database');

    const storedToken = db.passwordResetTokens[0];
    const expectedHash = hashClaimOtp('user_imported_1', mockDelivery.lastParams!.otp);
    assertTest(storedToken.tokenHash === expectedHash, 'TEST-01G', 'Database contains salted SHA-256 hash of OTP');
    assertTest(storedToken.usedAt === null, 'TEST-01H', 'Token record is unused');
    assertTest(storedToken.expiresAt > new Date(), 'TEST-01I', 'Token record has future expiration date');
  }

  // Test 2: Anti-Enumeration for Non-Existent Phone
  {
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();

    const result = await requestAccountClaimOtp('+919999999999', db, 'kewat', mockDelivery);
    assertTest(result.success === true, 'TEST-02A', 'Anti-enumeration: Unknown phone returns success: true');
    assertTest(result.delivered === false, 'TEST-02B', 'Anti-enumeration: Unknown phone does not deliver OTP');
    assertTest(mockDelivery.lastParams === null, 'TEST-02C', 'No OTP delivered for unknown phone');
    assertTest(db.passwordResetTokens.length === 0, 'TEST-02D', 'No token created in database for unknown phone');
  }

  // Test 3: Anti-Enumeration for ACTIVE User
  {
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_active_1',
      phone: '+919876543211',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.ACTIVE,
      isPhoneVerified: true,
      refreshTokens: [],
    });

    const result = await requestAccountClaimOtp('9876543211', db, 'kewat', mockDelivery);
    assertTest(result.success === true, 'TEST-03A', 'Anti-enumeration: Active user returns success: true');
    assertTest(result.delivered === false, 'TEST-03B', 'Anti-enumeration: Active user does not deliver claim OTP');
    assertTest(db.passwordResetTokens.length === 0, 'TEST-03C', 'No claim token created for active user');
  }

  // Test 4: Anti-Enumeration for SUSPENDED User
  {
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_suspended_1',
      phone: '+919876543212',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.SUSPENDED,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    const result = await requestAccountClaimOtp('9876543212', db, 'kewat', mockDelivery);
    assertTest(result.success === true, 'TEST-04A', 'Anti-enumeration: Suspended user returns success: true');
    assertTest(result.delivered === false, 'TEST-04B', 'Anti-enumeration: Suspended user does not deliver claim OTP');
    assertTest(db.passwordResetTokens.length === 0, 'TEST-04C', 'No claim token created for suspended user');
  }

  // Test 5: Boundary Check: Normal Self-Registered Member (refreshTokens > 0)
  {
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_self_registered_1',
      phone: '+919876543213',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [{ id: 'rt_1' }], // Has session from registration
    });

    const result = await requestAccountClaimOtp('9876543213', db, 'kewat', mockDelivery);
    assertTest(result.success === true, 'TEST-05A', 'Self-registered user receives generic anti-enumeration response');
    assertTest(result.delivered === false, 'TEST-05B', 'Self-registered user cannot bypass admin approval via claim OTP');
    assertTest(db.passwordResetTokens.length === 0, 'TEST-05C', 'No claim token created for self-registered pending member');
  }

  // Test 6: 60-Second Cooldown Enforcement
  {
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_cooldown_1',
      phone: '+919876543214',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    // First request
    const firstResult = await requestAccountClaimOtp('9876543214', db, 'kewat', mockDelivery);
    assertTest(firstResult.delivered === true, 'TEST-06A', 'First request succeeds and delivers OTP');
    assertTest(db.passwordResetTokens.length === 1, 'TEST-06B', 'First request creates token');

    // Immediate second request within 60s
    mockDelivery.lastParams = null;
    const secondResult = await requestAccountClaimOtp('9876543214', db, 'kewat', mockDelivery);
    assertTest(secondResult.success === true, 'TEST-06C', 'Second request returns success: true');
    assertTest(secondResult.delivered === false, 'TEST-06D', 'Second request blocked by 60s cooldown');
    assertTest(mockDelivery.lastParams === null, 'TEST-06E', 'No new OTP sent during cooldown');
    assertTest(db.passwordResetTokens.length === 1, 'TEST-06F', 'No additional token created during cooldown');
  }

  // Test 7: Verify Claim OTP with Invalid Code
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_invalid_otp_1',
      phone: '+919876543215',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp('9876543215', db, 'kewat', mockDelivery);

    let caughtError: any = null;
    try {
      await verifyClaimOtpAndSetPassword('9876543215', '000000', 'NewValidPass123', db);
    } catch (err) {
      caughtError = err;
    }

    assertTest(caughtError instanceof InvalidClaimError, 'TEST-07A', 'Wrong OTP throws InvalidClaimError');
    assertTest(caughtError.message === 'Invalid verification code.', 'TEST-07B', 'Error message is "Invalid verification code."');
  }

  // Test 8: 5 Failed Attempts Burns the Token Record
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_burn_1',
      phone: '+919876543216',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp('9876543216', db, 'kewat', mockDelivery);
    const tokenRecord = db.passwordResetTokens[0];
    assertTest(tokenRecord.usedAt === null, 'TEST-08A', 'Token initially unused');

    // Make 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      try {
        await verifyClaimOtpAndSetPassword('9876543216', `11111${i}`, 'NewValidPass123', db);
      } catch (err: any) {
        assertTest(err.message === 'Invalid verification code.', `TEST-08B-${i}`, `Attempt ${i} rejected`);
      }
    }
    assertTest(tokenRecord.usedAt === null, 'TEST-08C', 'Token still active after 4 attempts');

    // 5th wrong attempt burns the token
    let fifthErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword('9876543216', '111115', 'NewValidPass123', db);
    } catch (err: any) {
      fifthErr = err;
    }

    assertTest(
      fifthErr?.message?.includes('Too many invalid attempts'),
      'TEST-08D',
      '5th attempt throws invalidation error'
    );
    assertTest(tokenRecord.usedAt !== null, 'TEST-08E', 'Token record burned (usedAt set) in database');

    // 6th attempt (even with the correct OTP now) must fail because token is burned
    let sixthErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword('9876543216', mockDelivery.lastParams!.otp, 'NewValidPass123', db);
    } catch (err: any) {
      sixthErr = err;
    }
    assertTest(sixthErr instanceof InvalidClaimError, 'TEST-08F', 'Subsequent attempt fails on burned token');
  }

  // Test 9: Expired Token Rejection
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    db.users.push({
      id: 'user_expired_1',
      phone: '+919876543217',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp('9876543217', db, 'kewat', mockDelivery);
    const tokenRecord = db.passwordResetTokens[0];
    // Force expiration in past
    tokenRecord.expiresAt = new Date(Date.now() - 1000);

    let expiredErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword('9876543217', mockDelivery.lastParams!.otp, 'NewValidPass123', db);
    } catch (err) {
      expiredErr = err;
    }

    assertTest(expiredErr instanceof InvalidClaimError, 'TEST-09A', 'Expired token throws InvalidClaimError');
    assertTest(
      expiredErr.message.includes('expired'),
      'TEST-09B',
      'Error message identifies token as expired'
    );
  }

  // Test 10: Successful Verification, Activation & Password Setup
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    const memberPhone = '+919876543218';
    const newPassword = 'SecureNewPassword@2026';

    db.users.push({
      id: 'user_success_1',
      phone: memberPhone,
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp(memberPhone, db, 'kewat', mockDelivery);
    const validOtp = mockDelivery.lastParams!.otp;

    await verifyClaimOtpAndSetPassword(
      memberPhone,
      validOtp,
      newPassword,
      db,
      '192.168.1.100',
      'Mozilla/5.0 TestBrowser'
    );

    const user = db.users.find((u: any) => u.id === 'user_success_1')!;
    assertTest(user.status === DbUserStatus.ACTIVE, 'TEST-10A', 'Member status transitioned to ACTIVE');
    assertTest(user.isPhoneVerified === true, 'TEST-10B', 'Member isPhoneVerified is true');

    const isPasswordValid = await argon2.verify(user.passwordHash, newPassword);
    assertTest(isPasswordValid === true, 'TEST-10C', 'New password verified with Argon2id hash');

    const tokenRecord = db.passwordResetTokens[0];
    assertTest(tokenRecord.usedAt !== null, 'TEST-10D', 'Claim token marked as used in database');

    assertTest(db.auditLogs.length === 1, 'TEST-10E', 'Audit log record created');
    const audit = db.auditLogs[0];
    assertTest(audit.action === 'ACCOUNT_CLAIM_AND_ACTIVATE', 'TEST-10F', 'Audit action matches');
    assertTest(audit.actorId === 'user_success_1', 'TEST-10G', 'Audit actorId is user ID');
    assertTest(audit.targetId === 'user_success_1', 'TEST-10H', 'Audit targetId is user ID');
    assertTest(audit.ipAddress === '192.168.1.100', 'TEST-10I', 'Audit IP address recorded');
  }

  // Test 11: Single-Use Protection (Cannot reuse consumed OTP)
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    const memberPhone = '+919876543219';

    db.users.push({
      id: 'user_reuse_1',
      phone: memberPhone,
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp(memberPhone, db, 'kewat', mockDelivery);
    const otp = mockDelivery.lastParams!.otp;

    await verifyClaimOtpAndSetPassword(memberPhone, otp, 'Password1234', db);

    let reuseErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword(memberPhone, otp, 'Password5678', db);
    } catch (err) {
      reuseErr = err;
    }
    assertTest(reuseErr instanceof InvalidClaimError, 'TEST-11A', 'Reusing consumed OTP fails');
  }

  // Test 12: Short Password Rejection (<8 chars)
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    const memberPhone = '+919876543220';

    db.users.push({
      id: 'user_short_pass_1',
      phone: memberPhone,
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    await requestAccountClaimOtp(memberPhone, db, 'kewat', mockDelivery);
    const otp = mockDelivery.lastParams!.otp;

    let shortPassErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword(memberPhone, otp, 'short', db);
    } catch (err) {
      shortPassErr = err;
    }
    assertTest(shortPassErr instanceof AuthError, 'TEST-12A', 'Password < 8 chars throws AuthError');
    assertTest(shortPassErr.statusCode === 400, 'TEST-12B', 'Password error has HTTP 400 status');
  }

  // Test 13: Tenant Isolation & assertDb Guard
  {
    let missingDbErr: any = null;
    try {
      await requestAccountClaimOtp('9876543210', undefined);
    } catch (err) {
      missingDbErr = err;
    }
    assertTest(missingDbErr instanceof AuthError, 'TEST-13A', 'Request OTP without db throws AuthError');
    assertTest(missingDbErr.statusCode === 500, 'TEST-13B', 'Missing tenant db has HTTP 500 status');

    let missingDbVerifyErr: any = null;
    try {
      await verifyClaimOtpAndSetPassword('9876543210', '123456', 'Password1234', undefined);
    } catch (err) {
      missingDbVerifyErr = err;
    }
    assertTest(missingDbVerifyErr instanceof AuthError, 'TEST-13C', 'Verify OTP without db throws AuthError');
  }

  // Test 14: Fail-Closed Production Guard
  {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldSmsKey = process.env.SMS_API_KEY;
    const oldFast2Sms = process.env.FAST2SMS_API_KEY;
    const oldMsg91 = process.env.MSG91_AUTH_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SMS_API_KEY;
      delete process.env.FAST2SMS_API_KEY;
      delete process.env.MSG91_AUTH_KEY;

      const db = createMockDatabase('kewat');
      db.users.push({
        id: 'user_prod_fail_1',
        phone: '+919876543221',
        passwordHash: dummyPasswordHash,
        role: DbRole.MEMBER,
        status: DbUserStatus.PENDING,
        isPhoneVerified: false,
        refreshTokens: [],
      });

      const result = await requestAccountClaimOtp('9876543221', db, 'kewat');
      assertTest(result.success === true, 'TEST-14A', 'Production fail-closed returns generic success: true');
      assertTest(result.delivered === false, 'TEST-14B', 'Production fail-closed does not deliver OTP');
      assertTest(db.passwordResetTokens.length === 0, 'TEST-14C', 'No token created in production without SMS provider');
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldSmsKey) process.env.SMS_API_KEY = oldSmsKey;
      if (oldFast2Sms) process.env.FAST2SMS_API_KEY = oldFast2Sms;
      if (oldMsg91) process.env.MSG91_AUTH_KEY = oldMsg91;
    }
  }

  // Test 15: Controller HTTP Integration — Request OTP Handler
  {
    const db = createMockDatabase('kewat');
    db.users.push({
      id: 'user_ctrl_1',
      phone: '+919876543222',
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    // 15A: Missing tenant
    let resStatus = 0;
    let resBody: any = null;
    const fakeRes: any = {
      status: (s: number) => {
        resStatus = s;
        return fakeRes;
      },
      json: (b: any) => {
        resBody = b;
      },
    };

    const noTenantReq: any = {
      body: { phone: '9876543222' },
      tenant: null,
      db: null,
    };
    await requestClaimOtpHandler(noTenantReq, fakeRes);
    assertTest(resStatus === 400, 'TEST-15A', 'Controller rejects request missing tenant context with 400');

    // 15B: Central Admin rejection
    const centralReq: any = {
      body: { phone: '9876543222' },
      isCentralAdmin: true,
      tenant: null,
      db: null,
    };
    await requestClaimOtpHandler(centralReq, fakeRes);
    assertTest(resStatus === 400, 'TEST-15B', 'Controller rejects central admin claim requests with 400');

    // 15C: Valid request
    const validReq: any = {
      body: { phone: '9876543222' },
      tenant: { slug: 'kewat', isResolved: true },
      db,
    };
    await requestClaimOtpHandler(validReq, fakeRes);
    assertTest(resStatus === 200, 'TEST-15C', 'Controller returns 200 for valid claim request');
    assertTest(resBody.success === true, 'TEST-15D', 'Response indicates success: true');
    assertTest(resBody.message.includes('activation code has been sent'), 'TEST-15E', 'Response has generic message');
  }

  // Test 16: Controller HTTP Integration — Verify OTP Handler
  {
    const db = createMockDatabase('kewat');
    const memberPhone = '+919876543223';
    db.users.push({
      id: 'user_ctrl_2',
      phone: memberPhone,
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    await requestAccountClaimOtp(memberPhone, db, 'kewat', mockDelivery);
    const validOtp = mockDelivery.lastParams!.otp;

    let resStatus = 0;
    let resBody: any = null;
    const fakeRes: any = {
      status: (s: number) => {
        resStatus = s;
        return fakeRes;
      },
      json: (b: any) => {
        resBody = b;
      },
    };

    // 16A: Invalid OTP format (not 6 digits)
    const invalidFormatReq: any = {
      body: { phone: memberPhone, otp: '123', newPassword: 'ValidPassword123' },
      tenant: { slug: 'kewat', isResolved: true },
      db,
    };
    await verifyClaimOtpHandler(invalidFormatReq, fakeRes);
    assertTest(resStatus === 400, 'TEST-16A', 'Controller rejects non-6-digit OTP format with 400');

    // 16B: Valid claim verification
    const validReq: any = {
      body: { phone: memberPhone, otp: validOtp, newPassword: 'BrandNewPassword@2026' },
      tenant: { slug: 'kewat', isResolved: true },
      db,
      ip: '10.0.0.1',
      headers: { 'user-agent': 'JestTestRunner' },
    };
    await verifyClaimOtpHandler(validReq, fakeRes);
    assertTest(resStatus === 200, 'TEST-16B', 'Controller returns 200 on successful claim verification');
    assertTest(resBody.success === true, 'TEST-16C', 'Response indicates success: true');
    assertTest(resBody.data?.claimed === true, 'TEST-16D', 'Response data has claimed: true');

    const updatedUser = db.users.find((u: any) => u.id === 'user_ctrl_2')!;
    assertTest(updatedUser.status === DbUserStatus.ACTIVE, 'TEST-16E', 'User status is now ACTIVE');
    assertTest(updatedUser.isPhoneVerified === true, 'TEST-16F', 'User isPhoneVerified is true');
  }

  // Test 17: Concurrent Verification Simulation (Race Condition Safety)
  {
    resetClaimTokenAttempts();
    const db = createMockDatabase('kewat');
    const memberPhone = '+919876543224';

    db.users.push({
      id: 'user_race_1',
      phone: memberPhone,
      passwordHash: dummyPasswordHash,
      role: DbRole.MEMBER,
      status: DbUserStatus.PENDING,
      isPhoneVerified: false,
      refreshTokens: [],
    });

    const mockDelivery = new MockClaimOtpDeliveryAdapter();
    await requestAccountClaimOtp(memberPhone, db, 'kewat', mockDelivery);
    const otp = mockDelivery.lastParams!.otp;

    // Run two verification attempts concurrently
    const [result1, result2] = await Promise.allSettled([
      verifyClaimOtpAndSetPassword(memberPhone, otp, 'FirstWinnerPass123', db),
      verifyClaimOtpAndSetPassword(memberPhone, otp, 'SecondLoserPass123', db),
    ]);

    const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
    const failures = [result1, result2].filter((r) => r.status === 'rejected');

    assertTest(successes.length === 1, 'TEST-17A', 'Exactly one concurrent verification succeeds');
    assertTest(failures.length === 1, 'TEST-17B', 'Exactly one concurrent verification is rejected');
  }

  console.log('\n================================================================');
  console.log(`   Verification Complete: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAccountClaimingTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});

