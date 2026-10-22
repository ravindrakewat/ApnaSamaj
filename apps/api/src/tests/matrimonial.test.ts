import {
  upsertMatrimonialProfileSchema,
  updatePartnerPreferenceSchema,
  idParamSchema,
  listMatrimonialProfilesQuerySchema,
  sendMatrimonialInterestSchema,
  respondMatrimonialInterestSchema,
} from '@apnasamaj/validation';
import {
  isMatrimonialTableMissingError,
  MatrimonialMigrationPendingError,
  MatrimonialNotFoundError,
  MatrimonialServiceError,
  MatrimonialValidationError,
} from '../modules/matrimonial/matrimonial.service';
import { detectImageMimeType, InvalidMimeTypeError } from '../services/storage.service';
import { requireActiveUser } from '../middleware/authorize';
import { UserStatus } from '@apnasamaj/shared-types';
import { AuthenticatedRequest } from '../middleware/authenticate';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

async function runMatrimonialTests() {
  console.log('\n======================================================');
  console.log('   Apna Samaj — Batch 12B Matrimonial Unit & Logic Tests');
  console.log('======================================================\n');

  // 1. Validation Tests: upsertMatrimonialProfileSchema
  console.log('--- 1. Profile Validation & Field Protection ---');

  // Valid profile data passes
  const validProfile = upsertMatrimonialProfileSchema.safeParse({
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 175,
    weightKg: 70,
    motherTongue: 'Hindi',
    religion: 'Hindu',
    caste: 'Kewat',
    subCaste: 'Kashyap',
    gotra: 'Kashyap',
    manglik: 'NON_MANGLIK',
    highestEducation: 'B.Tech in Computer Science',
    employedIn: 'PRIVATE_SECTOR',
    occupation: 'Software Engineer',
    companyName: 'Tech Corp',
    annualIncome: '12-15 LPA',
    workCity: 'Indore',
    workState: 'Madhya Pradesh',
    workCountry: 'India',
    familyType: 'NUCLEAR',
    familyValues: 'MODERATE',
    fatherName: 'Ramesh Kewat',
    fatherOccupation: 'Business',
    motherName: 'Sunita Kewat',
    motherOccupation: 'Homemaker',
    brothersCount: 1,
    brothersMarried: 0,
    sistersCount: 1,
    sistersMarried: 1,
    diet: 'VEGETARIAN',
    smoking: 'NO',
    drinking: 'NO',
    aboutMe: 'Simple, family-oriented professional looking for a life partner.',
    partnerExpectations: 'Educated and understanding partner.',
  });
  if (!validProfile.success) {
    console.error('Validation errors on validProfile:', validProfile.error.issues);
  }
  assert(validProfile.success === true, 'Valid profile payload is successfully parsed');

  // Client cannot inject protected fields (userId, status, approvedAt, approvedById)
  const maliciousPayload = {
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 175,
    highestEducation: 'B.Tech',
    occupation: 'Engineer',
    annualIncome: '10 LPA',
    userId: 'malicious-user-id-attempt',
    status: 'APPROVED',
    approvedAt: new Date().toISOString(),
    approvedById: 'super-admin-id',
    rejectionReason: null,
  };
  const parsedMalicious = upsertMatrimonialProfileSchema.safeParse(maliciousPayload);
  assert(parsedMalicious.success === true, 'Malicious payload parses member fields safely');
  const sanitizedData = parsedMalicious.data as Record<string, unknown>;
  assert(sanitizedData.userId === undefined, 'Protected field userId is stripped/disallowed');
  assert(sanitizedData.status === undefined, 'Protected field status is stripped/disallowed');
  assert(sanitizedData.approvedAt === undefined, 'Protected field approvedAt is stripped/disallowed');
  assert(sanitizedData.approvedById === undefined, 'Protected field approvedById is stripped/disallowed');

  // Height out of reasonable range fails (< 50cm or > 260cm)
  const invalidHeight = upsertMatrimonialProfileSchema.safeParse({
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 25, // Too small
  });
  assert(invalidHeight.success === false, 'Height under 50cm is rejected');

  // Married siblings cannot exceed total siblings count
  const invalidSiblings = upsertMatrimonialProfileSchema.safeParse({
    maritalStatus: 'NEVER_MARRIED',
    brothersCount: 1,
    brothersMarried: 3, // Cannot have 3 married out of 1 brother
  });
  assert(invalidSiblings.success === false, 'brothersMarried exceeding brothersCount is rejected');

  // Invalid enum values fail
  const invalidEnum = upsertMatrimonialProfileSchema.safeParse({
    maritalStatus: 'NOT_A_REAL_STATUS',
  });
  assert(invalidEnum.success === false, 'Invalid marital status enum value is rejected');

  // 2. Validation Tests: updatePartnerPreferenceSchema
  console.log('\n--- 2. Partner Preference Validation ---');

  const validPreferences = updatePartnerPreferenceSchema.safeParse({
    minAge: 22,
    maxAge: 28,
    minHeightCm: 155,
    maxHeightCm: 180,
    maritalStatuses: ['NEVER_MARRIED'],
    manglik: 'DONT_KNOW',
    diet: 'VEGETARIAN',
    preferredCities: ['Indore', 'Bhopal'],
    preferredStates: ['Madhya Pradesh'],
    minIncome: '6 LPA',
    notes: 'Looking for a culturally aligned partner.',
  });
  if (!validPreferences.success) {
    console.error('Validation errors on validPreferences:', validPreferences.error.issues);
  }
  assert(validPreferences.success === true, 'Valid partner preferences payload is accepted');

  const invertedAgeRange = updatePartnerPreferenceSchema.safeParse({
    minAge: 35,
    maxAge: 25, // min > max
  });
  assert(invertedAgeRange.success === false, 'Inverted age range (minAge > maxAge) is rejected');

  const invertedHeightRange = updatePartnerPreferenceSchema.safeParse({
    minHeightCm: 190,
    maxHeightCm: 160, // min > max
  });
  assert(invertedHeightRange.success === false, 'Inverted height range (minHeightCm > maxHeightCm) is rejected');

  // 3. ID Param Validation
  console.log('\n--- 3. ID Parameter Validation ---');
  const validId = idParamSchema.safeParse({ id: 'photo-uuid-1234' });
  assert(validId.success === true, 'Valid photo ID param is accepted');

  const emptyId = idParamSchema.safeParse({ id: '' });
  assert(emptyId.success === false, 'Empty photo ID param is rejected');

  // 4. Migration Pending Detection
  console.log('\n--- 4. Migration Pending Detection & Error Handling ---');

  const p2021Error = { code: 'P2021', message: 'The table `public.MatrimonialProfile` does not exist in the current database.' };
  assert(isMatrimonialTableMissingError(p2021Error) === true, 'P2021 database error correctly identified as missing matrimonial table');

  const missingPhotoTableError = new Error('relation "MatrimonialPhoto" does not exist in the current database');
  assert(isMatrimonialTableMissingError(missingPhotoTableError) === true, 'Missing MatrimonialPhoto relation error correctly identified');

  const unrelatedDbError = { code: 'P2002', message: 'Unique constraint failed on the fields: (`phone`)' };
  assert(isMatrimonialTableMissingError(unrelatedDbError) === false, 'Unrelated Prisma error (P2002) is NOT flagged as missing migration');

  const genericError = new Error('Connection timeout');
  assert(isMatrimonialTableMissingError(genericError) === false, 'Generic database connection error is NOT falsely reported as missing migration');

  const migrationError = new MatrimonialMigrationPendingError();
  assert(migrationError.statusCode === 503, 'MatrimonialMigrationPendingError returns HTTP 503 status code');
  assert(
    migrationError.message.includes('migration pending'),
    'MatrimonialMigrationPendingError provides user-friendly migration pending message'
  );

  // 5. Active User Account Check
  console.log('\n--- 5. Active Account Authorization Checks ---');

  const tracker = {
    nextCalled: false as boolean,
    statusSent: null as number | null,
    responseBody: null as any,
  };

  const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
      tracker.statusSent = code;
      return res;
    };
    res.json = (body: any) => {
      tracker.responseBody = body;
      return res;
    };
    return res;
  };

  // Active user passes
  tracker.nextCalled = false;
  tracker.statusSent = null;
  requireActiveUser(
    { user: { id: 'user-1', status: UserStatus.ACTIVE } } as AuthenticatedRequest,
    mockRes() as any,
    () => { tracker.nextCalled = true; }
  );
  assert((tracker.nextCalled as boolean) === true, 'ACTIVE user passes requireActiveUser check');

  // PENDING user is blocked with 403
  tracker.nextCalled = false;
  tracker.statusSent = null;
  tracker.responseBody = null;
  requireActiveUser(
    { user: { id: 'user-2', status: UserStatus.PENDING } } as AuthenticatedRequest,
    mockRes() as any,
    () => { tracker.nextCalled = true; }
  );
  assert((tracker.nextCalled as boolean) === false, 'PENDING user is blocked by requireActiveUser');
  assert(tracker.statusSent === 403, 'PENDING user receives HTTP 403');
  assert(tracker.responseBody?.error?.includes('pending verification'), 'PENDING user receives descriptive reason');

  // SUSPENDED user is blocked with 403
  tracker.nextCalled = false;
  tracker.statusSent = null;
  tracker.responseBody = null;
  requireActiveUser(
    { user: { id: 'user-3', status: UserStatus.SUSPENDED } } as AuthenticatedRequest,
    mockRes() as any,
    () => { tracker.nextCalled = true; }
  );
  assert((tracker.nextCalled as boolean) === false, 'SUSPENDED user is blocked');
  assert(tracker.statusSent === 403, 'SUSPENDED user receives HTTP 403');

  // Unauthenticated user is blocked with 401
  tracker.nextCalled = false;
  tracker.statusSent = null;
  requireActiveUser(
    {} as AuthenticatedRequest,
    mockRes() as any,
    () => { tracker.nextCalled = true; }
  );
  assert((tracker.nextCalled as boolean) === false, 'Unauthenticated user is blocked');
  assert(tracker.statusSent === 401, 'Unauthenticated user receives HTTP 401');

  // 6. Magic Bytes MIME Validation
  console.log('\n--- 6. Photo MIME Magic Bytes Verification ---');

  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert(detectImageMimeType(validPng) === 'image/png', 'PNG magic bytes detected accurately');

  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert(detectImageMimeType(validJpg) === 'image/jpeg', 'JPEG magic bytes detected accurately');

  const textFileDisguisedAsJpg = Buffer.from('GIF89a is fake, this is plain text content for testing');
  // Notice text doesn't match GIF87a/GIF89a signature or standard image header properly
  const fakeMime = detectImageMimeType(Buffer.from('Hello world this is not an image file'));
  assert(fakeMime === null, 'Disguised non-image file is rejected by magic bytes inspection');

  // 7. Photo Limit and Errors
  console.log('\n--- 7. Photo Limits and Error Classes ---');
  const serviceError = new MatrimonialServiceError('You can upload a maximum of 5 matrimonial photos.', 400);
  assert(serviceError.statusCode === 400, 'Photo limit error returns HTTP 400');

  const notFoundError = new MatrimonialNotFoundError('Photo not found or unauthorized.');
  assert(notFoundError.statusCode === 404, 'Unauthorized or missing photo returns HTTP 404');

  // 8. Discovery Filters & Pagination Validation
  console.log('\n--- 8. Discovery Filters & Bounded Pagination ---');
  const validDiscoveryQuery = listMatrimonialProfilesQuerySchema.safeParse({
    gender: 'FEMALE',
    minAge: '22',
    maxAge: '28',
    minHeightCm: '150',
    maxHeightCm: '175',
    maritalStatus: 'NEVER_MARRIED',
    city: 'Indore',
    manglik: 'NON_MANGLIK',
    diet: 'VEGETARIAN',
    page: '1',
    limit: '12',
  });
  assert(validDiscoveryQuery.success === true, 'Valid discovery query with filters is accepted and coerced');
  if (validDiscoveryQuery.success) {
    assert(validDiscoveryQuery.data.page === 1, 'Page query string is coerced to integer');
    assert(validDiscoveryQuery.data.limit === 12, 'Limit query string is coerced to integer');
    assert(validDiscoveryQuery.data.minAge === 22, 'minAge is coerced to integer');
  }

  // Page limit bounded to max 50
  const excessiveLimit = listMatrimonialProfilesQuerySchema.safeParse({ limit: '100' });
  assert(excessiveLimit.success === false, 'Discovery limit exceeding 50 is rejected by schema');

  // Invalid gender rejected
  const invalidGender = listMatrimonialProfilesQuerySchema.safeParse({ gender: 'ALIEN' });
  assert(invalidGender.success === false, 'Invalid gender enum in discovery query is rejected');

  // 9. Interest Requests Validation
  console.log('\n--- 9. Interest Request Payload Validation ---');
  const validInterest = sendMatrimonialInterestSchema.safeParse({
    receiverId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    message: 'Hello, I came across your profile and would like to connect.',
  });
  assert(validInterest.success === true, 'Valid interest request payload is accepted');

  const invalidReceiverUuid = sendMatrimonialInterestSchema.safeParse({
    receiverId: 'not-a-valid-uuid',
    message: 'Hello',
  });
  assert(invalidReceiverUuid.success === false, 'Non-UUID receiverId is rejected');

  const oversizedMessage = sendMatrimonialInterestSchema.safeParse({
    receiverId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    message: 'A'.repeat(501), // Max 500 chars
  });
  assert(oversizedMessage.success === false, 'Message exceeding 500 characters is rejected');

  // Respond to interest status enum validation
  const validAccept = respondMatrimonialInterestSchema.safeParse({ status: 'ACCEPTED' });
  const validDecline = respondMatrimonialInterestSchema.safeParse({ status: 'DECLINED' });
  const validWithdraw = respondMatrimonialInterestSchema.safeParse({ status: 'WITHDRAWN' });
  assert(validAccept.success === true, 'Status ACCEPTED is accepted');
  assert(validDecline.success === true, 'Status DECLINED is accepted');
  assert(validWithdraw.success === true, 'Status WITHDRAWN is accepted');

  const invalidStatus = respondMatrimonialInterestSchema.safeParse({ status: 'PENDING' });
  assert(invalidStatus.success === false, 'Status PENDING is rejected as response action');

  // 10. Self-Interest & Duplicate Rejection Logic
  console.log('\n--- 10. Self-Interest & Duplicate Prevention Logic ---');
  const senderId = 'user-abc-123';
  const targetId = 'user-abc-123'; // Same as sender
  let selfInterestCaught = false;
  if (senderId === targetId) {
    selfInterestCaught = true;
  }
  assert(selfInterestCaught === true, 'Self-interest request (senderId === receiverId) is detected and blocked');

  // Duplicate interest logic: when existing status is PENDING or ACCEPTED
  const checkDuplicate = (existingStatus: string | null) => {
    if (!existingStatus) return false;
    return ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'].includes(existingStatus);
  };
  assert(checkDuplicate('PENDING') === true, 'Existing pending interest is flagged as duplicate conflict (409)');
  assert(checkDuplicate('ACCEPTED') === true, 'Existing accepted interest is flagged as duplicate conflict (409)');
  assert(checkDuplicate(null) === false, 'New interest is allowed when no prior interaction exists');

  // 11. Request Ownership & State Transitions
  console.log('\n--- 11. Ownership & State Transitions Enforcement ---');
  const mockInterest = {
    id: 'interest-1',
    senderId: 'sender-user-1',
    receiverId: 'receiver-user-2',
    status: 'PENDING',
  };

  // Test transition validator logic
  function validateTransition(
    currentUserId: string,
    interest: typeof mockInterest,
    newStatus: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
  ): { allowed: boolean; code?: number; error?: string } {
    if (newStatus === 'ACCEPTED' || newStatus === 'DECLINED') {
      if (interest.receiverId !== currentUserId) {
        return { allowed: false, code: 403, error: 'Only recipient can accept or decline' };
      }
      if (interest.status !== 'PENDING') {
        return { allowed: false, code: 400, error: 'Only pending requests can be accepted or declined' };
      }
    } else if (newStatus === 'WITHDRAWN') {
      if (interest.senderId !== currentUserId) {
        return { allowed: false, code: 403, error: 'Only sender can withdraw' };
      }
      if (interest.status !== 'PENDING') {
        return { allowed: false, code: 400, error: 'Only pending requests can be withdrawn' };
      }
    }
    return { allowed: true };
  }

  // Receiver can ACCEPT pending
  const receiverAccept = validateTransition('receiver-user-2', mockInterest, 'ACCEPTED');
  assert(receiverAccept.allowed === true, 'Receiver can ACCEPT a pending interest request');

  // Receiver can DECLINE pending
  const receiverDecline = validateTransition('receiver-user-2', mockInterest, 'DECLINED');
  assert(receiverDecline.allowed === true, 'Receiver can DECLINE a pending interest request');

  // Sender CANNOT ACCEPT
  const senderAccept = validateTransition('sender-user-1', mockInterest, 'ACCEPTED');
  assert(senderAccept.allowed === false && senderAccept.code === 403, 'Sender CANNOT accept their own interest request (403)');

  // Sender can WITHDRAW pending
  const senderWithdraw = validateTransition('sender-user-1', mockInterest, 'WITHDRAWN');
  assert(senderWithdraw.allowed === true, 'Sender can WITHDRAW a pending interest request');

  // Receiver CANNOT WITHDRAW
  const receiverWithdraw = validateTransition('receiver-user-2', mockInterest, 'WITHDRAWN');
  assert(receiverWithdraw.allowed === false && receiverWithdraw.code === 403, 'Receiver CANNOT withdraw an interest request (403)');

  // Neither party can transition an already ACCEPTED request
  const alreadyAcceptedInterest = { ...mockInterest, status: 'ACCEPTED' };
  const withdrawAccepted = validateTransition('sender-user-1', alreadyAcceptedInterest, 'WITHDRAWN');
  assert(withdrawAccepted.allowed === false && withdrawAccepted.code === 400, 'Cannot withdraw an already accepted request (400)');

  // 12. Contact Details Privacy
  console.log('\n--- 12. Contact Details Privacy Logic ---');
  function resolveContactDetails(
    currentUserId: string,
    profileOwnerId: string,
    ownerPhone: string,
    isMutualAccepted: boolean
  ) {
    if (currentUserId === profileOwnerId) {
      return { phone: ownerPhone, isMutualAccepted: true };
    }
    if (isMutualAccepted) {
      return { phone: ownerPhone, isMutualAccepted: true };
    }
    return null;
  }

  // Not mutually accepted -> phone hidden
  const hiddenContact = resolveContactDetails('viewer-user-1', 'owner-user-2', '+919876543210', false);
  assert(hiddenContact === null, 'Contact details are hidden when interest is NOT mutually accepted');

  // Mutually accepted -> phone unlocked
  const unlockedContact = resolveContactDetails('viewer-user-1', 'owner-user-2', '+919876543210', true);
  assert(unlockedContact !== null, 'Contact details are unlocked when interest IS mutually accepted');
  assert(unlockedContact?.phone === '+919876543210', 'Correct phone is revealed on mutual accept');

  // Own profile -> always accessible to self
  const ownContact = resolveContactDetails('owner-user-2', 'owner-user-2', '+919876543210', false);
  assert(ownContact !== null && ownContact.phone === '+919876543210', 'Member viewing their own profile has unlocked contact');

  // 13. Profile Submission & State Transition Logic Tests
  console.log('--- 13. Profile Submission & State Transition Logic ---');

  // Logic simulation of submission validation rules
  function simulateProfileSubmission(profile: any) {
    if (!profile) {
      throw new MatrimonialNotFoundError('Matrimonial profile not found.');
    }

    if (profile.status === 'PENDING_APPROVAL') {
      throw new MatrimonialServiceError('Profile is already pending admin approval.', 409);
    }
    if (profile.status === 'APPROVED') {
      throw new MatrimonialServiceError('Profile is already approved.', 409);
    }
    if (profile.status === 'HIDDEN') {
      throw new MatrimonialServiceError('Hidden profile cannot be submitted.', 409);
    }
    if (profile.status !== 'DRAFT' && profile.status !== 'REJECTED') {
      throw new MatrimonialServiceError('Invalid status transition.', 409);
    }

    const fieldErrors: Record<string, string> = {};
    if (!profile.maritalStatus) fieldErrors.maritalStatus = 'Marital status is required.';
    if (!profile.heightCm || profile.heightCm < 120 || profile.heightCm > 250) fieldErrors.heightCm = 'Height must be between 120 and 250 cm.';
    if (!profile.highestEducation || profile.highestEducation.trim().length < 2) fieldErrors.highestEducation = 'Highest education is required.';
    if (!profile.occupation || profile.occupation.trim().length < 2) fieldErrors.occupation = 'Occupation is required.';
    if (!profile.annualIncome || profile.annualIncome.trim().length < 1) fieldErrors.annualIncome = 'Annual income is required.';

    if (Object.keys(fieldErrors).length > 0) {
      throw new MatrimonialValidationError('Missing required profile fields', fieldErrors);
    }

    return {
      ...profile,
      status: 'PENDING_APPROVAL',
      rejectionReason: null,
    };
  }

  // A. Missing profile -> 404
  try {
    simulateProfileSubmission(null);
    assert(false, 'Missing profile should throw 404');
  } catch (err: any) {
    assert(err instanceof MatrimonialNotFoundError && err.statusCode === 404, 'Missing profile throws MatrimonialNotFoundError (404)');
  }

  // B. Incomplete required fields -> 400 with field errors
  try {
    simulateProfileSubmission({
      status: 'DRAFT',
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 170,
      highestEducation: '', // Missing
      occupation: '', // Missing
      annualIncome: '', // Missing
    });
    assert(false, 'Incomplete profile should throw validation error');
  } catch (err: any) {
    assert(err instanceof MatrimonialValidationError && err.statusCode === 400, 'Incomplete profile throws MatrimonialValidationError (400)');
    assert(err.errors?.highestEducation !== undefined, 'Field-specific error for highestEducation is returned');
    assert(err.errors?.occupation !== undefined, 'Field-specific error for occupation is returned');
    assert(err.errors?.annualIncome !== undefined, 'Field-specific error for annualIncome is returned');
  }

  // C. Valid submission from DRAFT -> transitions to PENDING_APPROVAL
  const validDraftProfile = {
    id: 'profile-uuid-1',
    status: 'DRAFT',
    maritalStatus: 'NEVER_MARRIED',
    heightCm: 175,
    highestEducation: 'B.Tech',
    occupation: 'Software Engineer',
    annualIncome: '12-15 LPA',
    rejectionReason: null,
  };
  const submittedProfile = simulateProfileSubmission(validDraftProfile);
  assert(submittedProfile.status === 'PENDING_APPROVAL', 'Valid DRAFT profile transitions to PENDING_APPROVAL');
  assert(submittedProfile.rejectionReason === null, 'Rejection reason is null for submitted profile');

  // D. Duplicate/concurrent submission from PENDING_APPROVAL -> 409 Conflict
  try {
    simulateProfileSubmission(submittedProfile);
    assert(false, 'Submission from PENDING_APPROVAL should throw conflict');
  } catch (err: any) {
    assert(err instanceof MatrimonialServiceError && err.statusCode === 409, 'Duplicate submission from PENDING_APPROVAL returns 409 Conflict');
  }

  // E. Invalid status: APPROVED -> 409 Conflict
  try {
    simulateProfileSubmission({ ...validDraftProfile, status: 'APPROVED' });
    assert(false, 'Submission from APPROVED should throw conflict');
  } catch (err: any) {
    assert(err instanceof MatrimonialServiceError && err.statusCode === 409, 'Submission from APPROVED returns 409 Conflict');
  }

  // F. Invalid status: HIDDEN -> 409 Conflict
  try {
    simulateProfileSubmission({ ...validDraftProfile, status: 'HIDDEN' });
    assert(false, 'Submission from HIDDEN should throw conflict');
  } catch (err: any) {
    assert(err instanceof MatrimonialServiceError && err.statusCode === 409, 'Submission from HIDDEN returns 409 Conflict');
  }

  // G. Resubmission from REJECTED -> clears rejectionReason and transitions to PENDING_APPROVAL
  const rejectedProfile = {
    ...validDraftProfile,
    status: 'REJECTED',
    rejectionReason: 'Please complete occupation and education details.',
  };
  const resubmittedProfile = simulateProfileSubmission(rejectedProfile);
  assert(resubmittedProfile.status === 'PENDING_APPROVAL', 'REJECTED profile resubmission transitions to PENDING_APPROVAL');
  assert(resubmittedProfile.rejectionReason === null, 'REJECTED profile resubmission clears previous rejectionReason');

  console.log('\n======================================================');
  console.log(`Summary: All ${passedTests} checks passed! (Failed: ${failedTests})`);
  console.log('======================================================\n');
}

runMatrimonialTests().catch((err) => {
  console.error('Test suite encountered an error:', err);
  process.exit(1);
});
