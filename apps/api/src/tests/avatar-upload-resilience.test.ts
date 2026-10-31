import {
  uploadAvatarMedia,
  extractStoragePathFromUrl,
  deleteStorageObjects,
  InvalidMimeTypeError,
  OversizedFileError,
} from '../services/storage.service';

const VALID_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runAvatarResilienceTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Avatar Upload Resilience & Fallback Tests       ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`);
      failed++;
    }
  }

  // 1. Valid avatar upload produces valid URL
  try {
    const result = await uploadAvatarMedia('test-user-123', VALID_1X1_PNG, 'image/png', 'avatar.png');
    assert(
      typeof result.url === 'string' && (result.url.startsWith('data:image/png;base64,') || result.url.startsWith('http')),
      'Valid PNG avatar upload returns valid Data URL or CDN HTTP URL'
    );
    assert(result.mimeType === 'image/png', 'Detected MIME is correctly image/png');
    assert(result.fileSizeBytes === VALID_1X1_PNG.length, 'File size matches input buffer');
  } catch (err) {
    assert(false, `Valid upload threw error: ${err}`);
  }

  // 2. Invalid magic bytes rejection
  try {
    const invalidBuffer = Buffer.from('NOT AN IMAGE BUFFER DATA');
    await uploadAvatarMedia('test-user-123', invalidBuffer, 'image/png', 'fake.png');
    assert(false, 'Invalid image content must throw InvalidMimeTypeError');
  } catch (err) {
    assert(err instanceof InvalidMimeTypeError, 'Invalid image buffer rejected with InvalidMimeTypeError');
  }

  // 3. Oversized file rejection
  try {
    const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, 0);
    VALID_1X1_PNG.copy(oversizedBuffer, 0, 0, VALID_1X1_PNG.length);
    await uploadAvatarMedia('test-user-123', oversizedBuffer, 'image/png', 'large.png');
    assert(false, 'Oversized image buffer must throw OversizedFileError');
  } catch (err) {
    assert(err instanceof OversizedFileError, 'Oversized buffer rejected with OversizedFileError');
  }

  // 4. Data URL extraction safety
  const dataUrl = `data:image/png;base64,${VALID_1X1_PNG.toString('base64')}`;
  const extractedPath = extractStoragePathFromUrl(dataUrl);
  assert(extractedPath === null, 'extractStoragePathFromUrl safely returns null for Data URLs');

  // 5. Empty storage path deletion safety
  try {
    await deleteStorageObjects(['']);
    assert(true, 'deleteStorageObjects safely handles empty paths without throwing');
  } catch (err) {
    assert(false, `deleteStorageObjects threw error on empty path: ${err}`);
  }

  console.log('================================================================');
  console.log(`   Avatar Resilience Tests: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAvatarResilienceTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
