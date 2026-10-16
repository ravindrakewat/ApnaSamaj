import { z } from 'zod';

/**
 * Normalizes an Indian mobile number to E.164 format (+91XXXXXXXXXX).
 * Accepts:
 * - 10 digits: 9876543210
 * - With leading 0: 09876543210
 * - With leading 91: 919876543210
 * - With leading +91: +919876543210
 * Cleans spaces, dashes, dots, and parentheses.
 */
export function normalizeIndianPhone(input: string): string {
  if (!input) return '';
  const cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+91')) {
    return `+91${cleaned.slice(3)}`;
  }
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+91${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+91${cleaned.slice(1)}`;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

export const indianPhoneRegex = /^\+91[6-9]\d{9}$/;

export const phoneSchema = z
  .string()
  .min(10, 'Mobile number must be at least 10 digits')
  .transform((val) => normalizeIndianPhone(val))
  .refine((val) => indianPhoneRegex.test(val), {
    message: 'Invalid Indian mobile number. Must be a 10-digit number starting with 6, 7, 8, or 9.',
  });

/**
 * Masks a normalized phone number for safe, non-sensitive logging.
 * Example: +919876543210 -> +91******3210
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return '***';
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  return `${prefix}******${suffix}`;
}
