import rateLimit from 'express-rate-limit';
import { ApiResponse } from '@apnasamaj/shared-types';
import { normalizeIndianPhone } from '@apnasamaj/validation';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many login attempts. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 refresh requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many token refresh requests. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 registration requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many registration attempts from this network. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const createPostRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 post creations per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'You are creating posts too quickly. Please wait a few minutes before posting again.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const createCommentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 comment creations per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'You are commenting too quickly. Please wait a few minutes before commenting again.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const reportPostRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 post reports per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many reports submitted from this network. Please wait a few minutes before reporting again.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const forgotPasswordIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 forgot-password requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many password reset requests from this network. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const forgotPasswordPhoneRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each phone number to 3 requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const rawPhone = req.body?.phone;
    if (typeof rawPhone === 'string' && rawPhone.trim()) {
      try {
        const normalized = normalizeIndianPhone(rawPhone);
        if (normalized) return `phone:${normalized}`;
      } catch {
        // fallback
      }
    }
    return `ip:${req.ip || 'unknown'}`;
  },
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many password reset requests for this phone number. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const verifyResetTokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 token verifications per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many reset token verification attempts. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});

export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 reset submissions per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: 'Too many password reset submissions. Please try again after 15 minutes.',
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  },
});
