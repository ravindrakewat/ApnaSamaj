import { z } from 'zod';

export const directoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional(),
  city: z.string().trim().max(100, 'City filter cannot exceed 100 characters.').optional(),
  state: z.string().trim().max(100, 'State filter cannot exceed 100 characters.').optional(),
  gotra: z.string().trim().max(100, 'Gotra filter cannot exceed 100 characters.').optional(),
  subCaste: z.string().trim().max(100, 'Sub-caste filter cannot exceed 100 characters.').optional(),
});

export const memberIdSchema = z.string().uuid('Invalid member ID format. Expected a valid UUID.');

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
