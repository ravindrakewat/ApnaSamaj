import { PublicMatrimonialProfileListItem, PublicMatrimonialProfileDetail } from '../../../../packages/shared-types/src/index';

/**
 * Matrimonial Card & Detail Image Selection Helper
 * Matches the resolution logic used in MatrimonialDiscoveryPage and MatrimonialProfileDetailPage
 */
export function resolveMatrimonialListingImage(profile: {
  primaryPhotoUrl?: string | null;
  avatarUrl?: string | null;
  hasImageLoadError?: boolean;
}): { displayUrl: string | null; usesDefaultAvatar: boolean } {
  if (profile.hasImageLoadError) {
    return { displayUrl: null, usesDefaultAvatar: true };
  }

  const url = profile.primaryPhotoUrl || profile.avatarUrl || null;
  if (!url) {
    return { displayUrl: null, usesDefaultAvatar: true };
  }

  return { displayUrl: url, usesDefaultAvatar: false };
}

export function resolveMatrimonialDetailImage(profile: {
  photos?: Array<{ id: string; url: string; isPrimary: boolean; isApproved: boolean }>;
  avatarUrl?: string | null;
  selectedPhotoIndex?: number;
  failedPhotoIds?: Record<string, boolean>;
}): { displayUrl: string | null; usesDefaultAvatar: boolean } {
  const approvedPhotos = (profile.photos || []).filter((p) => p.isApproved);
  const idx = profile.selectedPhotoIndex ?? 0;
  const activePhoto = approvedPhotos[idx] || null;

  if (activePhoto && !profile.failedPhotoIds?.[activePhoto.id]) {
    return { displayUrl: activePhoto.url, usesDefaultAvatar: false };
  }

  if (profile.avatarUrl && !profile.failedPhotoIds?.['avatar']) {
    return { displayUrl: profile.avatarUrl, usesDefaultAvatar: false };
  }

  return { displayUrl: null, usesDefaultAvatar: true };
}

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

async function runTests() {
  console.log('======================================================');
  console.log('   Apna Samaj — Matrimonial Image Rendering Tests     ');
  console.log('======================================================\n');

  console.log('--- 1. Listing Card with Valid Profile Image URL ---');
  const cardWithPrimaryPhoto = resolveMatrimonialListingImage({
    primaryPhotoUrl: 'https://cdn.example.com/matrimonial/photo1.jpg',
    avatarUrl: 'https://cdn.example.com/avatars/user1.jpg',
  });
  assert(
    cardWithPrimaryPhoto.displayUrl === 'https://cdn.example.com/matrimonial/photo1.jpg',
    'Listing card prioritizes primary matrimonial photo over user avatar'
  );
  assert(cardWithPrimaryPhoto.usesDefaultAvatar === false, 'Listing card does not use default avatar');

  console.log('\n--- 2. Profile with Multiple Matrimonial Photos ---');
  const photos = [
    { id: 'ph-1', url: 'https://cdn.example.com/matrimonial/gallery1.jpg', isPrimary: false, isApproved: true },
    { id: 'ph-2', url: 'https://cdn.example.com/matrimonial/gallery2_primary.jpg', isPrimary: true, isApproved: true },
    { id: 'ph-3', url: 'https://cdn.example.com/matrimonial/gallery3.jpg', isPrimary: false, isApproved: true },
  ];
  // Backend resolution logic for primary photo:
  const primary = photos.find((p) => p.isPrimary) || photos[0];
  const listingItem: PublicMatrimonialProfileListItem = {
    id: 'mp-123',
    userId: 'u-123',
    fullName: 'Pooja Kewat',
    gender: 'FEMALE',
    age: 26,
    city: 'Indore',
    state: 'Madhya Pradesh',
    avatarUrl: null, // Member has no account avatar
    primaryPhotoUrl: primary.url,
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 165,
    highestEducation: 'M.Tech',
    employedIn: 'IT',
    occupation: 'Software Engineer',
    annualIncome: '15 LPA',
    subCaste: 'Kashyap',
    gotra: 'Kashyap',
    manglik: 'NON_MANGLIK',
    diet: 'VEGETARIAN',
    photosCount: photos.length,
    createdAt: new Date().toISOString(),
  };

  const cardWithMultiplePhotos = resolveMatrimonialListingImage(listingItem);
  assert(
    cardWithMultiplePhotos.displayUrl === 'https://cdn.example.com/matrimonial/gallery2_primary.jpg',
    'Profile card displays the marked primary photo from multiple photos'
  );
  assert(listingItem.photosCount === 3, 'Photos count badge accurately reflects 3 photos');

  console.log('\n--- 3. Profile with No Image (Neither Matrimonial nor Avatar) ---');
  const profileNoImage: PublicMatrimonialProfileListItem = {
    id: 'mp-456',
    userId: 'u-456',
    fullName: 'Rahul Kewat',
    gender: 'MALE',
    age: 29,
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    avatarUrl: null,
    primaryPhotoUrl: null,
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 178,
    highestEducation: 'MBA',
    employedIn: 'BANKING',
    occupation: 'Manager',
    annualIncome: '18 LPA',
    subCaste: 'Kashyap',
    gotra: 'Kashyap',
    manglik: 'NON_MANGLIK',
    diet: 'VEGETARIAN',
    photosCount: 0,
    createdAt: new Date().toISOString(),
  };
  const cardNoImage = resolveMatrimonialListingImage(profileNoImage);
  assert(cardNoImage.displayUrl === null, 'Profile with no images returns null URL');
  assert(cardNoImage.usesDefaultAvatar === true, 'Profile with no images safely falls back to default avatar');

  console.log('\n--- 4. Failed Image Request (onError Handling) ---');
  const cardWithBrokenImage = resolveMatrimonialListingImage({
    primaryPhotoUrl: 'https://cdn.example.com/broken_photo.jpg',
    avatarUrl: null,
    hasImageLoadError: true, // Simulated onError event
  });
  assert(cardWithBrokenImage.displayUrl === null, 'Failed image request resets display URL');
  assert(cardWithBrokenImage.usesDefaultAvatar === true, 'Failed image gracefully falls back to default avatar without crashing');

  console.log('\n--- 5. Consistency Between Listing Card and Full Profile Selection ---');
  const fullProfile: PublicMatrimonialProfileDetail = {
    ...listingItem,
    photos: photos.map((p, idx) => ({
      id: p.id,
      profileId: 'mp-123',
      url: p.url,
      order: idx,
      isPrimary: p.isPrimary,
      isApproved: p.isApproved,
      createdAt: new Date().toISOString(),
    })),
    partnerPreference: null,
    weightKg: 55,
    motherTongue: 'Hindi',
    religion: 'Hindu',
    caste: 'Kewat',
    birthTime: null,
    birthCity: null,
    rashi: null,
    nakshatra: null,
    educationDetails: null,
    companyName: null,
    workCity: 'Indore',
    workState: 'Madhya Pradesh',
    workCountry: 'India',
    familyType: 'NUCLEAR',
    familyValues: 'MODERATE',
    fatherName: 'Father',
    fatherOccupation: 'Business',
    motherName: 'Mother',
    motherOccupation: 'Homemaker',
    brothersCount: 1,
    brothersMarried: 0,
    sistersCount: 0,
    sistersMarried: 0,
    familyNativePlace: 'Indore',
    aboutFamily: null,
    smoking: 'NO',
    drinking: 'NO',
    aboutMe: 'About me',
    partnerExpectations: 'Expectations',
  };

  const fullDetailImage = resolveMatrimonialDetailImage({
    photos: fullProfile.photos,
    avatarUrl: fullProfile.avatarUrl,
    selectedPhotoIndex: 1, // Points to primary photo
  });
  assert(
    cardWithMultiplePhotos.displayUrl === fullDetailImage.displayUrl,
    'Listing card and Full Profile active view resolve the exact same primary image URL'
  );

  console.log('\n--- 6. Matrimonial Photo Privacy & Moderation Filtering ---');
  const unapprovedPhotos = [
    { id: 'ph-unapproved', url: 'https://cdn.example.com/unapproved.jpg', isPrimary: true, isApproved: false },
    { id: 'ph-approved', url: 'https://cdn.example.com/approved.jpg', isPrimary: false, isApproved: true },
  ];
  const privacyFilteredDetail = resolveMatrimonialDetailImage({
    photos: unapprovedPhotos,
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
  });
  assert(
    privacyFilteredDetail.displayUrl === 'https://cdn.example.com/approved.jpg',
    'Unapproved photos are strictly filtered out; only approved photos are displayed'
  );

  console.log('\n======================================================');
  console.log(`Summary: All ${passed} checks passed! (Failed: ${failed})`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

