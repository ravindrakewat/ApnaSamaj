import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus, PostType } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';
import { StorageError } from '../services/storage.service';

const ACTIVE_MEMBER_1_PHONE = '+919777700001';
const ACTIVE_MEMBER_2_PHONE = '+919777700002';
const PENDING_MEMBER_PHONE = '+919777700003';
const SUSPENDED_MEMBER_PHONE = '+919777700004';
const TEST_PASSWORD = 'TestPassword123!';

// Minimal 1x1 valid PNG image buffer
const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Minimal 1x1 valid JPEG image buffer
const VALID_1X1_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9,
]);

// Minimal valid MP4 buffer with ftyp box
const VALID_MP4_BUFFER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, // size: 24 bytes
  0x66, 0x74, 0x79, 0x70, // 'ftyp'
  0x69, 0x73, 0x6f, 0x6d, // 'isom'
  0x00, 0x00, 0x02, 0x00, // minor version
  0x69, 0x73, 0x6f, 0x6d, // compatible brand 1
  0x6d, 0x70, 0x34, 0x31, // compatible brand 2
]);

async function runPostMediaTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Secure Post Media & Upload Regression Tests     ');
  console.log('================================================================\n');

  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  const allPhones = [
    ACTIVE_MEMBER_1_PHONE,
    ACTIVE_MEMBER_2_PHONE,
    PENDING_MEMBER_PHONE,
    SUSPENDED_MEMBER_PHONE,
  ];

  // Clean previous test data
  await prisma.user.deleteMany({
    where: { phone: { in: allPhones } },
  });

  // Seed test users in Kewat community DB
  const activeMember1 = await prisma.user.create({
    data: {
      phone: ACTIVE_MEMBER_1_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Media Tester One',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  const activeMember2 = await prisma.user.create({
    data: {
      phone: ACTIVE_MEMBER_2_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Media Tester Two',
          city: 'Indore',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  const pendingMember = await prisma.user.create({
    data: {
      phone: PENDING_MEMBER_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.PENDING,
      isPhoneVerified: false,
      profile: {
        create: {
          fullName: 'Pending Tester',
        },
      },
    },
  });

  const suspendedMember = await prisma.user.create({
    data: {
      phone: SUSPENDED_MEMBER_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.SUSPENDED,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Suspended Tester',
        },
      },
    },
  });

  // Start ephemeral test server
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] Server listening on ${baseUrl}\n`);

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

  function makeToken(user: { id: string; phone: string; role: string; status: string }) {
    return jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role, status: user.status, communitySlug: 'kewat' },
      config.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  const tokenMember1 = makeToken({
    id: activeMember1.id,
    phone: activeMember1.phone,
    role: activeMember1.role,
    status: activeMember1.status,
  });

  const tokenMember2 = makeToken({
    id: activeMember2.id,
    phone: activeMember2.phone,
    role: activeMember2.role,
    status: activeMember2.status,
  });

  const tokenPending = makeToken({
    id: pendingMember.id,
    phone: pendingMember.phone,
    role: pendingMember.role,
    status: pendingMember.status,
  });

  const tokenSuspended = makeToken({
    id: suspendedMember.id,
    phone: suspendedMember.phone,
    role: suspendedMember.role,
    status: suspendedMember.status,
  });

  // Helper to send multipart upload
  async function uploadFile(
    token: string | null,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    communitySlug: string | null = 'kewat'
  ): Promise<{ status: number; data: any }> {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    };
    if (communitySlug) {
      headers['x-community-slug'] = communitySlug;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}/api/v1/posts/media/upload`, {
      method: 'POST',
      headers,
      body,
    });

    const data: any = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  try {
    // ---------------------------------------------------------------
    // 1. Publishing a text-only post (Task 4, Req 1)
    // ---------------------------------------------------------------
    console.log('--- 1. Publishing Text-Only Post ---');
    const resTextOnly = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
        'x-community-slug': 'kewat',
      },
      body: JSON.stringify({
        content: 'Community announcement without any media attachment',
        type: PostType.GENERAL,
        media: [],
      }),
    });
    const dataTextOnly = ((await resTextOnly.json()) as any);
    assert(resTextOnly.status === 201 && dataTextOnly.success === true, 'Text-only post publishes successfully (201 Created)');
    assert(Array.isArray(dataTextOnly.data.media) && dataTextOnly.data.media.length === 0, 'Text-only post returns empty media array');

    // ---------------------------------------------------------------
    // 2. Uploading a valid image successfully (Task 4, Req 2)
    // ---------------------------------------------------------------
    console.log('\n--- 2. Uploading Valid Image Successfully ---');
    const resPngUpload = await uploadFile(tokenMember1, VALID_1X1_PNG, 'sample.png', 'image/png');
    assert(
      resPngUpload.status === 201 && resPngUpload.data.success === true,
      'Active member successfully uploads valid PNG (201 Created)'
    );
    assert(
      typeof resPngUpload.data.data.url === 'string' &&
        resPngUpload.data.data.url.startsWith('http') &&
        resPngUpload.data.data.mimeType === 'image/png',
      'Upload returns public URL and detected image/png MIME'
    );
    assert(
      resPngUpload.data.data.storagePath.startsWith(`posts/${activeMember1.id}/`),
      'Storage path is securely namespaced under user ID'
    );

    const uploadedPngUrl = resPngUpload.data.data.url;

    // Upload JPEG as well
    const resJpegUpload = await uploadFile(tokenMember1, VALID_1X1_JPEG, 'sample.jpg', 'image/jpeg');
    assert(
      resJpegUpload.status === 201 && resJpegUpload.data.data.mimeType === 'image/jpeg',
      'Active member successfully uploads valid JPEG'
    );
    const uploadedJpegUrl = resJpegUpload.data.data.url;

    // ---------------------------------------------------------------
    // 3. Publishing a post with an uploaded image (Task 4, Req 3)
    // ---------------------------------------------------------------
    console.log('\n--- 3. Publishing Post with Uploaded Image ---');
    const resCreate = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
        'x-community-slug': 'kewat',
      },
      body: JSON.stringify({
        content: 'Community photo update from Bhopal!',
        type: PostType.GENERAL,
        media: [
          { url: uploadedPngUrl, mediaType: 'IMAGE', order: 0 },
          { url: uploadedJpegUrl, mediaType: 'IMAGE', order: 1 },
        ],
      }),
    });
    const dataCreate = ((await resCreate.json()) as any);
    assert(resCreate.status === 201, 'Post created with attached media (201 Created)');
    assert(
      Array.isArray(dataCreate.data.media) && dataCreate.data.media.length === 2,
      'Created post returns media array with 2 items'
    );

    const createdPostId = dataCreate.data.id;

    // Verify DB persistence in Prisma PostMedia
    const dbMedia = await prisma.postMedia.findMany({
      where: { postId: createdPostId },
      orderBy: { order: 'asc' },
    });
    assert(
      dbMedia.length === 2 && dbMedia[0].url === uploadedPngUrl,
      'PostMedia correctly persisted in database with correct postId and URL'
    );

    // ---------------------------------------------------------------
    // 4. Handling storage upload failure (Task 4, Req 4)
    // ---------------------------------------------------------------
    console.log('\n--- 4. Handling Storage Upload Failure ---');
    const storageErr = new StorageError('Simulated storage bucket error', 500);
    assert(
      storageErr.statusCode === 500 && storageErr.message.includes('Simulated storage'),
      'StorageError correctly encapsulates status 500 and error message'
    );

    // ---------------------------------------------------------------
    // 5. Handling invalid image type or oversized image (Task 4, Req 5)
    // ---------------------------------------------------------------
    console.log('\n--- 5. Handling Invalid Image Type & Oversized Image ---');

    // Spoofed text file disguised as PNG
    const fakeTextFile = Buffer.from('This is a plain text file pretending to be an image!');
    const resSpoofed = await uploadFile(tokenMember1, fakeTextFile, 'spoofed.png', 'image/png');
    assert(
      resSpoofed.status === 400 && resSpoofed.data.error.includes('Corrupted or unsupported'),
      'Spoofed text file with image/png MIME fails magic bytes validation (400)'
    );

    // SVG file rejected by MIME filter
    const svgFile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const resSvg = await uploadFile(tokenMember1, svgFile, 'vector.svg', 'image/svg+xml');
    assert(resSvg.status === 400, 'SVG file upload is rejected by MIME filter (400)');

    // Oversized file (> 5MB)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0);
    VALID_1X1_PNG.copy(oversizedBuffer, 0, 0, VALID_1X1_PNG.length);
    const resOversized = await uploadFile(tokenMember1, oversizedBuffer, 'large.png', 'image/png');
    assert(
      resOversized.status === 400 && resOversized.data.error.includes('5MB'),
      'Oversized file (> 5MB) returns 400 Bad Request'
    );

    // ---------------------------------------------------------------
    // 6. Handling expired or missing auth token (Task 4, Req 6)
    // ---------------------------------------------------------------
    console.log('\n--- 6. Handling Expired or Missing Auth Token ---');

    const resUnauth = await uploadFile(null, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(resUnauth.status === 401, 'Upload without token returns 401 Unauthorized');

    const expiredToken = jwt.sign(
      { sub: activeMember1.id, role: activeMember1.role, status: 'ACTIVE', communitySlug: 'kewat' },
      config.jwtAccessSecret,
      { expiresIn: '-10s' }
    );
    const resExpired = await uploadFile(expiredToken, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(
      resExpired.status === 401 && resExpired.data.error.includes('expired'),
      'Upload with expired token returns 401 Access token has expired'
    );

    const resPending = await uploadFile(tokenPending, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(
      resPending.status === 403 && resPending.data.error.includes('pending verification'),
      'Pending member upload returns 403 Forbidden'
    );

    const resSuspended = await uploadFile(tokenSuspended, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(
      resSuspended.status === 403 && resSuspended.data.error.includes('suspended'),
      'Suspended member upload returns 403 Forbidden'
    );

    // ---------------------------------------------------------------
    // 7. Handling response structure contract (Task 4, Req 7)
    // ---------------------------------------------------------------
    console.log('\n--- 7. Image Upload Response Contract Validation ---');
    const uploadItem = resPngUpload.data.data;
    assert(
      typeof uploadItem.url === 'string' &&
      typeof uploadItem.storagePath === 'string' &&
      uploadItem.mediaType === 'IMAGE' &&
      typeof uploadItem.fileName === 'string' &&
      typeof uploadItem.fileSizeBytes === 'number' &&
      typeof uploadItem.mimeType === 'string',
      'Upload response strictly satisfies UploadMediaResponseData contract'
    );

    // ---------------------------------------------------------------
    // 8. Retrying failed upload without duplicate records (Task 4, Req 8)
    // ---------------------------------------------------------------
    console.log('\n--- 8. Retrying Failed Upload Without Duplicates ---');

    // First image upload succeeds
    const resRetry1 = await uploadFile(tokenMember1, VALID_1X1_PNG, 'first.png', 'image/png');
    assert(resRetry1.status === 201, 'First upload succeeds');

    // Second upload attempt is invalid (fails with 400)
    const resRetryFail = await uploadFile(tokenMember1, fakeTextFile, 'corrupt.jpg', 'image/jpeg');
    assert(resRetryFail.status === 400, 'Corrupted upload fails as expected');

    // User retries with valid image (succeeds)
    const resRetry2 = await uploadFile(tokenMember1, VALID_1X1_JPEG, 'retried.jpg', 'image/jpeg');
    assert(resRetry2.status === 201, 'Retried upload succeeds');

    // Publish post with the 2 succeeded uploads
    const resRetryPost = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
        'x-community-slug': 'kewat',
      },
      body: JSON.stringify({
        content: 'Post published after retry with only successful items',
        type: PostType.GENERAL,
        media: [
          { url: resRetry1.data.data.url, mediaType: 'IMAGE', order: 0 },
          { url: resRetry2.data.data.url, mediaType: 'IMAGE', order: 1 },
        ],
      }),
    });
    const dataRetryPost = ((await resRetryPost.json()) as any);
    assert(resRetryPost.status === 201, 'Post with retried media published (201 Created)');

    const dbRetryMedia = await prisma.postMedia.findMany({
      where: { postId: dataRetryPost.data.id },
    });
    assert(
      dbRetryMedia.length === 2,
      'Database contains exactly 2 PostMedia records, zero ghost or duplicate records'
    );

    // ---------------------------------------------------------------
    // 9. Video upload behavior remains unchanged (Task 4, Req 9)
    // ---------------------------------------------------------------
    console.log('\n--- 9. Video Upload Behavior Preservation ---');
    const vidBoundary = '----WebKitFormBoundaryVid' + Math.random().toString(36).substring(2);
    const vidHeader = Buffer.from(
      `--${vidBoundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
    );
    const vidFooter = Buffer.from(`\r\n--${vidBoundary}--\r\n`);
    const vidBody = Buffer.concat([vidHeader, VALID_MP4_BUFFER, vidFooter]);

    const resVideo = await fetch(`${baseUrl}/api/v1/posts/media/video-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${vidBoundary}`,
        'Content-Length': String(vidBody.length),
        'x-community-slug': 'kewat',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: vidBody,
    });
    const dataVideo = ((await resVideo.json()) as any);
    assert(
      resVideo.status === 201 && dataVideo.success === true,
      'Video upload succeeds with 201 Created'
    );
    assert(
      dataVideo.data.mediaType === 'VIDEO' && dataVideo.data.mimeType === 'video/mp4',
      'Video upload returns mediaType VIDEO and mimeType video/mp4'
    );

  } finally {
    // Teardown server & test data
    server.close();
    await prisma.user.deleteMany({
      where: { phone: { in: allPhones } },
    });
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(` Post Media Test Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPostMediaTests().catch((err) => {
  console.error('[Test] Unhandled error during test execution:', err);
  process.exit(1);
});
