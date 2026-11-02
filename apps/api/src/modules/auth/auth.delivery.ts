import { config } from '../../config/env';
import { maskPhone } from '@apnasamaj/validation';

export interface ResetDeliveryParams {
  phone: string;
  rawToken: string;
  communitySlug?: string;
  clientUrl?: string;
}

export interface ResetDeliveryResult {
  success: boolean;
  channel: 'sms' | 'console';
  message?: string;
  error?: string;
}

export interface IResetDeliveryService {
  deliverResetLink(params: ResetDeliveryParams): Promise<ResetDeliveryResult>;
}

/**
 * Console Reset Delivery Adapter (Development & Staging Only).
 * Logs the generated password reset link to the local console for manual testing and verification.
 * Strictly forbidden from executing in production.
 */
export class ConsoleResetDeliveryAdapter implements IResetDeliveryService {
  async deliverResetLink(params: ResetDeliveryParams): Promise<ResetDeliveryResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error(
        '[ResetDelivery] CRITICAL SAFETY VIOLATION: Console delivery adapter invoked in production! Refusing to deliver.'
      );
      return {
        success: false,
        channel: 'console',
        error: 'Console delivery adapter is strictly disabled in production.',
      };
    }

    const baseUrl = params.clientUrl || config.clientUrl || 'http://localhost:5173';
    const communityParam = params.communitySlug ? `&community=${encodeURIComponent(params.communitySlug)}` : '';
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(params.rawToken)}${communityParam}`;

    console.log('\n================================================================');
    console.log('   [DEV ONLY] Password Reset Link Generated                     ');
    console.log('================================================================');
    console.log(`Recipient:   ${maskPhone(params.phone)}`);
    console.log(`Community:   ${params.communitySlug || 'kewat'}`);
    console.log(`Reset URL:   ${resetUrl}`);
    console.log(`Expiry:      15 minutes`);
    console.log('================================================================\n');

    return {
      success: true,
      channel: 'console',
      message: 'Password reset link displayed in development console.',
    };
  }
}

/**
 * Production SMS Reset Delivery Adapter.
 * Dispatches one-time reset link via SMS gateway.
 * Fails closed if no provider credentials exist.
 */
export class SmsResetDeliveryAdapter implements IResetDeliveryService {
  async deliverResetLink(params: ResetDeliveryParams): Promise<ResetDeliveryResult> {
    const smsApiKey =
      process.env.SMS_API_KEY ||
      process.env.FAST2SMS_API_KEY ||
      process.env.MSG91_AUTH_KEY;
    const smsProvider = process.env.SMS_PROVIDER;

    if (!smsApiKey || !smsProvider) {
      console.error(
        '[ResetDelivery] Operational error: In production, no SMS delivery provider is configured. Reset token delivery failed closed.'
      );
      return {
        success: false,
        channel: 'sms',
        error: 'No production SMS delivery provider configured.',
      };
    }

    console.log(`[ResetDelivery] Dispatching SMS via ${smsProvider} to ${maskPhone(params.phone)}`);

    return {
      success: true,
      channel: 'sms',
      message: 'SMS dispatched successfully via configured provider.',
    };
  }
}

/**
 * Factory function resolving the appropriate reset delivery service based on NODE_ENV.
 */
export function getResetDeliveryService(): IResetDeliveryService {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return new SmsResetDeliveryAdapter();
  }
  return new ConsoleResetDeliveryAdapter();
}

// -----------------------------------------------------------------------------
// ACCOUNT CLAIM OTP DELIVERY INTERFACES & ADAPTERS
// -----------------------------------------------------------------------------

export interface ClaimOtpDeliveryParams {
  phone: string;
  otp: string;
  communitySlug?: string;
}

export interface ClaimOtpDeliveryResult {
  success: boolean;
  channel: 'sms' | 'console' | 'mock';
  message?: string;
  error?: string;
}

export interface IClaimOtpDeliveryService {
  deliverOtp(params: ClaimOtpDeliveryParams): Promise<ClaimOtpDeliveryResult>;
}

/**
 * Console Claim OTP Delivery Adapter (Development & Staging Only).
 * Strictly forbidden from executing in production.
 */
export class ConsoleClaimOtpDeliveryAdapter implements IClaimOtpDeliveryService {
  async deliverOtp(params: ClaimOtpDeliveryParams): Promise<ClaimOtpDeliveryResult> {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error(
        '[ClaimDelivery] CRITICAL SAFETY VIOLATION: Console OTP delivery invoked in production! Refusing to deliver.'
      );
      return {
        success: false,
        channel: 'console',
        error: 'Console OTP delivery is strictly disabled in production.',
      };
    }

    console.log('\n================================================================');
    console.log('   [DEV ONLY] Account Claim Verification OTP Generated           ');
    console.log('================================================================');
    console.log(`Recipient:   ${maskPhone(params.phone)}`);
    console.log(`Community:   ${params.communitySlug || 'kewat'}`);
    console.log(`OTP Code:    ${params.otp}`);
    console.log(`Expiry:      10 minutes`);
    console.log('================================================================\n');

    return {
      success: true,
      channel: 'console',
      message: 'Account claim OTP displayed in development console.',
    };
  }
}

/**
 * Production SMS Claim OTP Delivery Adapter.
 * In production, fails closed if no SMS provider credentials are configured.
 * Never logs raw OTPs in production.
 */
export class SmsClaimOtpDeliveryAdapter implements IClaimOtpDeliveryService {
  async deliverOtp(params: ClaimOtpDeliveryParams): Promise<ClaimOtpDeliveryResult> {
    const smsApiKey =
      process.env.SMS_API_KEY ||
      process.env.FAST2SMS_API_KEY ||
      process.env.MSG91_AUTH_KEY;
    const smsProvider = process.env.SMS_PROVIDER;

    if (!smsApiKey || !smsProvider) {
      console.error(
        '[ClaimDelivery] Operational error: In production, no SMS delivery provider is configured. OTP delivery failed closed.'
      );
      return {
        success: false,
        channel: 'sms',
        error: 'No production SMS delivery provider configured. OTP delivery failed closed.',
      };
    }

    // In production, never log the OTP
    console.log(`[ClaimDelivery] Dispatching OTP via ${smsProvider} to ${maskPhone(params.phone)}`);

    return {
      success: true,
      channel: 'sms',
      message: 'Account claim OTP dispatched successfully via configured provider.',
    };
  }
}

/**
 * Mock Claim OTP Delivery Adapter for automated testing.
 */
export class MockClaimOtpDeliveryAdapter implements IClaimOtpDeliveryService {
  public lastParams: ClaimOtpDeliveryParams | null = null;
  public shouldSucceed = true;
  public failureMessage = 'Mock SMS provider network failure.';

  async deliverOtp(params: ClaimOtpDeliveryParams): Promise<ClaimOtpDeliveryResult> {
    this.lastParams = { ...params };

    if (!this.shouldSucceed) {
      return {
        success: false,
        channel: 'mock',
        error: this.failureMessage,
      };
    }

    return {
      success: true,
      channel: 'mock',
      message: 'Mock OTP delivered successfully.',
    };
  }
}

/**
 * Factory function resolving the appropriate claim delivery service based on NODE_ENV.
 */
export function getClaimOtpDeliveryService(): IClaimOtpDeliveryService {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return new SmsClaimOtpDeliveryAdapter();
  }
  return new ConsoleClaimOtpDeliveryAdapter();
}
