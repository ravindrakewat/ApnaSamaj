import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from cwd and monorepo root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  refreshTokenExpiresDays: number;
  clientUrl: string;
  adminUrl: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  supabaseStorageBucket: string;
  supabasePrivateStorageBucket: string;
  maxMediaFileSizeBytes: number;
  maxVideoFileSizeBytes: number;
  maxPostMediaCount: number;
}

export function validateAndGetConfig(): AppConfig {
  const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

  if (!jwtSecret || jwtSecret.trim().length < 32) {
    throw new Error(
      '[Config Error] JWT_ACCESS_SECRET must be configured and be at least 32 characters long. Please check your .env configuration.'
    );
  }

  const port = parseInt(process.env.PORT || '4000', 10);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const jwtAccessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  const refreshTokenExpiresDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const adminUrl = process.env.ADMIN_URL || 'http://localhost:5174';

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'post-media';
  const supabasePrivateStorageBucket =
    process.env.SUPABASE_PRIVATE_DOCUMENTS_BUCKET || 'matrimonial-documents';
  const maxMediaFileSizeBytes = parseInt(process.env.MAX_MEDIA_FILE_SIZE_BYTES || '5242880', 10); // 5MB
  const maxVideoFileSizeBytes = parseInt(process.env.MAX_VIDEO_FILE_SIZE_BYTES || '31457280', 10); // 30MB
  const maxPostMediaCount = parseInt(process.env.MAX_POST_MEDIA_COUNT || '4', 10); // 4 images

  return {
    port: isNaN(port) ? 4000 : port,
    nodeEnv,
    jwtAccessSecret: jwtSecret.trim(),
    jwtAccessExpiresIn,
    refreshTokenExpiresDays: isNaN(refreshTokenExpiresDays) ? 7 : refreshTokenExpiresDays,
    clientUrl,
    adminUrl,
    supabaseUrl,
    supabaseSecretKey,
    supabaseStorageBucket,
    supabasePrivateStorageBucket,
    maxMediaFileSizeBytes: isNaN(maxMediaFileSizeBytes) ? 5242880 : maxMediaFileSizeBytes,
    maxVideoFileSizeBytes: isNaN(maxVideoFileSizeBytes) ? 31457280 : maxVideoFileSizeBytes,
    maxPostMediaCount: isNaN(maxPostMediaCount) ? 4 : maxPostMediaCount,
  };
}

export const config = validateAndGetConfig();
