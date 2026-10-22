import { z } from 'zod';

export const directoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  gotra: z.string().trim().optional(),
});

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
