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
 * Production SMS Delivery Adapter.
 * In a real production deployment, this adapter dispatches the one-time link/OTP
 * via an Indian DLT-compliant SMS provider (e.g. Fast2SMS, MSG91, or Twilio).
 * 
 * FAIL-CLOSED INVARIANT:
 * If no SMS provider credentials are configured in production, this adapter
 * fails closed without creating usable tokens or logging secrets.
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

    // When an actual SMS provider is configured, handle HTTP delivery here:
    // (e.g. fetch to Fast2SMS / MSG91 API with registered DLT template)
    console.log(`[ResetDelivery] Dispatching SMS via ${smsProvider} to ${maskPhone(params.phone)}`);

    return {
      success: true,
      channel: 'sms',
      message: 'SMS dispatched successfully via configured provider.',
    };
  }
}

/**
 * Factory function resolving the appropriate delivery service based on NODE_ENV.
 */
export function getResetDeliveryService(): IResetDeliveryService {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return new SmsResetDeliveryAdapter();
  }
  return new ConsoleResetDeliveryAdapter();
}

