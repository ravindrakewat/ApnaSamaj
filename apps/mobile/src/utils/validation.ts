/**
 * Client-side validation utilities for Apna Samaj Mobile.
 * Designed to strictly align with backend `@apnasamaj/validation` schemas
 * while executing with zero external dependencies for maximum Hermes speed.
 */

export const INDIAN_PHONE_REGEX = /^\+91[6-9]\d{9}$/;

/**
 * Normalizes an Indian mobile phone number to E.164 format (+91XXXXXXXXXX).
 * Accepts:
 * - 10 digits: 9876543210 -> +919876543210
 * - With leading 0: 09876543210 -> +919876543210
 * - With leading 91: 919876543210 -> +919876543210
 * - With leading +91: +919876543210 -> +919876543210
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

/**
 * Validates whether an input is a valid normalized Indian phone number (+91XXXXXXXXXX).
 */
export function isValidIndianPhone(phone: string): boolean {
  return INDIAN_PHONE_REGEX.test(phone);
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface PhoneValidationResult extends ValidationResult {
  normalized: string;
}

/**
 * Validates mobile number input and returns normalized E.164 value or error.
 */
export function validatePhone(
  rawPhone: string,
  lang: 'hi' | 'en' = 'hi'
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      normalized: '',
      error: lang === 'hi' ? 'फ़ोन नंबर आवश्यक है' : 'Phone number is required',
    };
  }

  const normalized = normalizeIndianPhone(rawPhone);
  if (!isValidIndianPhone(normalized)) {
    return {
      isValid: false,
      normalized,
      error:
        lang === 'hi'
          ? 'अमान्य मोबाइल नंबर। कृपया 10 अंकों का मान्य भारतीय नंबर दर्ज करें (6-9 से शुरू होने वाला)।'
          : 'Invalid mobile number. Must be a 10-digit Indian number starting with 6, 7, 8, or 9.',
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

/**
 * Validates password meets the backend minimum length requirement (8+ characters).
 */
export function validatePassword(
  password: string,
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  if (!password) {
    return {
      isValid: false,
      error: lang === 'hi' ? 'पासवर्ड आवश्यक है' : 'Password is required',
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'पासवर्ड कम से कम 8 वर्णों का होना चाहिए'
          : 'Password must be at least 8 characters long',
    };
  }

  return { isValid: true };
}

/**
 * Validates full name meets requirements (2 to 100 characters).
 */
export function validateFullName(
  fullName: string,
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  const trimmed = fullName ? fullName.trim() : '';
  if (!trimmed) {
    return {
      isValid: false,
      error: lang === 'hi' ? 'पूरा नाम आवश्यक है' : 'Full name is required',
    };
  }

  if (trimmed.length < 2) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'पूरा नाम कम से कम 2 अक्षरों का होना चाहिए'
          : 'Full name must be at least 2 characters',
    };
  }

  if (trimmed.length > 100) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'पूरा नाम 100 वर्णों से अधिक नहीं हो सकता'
          : 'Full name must not exceed 100 characters',
    };
  }

  return { isValid: true };
}

/**
 * Validates community tenant slug.
 */
export function validateCommunitySlug(
  slug: string,
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  const trimmed = slug ? slug.trim().toLowerCase() : '';
  if (!trimmed) {
    return {
      isValid: false,
      error: lang === 'hi' ? 'कम्युनिटी स्लग आवश्यक है' : 'Community slug is required',
    };
  }

  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'स्लग में केवल छोटे अक्षर, संख्या, हाइफ़न और अंडरस्कोर हो सकते हैं'
          : 'Slug can only contain lowercase letters, numbers, hyphens, and underscores',
    };
  }

  return { isValid: true };
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/jpg',
];

/**
 * Validates post title according to post type rules:
 * - ANNOUNCEMENT and EVENT require title (1-150 chars).
 * - GENERAL post title is optional (max 150 chars).
 */
export function validatePostTitle(
  title: string,
  type: 'GENERAL' | 'ANNOUNCEMENT' | 'EVENT' = 'GENERAL',
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  const trimmed = title ? title.trim() : '';

  if (type === 'ANNOUNCEMENT' || type === 'EVENT') {
    if (!trimmed) {
      return {
        isValid: false,
        error:
          lang === 'hi'
            ? 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है'
            : 'Title is required for this post type',
      };
    }
  }

  if (trimmed.length > 150) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'शीर्षक 150 वर्णों से अधिक नहीं हो सकता'
          : 'Title must not exceed 150 characters',
    };
  }

  return { isValid: true };
}

/**
 * Validates post content:
 * - Must not exceed 5000 characters.
 * - Post must contain either text content, title, or media attachment.
 */
export function validatePostContent(
  content: string,
  title: string,
  hasMedia: boolean,
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  const trimmedContent = content ? content.trim() : '';
  const trimmedTitle = title ? title.trim() : '';

  if (trimmedContent.length > 5000) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'सामग्री 5000 वर्णों से अधिक नहीं हो सकती'
          : 'Content must not exceed 5000 characters',
    };
  }

  if (!trimmedContent && !trimmedTitle && !hasMedia) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'पोस्ट में टेक्स्ट सामग्री या कम से कम एक मीडिया संलग्न होना चाहिए'
          : 'Post must contain either text content or at least one media attachment',
    };
  }

  return { isValid: true };
}

/**
 * Validates selected image size and format.
 */
export function validateImageAttachment(
  fileSizeBytes: number,
  mimeType: string,
  lang: 'hi' | 'en' = 'hi'
): ValidationResult {
  if (fileSizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'छवि फ़ाइल 5MB की अधिकतम सीमा से अधिक है'
          : 'Image file size exceeds the 5MB maximum limit',
    };
  }

  const cleanMime = mimeType ? mimeType.toLowerCase().trim() : '';
  if (cleanMime && !ALLOWED_IMAGE_MIMES.includes(cleanMime)) {
    return {
      isValid: false,
      error:
        lang === 'hi'
          ? 'असमर्थित छवि प्रारूप (केवल JPEG, PNG, WebP और GIF समर्थित हैं)'
          : 'Unsupported image format (only JPEG, PNG, WebP, and GIF are supported)',
    };
  }

  return { isValid: true };
}
