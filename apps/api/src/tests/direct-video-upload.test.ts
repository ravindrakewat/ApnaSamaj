import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { prisma } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';
import {
  detectVideoMimeType,
  detectVideoMimeTypeFromDisk,
  uploadPostVideo,
  InvalidMimeTypeError,
} from '../services/storage.service';
import {
  createPostSchema,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  ALLOWED_VIDEO_MIME_TYPES,
} from '@apnasamaj/validation';

// Minimal valid MP4 buffer with ftyp box
const VALID_MP4_BUFFER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, // size: 24 bytes
  0x66, 0x74, 0x79, 0x70, // 'ftyp'
  0x69, 0x73, 0x6f, 0x6d, // 'isom'
  0x00, 0x00, 0x02, 0x00, // minor version
  0x69, 0x73, 0x6f, 0x6d, // compatible brand 1
  0x6d, 0x70, 0x34, 0x31, // compatible brand 2
]);

// Minimal valid WebM buffer with EBML header and 'webm' DocType
const VALID_WEBM_BUFFER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, // EBML ID
  0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
  0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, // DocType: 'webm'
]);

// Malicious / spoofed files
const SPOOFED_TEXT_FILE = Buffer.from('This is a text file maliciously disguised as an MP4 video.');
const MKV_BUFFER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, // EBML ID
  0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x08,
  0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61, // DocType: 'matroska'
]);

async function runDirectVideoUploadTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 15G.2 Direct Video Upload Test Suite      ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------
  // 1. Validation Constants & Unit Tests
  // -----------------------------------------------------------------
  console.log('\n--- 1. Validation Constraints & Magic Bytes Unit Tests ---');

  assert(
    MAX_VIDEO_FILE_SIZE_BYTES === 30 * 1024 * 1024,
    'MAX_VIDEO_FILE_SIZE_BYTES is exactly 30MB (31,457,280 bytes)'
  );
  assert(MAX_VIDEO_DURATION_SECONDS === 90, 'MAX_VIDEO_DURATION_SECONDS is 90 seconds');
  assert(
    ALLOWED_VIDEO_MIME_TYPES.includes('video/mp4') &&
      ALLOWED_VIDEO_MIME_TYPES.includes('video/webm') &&
      ALLOWED_VIDEO_MIME_TYPES.length === 2,
    'ALLOWED_VIDEO_MIME_TYPES strictly contains video/mp4 and video/webm'
  );

  // Magic bytes in-memory detection
  assert(
    detectVideoMimeType(VALID_MP4_BUFFER) === 'video/mp4',
    'detectVideoMimeType correctly detects valid MP4 ftyp atom'
  );
  assert(
    detectVideoMimeType(VALID_WEBM_BUFFER) === 'video/webm',
    'detectVideoMimeType correctly detects valid WebM EBML docType'
  );
  assert(
    detectVideoMimeType(SPOOFED_TEXT_FILE) === null,
    'detectVideoMimeType rejects spoofed plain text disguised as video'
  );
  assert(
    detectVideoMimeType(MKV_BUFFER) === null,
    'detectVideoMimeType rejects non-WebM matroska containers'
  );
  assert(
    detectVideoMimeType(Buffer.alloc(6)) === null,
    'detectVideoMimeType rejects short buffers under 12 bytes'
  );

  // -----------------------------------------------------------------
  // 2. Memory-Safe Disk Magic Bytes Detection
  // -----------------------------------------------------------------
  console.log('\n--- 2. Memory-Safe Disk Detection (128-byte header read) ---');

  const testTempDir = path.join(os.tmpdir(), 'apnasamaj-video-test-disk');
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }

  const mp4TempPath = path.join(testTempDir, 'sample.mp4');
  const webmTempPath = path.join(testTempDir, 'sample.webm');
  const spoofTempPath = path.join(testTempDir, 'spoofed.mp4');

  fs.writeFileSync(mp4TempPath, VALID_MP4_BUFFER);
  fs.writeFileSync(webmTempPath, VALID_WEBM_BUFFER);
  fs.writeFileSync(spoofTempPath, SPOOFED_TEXT_FILE);

  try {
    const mp4Mime = await detectVideoMimeTypeFromDisk(mp4TempPath);
    assert(mp4Mime === 'video/mp4', 'detectVideoMimeTypeFromDisk detects MP4 from disk');

    const webmMime = await detectVideoMimeTypeFromDisk(webmTempPath);
    assert(webmMime === 'video/webm', 'detectVideoMimeTypeFromDisk detects WebM from disk');

    const spoofMime = await detectVideoMimeTypeFromDisk(spoofTempPath);
    assert(spoofMime === null, 'detectVideoMimeTypeFromDisk rejects spoofed text file from disk');
  } finally {
    try {
      if (fs.existsSync(mp4TempPath)) fs.unlinkSync(mp4TempPath);
      if (fs.existsSync(webmTempPath)) fs.unlinkSync(webmTempPath);
      if (fs.existsSync(spoofTempPath)) fs.unlinkSync(spoofTempPath);
    } catch {}
  }

  // -----------------------------------------------------------------
  // 3. Storage Service Direct Video Upload Pipeline
  // -----------------------------------------------------------------
  console.log('\n--- 3. Storage Service Direct Video Upload Pipeline ---');

  // Test empty file rejection
  const emptyTempPath = path.join(testTempDir, 'empty.mp4');
  fs.writeFileSync(emptyTempPath, Buffer.alloc(0));
  try {
    await uploadPostVideo('user-1', emptyTempPath, 'video/mp4', 'empty.mp4');
    assert(false, 'Empty video file must throw StorageError');
  } catch (err: any) {
    assert(err.message.includes('empty'), 'Empty video file rejected with error');
  } finally {
    if (fs.existsSync(emptyTempPath)) fs.unlinkSync(emptyTempPath);
  }

  // Test spoofed content rejection
  const invalidContentPath = path.join(testTempDir, 'bad.mp4');
  fs.writeFileSync(invalidContentPath, Buffer.from('FAKE MP4 CONTENT THAT IS NOT A REAL VIDEO'));
  try {
    await uploadPostVideo('user-1', invalidContentPath, 'video/mp4', 'bad.mp4');
    assert(false, 'Invalid video content must throw InvalidMimeTypeError');
  } catch (err: any) {
    assert(
      err instanceof InvalidMimeTypeError,
      'Invalid video content throws InvalidMimeTypeError'
    );
  } finally {
    if (fs.existsSync(invalidContentPath)) fs.unlinkSync(invalidContentPath);
  }

  // Test valid upload to Supabase / mock storage
  const validMp4Path = path.join(testTempDir, 'valid.mp4');
  fs.writeFileSync(validMp4Path, VALID_MP4_BUFFER);
  try {
    const uploadRes = await uploadPostVideo('test-user-999', validMp4Path, 'video/mp4', 'valid.mp4');
    assert(uploadRes.mediaType === 'VIDEO', 'Upload result mediaType is VIDEO');
    assert(uploadRes.mimeType === 'video/mp4', 'Upload result mimeType is video/mp4');
    assert(uploadRes.fileSizeBytes === VALID_MP4_BUFFER.length, 'File size accurately captured');
    assert(
      uploadRes.url.includes('.mp4') && uploadRes.url.includes('test-user-999'),
      'Public URL correctly constructed with user namespace and .mp4 extension'
    );
  } catch (err) {
    assert(false, `Valid MP4 upload failed: ${err}`);
  } finally {
    if (fs.existsSync(validMp4Path)) fs.unlinkSync(validMp4Path);
  }

  // -----------------------------------------------------------------
  // 4. HTTP API Server Integration & Multer Disk Storage Tests
  // -----------------------------------------------------------------
  console.log('\n--- 4. HTTP Endpoint Security & Multipart Upload Tests ---');

  // Query real users from database to ensure authenticateToken passes
  const dbActiveUser = await prisma.user.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true, phone: true, role: true, status: true },
  });

  const dbPendingUser = await prisma.user.findFirst({
    where: { status: 'PENDING' },
    select: { id: true, phone: true, role: true, status: true },
  });

  if (!dbActiveUser) {
    throw new Error('No ACTIVE user found in database for testing');
  }

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function makeToken(user: { id: string; phone: string; role: string; status: string }) {
    return jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role, status: user.status },
      config.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  const activeToken = makeToken(dbActiveUser);
  const pendingToken = dbPendingUser
    ? makeToken(dbPendingUser)
    : makeToken({
        id: dbActiveUser.id,
        phone: dbActiveUser.phone,
        role: dbActiveUser.role,
        status: 'PENDING',
      });

  async function postMultipart(
    token: string | null,
    fileBuffer: Buffer | null,
    filename: string,
    mimeType: string,
    communitySlug: string | null = 'kewat'
  ) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = Buffer.alloc(0);

    if (fileBuffer) {
      const header = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      body = Buffer.concat([header, fileBuffer, footer]);
    }

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (communitySlug) headers['X-Community-Slug'] = communitySlug;

    const res = await fetch(`${baseUrl}/api/v1/posts/media/video-upload`, {
      method: 'POST',
      headers,
      body,
    });

    const data: any = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  // 4A. Unauthenticated upload rejected
  const resNoAuth = await postMultipart(null, VALID_MP4_BUFFER, 'video.mp4', 'video/mp4');
  assert(resNoAuth.status === 401, 'Unauthenticated request rejected with 401');

  // 4B. Pending user rejected with 403
  if (dbPendingUser) {
    const resPending = await postMultipart(pendingToken, VALID_MP4_BUFFER, 'video.mp4', 'video/mp4');
    assert(resPending.status === 403, 'Pending user request rejected with 403');
  } else {
    assert(true, 'Pending user verification skipped (no pending user in db)');
  }

  // 4C. Missing tenant rejected with 400
  const resNoTenant = await postMultipart(activeToken, VALID_MP4_BUFFER, 'video.mp4', 'video/mp4', null);
  assert(resNoTenant.status === 400, 'Missing community tenant context rejected with 400');

  // 4D. Invalid MIME type rejected
  const resInvalidMime = await postMultipart(
    activeToken,
    VALID_MP4_BUFFER,
    'image.png',
    'image/png'
  );
  assert(
    resInvalidMime.status === 400 && resInvalidMime.data.error.includes('MP4 and WebM'),
    'Non-video MIME type rejected by middleware with 400'
  );

  // 4E. Spoofed file content rejected by magic bytes inspection
  const resSpoofed = await postMultipart(
    activeToken,
    SPOOFED_TEXT_FILE,
    'spoofed.mp4',
    'video/mp4'
  );
  assert(
    resSpoofed.status === 400 && resSpoofed.data.error.includes('Corrupted or unsupported'),
    'Spoofed text disguised as MP4 rejected by magic bytes with 400'
  );

  // 4F. Valid MP4 upload succeeds with 201
  const resValidMp4 = await postMultipart(
    activeToken,
    VALID_MP4_BUFFER,
    'community-event.mp4',
    'video/mp4'
  );
  assert(resValidMp4.status === 201, 'Valid MP4 upload returns 201 Created');
  assert(resValidMp4.data.data?.mediaType === 'VIDEO', 'Response data indicates mediaType VIDEO');
  assert(resValidMp4.data.data?.mimeType === 'video/mp4', 'Response data indicates mimeType video/mp4');

  // 4G. Valid WebM upload succeeds with 201
  const resValidWebM = await postMultipart(
    activeToken,
    VALID_WEBM_BUFFER,
    'speech.webm',
    'video/webm'
  );
  assert(resValidWebM.status === 201, 'Valid WebM upload returns 201 Created');
  assert(resValidWebM.data.data?.mediaType === 'VIDEO', 'Response data indicates mediaType VIDEO');
  assert(resValidWebM.data.data?.mimeType === 'video/webm', 'Response data indicates mimeType video/webm');

  // 4H. Verify temp file cleanup on disk
  const videoTempDir = path.join(os.tmpdir(), 'apnasamaj-video-uploads');
  if (fs.existsSync(videoTempDir)) {
    const remainingTempFiles = fs.readdirSync(videoTempDir);
    assert(
      remainingTempFiles.length === 0,
      `Disk cleanup verified: 0 orphan files in ${videoTempDir} after requests completed`
    );
  }

  // -----------------------------------------------------------------
  // 5. Post Creation Validation Schemas with Direct Video
  // -----------------------------------------------------------------
  console.log('\n--- 5. Post Creation Schema Rules with Direct Video ---');

  const validDirectVideoUrl = resValidMp4.data.data?.url || 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4';

  // 5A. Single direct video attachment
  const parseSingleVideo = createPostSchema.safeParse({
    content: 'Community speech recording',
    type: 'GENERAL',
    media: [
      {
        url: validDirectVideoUrl,
        mediaType: 'VIDEO',
        order: 0,
      },
    ],
  });
  assert(parseSingleVideo.success, 'Post with 1 direct video passes validation');

  // 5B. Video alone without text content
  const parseVideoOnly = createPostSchema.safeParse({
    content: '',
    type: 'GENERAL',
    media: [
      {
        url: validDirectVideoUrl,
        mediaType: 'VIDEO',
        order: 0,
      },
    ],
  });
  assert(parseVideoOnly.success, 'Post with video alone (no text content) passes validation');

  // 5C. Mutual exclusivity: 1 direct video + 1 YouTube video rejected
  const parseTwoVideos = createPostSchema.safeParse({
    content: 'Two videos',
    type: 'GENERAL',
    media: [
      {
        url: validDirectVideoUrl,
        mediaType: 'VIDEO',
        order: 0,
      },
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaType: 'VIDEO',
        order: 1,
      },
    ],
  });
  assert(!parseTwoVideos.success, 'Post with both direct video and YouTube video is rejected');
  assert(
    parseTwoVideos.error?.issues[0]?.message.includes('Only one video can be attached'),
    'Two videos error message correctly mentions only 1 video allowed'
  );

  // 5D. 1 direct video + 3 photos (total 4) accepted
  const parseVideoAndPhotos = createPostSchema.safeParse({
    content: 'Event highlights with video and photos',
    type: 'EVENT',
    media: [
      { url: validDirectVideoUrl, mediaType: 'VIDEO', order: 0 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p1.jpg', mediaType: 'IMAGE', order: 1 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p2.jpg', mediaType: 'IMAGE', order: 2 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p3.jpg', mediaType: 'IMAGE', order: 3 },
    ],
  });
  assert(parseVideoAndPhotos.success, 'Post with 1 video and 3 photos (total 4) passes validation');

  // 5E. 1 direct video + 4 photos (total 5) rejected
  const parseOverMaxMedia = createPostSchema.safeParse({
    content: 'Too many media items',
    type: 'GENERAL',
    media: [
      { url: validDirectVideoUrl, mediaType: 'VIDEO', order: 0 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p1.jpg', mediaType: 'IMAGE', order: 1 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p2.jpg', mediaType: 'IMAGE', order: 2 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p3.jpg', mediaType: 'IMAGE', order: 3 },
      { url: 'https://mock-storage.apnasamaj.local/post-media/posts/u/p4.jpg', mediaType: 'IMAGE', order: 4 },
    ],
  });
  assert(!parseOverMaxMedia.success, 'Post with 5 media items rejected by max(4) rule');

  // Close test server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Cleanup test temp directory
  try {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  } catch {}

  console.log('\n================================================================');
  console.log(`   Direct Video Upload Tests: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDirectVideoUploadTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
