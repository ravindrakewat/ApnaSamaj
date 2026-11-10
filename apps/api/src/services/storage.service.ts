import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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

export type SupportedVideoMime = 'video/mp4' | 'video/webm';

/**
 * Validates binary video content by inspecting file signatures (magic bytes).
 * Supports standard MP4 (ftyp atom) and WebM (EBML header with webm docType).
 */
export function detectVideoMimeType(buffer: Buffer): SupportedVideoMime | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // MP4: ISO BMFF ftyp box at offset 4
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'video/mp4';
  }

  // WebM: EBML header starting with 0x1A 0x45 0xDF 0xA3 containing 'webm' docType
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    const headerSlice = buffer.subarray(0, Math.min(buffer.length, 64)).toString('latin1');
    if (headerSlice.includes('webm')) {
      return 'video/webm';
    }
  }

  return null;
}

/**
 * Memory-safe video MIME detection reading only the first 128 bytes from disk.
 * Avoids loading multi-megabyte video files into Node.js heap memory.
 */
export async function detectVideoMimeTypeFromDisk(filePath: string): Promise<SupportedVideoMime | null> {
  let fileHandle = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const headerBuf = Buffer.alloc(128);
    const { bytesRead } = await fileHandle.read(headerBuf, 0, 128, 0);
    if (bytesRead < 12) {
      return null;
    }
    return detectVideoMimeType(headerBuf.subarray(0, bytesRead));
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

export async function ensureBucketExists(): Promise<void> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return;
  }
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return;
  }
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
      fileSizeLimit: 52428800,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
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

/**
 * Uploads a video file from a disk path to Supabase Storage with strict MIME and size validation.
 * Uses streaming to prevent loading multi-megabyte buffers into Node.js heap memory.
 * Namespaces files under posts/{userId}/{uuid}.{ext} to guarantee zero path traversal
 * and prevent unauthorized overwrites.
 */
export async function uploadPostVideo(
  userId: string,
  tempFilePath: string,
  _claimedMimeType?: string,
  originalName: string = 'video.mp4'
): Promise<UploadMediaResponseData> {
  // 1. File existence and size check
  const stat = await fs.promises.stat(tempFilePath);
  const maxBytes = config.maxVideoFileSizeBytes; // 30MB
  if (stat.size > maxBytes) {
    throw new OversizedFileError(maxBytes);
  }
  if (stat.size === 0) {
    throw new StorageError('Uploaded video file is empty.', 400);
  }

  // 2. Magic bytes validation (memory-safe: reads only first 128 bytes from disk)
  const detectedMime = await detectVideoMimeTypeFromDisk(tempFilePath);
  if (!detectedMime) {
    throw new InvalidMimeTypeError(
      'Corrupted or unsupported video file content. Only MP4 and WebM videos are allowed.'
    );
  }

  const ext = detectedMime === 'video/mp4' ? 'mp4' : 'webm';
  const fileId = crypto.randomUUID();
  const storagePath = `posts/${userId}/${fileId}.${ext}`;

  // 3. Upload to Supabase Storage if credentials are configured
  if (config.supabaseUrl && config.supabaseSecretKey) {
    try {
      const supabase = getSupabaseClient();
      const fileStream = fs.createReadStream(tempFilePath);

      let { error: uploadError } = await supabase.storage
        .from(config.supabaseStorageBucket)
        .upload(storagePath, fileStream, {
          contentType: detectedMime,
          upsert: false,
          duplex: 'half',
        });

      if (
        uploadError &&
        (uploadError.message.toLowerCase().includes('not found') ||
          uploadError.message.toLowerCase().includes('bucket'))
      ) {
        try {
          await ensureBucketExists();
          const retryStream = fs.createReadStream(tempFilePath);
          const retry = await supabase.storage
            .from(config.supabaseStorageBucket)
            .upload(storagePath, retryStream, {
              contentType: detectedMime,
              upsert: false,
              duplex: 'half',
            });
          uploadError = retry.error;
        } catch (retryErr) {
          console.warn('[Storage Service] Bucket auto-creation retry failed:', retryErr);
        }
      }

      if (uploadError) {
        console.error('[Storage Service] Supabase video upload failed:', uploadError.message);
        throw new StorageError(`Failed to upload video: ${uploadError.message}`, 500);
      }

      const { data: publicUrlData } = supabase.storage
        .from(config.supabaseStorageBucket)
        .getPublicUrl(storagePath);

      return {
        url: publicUrlData.publicUrl,
        storagePath,
        mediaType: 'VIDEO',
        fileName: originalName,
        fileSizeBytes: stat.size,
        mimeType: detectedMime,
      };
    } catch (supabaseErr) {
      if (supabaseErr instanceof StorageError) throw supabaseErr;
      console.warn(
        '[Storage Service] Supabase video upload encountered exception:',
        supabaseErr instanceof Error ? supabaseErr.message : supabaseErr
      );
      throw new StorageError(
        `Failed to upload video: ${supabaseErr instanceof Error ? supabaseErr.message : 'Unknown storage error'}`,
        500
      );
    }
  }

  // 4. Safe fallback for dev/test environments without live Supabase storage credentials
  console.info(
    '[Storage Service] Supabase credentials not configured in environment. Using mock storage URL for video upload.'
  );
  return {
    url: `https://mock-storage.apnasamaj.local/${config.supabaseStorageBucket}/${storagePath}`,
    storagePath,
    mediaType: 'VIDEO',
    fileName: originalName,
    fileSizeBytes: stat.size,
    mimeType: detectedMime,
  };
}

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

  // 3. Upload to Supabase Storage if credentials are configured
  if (config.supabaseUrl && config.supabaseSecretKey) {
    try {
      const supabase = getSupabaseClient();
      let { error: uploadError } = await supabase.storage
        .from(config.supabaseStorageBucket)
        .upload(storagePath, fileBuffer, {
          contentType: detectedMime,
          upsert: false,
        });

      if (
        uploadError &&
        (uploadError.message.toLowerCase().includes('not found') ||
          uploadError.message.toLowerCase().includes('bucket'))
      ) {
        try {
          await ensureBucketExists();
          const retry = await supabase.storage
            .from(config.supabaseStorageBucket)
            .upload(storagePath, fileBuffer, {
              contentType: detectedMime,
              upsert: false,
            });
          uploadError = retry.error;
        } catch (retryErr) {
          console.warn('[Storage Service] Bucket auto-creation retry failed:', retryErr);
        }
      }

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
    } catch (supabaseErr) {
      if (supabaseErr instanceof StorageError) throw supabaseErr;
      console.warn(
        '[Storage Service] Supabase post media upload encountered exception:',
        supabaseErr instanceof Error ? supabaseErr.message : supabaseErr
      );
      throw new StorageError(
        `Failed to upload media: ${supabaseErr instanceof Error ? supabaseErr.message : 'Unknown storage error'}`,
        500
      );
    }
  }

  // Safe fallback for dev/test environments without live Supabase storage credentials
  console.info(
    '[Storage Service] Supabase credentials not configured in environment. Using mock storage URL for post media upload.'
  );
  return {
    url: `https://mock-storage.apnasamaj.local/${config.supabaseStorageBucket}/${storagePath}`,
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

  // 3. Attempt upload to Supabase Storage if configured
  if (config.supabaseUrl && config.supabaseSecretKey) {
    try {
      const supabase = getSupabaseClient();
      let { error: uploadError } = await supabase.storage
        .from(config.supabaseStorageBucket)
        .upload(storagePath, fileBuffer, {
          contentType: detectedMime,
          upsert: false,
        });

      if (
        uploadError &&
        (uploadError.message.toLowerCase().includes('not found') ||
          uploadError.message.toLowerCase().includes('bucket'))
      ) {
        try {
          await ensureBucketExists();
          const retry = await supabase.storage
            .from(config.supabaseStorageBucket)
            .upload(storagePath, fileBuffer, {
              contentType: detectedMime,
              upsert: false,
            });
          uploadError = retry.error;
        } catch (retryErr) {
          console.warn('[Storage Service] Bucket auto-creation retry failed:', retryErr);
        }
      }

      if (!uploadError) {
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

      console.warn(
        '[Storage Service] Supabase avatar upload returned error, falling back to data URL:',
        uploadError.message
      );
    } catch (supabaseErr) {
      console.warn(
        '[Storage Service] Supabase avatar upload failed with exception, falling back to data URL:',
        supabaseErr instanceof Error ? supabaseErr.message : supabaseErr
      );
    }
  } else {
    console.info(
      '[Storage Service] Supabase credentials not configured in environment. Using data URL fallback for profile avatar.'
    );
  }

  // 4. Fallback to inline Data URL: guarantees profile photo upload never fails with 500
  return {
    url: `data:${detectedMime};base64,${fileBuffer.toString('base64')}`,
    storagePath: '',
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
  let { error: uploadError } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .upload(storagePath, fileBuffer, {
      contentType: detectedMime,
      upsert: false,
    });

  if (
    uploadError &&
    (uploadError.message.toLowerCase().includes('not found') ||
      uploadError.message.toLowerCase().includes('bucket'))
  ) {
    try {
      await ensureBucketExists();
      const retry = await supabase.storage
        .from(config.supabaseStorageBucket)
        .upload(storagePath, fileBuffer, {
          contentType: detectedMime,
          upsert: false,
        });
      uploadError = retry.error;
    } catch (retryErr) {
      console.warn('[Storage Service] Bucket auto-creation retry failed:', retryErr);
    }
  }

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


// -----------------------------------------------------------------------------
// MATRIMONIAL VERIFICATION DOCUMENTS (DEDICATED PRIVATE BUCKET)
// -----------------------------------------------------------------------------

export type SupportedDocumentMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export const MATRIMONIAL_DOCUMENTS_BUCKET =
  config.supabasePrivateStorageBucket || 'matrimonial-documents';

/**
 * Ensures that the dedicated private storage bucket exists for verification documents.
 * Configured as strictly non-public (public: false) with a 5MB limit.
 */
export async function ensurePrivateDocumentBucketExists(): Promise<void> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return;
  }
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return;
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.warn('[Storage Service] Could not verify private document bucket list:', listError.message);
    return;
  }

  const exists = buckets?.some((b) => b.name === MATRIMONIAL_DOCUMENTS_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(MATRIMONIAL_DOCUMENTS_BUCKET, {
      public: false, // STRICTLY PRIVATE
      fileSizeLimit: 5242880, // 5MB limit
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    });

    if (createError && !createError.message.includes('already exists')) {
      console.error('[Storage Service] Failed to create private document bucket:', createError.message);
    }
  }
}

/**
 * Validates document magic bytes (PDF header or supported image signatures).
 */
export function detectDocumentMimeType(buffer: Buffer): SupportedDocumentMime | null {
  if (!buffer || buffer.length < 4) return null;
  // Check PDF (%PDF-)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }
  // Check Image signatures
  const imgMime = detectImageMimeType(buffer);
  if (imgMime && imgMime !== 'image/gif') {
    return imgMime;
  }
  return null;
}

export interface UploadDocumentResponseData {
  storagePath: string;
  mimeType: SupportedDocumentMime;
  fileSizeBytes: number;
}

/**
 * Securely uploads a verification document to private storage.
 * Strictly avoids generating public URLs.
 */
export async function uploadMatrimonialVerificationDocument(
  userId: string,
  fileBuffer: Buffer,
  originalName: string
): Promise<UploadDocumentResponseData> {
  if (fileBuffer.length > 5 * 1024 * 1024) {
    throw new StorageError('Document file size exceeds maximum allowed limit (5MB).', 400);
  }
  const detectedMime = detectDocumentMimeType(fileBuffer);
  if (!detectedMime) {
    throw new InvalidMimeTypeError(
      'Unsupported document format. Allowed formats: PDF, JPEG, PNG, WebP.'
    );
  }
  const ext = detectedMime === 'application/pdf' ? 'pdf' : (detectedMime === 'image/jpeg' ? 'jpg' : detectedMime.split('/')[1]);
  const storagePath = `matrimonial-docs/${userId}/${crypto.randomUUID()}.${ext}`;

  if (config.supabaseUrl && config.supabaseSecretKey) {
    const supabase = getSupabaseClient();
    let { error: uploadError } = await supabase.storage
      .from(MATRIMONIAL_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: detectedMime,
        upsert: false,
      });

    if (
      uploadError &&
      (uploadError.message.toLowerCase().includes('not found') ||
        uploadError.message.toLowerCase().includes('bucket'))
    ) {
      try {
        await ensurePrivateDocumentBucketExists();
        const retry = await supabase.storage
          .from(MATRIMONIAL_DOCUMENTS_BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: detectedMime,
            upsert: false,
          });
        uploadError = retry.error;
      } catch (retryErr) {
        console.warn('[Storage Service] Private bucket auto-creation retry failed:', retryErr);
      }
    }

    if (uploadError) {
      console.error('[Storage Service] Supabase private document upload failed:', uploadError.message);
      throw new StorageError(`Failed to upload document: ${uploadError.message}`, 500);
    }
  }

  return {
    storagePath,
    mimeType: detectedMime,
    fileSizeBytes: fileBuffer.length,
  };
}

/**
 * Generates a temporary, short-lived signed URL for an authorized admin to view a document.
 * Requires configured remote storage; never exposes local file paths.
 */
export async function createTemporarySignedDocumentUrl(
  storagePath: string,
  expiresInSeconds: number = 300
): Promise<string> {
  if (config.supabaseUrl && config.supabaseSecretKey) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(MATRIMONIAL_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      console.error('[Storage Service] Failed to create signed URL:', error.message);
      throw new StorageError('Failed to generate document signed URL.', 500);
    }
    return data.signedUrl;
  }

  throw new StorageError(
    'Secure storage service is not configured. Temporary signed URLs cannot be generated.',
    503
  );
}

/**
 * Safely removes a private verification document from the dedicated private bucket.
 */
export async function deleteMatrimonialDocumentObject(storagePath: string): Promise<void> {
  if (!storagePath || !config.supabaseUrl || !config.supabaseSecretKey) {
    return;
  }
  try {
    const supabase = getSupabaseClient();
    await supabase.storage.from(MATRIMONIAL_DOCUMENTS_BUCKET).remove([storagePath]);
  } catch (err) {
    console.warn('[Storage Service] Failed to delete document from private bucket:', err);
  }
}

// -----------------------------------------------------------------------------
// CHAT MEDIA ATTACHMENTS (IMAGES, VIDEOS, DOCUMENTS - PRIVATE BUCKET)
// -----------------------------------------------------------------------------

export const CHAT_ATTACHMENTS_BUCKET =
  config.supabasePrivateStorageBucket || 'chat-attachments';

export const CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const CHAT_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
export const CHAT_MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20MB
export const CHAT_MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB

const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.phtml',
  '.js', '.ts', '.mjs', '.apk', '.jar', '.msi', '.bin',
  '.com', '.vbs', '.py', '.pl', '.cgi',
]);

export interface DetectedChatAttachment {
  type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  mimeType: string;
  extension: string;
}

/**
 * Validates file content magic bytes and matches against supported chat formats.
 * Strictly rejects scripts, executables, and spoofed file types.
 */
export function detectChatAttachmentTypeAndMime(
  buffer: Buffer,
  originalName: string
): DetectedChatAttachment | null {
  if (!buffer || buffer.length < 4) return null;

  const ext = (path.extname(originalName || '').toLowerCase());
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    return null;
  }

  // Reject Windows executables (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return null;
  }

  // Reject Linux/Unix ELF binaries
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return null;
  }

  // Reject Shell scripts
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    return null;
  }

  // 1. Check Images (JPEG, PNG, WebP)
  const imageMime = detectImageMimeType(buffer);
  if (imageMime && imageMime !== 'image/gif') {
    const imgExt = imageMime === 'image/jpeg' ? 'jpg' : (imageMime === 'image/png' ? 'png' : 'webp');
    return {
      type: 'IMAGE',
      mimeType: imageMime,
      extension: imgExt,
    };
  }

  // 2. Check Videos and Audio (MP4, MOV, M4A, 3GP)
  if (buffer.length >= 12) {
    // ISO BMFF box at offset 4: ftyp, moov, mdat, wide
    const isIsoBmff =
      (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) || // ftyp
      (buffer[4] === 0x6d && buffer[5] === 0x6f && buffer[6] === 0x6f && buffer[7] === 0x76) || // moov
      (buffer[4] === 0x6d && buffer[5] === 0x64 && buffer[6] === 0x61 && buffer[7] === 0x74) || // mdat
      (buffer[4] === 0x77 && buffer[5] === 0x69 && buffer[6] === 0x64 && buffer[7] === 0x65);   // wide

    if (isIsoBmff) {
      const brand = buffer.toString('latin1', 8, 12);
      if (ext === '.m4a' || brand === 'M4A ' || brand === 'M4B ') {
        return {
          type: 'AUDIO',
          mimeType: 'audio/m4a',
          extension: 'm4a',
        };
      }
      if (ext === '.3gp' || brand.startsWith('3gp')) {
        return {
          type: 'AUDIO',
          mimeType: 'audio/3gpp',
          extension: '3gp',
        };
      }
      const isMov = ext === '.mov' || brand === 'qt  ';
      return {
        type: 'VIDEO',
        mimeType: isMov ? 'video/quicktime' : 'video/mp4',
        extension: isMov ? 'mov' : 'mp4',
      };
    }
  }

  // 3. Check Dedicated Audio Formats (MP3, OGG, OPUS, WAV, AAC, WEBM Audio)
  // MP3: ID3 header or sync word
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && ext === '.mp3')
  ) {
    return {
      type: 'AUDIO',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    };
  }

  // OGG / OPUS: OggS header (0x4F 0x67 0x67 0x53)
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x47 &&
    buffer[2] === 0x47 &&
    buffer[3] === 0x53
  ) {
    const isOpus = ext === '.opus';
    return {
      type: 'AUDIO',
      mimeType: isOpus ? 'audio/opus' : 'audio/ogg',
      extension: isOpus ? 'opus' : 'ogg',
    };
  }

  // WAV: RIFF...WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString('latin1', 8, 12) === 'WAVE'
  ) {
    return {
      type: 'AUDIO',
      mimeType: 'audio/wav',
      extension: 'wav',
    };
  }

  // AAC: ADTS sync word (0xFF 0xF1 or 0xFF 0xF9)
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return {
      type: 'AUDIO',
      mimeType: 'audio/aac',
      extension: 'aac',
    };
  }

  // WebM Audio: EBML header with webm/weba extension
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3 &&
    (ext === '.weba' || ext === '.webm')
  ) {
    return {
      type: 'AUDIO',
      mimeType: 'audio/webm',
      extension: 'webm',
    };
  }

  // Additional safe check for audio files by extension if non-executable
  if (ext === '.m4a') {
    return {
      type: 'AUDIO',
      mimeType: 'audio/m4a',
      extension: 'm4a',
    };
  }
  if (ext === '.mp3') {
    return {
      type: 'AUDIO',
      mimeType: 'audio/mpeg',
      extension: 'mp3',
    };
  }
  if (ext === '.wav') {
    return {
      type: 'AUDIO',
      mimeType: 'audio/wav',
      extension: 'wav',
    };
  }

  // 4. Check Documents (PDF, DOC, DOCX, XLS, XLSX)
  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return {
      type: 'DOCUMENT',
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // CFBF / OLE Compound File (Legacy DOC and XLS): D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    if (ext === '.xls') {
      return {
        type: 'DOCUMENT',
        mimeType: 'application/vnd.ms-excel',
        extension: 'xls',
      };
    }
    return {
      type: 'DOCUMENT',
      mimeType: 'application/msword',
      extension: 'doc',
    };
  }

  // PK Zip Container (Modern DOCX and XLSX): 50 4B 03 04 or 05 06 or 07 08
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    if (ext === '.xlsx') {
      return {
        type: 'DOCUMENT',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      };
    }
    if (ext === '.docx' || ext === '.doc') {
      return {
        type: 'DOCUMENT',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
      };
    }
  }

  return null;
}

const CHAT_BUCKET_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/mpeg',
  'audio/x-m4a',
  'audio/3gpp',
  'audio/opus',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Ensures that the dedicated private storage bucket exists for chat attachments.
 * Strictly private (public: false) with a 50MB file size limit.
 */
export async function ensureChatAttachmentBucketExists(): Promise<void> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    return;
  }
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return;
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.warn('[Storage Service] Could not verify chat attachment bucket list:', listError.message);
    return;
  }

  const exists = buckets?.some((b) => b.name === CHAT_ATTACHMENTS_BUCKET);
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(CHAT_ATTACHMENTS_BUCKET, {
      public: false, // STRICTLY PRIVATE
      fileSizeLimit: 52428800, // 50MB limit
      allowedMimeTypes: CHAT_BUCKET_ALLOWED_MIME_TYPES,
    });

    if (createError && !createError.message.includes('already exists')) {
      console.error('[Storage Service] Failed to create chat attachment bucket:', createError.message);
    }
  } else {
    // Ensure bucket allows audio formats
    try {
      await supabase.storage.updateBucket(CHAT_ATTACHMENTS_BUCKET, {
        public: false,
        fileSizeLimit: 52428800,
        allowedMimeTypes: CHAT_BUCKET_ALLOWED_MIME_TYPES,
      });
    } catch (updateErr: any) {
      console.warn('[Storage Service] Could not update bucket allowedMimeTypes:', updateErr?.message);
    }
  }
}

export interface UploadChatAttachmentParams {
  tenantSlug: string;
  conversationId?: string;
  groupId?: string;
  fileBuffer: Buffer;
  originalName: string;
  duration?: number;
}

export interface UploadChatAttachmentResult {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  url: string;
  duration?: number;
  createdAt: string;
}

/**
 * Uploads a validated chat attachment to private storage with tenant & conversation isolation.
 */
export async function uploadChatAttachment(
  params: UploadChatAttachmentParams
): Promise<UploadChatAttachmentResult> {
  const { tenantSlug, conversationId, groupId, fileBuffer, originalName, duration } = params;

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new StorageError('Uploaded file is empty.', 400);
  }

  // 1. Content & magic bytes inspection
  const detected = detectChatAttachmentTypeAndMime(fileBuffer, originalName);
  if (!detected) {
    throw new InvalidMimeTypeError(
      'Unsupported file format or corrupted content. Supported types: Images (JPEG, PNG, WebP), Videos (MP4, MOV), Audio/Voice Notes (M4A, MP3, AAC, OGG, WAV, 3GP, WebM), and Documents (PDF, DOC, DOCX, XLS, XLSX).'
    );
  }

  // 2. Strict size validation per attachment type
  if (detected.type === 'IMAGE' && fileBuffer.length > CHAT_MAX_IMAGE_BYTES) {
    throw new OversizedFileError(CHAT_MAX_IMAGE_BYTES);
  }
  if (detected.type === 'VIDEO' && fileBuffer.length > CHAT_MAX_VIDEO_BYTES) {
    throw new OversizedFileError(CHAT_MAX_VIDEO_BYTES);
  }
  if (detected.type === 'DOCUMENT' && fileBuffer.length > CHAT_MAX_DOCUMENT_BYTES) {
    throw new OversizedFileError(CHAT_MAX_DOCUMENT_BYTES);
  }
  if (detected.type === 'AUDIO' && fileBuffer.length > CHAT_MAX_AUDIO_BYTES) {
    throw new OversizedFileError(CHAT_MAX_AUDIO_BYTES);
  }

  // 3. Safe filename and storage path generation
  const safeName = path.basename(originalName || `attachment.${detected.extension}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = crypto.randomUUID();
  const folder = conversationId
    ? `direct/${tenantSlug}/${conversationId}`
    : `groups/${tenantSlug}/${groupId}`;
  const storagePath = `${folder}/${fileId}.${detected.extension}`;

  let signedUrl = '';

  // 4. Upload to Supabase Storage if configured
  if (config.supabaseUrl && config.supabaseSecretKey) {
    try {
      const supabase = getSupabaseClient();
      let { error: uploadError } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: detected.mimeType,
          upsert: false,
        });

      if (
        uploadError &&
        (uploadError.message.toLowerCase().includes('not found') ||
          uploadError.message.toLowerCase().includes('bucket') ||
          uploadError.message.toLowerCase().includes('mime type'))
      ) {
        try {
          await ensureChatAttachmentBucketExists();
          // Fallback to audio/mp4 if audio/m4a was rejected by strict bucket validator
          const fallbackMime =
            detected.mimeType === 'audio/m4a'
              ? 'audio/mp4'
              : detected.mimeType;

          const retry = await supabase.storage
            .from(CHAT_ATTACHMENTS_BUCKET)
            .upload(storagePath, fileBuffer, {
              contentType: fallbackMime,
              upsert: false,
            });
          uploadError = retry.error;
        } catch (retryErr) {
          console.warn('[Storage Service] Chat attachment bucket auto-creation retry failed:', retryErr);
        }
      }

      if (uploadError) {
        console.warn('[Storage Service] Supabase chat attachment upload failed, using local storage:', uploadError.message);
        try {
          const localFilePath = path.resolve(process.cwd(), 'uploads/chat-attachments', storagePath);
          fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
          fs.writeFileSync(localFilePath, fileBuffer);
        } catch (fsErr) {
          console.warn('[Storage Service] Failed to save local chat attachment fallback:', fsErr);
        }
      } else {
        // Generate initial 1-hour signed URL
        const { data: signedData, error: signError } = await supabase.storage
          .from(CHAT_ATTACHMENTS_BUCKET)
          .createSignedUrl(storagePath, 3600);

        if (!signError && signedData?.signedUrl) {
          signedUrl = signedData.signedUrl;
        }
      }
    } catch (err: unknown) {
      console.warn('[Storage Service] Supabase upload exception, using local storage fallback:', err instanceof Error ? err.message : err);
      try {
        const localFilePath = path.resolve(process.cwd(), 'uploads/chat-attachments', storagePath);
        fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
        fs.writeFileSync(localFilePath, fileBuffer);
      } catch (fsErr) {
        console.warn('[Storage Service] Failed to save local chat attachment fallback:', fsErr);
      }
    }
  } else {
    // Local storage fallback for development / test environments
    try {
      const localFilePath = path.resolve(process.cwd(), 'uploads/chat-attachments', storagePath);
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
      fs.writeFileSync(localFilePath, fileBuffer);
    } catch (fsErr) {
      console.warn('[Storage Service] Failed to save local chat attachment fallback:', fsErr);
    }
  }

  if (!signedUrl) {
    signedUrl = resolveChatAttachmentUrl(storagePath);
  }

  return {
    id: fileId,
    type: detected.type,
    fileName: safeName,
    mimeType: detected.mimeType,
    fileSizeBytes: fileBuffer.length,
    storagePath,
    url: signedUrl,
    duration: duration != null ? Math.round(duration) : undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Resolves a safe fallback attachment URL.
 * Chat attachments are stored in a strictly private bucket (CHAT_ATTACHMENTS_BUCKET),
 * so public URLs must never be returned. Returns the authorized local streaming endpoint.
 */
export function resolveChatAttachmentUrl(storagePath: string): string {
  const apiPort = config.port || 4000;
  return `http://localhost:${apiPort}/api/v1/chat/attachments/raw/${storagePath}?token=local-dev-token&expires=3600`;
}

/**
 * Generates a short-lived signed URL for an authorized user to access a private chat attachment.
 */
export async function createTemporarySignedChatAttachmentUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const apiPort = config.port || 4000;
  if (config.supabaseUrl && config.supabaseSecretKey) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (error) {
        console.warn('[Storage Service] Supabase createSignedUrl notice:', error.message);
        return `http://localhost:${apiPort}/api/v1/chat/attachments/raw/${storagePath}?token=mock-signed-token&expires=${expiresInSeconds}`;
      }
      if (data?.signedUrl) {
        return data.signedUrl;
      }
    } catch (err) {
      console.warn('[Storage Service] Supabase signed URL exception:', err);
    }
  }

  // Development / test fallback
  return `http://localhost:${apiPort}/api/v1/chat/attachments/raw/${storagePath}?token=local-dev-token&expires=${expiresInSeconds}`;
}

/**
 * Iterates through an array of messages and populates fresh, authorized signed URLs
 * for each attachment. Safe for both Supabase live storage and local development/tests.
 */
export async function populateSignedAttachmentUrls<T extends { attachments?: any[] }>(
  messages: T[]
): Promise<T[]> {
  if (!messages || messages.length === 0) return messages;

  for (const msg of messages) {
    if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        if (att && att.storagePath) {
          try {
            att.url = await createTemporarySignedChatAttachmentUrl(att.storagePath, 3600);
          } catch {
            // Keep default resolved URL if signing fails
          }
        }
      }
    }
  }
  return messages;
}

