import crypto from 'crypto';
import { UploadMediaResponseData } from '@apnasamaj/shared-types';
import { config } from '../config/env';
import { getSupabaseClient } from '../config/supabase';

export class StorageError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'StorageError';
    this.statusCode = statusCode;
  }
}

export class InvalidMimeTypeError extends StorageError {
  constructor(message: string = 'Corrupted or unsupported image file content. Only JPEG, PNG, WebP, and GIF images are allowed.') {
    super(message, 400);
  }
}

export class OversizedFileError extends StorageError {
  constructor(maxBytes: number) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
    super(`File size exceeds the maximum allowed limit of ${maxMb}MB.`, 400);
  }
}

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const MIME_TO_EXTENSION: Record<SupportedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Validates actual binary content by inspecting file magic bytes.
 * Prevents malicious spoofing of file extensions.
 */
export function detectImageMimeType(buffer: Buffer): SupportedImageMime | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: 52 49 46 46 ('RIFF') at 0..3 and 57 45 42 50 ('WEBP') at 8..11
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Ensures that the target storage bucket exists in Supabase.
 */
export async function ensureBucketExists(): Promise<void> {
  const supabase = getSupabaseClient();
  const bucketName = config.supabaseStorageBucket;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.warn('[Storage Service] Could not verify bucket list:', listError.message);
    return;
  }

  const exists = buckets?.some((b) => b.name === bucketName);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: config.maxMediaFileSizeBytes,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    });

    if (createError && !createError.message.includes('already exists')) {
      console.error('[Storage Service] Failed to create storage bucket:', createError.message);
    }
  }
}

/**
 * Uploads an image buffer to Supabase Storage with strict MIME and size validation.
 * Namespaces files under posts/{userId}/{uuid}.{ext} to guarantee zero path traversal
 * and prevent unauthorized overwrites.
 */
export async function uploadPostMedia(
  userId: string,
  fileBuffer: Buffer,
  _claimedMimeType?: string,
  originalName: string = 'image.jpg'
): Promise<UploadMediaResponseData> {
  // 1. File size check
  if (fileBuffer.length > config.maxMediaFileSizeBytes) {
    throw new OversizedFileError(config.maxMediaFileSizeBytes);
  }

  // 2. Magic bytes validation
  const detectedMime = detectImageMimeType(fileBuffer);
  if (!detectedMime) {
    throw new InvalidMimeTypeError();
  }

  const ext = MIME_TO_EXTENSION[detectedMime];
  const fileId = crypto.randomUUID();
  const storagePath = `posts/${userId}/${fileId}.${ext}`;

  // 3. Upload to Supabase Storage
  const supabase = getSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .upload(storagePath, fileBuffer, {
      contentType: detectedMime,
      upsert: false,
    });

  if (uploadError) {
    console.error('[Storage Service] Supabase upload failed:', uploadError.message);
    throw new StorageError(`Failed to upload media: ${uploadError.message}`, 500);
  }

  // 4. Resolve public URL
  const { data: publicUrlData } = supabase.storage
    .from(config.supabaseStorageBucket)
    .getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    storagePath,
    mediaType: 'IMAGE',
    fileName: originalName,
    fileSizeBytes: fileBuffer.length,
    mimeType: detectedMime,
  };
}

/**
 * Uploads a profile avatar image buffer to Supabase Storage with strict MIME and size validation.
 * Namespaces files under avatars/{userId}/{uuid}.{ext} to guarantee zero path traversal
 * and prevent unauthorized overwrites.
 */
export async function uploadAvatarMedia(
  userId: string,
  fileBuffer: Buffer,
  _claimedMimeType?: string,
  originalName: string = 'avatar.jpg'
): Promise<UploadMediaResponseData> {
  // 1. File size check
  if (fileBuffer.length > config.maxMediaFileSizeBytes) {
    throw new OversizedFileError(config.maxMediaFileSizeBytes);
  }

  // 2. Magic bytes validation
  const detectedMime = detectImageMimeType(fileBuffer);
  if (!detectedMime) {
    throw new InvalidMimeTypeError();
  }

  const ext = MIME_TO_EXTENSION[detectedMime];
  const fileId = crypto.randomUUID();
  const storagePath = `avatars/${userId}/${fileId}.${ext}`;

  // 3. Upload to Supabase Storage
  const supabase = getSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .upload(storagePath, fileBuffer, {
      contentType: detectedMime,
      upsert: false,
    });

  if (uploadError) {
    console.error('[Storage Service] Supabase avatar upload failed:', uploadError.message);
    throw new StorageError(`Failed to upload avatar: ${uploadError.message}`, 500);
  }

  // 4. Resolve public URL
  const { data: publicUrlData } = supabase.storage
    .from(config.supabaseStorageBucket)
    .getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    storagePath,
    mediaType: 'IMAGE',
    fileName: originalName,
    fileSizeBytes: fileBuffer.length,
    mimeType: detectedMime,
  };
}

/**
 * Uploads a matrimonial gallery photo to Supabase Storage in the isolated matrimonial/ namespace.
 * Enforces magic bytes MIME validation and file size limits.
 */
export async function uploadMatrimonialMedia(
  userId: string,
  fileBuffer: Buffer,
  _claimedMimeType?: string,
  originalName: string = 'matrimonial.jpg'
): Promise<UploadMediaResponseData> {
  // 1. File size check
  if (fileBuffer.length > config.maxMediaFileSizeBytes) {
    throw new OversizedFileError(config.maxMediaFileSizeBytes);
  }

  // 2. Magic bytes validation
  const detectedMime = detectImageMimeType(fileBuffer);
  if (!detectedMime) {
    throw new InvalidMimeTypeError();
  }

  const ext = MIME_TO_EXTENSION[detectedMime];
  const fileId = crypto.randomUUID();
  const storagePath = `matrimonial/${userId}/${fileId}.${ext}`;

  // 3. Upload to Supabase Storage
  const supabase = getSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .upload(storagePath, fileBuffer, {
      contentType: detectedMime,
      upsert: false,
    });

  if (uploadError) {
    console.error('[Storage Service] Supabase matrimonial upload failed:', uploadError.message);
    throw new StorageError(`Failed to upload matrimonial photo: ${uploadError.message}`, 500);
  }

  // 4. Resolve public URL
  const { data: publicUrlData } = supabase.storage
    .from(config.supabaseStorageBucket)
    .getPublicUrl(storagePath);

  return {
    url: publicUrlData.publicUrl,
    storagePath,
    mediaType: 'IMAGE',
    fileName: originalName,
    fileSizeBytes: fileBuffer.length,
    mimeType: detectedMime,
  };
}

/**

 * Deletes one or more storage objects from Supabase Storage.
 * Safe and idempotent.
 */
export async function deleteStorageObjects(storagePaths: string[]): Promise<void> {
  const validPaths = storagePaths.filter(Boolean);
  if (validPaths.length === 0) return;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(config.supabaseStorageBucket)
      .remove(validPaths);

    if (error) {
      console.warn('[Storage Service] Storage cleanup warning:', error.message);
    }
  } catch (err) {
    console.warn('[Storage Service] Storage cleanup error:', err);
  }
}

/**
 * Extracts the storage object path (e.g. posts/userId/uuid.jpg) from a full Supabase URL.
 */
export function extractStoragePathFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const bucketName = config.supabaseStorageBucket;
  const marker = `/${bucketName}/`;
  const index = url.indexOf(marker);
  if (index !== -1) {
    return url.slice(index + marker.length).split('?')[0];
  }
  return null;
}
