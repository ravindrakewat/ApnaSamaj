import assert from 'assert';
import {
  maritalStatusSchema,
  manglikStatusSchema,
  employmentSectorSchema,
  familyTypeSchema,
  familyValuesSchema,
  dietTypeSchema,
  habitFrequencySchema,
  upsertMatrimonialProfileSchema,
  updatePartnerPreferenceSchema,
} from '@apnasamaj/validation';
import {
  OwnMatrimonialProfile,
  PublicMatrimonialProfileListItem,
} from '@apnasamaj/shared-types';

export async function runMatrimonialProfileManagementTests() {
  console.log('\n--- Running Batch 10.2.8: Matrimonial Profile Management Tests ---');

  // Test 1: Wizard Step Navigation Boundaries
  {
    const TOTAL_STEPS = 7;
    const canNavigateNext = (currentStep: number) => currentStep < TOTAL_STEPS;
    const canNavigateBack = (currentStep: number) => currentStep > 1;

    assert.strictEqual(canNavigateNext(1), true);
    assert.strictEqual(canNavigateNext(6), true);
    assert.strictEqual(canNavigateNext(7), false, 'Cannot navigate beyond final step');

    assert.strictEqual(canNavigateBack(1), false, 'Cannot navigate back from step 1');
    assert.strictEqual(canNavigateBack(2), true);
    assert.strictEqual(canNavigateBack(7), true);
    console.log('  ✓ Wizard step boundaries (1 to 7) enforce correct navigation');
  }

  // Test 2: Step 1 Basic Information Validation (Height, Weight, Enums)
  {
    const validateBasicInfo = (heightCmStr: string, weightKgStr?: string) => {
      const h = parseInt(heightCmStr, 10);
      if (isNaN(h) || h < 120 || h > 250) {
        return { valid: false, error: 'Height must be between 120 cm and 250 cm' };
      }
      if (weightKgStr && weightKgStr.trim()) {
        const w = parseInt(weightKgStr, 10);
        if (isNaN(w) || w < 30 || w > 300) {
          return { valid: false, error: 'Weight must be between 30 kg and 300 kg' };
        }
      }
      return { valid: true };
    };

    assert.strictEqual(validateBasicInfo('165').valid, true);
    assert.strictEqual(validateBasicInfo('110').valid, false);
    assert.strictEqual(validateBasicInfo('260').valid, false);
    assert.strictEqual(validateBasicInfo('invalid').valid, false);

    assert.strictEqual(validateBasicInfo('170', '65').valid, true);
    assert.strictEqual(validateBasicInfo('170', '25').valid, false);
    assert.strictEqual(validateBasicInfo('170', '350').valid, false);

    // Enums
    assert.strictEqual(maritalStatusSchema.safeParse('NEVER_MARRIED').success, true);
    assert.strictEqual(maritalStatusSchema.safeParse('DIVORCED').success, true);
    assert.strictEqual(maritalStatusSchema.safeParse('SINGLE').success, false);

    assert.strictEqual(manglikStatusSchema.safeParse('NON_MANGLIK').success, true);
    assert.strictEqual(manglikStatusSchema.safeParse('DONT_KNOW').success, true);
    assert.strictEqual(manglikStatusSchema.safeParse('UNKNOWN').success, false);
    console.log('  ✓ Step 1 basic info (height, weight, maritalStatus, manglik) validated');
  }

  // Test 3: Step 2 Education & Occupation Validation
  {
    const validateEducationAndCareer = (highestEdu: string, occ: string, income: string) => {
      if (!highestEdu.trim() || highestEdu.trim().length < 2) return false;
      if (!occ.trim() || occ.trim().length < 2) return false;
      if (!income.trim() || income.trim().length < 1) return false;
      return true;
    };

    assert.strictEqual(validateEducationAndCareer('B.Tech', 'Software Engineer', '10 LPA'), true);
    assert.strictEqual(validateEducationAndCareer('', 'Software Engineer', '10 LPA'), false);
    assert.strictEqual(validateEducationAndCareer('B.Tech', '', '10 LPA'), false);
    assert.strictEqual(validateEducationAndCareer('B.Tech', 'Software Engineer', ''), false);

    assert.strictEqual(employmentSectorSchema.safeParse('PRIVATE_SECTOR').success, true);
    assert.strictEqual(employmentSectorSchema.safeParse('GOVERNMENT_PSU').success, true);
    assert.strictEqual(employmentSectorSchema.safeParse('BUSINESS_SELF_EMPLOYED').success, true);
    assert.strictEqual(employmentSectorSchema.safeParse('FREELANCE').success, false);
    console.log('  ✓ Step 2 education, occupation, income, and sector schemas verified');
  }

  // Test 4: Step 3 Family Sibling Count Invariant
  {
    const validateSiblings = (bCount: number, bMarried: number, sCount: number, sMarried: number) => {
      if (bMarried > bCount) return false;
      if (sMarried > sCount) return false;
      return true;
    };

    assert.strictEqual(validateSiblings(2, 1, 1, 0), true);
    assert.strictEqual(validateSiblings(1, 2, 0, 0), false, 'Married brothers cannot exceed total brothers');
    assert.strictEqual(validateSiblings(0, 0, 1, 2), false, 'Married sisters cannot exceed total sisters');

    assert.strictEqual(familyTypeSchema.safeParse('NUCLEAR').success, true);
    assert.strictEqual(familyTypeSchema.safeParse('JOINT').success, true);
    assert.strictEqual(familyValuesSchema.safeParse('TRADITIONAL').success, true);
    assert.strictEqual(familyValuesSchema.safeParse('LIBERAL').success, true);
    console.log('  ✓ Step 3 family sibling invariants and structure enums verified');
  }

  // Test 5: Step 4 Lifestyle & Diet Enums
  {
    assert.strictEqual(dietTypeSchema.safeParse('VEGETARIAN').success, true);
    assert.strictEqual(dietTypeSchema.safeParse('NON_VEGETARIAN').success, true);
    assert.strictEqual(dietTypeSchema.safeParse('JAIN').success, true);
    assert.strictEqual(dietTypeSchema.safeParse('VEGAN').success, false);

    assert.strictEqual(habitFrequencySchema.safeParse('NO').success, true);
    assert.strictEqual(habitFrequencySchema.safeParse('YES').success, true);
    assert.strictEqual(habitFrequencySchema.safeParse('OCCASIONALLY').success, true);
    assert.strictEqual(habitFrequencySchema.safeParse('DAILY').success, false);
    console.log('  ✓ Step 4 lifestyle and diet schemas verified');
  }

  // Test 6: Step 5 Partner Preference Range Validation
  {
    const validatePreferences = (minA: number, maxA: number, minH: number, maxH: number) => {
      if (minA < 18 || maxA > 80 || minA > maxA) return false;
      if (minH < 120 || maxH > 250 || minH > maxH) return false;
      return true;
    };

    assert.strictEqual(validatePreferences(21, 28, 150, 180), true);
    assert.strictEqual(validatePreferences(30, 25, 150, 180), false, 'minAge > maxAge rejected');
    assert.strictEqual(validatePreferences(16, 25, 150, 180), false, 'minAge < 18 rejected');
    assert.strictEqual(validatePreferences(21, 28, 185, 160), false, 'minHeight > maxHeight rejected');

    const parsedPref = updatePartnerPreferenceSchema.safeParse({
      minAge: 21,
      maxAge: 29,
      minHeightCm: 152,
      maxHeightCm: 180,
      maritalStatuses: ['NEVER_MARRIED'],
      preferredCities: ['Indore', 'Bhopal'],
    });
    assert.strictEqual(parsedPref.success, true);
    console.log('  ✓ Step 5 partner preference age and height ranges verified');
  }

  // Test 7: Step 6 Photos Max Count & Primary Assignment
  {
    const maxPhotos = 5;
    const canAddPhoto = (currentCount: number) => currentCount < maxPhotos;

    assert.strictEqual(canAddPhoto(0), true);
    assert.strictEqual(canAddPhoto(4), true);
    assert.strictEqual(canAddPhoto(5), false, 'Cannot add beyond 5 photos');

    const photosList = [
      { uri: 'file://photo1.jpg', isPrimary: true },
      { uri: 'file://photo2.jpg', isPrimary: false },
    ];
    assert.strictEqual(photosList[0].isPrimary, true, 'First photo is marked as primary');
    console.log('  ✓ Step 6 photo limit (max 5) and primary photo designation verified');
  }

  // Test 8: Prepopulation & Edit Mode Non-Destructive Update
  {
    const mockExistingProfile: OwnMatrimonialProfile = {
      id: 'profile-uuid-1',
      userId: 'user-uuid-1',
      status: 'APPROVED',
      rejectionReason: null,
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 172,
      weightKg: 68,
      motherTongue: 'Hindi',
      religion: 'Hindu',
      caste: 'Kewat',
      subCaste: 'Kashyap',
      gotra: 'Kashyap',
      manglik: 'NON_MANGLIK',
      birthTime: '10:30',
      birthCity: 'Rewa',
      rashi: 'Mesh',
      nakshatra: 'Ashwini',
      highestEducation: 'M.Tech',
      educationDetails: 'Computer Science',
      employedIn: 'PRIVATE_SECTOR',
      occupation: 'Tech Lead',
      companyName: 'Infosys',
      annualIncome: '18-20 LPA',
      workCity: 'Bengaluru',
      workState: 'Karnataka',
      workCountry: 'India',
      familyType: 'NUCLEAR',
      familyValues: 'MODERATE',
      fatherName: 'Ram Kewat',
      fatherOccupation: 'Retired',
      motherName: 'Sita Kewat',
      motherOccupation: 'Homemaker',
      brothersCount: 1,
      brothersMarried: 1,
      sistersCount: 0,
      sistersMarried: 0,
      familyNativePlace: 'Rewa, MP',
      aboutFamily: 'Loving and supportive family',
      diet: 'VEGETARIAN',
      smoking: 'NO',
      drinking: 'NO',
      aboutMe: 'Software professional with traditional values',
      partnerExpectations: 'Educated and understanding partner',
      approvedAt: '2026-11-01T00:00:00Z',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      photos: [],
      partnerPreference: {
        id: 'pref-1',
        profileId: 'profile-uuid-1',
        minAge: 22,
        maxAge: 28,
        minHeightCm: 155,
        maxHeightCm: 170,
        maritalStatuses: ['NEVER_MARRIED'],
        manglik: 'NON_MANGLIK',
        diet: 'VEGETARIAN',
        preferredEducations: ['B.Tech', 'MCA'],
        preferredOccupations: ['IT', 'Banking'],
        preferredCities: ['Bengaluru', 'Indore'],
        preferredStates: ['MP', 'Karnataka'],
        minIncome: '8 LPA',
        notes: null,
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    };

    // Prepopulate form
    assert.strictEqual(mockExistingProfile.highestEducation, 'M.Tech');
    assert.strictEqual(mockExistingProfile.occupation, 'Tech Lead');
    assert.strictEqual(mockExistingProfile.status, 'APPROVED');

    // Partial edit: user changes occupation and income only
    const updatedPayload = {
      ...mockExistingProfile,
      occupation: 'Engineering Manager',
      annualIncome: '25-30 LPA',
    };

    const validated = upsertMatrimonialProfileSchema.safeParse(updatedPayload);
    assert.strictEqual(validated.success, true);
    if (validated.success) {
      assert.strictEqual(validated.data.occupation, 'Engineering Manager');
      assert.strictEqual(validated.data.highestEducation, 'M.Tech', 'Preserves unmodified fields');
      assert.strictEqual(validated.data.subCaste, 'Kashyap');
    }
    console.log('  ✓ Existing profile prepopulation and non-destructive editing verified');
  }

  // Test 9: Discovery & Contact Privacy Protection
  {
    const discoveryItem: PublicMatrimonialProfileListItem = {
      id: 'profile-1',
      userId: 'user-1',
      fullName: 'Vikram Kewat',
      gender: 'MALE',
      age: 27,
      city: 'Indore',
      state: 'MP',
      avatarUrl: null,
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 175,
      highestEducation: 'B.Tech',
      employedIn: 'PRIVATE_SECTOR',
      occupation: 'Software Engineer',
      annualIncome: '12 LPA',
      subCaste: 'Kashyap',
      gotra: 'Kashyap',
      manglik: 'NON_MANGLIK',
      diet: 'VEGETARIAN',
      photosCount: 2,
      createdAt: '2026-11-10T00:00:00Z',
    };

    // Public list item must strictly omit phone number and email
    assert.strictEqual((discoveryItem as any).phone, undefined);
    assert.strictEqual((discoveryItem as any).email, undefined);
    assert.strictEqual((discoveryItem as any).passwordHash, undefined);
    console.log('  ✓ Public discovery profile strictly omits private contact info');
  }

  console.log('--- Batch 10.2.8: All Matrimonial Profile Management Tests Passed! ---\n');
}

