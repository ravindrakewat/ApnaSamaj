import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus, PostType } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';
import { getSupabaseClient } from '../config/supabase';

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

async function runPostMediaTests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Phase 4B: Secure Post Media Upload Tests');
  console.log('[Test] ====================================================');

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

  // Seed test users
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
  console.log(`[Test] Server listening on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  function makeToken(user: { id: string; phone: string; role: string; status: string }) {
    return jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role, status: user.status },
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
    mimeType: string
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
    // 1. Authorization checks for upload
    // ---------------------------------------------------------------
    console.log('\n--- 1. Upload Authorization Checks ---');

    const resUnauth = await uploadFile(null, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(resUnauth.status === 401, 'Upload without token returns 401 Unauthorized');

    const resPending = await uploadFile(tokenPending, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(
      resPending.status === 403 && resPending.data.error.includes('pending verification'),
      'Pending member upload returns 403 forbidden'
    );

    const resSuspended = await uploadFile(tokenSuspended, VALID_1X1_PNG, 'test.png', 'image/png');
    assert(
      resSuspended.status === 403 && resSuspended.data.error.includes('suspended'),
      'Suspended member upload returns 403 forbidden'
    );

    // ---------------------------------------------------------------
    // 2. MIME & Magic Bytes Validation
    // ---------------------------------------------------------------
    console.log('\n--- 2. File Content & MIME Validation ---');

    // Fake text file disguised as PNG
    const fakeTextFile = Buffer.from('This is a plain text file pretending to be an image!');
    const resSpoofed = await uploadFile(tokenMember1, fakeTextFile, 'spoofed.png', 'image/png');
    assert(
      resSpoofed.status === 400 && resSpoofed.data.error.includes('Corrupted or unsupported'),
      'Spoofed text file with image/png MIME fails magic bytes validation (400)'
    );

    // SVG file (unsupported for post media due to XSS risk)
    const svgFile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const resSvg = await uploadFile(tokenMember1, svgFile, 'vector.svg', 'image/svg+xml');
    assert(
      resSvg.status === 400,
      'SVG file upload is rejected by MIME filter (400)'
    );

    // Oversized file (> 5MB)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0);
    // Copy valid PNG header so it would pass magic bytes if not caught by size
    VALID_1X1_PNG.copy(oversizedBuffer, 0, 0, VALID_1X1_PNG.length);
    const resOversized = await uploadFile(tokenMember1, oversizedBuffer, 'large.png', 'image/png');
    assert(
      resOversized.status === 400 && resOversized.data.error.includes('5MB'),
      'Oversized file (> 5MB) returns 400 Bad Request'
    );

    // ---------------------------------------------------------------
    // 3. Successful Upload & Path Safety
    // ---------------------------------------------------------------
    console.log('\n--- 3. Successful Upload & Path Safety ---');

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
      'Storage path is securely namespaced under user ID to prevent traversal'
    );

    const uploadedPngUrl = resPngUpload.data.data.url;
    const uploadedPngPath = resPngUpload.data.data.storagePath;

    // Upload a valid JPEG as well
    const resJpegUpload = await uploadFile(tokenMember1, VALID_1X1_JPEG, 'sample.jpg', 'image/jpeg');
    assert(
      resJpegUpload.status === 201 && resJpegUpload.data.data.mimeType === 'image/jpeg',
      'Active member successfully uploads valid JPEG'
    );
    const uploadedJpegUrl = resJpegUpload.data.data.url;
    const uploadedJpegPath = resJpegUpload.data.data.storagePath;

    // ---------------------------------------------------------------
    // 4. Attach Media to Post Creation
    // ---------------------------------------------------------------
    console.log('\n--- 4. Post Creation with Media Attachment ---');

    // Fail if > 4 media items
    const resTooMany = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({
        content: 'Post with too many images',
        type: PostType.GENERAL,
        media: [
          { url: uploadedPngUrl, mediaType: 'IMAGE', order: 0 },
          { url: uploadedJpegUrl, mediaType: 'IMAGE', order: 1 },
          { url: uploadedPngUrl, mediaType: 'IMAGE', order: 2 },
          { url: uploadedJpegUrl, mediaType: 'IMAGE', order: 3 },
          { url: uploadedPngUrl, mediaType: 'IMAGE', order: 4 }, // 5th item
        ],
      }),
    });
    const dataTooMany = ((await resTooMany.json()) as any);
    assert(
      resTooMany.status === 400 && dataTooMany.error.toLowerCase().includes('maximum of 4'),
      'Creating post with > 4 images returns 400 Bad Request'
    );

    // Successful post creation with 2 images
    const resCreate = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
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
    assert(
      dataCreate.data.media[0].order === 0 && dataCreate.data.media[1].order === 1,
      'Post media is correctly ordered'
    );

    const createdPostId = dataCreate.data.id;

    // Verify DB persistence in Prisma PostMedia
    const dbMedia = await prisma.postMedia.findMany({
      where: { postId: createdPostId },
      orderBy: { order: 'asc' },
    });
    assert(
      dbMedia.length === 2 && dbMedia[0].url === uploadedPngUrl,
      'PostMedia correctly persisted in PostgreSQL database'
    );

    // ---------------------------------------------------------------
    // 5. Feed and Single Post retrieval with Media
    // ---------------------------------------------------------------
    console.log('\n--- 5. Feed and Single Post Retrieval with Media ---');

    const resFeed = await fetch(`${baseUrl}/api/v1/posts?page=1&limit=5`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    const dataFeed = ((await resFeed.json()) as any);
    const foundPostInFeed = dataFeed.data.posts.find((p: any) => p.id === createdPostId);
    assert(
      foundPostInFeed && foundPostInFeed.media && foundPostInFeed.media.length === 2,
      'Community feed query returns attached post media'
    );

    const resGetSingle = await fetch(`${baseUrl}/api/v1/posts/${createdPostId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    const dataGetSingle = ((await resGetSingle.json()) as any);
    assert(
      dataGetSingle.status === 200 || resGetSingle.status === 200,
      'Single post retrieval succeeds'
    );
    assert(
      dataGetSingle.data.media.length === 2,
      'Single post endpoint returns complete media list'
    );

    // ---------------------------------------------------------------
    // 6. Update Post: Media Removal & Ownership
    // ---------------------------------------------------------------
    console.log('\n--- 6. Post Update & Media Removal ---');

    // Unauthorized member cannot edit post
    const resForbiddenEdit = await fetch(`${baseUrl}/api/v1/posts/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember2}`,
      },
      body: JSON.stringify({
        content: 'Hacked by member 2',
      }),
    });
    assert(
      resForbiddenEdit.status === 403,
      'Non-owner cannot update post or its media (403 Forbidden)'
    );

    // Owner removes one image and keeps the other
    const resEdit = await fetch(`${baseUrl}/api/v1/posts/${createdPostId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({
        content: 'Updated post: kept only the PNG',
        media: [{ url: uploadedPngUrl, mediaType: 'IMAGE', order: 0 }],
      }),
    });
    const dataEdit = ((await resEdit.json()) as any);
    assert(resEdit.status === 200, 'Post owner successfully updates post media');
    assert(
      dataEdit.data.media.length === 1 && dataEdit.data.media[0].url === uploadedPngUrl,
      'Post updated to contain only 1 remaining media item'
    );

    const dbMediaAfterEdit = await prisma.postMedia.findMany({
      where: { postId: createdPostId },
    });
    assert(
      dbMediaAfterEdit.length === 1 && dbMediaAfterEdit[0].url === uploadedPngUrl,
      'Removed media item was deleted from PostgreSQL PostMedia table'
    );

    // ---------------------------------------------------------------
    // 7. Post Deletion & Supabase Storage Cleanup
    // ---------------------------------------------------------------
    console.log('\n--- 7. Post Deletion & Media Cleanup ---');

    // Non-owner cannot delete post
    const resForbiddenDelete = await fetch(`${baseUrl}/api/v1/posts/${createdPostId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    assert(
      resForbiddenDelete.status === 403,
      'Non-owner cannot delete member post (403 Forbidden)'
    );

    // Owner deletes post
    const resDelete = await fetch(`${baseUrl}/api/v1/posts/${createdPostId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    assert(resDelete.status === 200, 'Post owner successfully deletes post');

    // Verify DB records are gone
    const postInDb = await prisma.post.findUnique({ where: { id: createdPostId } });
    const mediaInDb = await prisma.postMedia.findMany({ where: { postId: createdPostId } });
    assert(postInDb === null && mediaInDb.length === 0, 'Post and PostMedia deleted from database');

    // ---------------------------------------------------------------
    // 8. Image-only Post Support
    // ---------------------------------------------------------------
    console.log('\n--- 8. Image-only Post Support ---');

    const resImgUpload3 = await uploadFile(tokenMember1, VALID_1X1_PNG, 'photo.png', 'image/png');
    assert(resImgUpload3.status === 201, 'Upload succeeds for image-only post');

    // Create post with empty content but with media
    const resImgOnlyPost = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({
        content: '',
        type: PostType.GENERAL,
        media: [{ url: resImgUpload3.data.data.url, mediaType: 'IMAGE', order: 0 }],
      }),
    });
    assert(
      resImgOnlyPost.status === 201,
      'Post with empty text content but valid media is allowed (201 Created)'
    );

    // Clean up image-only post
    const imgOnlyPostData = ((await resImgOnlyPost.json()) as any);
    await fetch(`${baseUrl}/api/v1/posts/${imgOnlyPostData.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });

  } finally {
    // Teardown server & test data
    server.close();
    await prisma.user.deleteMany({
      where: { phone: { in: allPhones } },
    });
    await prisma.$disconnect();
  }

  console.log('\n[Test] ====================================================');
  console.log(`[Test] Test Summary: ${passed} passed, ${failed} failed`);
  console.log('[Test] ====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPostMediaTests().catch((err) => {
  console.error('[Test] Unhandled error during test execution:', err);
  process.exit(1);
});
