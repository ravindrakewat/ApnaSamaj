import { Gender } from './user';

/**
 * Moderation and publication status for a member's matrimonial profile.
 */
export type MatrimonialProfileStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'HIDDEN';

/**
 * Marital status options.
 */
export type MaritalStatus =
  | 'NEVER_MARRIED'
  | 'DIVORCED'
  | 'WIDOWED'
  | 'AWAITING_DIVORCE';

/**
 * Astrological Manglik dosha status.
 */
export type ManglikStatus =
  | 'MANGLIK'
  | 'NON_MANGLIK'
  | 'ANSHIK'
  | 'DONT_KNOW';

/**
 * Employment and industry sector.
 */
export type EmploymentSector =
  | 'PRIVATE_SECTOR'
  | 'GOVERNMENT_PSU'
  | 'BUSINESS_SELF_EMPLOYED'
  | 'DEFENSE'
  | 'NOT_WORKING';

/**
 * Family structure and household type.
 */
export type FamilyType = 'NUCLEAR' | 'JOINT';

/**
 * Family culture and outlook.
 */
export type FamilyValues = 'TRADITIONAL' | 'MODERATE' | 'LIBERAL';

/**
 * Dietary preference.
 */
export type DietType = 'VEGETARIAN' | 'NON_VEGETARIAN' | 'EGGETARIAN' | 'JAIN';

/**
 * Habit frequency (smoking, drinking).
 */
export type HabitFrequency = 'NO' | 'YES' | 'OCCASIONALLY';

/**
 * Status of an expressed interest / connection request.
 */
export type MatrimonialInterestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'WITHDRAWN';

/**
 * Representation of a matrimonial gallery photo.
 */
export interface MatrimonialPhotoItem {
  id: string;
  profileId: string;
  url: string;
  order: number;
  isPrimary: boolean;
  isApproved: boolean;
  createdAt: string;
}

/**
 * Partner preferences configured by a member.
 */
export interface MatrimonialPartnerPreferenceItem {
  id: string;
  profileId: string;
  minAge: number;
  maxAge: number;
  minHeightCm: number;
  maxHeightCm: number;
  maritalStatuses: MaritalStatus[];
  manglik: ManglikStatus | null;
  diet: DietType | null;
  preferredEducations: string[];
  preferredOccupations: string[];
  preferredCities: string[];
  preferredStates: string[];
  minIncome: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public, privacy-safe summary of a matrimonial profile for discovery and search cards.
 * Excludes all private contact info (phone, email, full residential address).
 */
export interface PublicMatrimonialProfileListItem {
  id: string;
  userId: string;
  fullName: string;
  gender: Gender | null;
  age: number | null;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  maritalStatus: MaritalStatus;
  heightCm: number;
  highestEducation: string;
  employedIn: EmploymentSector;
  occupation: string;
  annualIncome: string;
  subCaste: string | null;
  gotra: string | null;
  manglik: ManglikStatus;
  diet: DietType;
  photosCount: number;
  interestStatus?: MatrimonialInterestStatus | null;
  createdAt: string;
}

/**
 * Public, privacy-safe detailed view of a matrimonial profile.
 * Contact details are omitted unless an interest request has been mutually accepted.
 */
export interface PublicMatrimonialProfileDetail extends PublicMatrimonialProfileListItem {
  photos: MatrimonialPhotoItem[];
  partnerPreference: MatrimonialPartnerPreferenceItem | null;
  weightKg: number | null;
  motherTongue: string;
  religion: string;
  caste: string | null;
  birthTime: string | null;
  birthCity: string | null;
  rashi: string | null;
  nakshatra: string | null;
  educationDetails: string | null;
  companyName: string | null;
  workCity: string | null;
  workState: string | null;
  workCountry: string;
  familyType: FamilyType;
  familyValues: FamilyValues;
  fatherName: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherOccupation: string | null;
  brothersCount: number;
  brothersMarried: number;
  sistersCount: number;
  sistersMarried: number;
  familyNativePlace: string | null;
  aboutFamily: string | null;
  smoking: HabitFrequency;
  drinking: HabitFrequency;
  aboutMe: string | null;
  partnerExpectations: string | null;
  unlockedContact?: {
    phone: string;
    isMutualAccepted: boolean;
  } | null;
}

/**
 * Full matrimonial profile of the current authenticated user (own profile management).
 */
export interface OwnMatrimonialProfile {
  id: string;
  userId: string;
  status: MatrimonialProfileStatus;
  rejectionReason: string | null;
  maritalStatus: MaritalStatus;
  heightCm: number;
  weightKg: number | null;
  motherTongue: string;
  religion: string;
  caste: string | null;
  subCaste: string | null;
  gotra: string | null;
  manglik: ManglikStatus;
  birthTime: string | null;
  birthCity: string | null;
  rashi: string | null;
  nakshatra: string | null;
  highestEducation: string;
  educationDetails: string | null;
  employedIn: EmploymentSector;
  occupation: string;
  companyName: string | null;
  annualIncome: string;
  workCity: string | null;
  workState: string | null;
  workCountry: string;
  familyType: FamilyType;
  familyValues: FamilyValues;
  fatherName: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherOccupation: string | null;
  brothersCount: number;
  brothersMarried: number;
  sistersCount: number;
  sistersMarried: number;
  familyNativePlace: string | null;
  aboutFamily: string | null;
  diet: DietType;
  smoking: HabitFrequency;
  drinking: HabitFrequency;
  aboutMe: string | null;
  partnerExpectations: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: MatrimonialPhotoItem[];
  partnerPreference: MatrimonialPartnerPreferenceItem | null;
}

/**
 * Representation of a connection / interest request between two members.
 */
export interface MatrimonialInterestItem {
  id: string;
  senderId: string;
  receiverId: string;
  status: MatrimonialInterestStatus;
  message: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  otherPartyProfile?: PublicMatrimonialProfileListItem | null;
}

/**
 * Paginated matrimonial search & discovery response shape.
 */
export interface PaginatedMatrimonialProfilesResponse {
  profiles: PublicMatrimonialProfileListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Paginated matrimonial interest requests response shape.
 */
export interface PaginatedMatrimonialInterestsResponse {
  interests: MatrimonialInterestItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Summary of a matrimonial profile for administrative moderation queue.
 */
export interface AdminMatrimonialProfileListItem {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  gender: Gender | null;
  age: number | null;
  city: string | null;
  state: string | null;
  avatarUrl: string | null;
  maritalStatus: MaritalStatus;
  highestEducation: string;
  occupation: string;
  status: MatrimonialProfileStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedBy?: {
    id: string;
    fullName: string;
  } | null;
  photosCount: number;
  unapprovedPhotosCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detailed matrimonial profile for administrative inspection and moderation review.
 */
export interface AdminMatrimonialProfileDetail extends OwnMatrimonialProfile {
  user: {
    id: string;
    phone: string;
    status: string;
    profile: {
      fullName: string;
      gender: Gender | null;
      dateOfBirth: string | null;
      avatarUrl: string | null;
      city: string | null;
      state: string | null;
      subCaste: string | null;
      gotra: string | null;
    } | null;
  };
  approvedBy?: {
    id: string;
    fullName: string;
  } | null;
}

/**
 * Paginated response shape for admin matrimonial profile list.
 */
export interface PaginatedAdminMatrimonialProfilesResponse {
  profiles: AdminMatrimonialProfileListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
