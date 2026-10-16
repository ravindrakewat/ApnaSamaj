import { z } from 'zod';
import { phoneSchema } from './phone.js';

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  phone: phoneSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long'),
  fullName: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  subCaste: z.string().trim().max(100).optional(),
  gotra: z.string().trim().max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  bio: z.string().trim().max(500, 'Bio must not exceed 500 characters').nullable().optional(),
  avatarUrl: z.string().url('Invalid avatar URL').nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  subCaste: z.string().trim().max(100).nullable().optional(),
  gotra: z.string().trim().max(100).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token cannot be empty').optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
