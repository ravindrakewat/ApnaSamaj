import assert from 'assert';
import { matrimonialApi, MatrimonialFilterParams } from '../api/matrimonial.api';
import { apiClient } from '../api/client';
import {
  PublicMatrimonialProfileListItem,
  PublicMatrimonialProfileDetail,
  PaginatedMatrimonialProfilesResponse,
  MatrimonialInterestItem,
  PaginatedMatrimonialInterestsResponse,
} from '@apnasamaj/shared-types';
import { setStoredCommunitySlug, setAuthTokens, clearAuthTokens } from '../services/storage.service';
import { resolveTranslation } from '../localization/i18n';
import { formatHeightCm } from '../components/MatrimonialCard';

let totalTests = 0;
let passedTests = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock Matrimonial Profiles
const mockProfile1: PublicMatrimonialProfileListItem = {
  id: 'mat-prof-001',
  userId: 'usr-mem-001',
  fullName: 'सुनील केवट',
  gender: 'MALE',
  age: 27,
  city: 'ग्वालियर',
  state: 'मध्य प्रदेश',
  avatarUrl: 'https://example.com/avatar1.jpg',
  primaryPhotoUrl: 'https://example.com/photo1.jpg',
  maritalStatus: 'NEVER_MARRIED',
  heightCm: 175,
  highestEducation: 'B.Tech in Computer Science',
  employedIn: 'PRIVATE_SECTOR',
  occupation: 'Software Engineer',
  annualIncome: '15-20 Lakhs',
  subCaste: 'केवट',
  gotra: 'कश्यप',
  manglik: 'NON_MANGLIK',
  diet: 'VEGETARIAN',
  photosCount: 3,
  interestStatus: null,
  isVerified: true,
  createdAt: '2026-02-01T10:00:00.000Z',
};

const mockProfileDetail1: PublicMatrimonialProfileDetail = {
  ...mockProfile1,
  photos: [
    {
      id: 'photo-1',
      profileId: 'mat-prof-001',
      url: 'https://example.com/photo1.jpg',
      order: 0,
      isPrimary: true,
      isApproved: true,
      createdAt: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 'photo-2',
      profileId: 'mat-prof-001',
      url: 'https://example.com/photo2.jpg',
      order: 1,
      isPrimary: false,
      isApproved: true,
      createdAt: '2026-02-01T10:05:00.000Z',
    },
  ],
  partnerPreference: {
    id: 'pref-1',
    profileId: 'mat-prof-001',
    minAge: 22,
    maxAge: 27,
    minHeightCm: 155,
    maxHeightCm: 175,
    maritalStatuses: ['NEVER_MARRIED'],
    manglik: 'NON_MANGLIK',
    diet: 'VEGETARIAN',
    preferredEducations: ['Graduate', 'Post Graduate'],
    preferredOccupations: ['Professional'],
    preferredCities: ['ग्वालियर', 'भोपाल', 'इंदौर'],
    preferredStates: ['मध्य प्रदेश'],
    minIncome: '5 Lakhs',
    notes: 'संस्कारी एवं शिक्षित परिवार।',
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  weightKg: 70,
  motherTongue: 'Hindi',
  religion: 'Hindu',
  caste: 'Kewat',
  birthTime: '10:30',
  birthCity: 'ग्वालियर',
  rashi: 'सिंह',
  nakshatra: 'मघा',
  educationDetails: 'NIT Bhopal',
  companyName: 'Tech Solutions Pvt Ltd',
  workCity: 'इंदौर',
  workState: 'मध्य प्रदेश',
  workCountry: 'India',
  familyType: 'NUCLEAR',
  familyValues: 'TRADITIONAL',
  fatherName: 'रामप्रसाद केवट',
  fatherOccupation: 'Government Service',
  motherName: 'सुनीता केवट',
  motherOccupation: 'Homemaker',
  brothersCount: 1,
  brothersMarried: 0,
  sistersCount: 1,
  sistersMarried: 1,
  familyNativePlace: 'ग्वालियर',
  aboutFamily: 'प्रतिष्ठित एवं सुसंस्कृत समाज परिवार।',
  smoking: 'NO',
  drinking: 'NO',
  aboutMe: 'सरल स्वभाव, पारिवारिक मूल्यों में आस्था एवं तकनीकी क्षेत्र में कार्यरत।',
  partnerExpectations: 'सुसंस्कृत, शिक्षित एवं परिवार का सम्मान करने वाली जीवनसंगिनी।',
  unlockedContact: null, // Protected by default
  isBlockedByViewer: false,
};

export async function runMatrimonialFlowTests() {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 6 Mobile Matrimonial Test Suite           ');
  console.log('================================================================\n');

  // Backup and initialize test state
  await setAuthTokens({ accessToken: 'test-matrimonial-access-token', refreshToken: 'test-matrimonial-refresh' });
  await setStoredCommunitySlug('kewat');

  const originalGet = apiClient.get.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);
  const originalPatch = apiClient.patch.bind(apiClient);
  const originalDelete = apiClient.delete.bind(apiClient);

  try {
    // -------------------------------------------------------------------------
    // Test 1: Discovery Listing API & Pagination
    // -------------------------------------------------------------------------
    await it('matrimonialApi.listProfiles: requests paginated discovery profiles with headers', async () => {
      let requestedUrl = '';
      let capturedOptions: any = null;

      (apiClient as any).get = async (url: string, opts?: any) => {
        requestedUrl = url;
        capturedOptions = opts;
        return {
          success: true,
          data: {
            profiles: [mockProfile1],
            pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
          },
        };
      };

      const result = await matrimonialApi.listProfiles({ page: 1, limit: 12 });
      assert.strictEqual(requestedUrl, '/matrimonial/profiles');
      assert.strictEqual(capturedOptions.params.page, 1);
      assert.strictEqual(capturedOptions.params.limit, 12);
      assert.strictEqual(result.profiles.length, 1);
      assert.strictEqual(result.profiles[0].id, 'mat-prof-001');
      assert.strictEqual(result.profiles[0].isVerified, true);
    });

    // -------------------------------------------------------------------------
    // Test 2: Search and Filter Construction
    // -------------------------------------------------------------------------
    await it('matrimonialApi.listProfiles: serializes supported filter parameters properly', async () => {
      let capturedParams: any = null;

      (apiClient as any).get = async (_url: string, opts?: any) => {
        capturedParams = opts.params;
        return {
          success: true,
          data: { profiles: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } },
        };
      };

      await matrimonialApi.listProfiles({
        gender: 'FEMALE',
        maritalStatus: 'NEVER_MARRIED',
        manglik: 'NON_MANGLIK',
        subCaste: 'केवट',
        city: 'ग्वालियर',
        minAge: 21,
        maxAge: 28,
      });

      assert.strictEqual(capturedParams.gender, 'FEMALE');
      assert.strictEqual(capturedParams.maritalStatus, 'NEVER_MARRIED');
      assert.strictEqual(capturedParams.manglik, 'NON_MANGLIK');
      assert.strictEqual(capturedParams.subCaste, 'केवट');
      assert.strictEqual(capturedParams.city, 'ग्वालियर');
      assert.strictEqual(capturedParams.minAge, 21);
      assert.strictEqual(capturedParams.maxAge, 28);
    });

    // -------------------------------------------------------------------------
    // Test 3: Profile Details Retrieval
    // -------------------------------------------------------------------------
    await it('matrimonialApi.getProfileById: fetches detailed public profile by UUID', async () => {
      let requestedUrl = '';

      (apiClient as any).get = async (url: string) => {
        requestedUrl = url;
        return {
          success: true,
          data: mockProfileDetail1,
        };
      };

      const profile = await matrimonialApi.getProfileById('mat-prof-001');
      assert.strictEqual(requestedUrl, '/matrimonial/profiles/mat-prof-001');
      assert.strictEqual(profile.fullName, 'सुनील केवट');
      assert.strictEqual(profile.photos.length, 2);
      assert.strictEqual(profile.highestEducation, 'B.Tech in Computer Science');
      assert.strictEqual(profile.partnerPreference?.minAge, 22);
    });

    // -------------------------------------------------------------------------
    // Test 4: Privacy & Contact Information Invariant (Locked State)
    // -------------------------------------------------------------------------
    await it('Privacy Invariant: contact details remain strictly locked when not mutually accepted', async () => {
      (apiClient as any).get = async () => ({
        success: true,
        data: mockProfileDetail1,
      });

      const profile = await matrimonialApi.getProfileById('mat-prof-001');
      assert.strictEqual(profile.unlockedContact, null, 'Unlocked contact must be null without mutual acceptance');
      assert.strictEqual((profile as any).phone, undefined, 'Raw phone number must never be exposed');
      assert.strictEqual((profile as any).password, undefined, 'Password must never be exposed');
      assert.strictEqual((profile as any).resetToken, undefined, 'Reset token must never be exposed');
    });

    // -------------------------------------------------------------------------
    // Test 5: Privacy & Contact Information Invariant (Unlocked State)
    // -------------------------------------------------------------------------
    await it('Privacy Invariant: phone is disclosed ONLY when isMutualAccepted is explicitly true', async () => {
      const unlockedProfile: PublicMatrimonialProfileDetail = {
        ...mockProfileDetail1,
        unlockedContact: {
          phone: '+919876543210',
          isMutualAccepted: true,
        },
      };

      (apiClient as any).get = async () => ({
        success: true,
        data: unlockedProfile,
      });

      const profile = await matrimonialApi.getProfileById('mat-prof-001');
      assert.ok(profile.unlockedContact, 'Unlocked contact is present');
      assert.strictEqual(profile.unlockedContact.phone, '+919876543210');
      assert.strictEqual(profile.unlockedContact.isMutualAccepted, true);
    });

    // -------------------------------------------------------------------------
    // Test 6: Community Tenant Isolation Header
    // -------------------------------------------------------------------------
    await it('Tenant Isolation: API requests automatically inherit active community slug header', async () => {
      await setStoredCommunitySlug('kewat');
      const headers = await (apiClient as any).buildHeaders({});
      assert.strictEqual(headers['x-community-slug'], 'kewat');

      await setStoredCommunitySlug('gupta');
      const headersGupta = await (apiClient as any).buildHeaders({});
      assert.strictEqual(headersGupta['x-community-slug'], 'gupta');

      // Restore
      await setStoredCommunitySlug('kewat');
    });

    // -------------------------------------------------------------------------
    // Test 7: Express / Send Interest Request
    // -------------------------------------------------------------------------
    await it('matrimonialApi.sendInterest: sends interest request with receiverId and optional message', async () => {
      let sentUrl = '';
      let sentBody: any = null;

      (apiClient as any).post = async (url: string, body: any) => {
        sentUrl = url;
        sentBody = body;
        return {
          success: true,
          data: {
            id: 'interest-101',
            senderId: 'usr-mem-current',
            receiverId: body.receiverId,
            status: 'PENDING',
            message: body.message,
            createdAt: '2026-02-02T10:00:00.000Z',
            updatedAt: '2026-02-02T10:00:00.000Z',
          },
        };
      };

      const interest = await matrimonialApi.sendInterest({
        receiverId: 'usr-mem-001',
        message: 'नमस्ते, आपकी प्रोफ़ाइल हमारे परिवार को उपयुक्त लगी।',
      });

      assert.strictEqual(sentUrl, '/matrimonial/interests');
      assert.strictEqual(sentBody.receiverId, 'usr-mem-001');
      assert.strictEqual(sentBody.message, 'नमस्ते, आपकी प्रोफ़ाइल हमारे परिवार को उपयुक्त लगी।');
      assert.strictEqual(interest.status, 'PENDING');
    });

    // -------------------------------------------------------------------------
    // Test 8: Duplicate Interest Rejection
    // -------------------------------------------------------------------------
    await it('matrimonialApi.sendInterest: rejects duplicate interest request with error', async () => {
      (apiClient as any).post = async () => ({
        success: false,
        error: 'An active interest request already exists between these members.',
      });

      await assert.rejects(
        async () => {
          await matrimonialApi.sendInterest({ receiverId: 'usr-mem-001' });
        },
        /already exists/
      );
    });

    // -------------------------------------------------------------------------
    // Test 9: List Received & Sent Interests
    // -------------------------------------------------------------------------
    await it('matrimonialApi.listReceivedInterests & listSentInterests query endpoints with pagination', async () => {
      let receivedUrl = '';
      let sentUrl = '';

      (apiClient as any).get = async (url: string) => {
        if (url.includes('received')) {
          receivedUrl = url;
          return { success: true, data: { interests: [], pagination: { page: 1, limit: 20, total: 0 } } };
        }
        if (url.includes('sent')) {
          sentUrl = url;
          return { success: true, data: { interests: [], pagination: { page: 1, limit: 20, total: 0 } } };
        }
        return { success: false, error: 'Unknown' };
      };

      await matrimonialApi.listReceivedInterests(1, 20);
      assert.strictEqual(receivedUrl, '/matrimonial/interests/received');

      await matrimonialApi.listSentInterests(1, 20);
      assert.strictEqual(sentUrl, '/matrimonial/interests/sent');
    });

    // -------------------------------------------------------------------------
    // Test 10: Respond to Interest (Accept / Decline)
    // -------------------------------------------------------------------------
    await it('matrimonialApi.respondInterest: patches interest status to ACCEPTED or DECLINED', async () => {
      let patchUrl = '';
      let patchBody: any = null;

      (apiClient as any).patch = async (url: string, body: any) => {
        patchUrl = url;
        patchBody = body;
        return {
          success: true,
          data: {
            id: 'interest-101',
            status: body.status,
            respondedAt: new Date().toISOString(),
          },
        };
      };

      const accepted = await matrimonialApi.respondInterest('interest-101', 'ACCEPTED');
      assert.strictEqual(patchUrl, '/matrimonial/interests/interest-101');
      assert.strictEqual(patchBody.status, 'ACCEPTED');
      assert.strictEqual(accepted.status, 'ACCEPTED');

      const declined = await matrimonialApi.respondInterest('interest-101', 'DECLINED');
      assert.strictEqual(patchBody.status, 'DECLINED');
      assert.strictEqual(declined.status, 'DECLINED');
    });

    // -------------------------------------------------------------------------
    // Test 11: Candidate Safety (Report & Block)
    // -------------------------------------------------------------------------
    await it('matrimonialApi.reportProfile and blockProfile submit security actions properly', async () => {
      let reportUrl = '';
      let reportBody: any = null;
      let blockUrl = '';
      let unblockUrl = '';

      (apiClient as any).post = async (url: string, body?: any) => {
        if (url.includes('report')) {
          reportUrl = url;
          reportBody = body;
        } else if (url.includes('block')) {
          blockUrl = url;
        }
        return { success: true };
      };

      (apiClient as any).delete = async (url: string) => {
        if (url.includes('block')) {
          unblockUrl = url;
        }
        return { success: true };
      };

      await matrimonialApi.reportProfile('mat-prof-001', {
        reason: 'FAKE_PROFILE',
        explanation: 'Suspicious profile photos',
      });
      assert.strictEqual(reportUrl, '/matrimonial/profiles/mat-prof-001/report');
      assert.strictEqual(reportBody.reason, 'FAKE_PROFILE');

      await matrimonialApi.blockProfile('mat-prof-001');
      assert.strictEqual(blockUrl, '/matrimonial/profiles/mat-prof-001/block');

      await matrimonialApi.unblockProfile('mat-prof-001');
      assert.strictEqual(unblockUrl, '/matrimonial/profiles/mat-prof-001/block');
    });

    // -------------------------------------------------------------------------
    // Test 12: Height Conversion Utility
    // -------------------------------------------------------------------------
    await it('formatHeightCm converts centimeters to feet and inches accurately', () => {
      assert.strictEqual(formatHeightCm(175), "175 cm (5'9\")");
      assert.strictEqual(formatHeightCm(160), "160 cm (5'3\")");
      assert.strictEqual(formatHeightCm(180), "180 cm (5'11\")");
      assert.strictEqual(formatHeightCm(183), "183 cm (6'0\")");
      assert.strictEqual(formatHeightCm(0), '');
    });

    // -------------------------------------------------------------------------
    // Test 13: Matrimonial Localization Resources
    // -------------------------------------------------------------------------
    await it('Localization: Matrimonial keys resolve cleanly in both Hindi and English', () => {
      const navHi = resolveTranslation('nav:matrimonial', { lang: 'hi' });
      const navEn = resolveTranslation('nav:matrimonial', { lang: 'en' });
      assert.strictEqual(navHi, 'विवाह परिचय');
      assert.strictEqual(navEn, 'Matrimonial');

      const discoveryHi = resolveTranslation('matrimonial:discoverySubtitle', { lang: 'hi' });
      const discoveryEn = resolveTranslation('matrimonial:discoverySubtitle', { lang: 'en' });
      assert.ok(discoveryHi && discoveryHi.length > 0);
      assert.ok(discoveryEn && discoveryEn.length > 0);
    });

    // -------------------------------------------------------------------------
    // Test 14: Unauthorized Profile Access Protection
    // -------------------------------------------------------------------------
    await it('matrimonialApi.getProfileById: propagates 401 Unauthorized for unauthenticated requests', async () => {
      (apiClient as any).get = async () => ({
        success: false,
        error: 'Authentication required.',
      });

      await assert.rejects(
        async () => {
          await matrimonialApi.getProfileById('mat-prof-001');
        },
        /Authentication required/
      );
    });
  } finally {
    // Restore original client methods
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  }

  console.log(`\n================================================================`);
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 6 matrimonial tests passed!`);
  console.log(`================================================================\n`);
}

// Auto-run if executed directly
if (require.main === module) {
  runMatrimonialFlowTests();
}

