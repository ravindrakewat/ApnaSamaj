import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@apnasamaj/i18n';
import {
  Container,
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Grid,
  TextField,
  MenuItem,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Snackbar,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  OutlinedInput,
  Checkbox,
  ListItemText,
  SelectChangeEvent,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import {
  Person as PersonIcon,
  Work as WorkIcon,
  FamilyRestroom as FamilyRestroomIcon,
  Tune as TuneIcon,
  PhotoLibrary as PhotoLibraryIcon,
  AddPhotoAlternate as AddPhotoAlternateIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Cancel as CancelIcon,
  VisibilityOff as VisibilityOffIcon,
  CallReceived as CallReceivedIcon,
  CallMade as CallMadeIcon,
  Send as SendIcon,
  Description as DescriptionIcon,
  Verified as VerifiedIcon,
} from '@mui/icons-material';
import {
  OwnMatrimonialProfile,
  MatrimonialProfileStatus,
  MatrimonialDocumentItem,
  MatrimonialDocumentType,
  MaritalStatus,
  ManglikStatus,
  EmploymentSector,
  FamilyType,
  FamilyValues,
  DietType,
  HabitFrequency,
} from '@apnasamaj/shared-types';
import {
  upsertMatrimonialProfileSchema,
  updatePartnerPreferenceSchema,
} from '@apnasamaj/validation';
import {
  getMyMatrimonialProfileApi,
  updateMyMatrimonialProfileApi,
  updateMyPartnerPreferencesApi,
  uploadMatrimonialPhotoApi,
  deleteMatrimonialPhotoApi,
  submitMyMatrimonialProfileApi,
  uploadMatrimonialDocumentApi,
  fetchMyMatrimonialDocumentsApi,
  deleteMyMatrimonialDocumentApi,
  MatrimonialApiError,
} from '../services/matrimonial.service';
import { ReceivedInterestsList } from '../components/matrimonial/ReceivedInterestsList';
import { SentInterestsList } from '../components/matrimonial/SentInterestsList';

const MARITAL_STATUS_OPTIONS: { value: MaritalStatus; label: string }[] = [
  { value: 'NEVER_MARRIED', label: 'Never Married' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOWED', label: 'Widowed' },
  { value: 'AWAITING_DIVORCE', label: 'Awaiting Divorce' },
];

const MANGLIK_OPTIONS: { value: ManglikStatus; label: string }[] = [
  { value: 'DONT_KNOW', label: "Don't Know" },
  { value: 'NON_MANGLIK', label: 'Non-Manglik' },
  { value: 'MANGLIK', label: 'Manglik' },
  { value: 'ANSHIK', label: 'Anshik (Partial) Manglik' },
];

const EMPLOYMENT_OPTIONS: { value: EmploymentSector; label: string }[] = [
  { value: 'PRIVATE_SECTOR', label: 'Private Sector' },
  { value: 'GOVERNMENT_PSU', label: 'Government / PSU' },
  { value: 'BUSINESS_SELF_EMPLOYED', label: 'Business / Self Employed' },
  { value: 'DEFENSE', label: 'Defense / Civil Services' },
  { value: 'NOT_WORKING', label: 'Not Working / Student' },
];

const FAMILY_TYPE_OPTIONS: { value: FamilyType; label: string }[] = [
  { value: 'NUCLEAR', label: 'Nuclear' },
  { value: 'JOINT', label: 'Joint Family' },
];

const FAMILY_VALUES_OPTIONS: { value: FamilyValues; label: string }[] = [
  { value: 'TRADITIONAL', label: 'Traditional' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'LIBERAL', label: 'Liberal' },
];

const DIET_OPTIONS: { value: DietType; label: string }[] = [
  { value: 'VEGETARIAN', label: 'Vegetarian' },
  { value: 'NON_VEGETARIAN', label: 'Non-Vegetarian' },
  { value: 'EGGETARIAN', label: 'Eggetarian' },
  { value: 'JAIN', label: 'Jain' },
];

const HABIT_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 'NO', label: 'No / Never' },
  { value: 'OCCASIONALLY', label: 'Occasionally' },
  { value: 'YES', label: 'Yes' },
];

export const MatrimonialDashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('matrimonial');

  const maritalStatusOptions = useMemo(
    () => [
      { value: 'NEVER_MARRIED' as MaritalStatus, label: t('maritalNeverMarried') },
      { value: 'DIVORCED' as MaritalStatus, label: t('maritalDivorced') },
      { value: 'WIDOWED' as MaritalStatus, label: t('maritalWidowed') },
      { value: 'AWAITING_DIVORCE' as MaritalStatus, label: t('maritalAwaitingDivorce') },
    ],
    [t]
  );

  const manglikOptions = useMemo(
    () => [
      { value: 'DONT_KNOW' as ManglikStatus, label: t('manglikDontKnow') },
      { value: 'NON_MANGLIK' as ManglikStatus, label: t('manglikNonManglik') },
      { value: 'MANGLIK' as ManglikStatus, label: t('manglikManglik') },
      { value: 'ANSHIK' as ManglikStatus, label: t('manglikAnshik') },
    ],
    [t]
  );

  const employmentOptions = useMemo(
    () => [
      { value: 'PRIVATE_SECTOR' as EmploymentSector, label: t('sectorPrivate') },
      { value: 'GOVERNMENT_PSU' as EmploymentSector, label: t('sectorGovernment') },
      { value: 'BUSINESS_SELF_EMPLOYED' as EmploymentSector, label: t('sectorBusiness') },
      { value: 'DEFENSE' as EmploymentSector, label: t('sectorGovernment') },
      { value: 'NOT_WORKING' as EmploymentSector, label: t('sectorNotEmployed') },
    ],
    [t]
  );

  const familyTypeOptions = useMemo(
    () => [
      { value: 'NUCLEAR' as FamilyType, label: t('familyTypeNuclear') },
      { value: 'JOINT' as FamilyType, label: t('familyTypeJoint') },
    ],
    [t]
  );

  const familyValuesOptions = useMemo(
    () => [
      { value: 'TRADITIONAL' as FamilyValues, label: t('valuesTraditional') },
      { value: 'MODERATE' as FamilyValues, label: t('valuesModerate') },
      { value: 'LIBERAL' as FamilyValues, label: t('valuesLiberal') },
    ],
    [t]
  );

  const dietOptions = useMemo(
    () => [
      { value: 'VEGETARIAN' as DietType, label: t('dietVegetarian') },
      { value: 'NON_VEGETARIAN' as DietType, label: t('dietNonVegetarian') },
      { value: 'EGGETARIAN' as DietType, label: t('dietEggetarian') },
      { value: 'JAIN' as DietType, label: t('dietJain') },
    ],
    [t]
  );

  const habitOptions = useMemo(
    () => [
      { value: 'NO' as HabitFrequency, label: t('habitNever') },
      { value: 'OCCASIONALLY' as HabitFrequency, label: t('habitOccasionally') },
      { value: 'YES' as HabitFrequency, label: t('habitRegularly') },
    ],
    [t]
  );
  const getInitialTab = (): number => {
    const t = searchParams.get('tab');
    if (t === 'received') return 5;
    if (t === 'sent') return 6;
    if (t === 'gallery') return 4;
    if (t === 'preferences') return 3;
    if (t === 'family') return 2;
    if (t === 'education') return 1;
    return 0;
  };

  const [activeTab, setActiveTab] = useState<number>(getInitialTab);

  // Document Verification State
  const [documentsList, setDocumentsList] = useState<MatrimonialDocumentItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState<boolean>(false);
  const [selectedDocType, setSelectedDocType] = useState<MatrimonialDocumentType>('GOVERNMENT_ID');
  const [docNameInput, setDocNameInput] = useState<string>('');
  const [docFileInput, setDocFileInput] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);

  const handleTabChange = (_: React.SyntheticEvent, val: number) => {
    setActiveTab(val);
    const tabMap: Record<number, string> = {
      0: 'personal',
      1: 'education',
      2: 'family',
      3: 'preferences',
      4: 'gallery',
      5: 'received',
      6: 'sent',
    };
    const tabParam = tabMap[val] || 'personal';
    setSearchParams({ tab: tabParam }, { replace: true });
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Profile data
  const [profile, setProfile] = useState<OwnMatrimonialProfile | null>(null);

  // Form states
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [isSubmittingForApproval, setIsSubmittingForApproval] = useState<boolean>(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState<boolean>(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Personal & Bio fields
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>('NEVER_MARRIED');
  const [heightCm, setHeightCm] = useState<string>('165');
  const [weightKg, setWeightKg] = useState<string>('');
  const [motherTongue, setMotherTongue] = useState<string>('Hindi');
  const [religion, setReligion] = useState<string>('Hindu');
  const [caste, setCaste] = useState<string>('Kewat');
  const [subCaste, setSubCaste] = useState<string>('');
  const [gotra, setGotra] = useState<string>('');
  const [manglik, setManglik] = useState<ManglikStatus>('DONT_KNOW');
  const [birthTime, setBirthTime] = useState<string>('');
  const [birthCity, setBirthCity] = useState<string>('');
  const [rashi, setRashi] = useState<string>('');
  const [nakshatra, setNakshatra] = useState<string>('');
  const [aboutMe, setAboutMe] = useState<string>('');

  // Education & Career fields
  const [highestEducation, setHighestEducation] = useState<string>('');
  const [educationDetails, setEducationDetails] = useState<string>('');
  const [employedIn, setEmployedIn] = useState<EmploymentSector>('PRIVATE_SECTOR');
  const [occupation, setOccupation] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [annualIncome, setAnnualIncome] = useState<string>('');
  const [workCity, setWorkCity] = useState<string>('');
  const [workState, setWorkState] = useState<string>('');
  const [workCountry, setWorkCountry] = useState<string>('India');

  // Family & Lifestyle fields
  const [familyType, setFamilyType] = useState<FamilyType>('NUCLEAR');
  const [familyValues, setFamilyValues] = useState<FamilyValues>('MODERATE');
  const [fatherName, setFatherName] = useState<string>('');
  const [fatherOccupation, setFatherOccupation] = useState<string>('');
  const [motherName, setMotherName] = useState<string>('');
  const [motherOccupation, setMotherOccupation] = useState<string>('');
  const [brothersCount, setBrothersCount] = useState<string>('0');
  const [brothersMarried, setBrothersMarried] = useState<string>('0');
  const [sistersCount, setSistersCount] = useState<string>('0');
  const [sistersMarried, setSistersMarried] = useState<string>('0');
  const [familyNativePlace, setFamilyNativePlace] = useState<string>('');
  const [aboutFamily, setAboutFamily] = useState<string>('');
  const [diet, setDiet] = useState<DietType>('VEGETARIAN');
  const [smoking, setSmoking] = useState<HabitFrequency>('NO');
  const [drinking, setDrinking] = useState<HabitFrequency>('NO');
  const [partnerExpectations, setPartnerExpectations] = useState<string>('');

  // Partner Preferences fields
  const [prefMinAge, setPrefMinAge] = useState<string>('21');
  const [prefMaxAge, setPrefMaxAge] = useState<string>('30');
  const [prefMinHeight, setPrefMinHeight] = useState<string>('150');
  const [prefMaxHeight, setPrefMaxHeight] = useState<string>('185');
  const [prefMaritalStatuses, setPrefMaritalStatuses] = useState<MaritalStatus[]>(['NEVER_MARRIED']);
  const [prefManglik, setPrefManglik] = useState<ManglikStatus>('DONT_KNOW');
  const [prefDiet, setPrefDiet] = useState<DietType>('VEGETARIAN');
  const [prefCities, setPrefCities] = useState<string>('');
  const [prefStates, setPrefStates] = useState<string>('');
  const [prefEducations, setPrefEducations] = useState<string>('');
  const [prefOccupations, setPrefOccupations] = useState<string>('');
  const [prefMinIncome, setPrefMinIncome] = useState<string>('');
  const [prefNotes, setPrefNotes] = useState<string>('');

  // Form errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const populateFields = useCallback((data: OwnMatrimonialProfile | null) => {
    if (!data) return;
    setMaritalStatus(data.maritalStatus || 'NEVER_MARRIED');
    setHeightCm(String(data.heightCm || 165));
    setWeightKg(data.weightKg ? String(data.weightKg) : '');
    setMotherTongue(data.motherTongue || 'Hindi');
    setReligion(data.religion || 'Hindu');
    setCaste(data.caste || 'Kewat');
    setSubCaste(data.subCaste || '');
    setGotra(data.gotra || '');
    setManglik(data.manglik || 'DONT_KNOW');
    setBirthTime(data.birthTime || '');
    setBirthCity(data.birthCity || '');
    setRashi(data.rashi || '');
    setNakshatra(data.nakshatra || '');
    setAboutMe(data.aboutMe || '');

    setHighestEducation(data.highestEducation || '');
    setEducationDetails(data.educationDetails || '');
    setEmployedIn(data.employedIn || 'PRIVATE_SECTOR');
    setOccupation(data.occupation || '');
    setCompanyName(data.companyName || '');
    setAnnualIncome(data.annualIncome || '');
    setWorkCity(data.workCity || '');
    setWorkState(data.workState || '');
    setWorkCountry(data.workCountry || 'India');

    setFamilyType(data.familyType || 'NUCLEAR');
    setFamilyValues(data.familyValues || 'MODERATE');
    setFatherName(data.fatherName || '');
    setFatherOccupation(data.fatherOccupation || '');
    setMotherName(data.motherName || '');
    setMotherOccupation(data.motherOccupation || '');
    setBrothersCount(String(data.brothersCount ?? 0));
    setBrothersMarried(String(data.brothersMarried ?? 0));
    setSistersCount(String(data.sistersCount ?? 0));
    setSistersMarried(String(data.sistersMarried ?? 0));
    setFamilyNativePlace(data.familyNativePlace || '');
    setAboutFamily(data.aboutFamily || '');
    setDiet(data.diet || 'VEGETARIAN');
    setSmoking(data.smoking || 'NO');
    setDrinking(data.drinking || 'NO');
    setPartnerExpectations(data.partnerExpectations || '');

    if (data.partnerPreference) {
      const pref = data.partnerPreference;
      setPrefMinAge(String(pref.minAge || 21));
      setPrefMaxAge(String(pref.maxAge || 30));
      setPrefMinHeight(String(pref.minHeightCm || 150));
      setPrefMaxHeight(String(pref.maxHeightCm || 185));
      setPrefMaritalStatuses(pref.maritalStatuses || ['NEVER_MARRIED']);
      setPrefManglik(pref.manglik || 'DONT_KNOW');
      setPrefDiet(pref.diet || 'VEGETARIAN');
      setPrefCities((pref.preferredCities || []).join(', '));
      setPrefStates((pref.preferredStates || []).join(', '));
      setPrefEducations((pref.preferredEducations || []).join(', '));
      setPrefOccupations((pref.preferredOccupations || []).join(', '));
      setPrefMinIncome(pref.minIncome || '');
      setPrefNotes(pref.notes || '');
    }
  }, []);

  const handleLoadDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      const docs = await fetchMyMatrimonialDocumentsApi();
      setDocumentsList(docs);
    } catch {
      // Ignored
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  const handleUploadDocument = async () => {
    if (!docFileInput || !docNameInput.trim()) {
      setErrorMessage('Please select a document file and enter a document name.');
      return;
    }
    setIsUploadingDoc(true);
    try {
      await uploadMatrimonialDocumentApi(docFileInput, selectedDocType, docNameInput.trim());
      setSuccessMessage('Document uploaded successfully for review.');
      setIsUploadDocModalOpen(false);
      setDocFileInput(null);
      setDocNameInput('');
      await handleLoadDocuments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload document.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await deleteMyMatrimonialDocumentApi(id);
      setSuccessMessage('Document removed.');
      await handleLoadDocuments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete document.');
    }
  };

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const data = await getMyMatrimonialProfileApi();
      setProfile(data);
      populateFields(data);
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load matrimonial profile.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [populateFields]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (activeTab === 7) handleLoadDocuments();
  }, [activeTab, handleLoadDocuments]);

  // Handle saving personal & career & family profile details
  const handleSaveProfile = async () => {
    setFormErrors({});
    setErrorMessage(null);

    const payload = {
      maritalStatus,
      heightCm: Number(heightCm),
      weightKg: weightKg ? Number(weightKg) : null,
      motherTongue: motherTongue.trim(),
      religion: religion.trim(),
      caste: caste.trim() || null,
      subCaste: subCaste.trim() || null,
      gotra: gotra.trim() || null,
      manglik,
      birthTime: birthTime.trim() || null,
      birthCity: birthCity.trim() || null,
      rashi: rashi.trim() || null,
      nakshatra: nakshatra.trim() || null,
      highestEducation: highestEducation.trim(),
      educationDetails: educationDetails.trim() || null,
      employedIn,
      occupation: occupation.trim(),
      companyName: companyName.trim() || null,
      annualIncome: annualIncome.trim(),
      workCity: workCity.trim() || null,
      workState: workState.trim() || null,
      workCountry: workCountry.trim() || 'India',
      familyType,
      familyValues,
      fatherName: fatherName.trim() || null,
      fatherOccupation: fatherOccupation.trim() || null,
      motherName: motherName.trim() || null,
      motherOccupation: motherOccupation.trim() || null,
      brothersCount: Number(brothersCount) || 0,
      brothersMarried: Number(brothersMarried) || 0,
      sistersCount: Number(sistersCount) || 0,
      sistersMarried: Number(sistersMarried) || 0,
      familyNativePlace: familyNativePlace.trim() || null,
      aboutFamily: aboutFamily.trim() || null,
      diet,
      smoking,
      drinking,
      aboutMe: aboutMe.trim() || null,
      partnerExpectations: partnerExpectations.trim() || null,
    };

    const validation = upsertMatrimonialProfileSchema.safeParse(payload);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = issue.path[0]?.toString() || 'general';
        errors[key] = issue.message;
      }
      setFormErrors(errors);
      setErrorMessage('Please correct the highlighted fields before saving.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await updateMyMatrimonialProfileApi(validation.data);
      setProfile(updated);
      populateFields(updated);
      setSuccessMessage(t('profileSaveSuccess'));
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to save matrimonial profile.');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle submitting profile for admin approval
  const handleSubmitForApproval = async () => {
    setIsSubmittingForApproval(true);
    setErrorMessage(null);
    try {
      const updated = await submitMyMatrimonialProfileApi();
      setProfile(updated);
      setIsSubmitDialogOpen(false);
      setSuccessMessage('Matrimonial profile submitted successfully! It is now pending Samaj admin approval.');
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to submit profile for approval.');
      }
      setIsSubmitDialogOpen(false);
    } finally {
      setIsSubmittingForApproval(false);
    }
  };

  // Handle saving partner preferences
  const handleSavePreferences = async () => {
    setFormErrors({});
    setErrorMessage(null);

    const parseCommaSeparated = (val: string) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const payload = {
      minAge: Number(prefMinAge),
      maxAge: Number(prefMaxAge),
      minHeightCm: Number(prefMinHeight),
      maxHeightCm: Number(prefMaxHeight),
      maritalStatuses: prefMaritalStatuses,
      manglik: prefManglik,
      diet: prefDiet,
      preferredCities: parseCommaSeparated(prefCities),
      preferredStates: parseCommaSeparated(prefStates),
      preferredEducations: parseCommaSeparated(prefEducations),
      preferredOccupations: parseCommaSeparated(prefOccupations),
      minIncome: prefMinIncome.trim() || null,
      notes: prefNotes.trim() || null,
    };

    const validation = updatePartnerPreferenceSchema.safeParse(payload);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = issue.path[0]?.toString() || 'general';
        errors[key] = issue.message;
      }
      setFormErrors(errors);
      setErrorMessage('Please correct the preference values before saving.');
      return;
    }

    setIsSavingPreferences(true);
    try {
      const updatedPref = await updateMyPartnerPreferencesApi(validation.data);
      if (profile) {
        setProfile({
          ...profile,
          partnerPreference: updatedPref,
        });
      }
      setSuccessMessage('Partner preferences updated successfully!');
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to save partner preferences.');
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Photo exceeds 5MB size limit. Please select a smaller photo.');
      return;
    }

    setIsUploadingPhoto(true);
    setErrorMessage(null);

    try {
      const newPhoto = await uploadMatrimonialPhotoApi(file);
      if (profile) {
        const updatedPhotos = [...(profile.photos || []), newPhoto];
        setProfile({ ...profile, photos: updatedPhotos });
      }
      setSuccessMessage('Photo uploaded successfully!');
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to upload photo.');
      }
    } finally {
      setIsUploadingPhoto(false);
      // Reset input value so same file can be selected again if needed
      e.target.value = '';
    }
  };

  // Handle photo deletion
  const handleDeletePhoto = async () => {
    if (!photoToDelete) return;

    try {
      await deleteMatrimonialPhotoApi(photoToDelete);
      if (profile) {
        const remaining = (profile.photos || []).filter((p) => p.id !== photoToDelete);
        // If primary was deleted, promote first remaining photo as primary locally
        if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) {
          remaining[0].isPrimary = true;
        }
        setProfile({ ...profile, photos: remaining });
      }
      setSuccessMessage(t('photoRemovedSuccess'));
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to delete photo.');
      }
    } finally {
      setPhotoToDelete(null);
    }
  };

  const renderStatusChip = (status?: MatrimonialProfileStatus) => {
    if (!status || status === 'DRAFT') {
      return (
        <Chip
          icon={<HourglassEmptyIcon fontSize="small" />}
          label={t('statusDraft')}
          color="default"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'PENDING_APPROVAL') {
      return (
        <Chip
          icon={<HourglassEmptyIcon fontSize="small" />}
          label={t('statusPendingApproval')}
          color="warning"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'APPROVED') {
      return (
        <Chip
          icon={<CheckCircleIcon fontSize="small" />}
          label={t('statusApproved')}
          color="success"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'REJECTED') {
      return (
        <Chip
          icon={<CancelIcon fontSize="small" />}
          label={t('statusRejected')}
          color="error"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'HIDDEN') {
      return (
        <Chip
          icon={<VisibilityOffIcon fontSize="small" />}
          label={t('statusHidden')}
          color="default"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    return null;
  };

  // Loading state
  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={44} />
          <Typography variant="body1" color="text.secondary">
            {t('loadingProfile')}
          </Typography>
        </Box>
      </Container>
    );
  }

  // Migration pending fallback
  if (isMigrationPending) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: 1,
            borderColor: 'warning.light',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <InfoIcon sx={{ fontSize: 56, color: 'warning.main' }} />
          </Box>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            {t('serviceUnavailableTitle')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
            {t('serviceUnavailableDiscoveryDesc')}
          </Typography>
          <Button variant="outlined" color="primary" onClick={loadProfile}>
            {t('retryConnectionBtn')}
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" color="text.primary">
              {t('dashboardTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('dashboardSubtitle')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {renderStatusChip(profile?.status)}
            {profile && (profile.status === 'DRAFT' || profile.status === 'REJECTED') && (
              <Button
                variant="contained"
                color={profile.status === 'REJECTED' ? 'warning' : 'primary'}
                startIcon={isSubmittingForApproval ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                disabled={isSubmittingForApproval || isSavingProfile}
                onClick={() => setIsSubmitDialogOpen(true)}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                {profile.status === 'REJECTED' ? t('resubmitForApproval') : t('submitForApproval')}
              </Button>
            )}
          </Box>
        </Box>

        {/* Suspended Profile Banner */}
        {profile?.status === 'SUSPENDED' && (
          <Alert severity="error" sx={{ mt: 2, mb: 1 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              {t('suspendedAlertTitle')}
            </Typography>
            <Typography variant="body2">
              {t('suspendedAlertDesc', { reason: profile.rejectionReason || 'Under administrative review' })}
            </Typography>
          </Alert>
        )}

        {/* Read-only Moderation Feedback & Guidelines */}
        {profile?.status === 'REJECTED' && profile.rejectionReason && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              {t('adminFeedbackTitle')}
            </Typography>
            <Typography variant="body2">{profile.rejectionReason}</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              {t('adminFeedbackInstructions')}
            </Typography>
          </Alert>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          {t('dashboardModerationNotice')}
        </Alert>

        {!profile && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('dashboardDraftNotice')}
          </Alert>
        )}
      </Box>

      {/* Main Tabs Container */}
      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          indicatorColor="primary"
          textColor="primary"
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Tab icon={<PersonIcon />} iconPosition="start" label={t('tabPersonal')} />
          <Tab icon={<WorkIcon />} iconPosition="start" label={t('tabEducationCareer')} />
          <Tab icon={<FamilyRestroomIcon />} iconPosition="start" label={t('tabFamilyLifestyle')} />
          <Tab icon={<TuneIcon />} iconPosition="start" label={t('tabPartnerPreferences')} />
          <Tab
            icon={<PhotoLibraryIcon />}
            iconPosition="start"
            label={t('tabGallery', { current: profile?.photos?.length || 0, max: 5 })}
          />
          <Tab
            icon={<CallReceivedIcon />}
            iconPosition="start"
            label={t('tabReceivedInterests')}
          />
          <Tab
            icon={<CallMadeIcon />}
            iconPosition="start"
            label={t('tabSentInterests')}
          />
          <Tab
            icon={<DescriptionIcon />}
            iconPosition="start"
            label={t('tabVerification')}
          />
        </Tabs>

        {/* ============================================================== */}
        {/* TAB 0: PERSONAL & ASTROLOGY DETAILS */}
        {/* ============================================================== */}
        {activeTab === 0 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
              {t('sectionPersonalAstrology')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('maritalStatusLabel')}
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus)}
                  error={Boolean(formErrors.maritalStatus)}
                  helperText={formErrors.maritalStatus}
                >
                  {maritalStatusOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('heightLabel')}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  error={Boolean(formErrors.heightCm)}
                  helperText={formErrors.heightCm || t('heightHelperText')}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('weightLabel')}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  error={Boolean(formErrors.weightKg)}
                  helperText={formErrors.weightKg}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('motherTongueLabel')}
                  value={motherTongue}
                  onChange={(e) => setMotherTongue(e.target.value)}
                  error={Boolean(formErrors.motherTongue)}
                  helperText={formErrors.motherTongue}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('religionLabel')}
                  value={religion}
                  onChange={(e) => setReligion(e.target.value)}
                  error={Boolean(formErrors.religion)}
                  helperText={formErrors.religion}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('casteCommunityLabel')}
                  value={caste}
                  onChange={(e) => setCaste(e.target.value)}
                  error={Boolean(formErrors.caste)}
                  helperText={formErrors.caste}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('subCasteLabel')}
                  value={subCaste}
                  onChange={(e) => setSubCaste(e.target.value)}
                  error={Boolean(formErrors.subCaste)}
                  helperText={formErrors.subCaste}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('gotraLabel')}
                  value={gotra}
                  onChange={(e) => setGotra(e.target.value)}
                  error={Boolean(formErrors.gotra)}
                  helperText={formErrors.gotra}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('manglikDoshaLabel')}
                  value={manglik}
                  onChange={(e) => setManglik(e.target.value as ManglikStatus)}
                  error={Boolean(formErrors.manglik)}
                  helperText={formErrors.manglik}
                >
                  {manglikOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('birthTimeLabel')}
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  placeholder={t('birthTimePlaceholder')}
                  error={Boolean(formErrors.birthTime)}
                  helperText={formErrors.birthTime}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('birthCityLabel')}
                  value={birthCity}
                  onChange={(e) => setBirthCity(e.target.value)}
                  error={Boolean(formErrors.birthCity)}
                  helperText={formErrors.birthCity}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('rashiLabel')}
                  value={rashi}
                  onChange={(e) => setRashi(e.target.value)}
                  error={Boolean(formErrors.rashi)}
                  helperText={formErrors.rashi}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('nakshatraLabel')}
                  value={nakshatra}
                  onChange={(e) => setNakshatra(e.target.value)}
                  error={Boolean(formErrors.nakshatra)}
                  helperText={formErrors.nakshatra}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label={t('aboutMeLabel')}
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  placeholder={t('aboutMePlaceholder')}
                  error={Boolean(formErrors.aboutMe)}
                  helperText={formErrors.aboutMe || `${aboutMe.length}/3000 characters`}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                startIcon={isSavingProfile ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSavingProfile ? t('saving') : t('savePersonalDetails')}
              </Button>
            </Box>
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 1: EDUCATION & CAREER */}
        {/* ============================================================== */}
        {activeTab === 1 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
              {t('sectionEducationCareer')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label={t('highestEducationLabel')}
                  value={highestEducation}
                  onChange={(e) => setHighestEducation(e.target.value)}
                  placeholder={t('highestEducationPlaceholder')}
                  error={Boolean(formErrors.highestEducation)}
                  helperText={formErrors.highestEducation}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('educationDetailsLabel')}
                  value={educationDetails}
                  onChange={(e) => setEducationDetails(e.target.value)}
                  error={Boolean(formErrors.educationDetails)}
                  helperText={formErrors.educationDetails}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label="Employed In"
                  value={employedIn}
                  onChange={(e) => setEmployedIn(e.target.value as EmploymentSector)}
                  error={Boolean(formErrors.employedIn)}
                  helperText={formErrors.employedIn}
                >
                  {EMPLOYMENT_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. Software Engineer, Civil Engineer, Teacher"
                  error={Boolean(formErrors.occupation)}
                  helperText={formErrors.occupation}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('companyNameLabel')}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  error={Boolean(formErrors.companyName)}
                  helperText={formErrors.companyName}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label={t('annualIncomeLabel')}
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  placeholder={t('annualIncomePlaceholder')}
                  error={Boolean(formErrors.annualIncome)}
                  helperText={formErrors.annualIncome}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('workCityLabel')}
                  value={workCity}
                  onChange={(e) => setWorkCity(e.target.value)}
                  error={Boolean(formErrors.workCity)}
                  helperText={formErrors.workCity}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('workStateLabel')}
                  value={workState}
                  onChange={(e) => setWorkState(e.target.value)}
                  error={Boolean(formErrors.workState)}
                  helperText={formErrors.workState}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('workCountryLabel')}
                  value={workCountry}
                  onChange={(e) => setWorkCountry(e.target.value)}
                  error={Boolean(formErrors.workCountry)}
                  helperText={formErrors.workCountry}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                startIcon={isSavingProfile ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSavingProfile ? t('saving') : t('saveEducationCareer')}
              </Button>
            </Box>
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 2: FAMILY & LIFESTYLE */}
        {/* ============================================================== */}
        {activeTab === 2 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
              {t('sectionFamilyLifestyle')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('familyTypeLabel')}
                  value={familyType}
                  onChange={(e) => setFamilyType(e.target.value as FamilyType)}
                  error={Boolean(formErrors.familyType)}
                  helperText={formErrors.familyType}
                >
                  {familyTypeOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('familyValuesLabel')}
                  value={familyValues}
                  onChange={(e) => setFamilyValues(e.target.value as FamilyValues)}
                  error={Boolean(formErrors.familyValues)}
                  helperText={formErrors.familyValues}
                >
                  {familyValuesOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('fatherNameLabel')}
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  error={Boolean(formErrors.fatherName)}
                  helperText={formErrors.fatherName}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('fatherOccupationLabel')}
                  value={fatherOccupation}
                  onChange={(e) => setFatherOccupation(e.target.value)}
                  error={Boolean(formErrors.fatherOccupation)}
                  helperText={formErrors.fatherOccupation}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('motherNameLabel')}
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  error={Boolean(formErrors.motherName)}
                  helperText={formErrors.motherName}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('motherOccupationLabel')}
                  value={motherOccupation}
                  onChange={(e) => setMotherOccupation(e.target.value)}
                  error={Boolean(formErrors.motherOccupation)}
                  helperText={formErrors.motherOccupation}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('totalBrothersLabel')}
                  value={brothersCount}
                  onChange={(e) => setBrothersCount(e.target.value)}
                  error={Boolean(formErrors.brothersCount)}
                  helperText={formErrors.brothersCount}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('marriedBrothersLabel')}
                  value={brothersMarried}
                  onChange={(e) => setBrothersMarried(e.target.value)}
                  error={Boolean(formErrors.brothersMarried)}
                  helperText={formErrors.brothersMarried}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('totalSistersLabel')}
                  value={sistersCount}
                  onChange={(e) => setSistersCount(e.target.value)}
                  error={Boolean(formErrors.sistersCount)}
                  helperText={formErrors.sistersCount}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('marriedSistersLabel')}
                  value={sistersMarried}
                  onChange={(e) => setSistersMarried(e.target.value)}
                  error={Boolean(formErrors.sistersMarried)}
                  helperText={formErrors.sistersMarried}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('ancestralPlaceLabel')}
                  value={familyNativePlace}
                  onChange={(e) => setFamilyNativePlace(e.target.value)}
                  placeholder={t('ancestralPlacePlaceholder')}
                  error={Boolean(formErrors.familyNativePlace)}
                  helperText={formErrors.familyNativePlace}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('dietPreferencePrefLabel')}
                  value={diet}
                  onChange={(e) => setDiet(e.target.value as DietType)}
                  error={Boolean(formErrors.diet)}
                  helperText={formErrors.diet}
                >
                  {dietOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('smokingHabitLabel')}
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value as HabitFrequency)}
                  error={Boolean(formErrors.smoking)}
                  helperText={formErrors.smoking}
                >
                  {habitOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label={t('drinkingHabitLabel')}
                  value={drinking}
                  onChange={(e) => setDrinking(e.target.value as HabitFrequency)}
                  error={Boolean(formErrors.drinking)}
                  helperText={formErrors.drinking}
                >
                  {habitOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={t('aboutFamilyLabel')}
                  value={aboutFamily}
                  onChange={(e) => setAboutFamily(e.target.value)}
                  placeholder={t('aboutFamilyPlaceholder')}
                  error={Boolean(formErrors.aboutFamily)}
                  helperText={formErrors.aboutFamily}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                startIcon={isSavingProfile ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSavingProfile ? t('saving') : t('saveFamilyLifestyle')}
              </Button>
            </Box>
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 3: PARTNER PREFERENCES */}
        {/* ============================================================== */}
        {activeTab === 3 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
              {t('sectionPartnerPreferences')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('sectionPartnerPreferencesSubtitle')}
            </Typography>

            {!profile && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                {t('createProfileFirstNotice')}
              </Alert>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('prefMinAgeLabel')}
                  value={prefMinAge}
                  onChange={(e) => setPrefMinAge(e.target.value)}
                  error={Boolean(formErrors.minAge)}
                  helperText={formErrors.minAge || t('prefMinAgeHelper')}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('prefMaxAgeLabel')}
                  value={prefMaxAge}
                  onChange={(e) => setPrefMaxAge(e.target.value)}
                  error={Boolean(formErrors.maxAge)}
                  helperText={formErrors.maxAge || t('prefMaxAgeHelper')}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('prefMinHeightLabel')}
                  value={prefMinHeight}
                  onChange={(e) => setPrefMinHeight(e.target.value)}
                  error={Boolean(formErrors.minHeightCm)}
                  helperText={formErrors.minHeightCm || t('prefMinHeightHelper')}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label={t('prefMaxHeightLabel')}
                  value={prefMaxHeight}
                  onChange={(e) => setPrefMaxHeight(e.target.value)}
                  error={Boolean(formErrors.maxHeightCm)}
                  helperText={formErrors.maxHeightCm || t('prefMaxHeightHelper')}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="marital-status-pref-label">{t('acceptableMaritalStatuses')}</InputLabel>
                  <Select
                    labelId="marital-status-pref-label"
                    multiple
                    value={prefMaritalStatuses}
                    onChange={(e: SelectChangeEvent<MaritalStatus[]>) => {
                      const val = e.target.value;
                      setPrefMaritalStatuses(
                        typeof val === 'string' ? (val.split(',') as MaritalStatus[]) : val
                      );
                    }}
                    input={<OutlinedInput label={t('acceptableMaritalStatuses')} />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((val) => (
                          <Chip
                            key={val}
                            label={maritalStatusOptions.find((o) => o.value === val)?.label || val}
                            size="small"
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {maritalStatusOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        <Checkbox checked={prefMaritalStatuses.indexOf(opt.value) > -1} />
                        <ListItemText primary={opt.label} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  select
                  fullWidth
                  label={t('manglikPreferenceLabel')}
                  value={prefManglik}
                  onChange={(e) => setPrefManglik(e.target.value as ManglikStatus)}
                  error={Boolean(formErrors.manglik)}
                  helperText={formErrors.manglik}
                >
                  {manglikOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  select
                  fullWidth
                  label={t('dietPreferencePrefLabel')}
                  value={prefDiet}
                  onChange={(e) => setPrefDiet(e.target.value as DietType)}
                  error={Boolean(formErrors.diet)}
                  helperText={formErrors.diet}
                >
                  {dietOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('preferredCitiesLabel')}
                  value={prefCities}
                  onChange={(e) => setPrefCities(e.target.value)}
                  placeholder={t('preferredCitiesPlaceholder')}
                  error={Boolean(formErrors.preferredCities)}
                  helperText={formErrors.preferredCities}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('preferredStatesLabel')}
                  value={prefStates}
                  onChange={(e) => setPrefStates(e.target.value)}
                  placeholder={t('preferredStatesPlaceholder')}
                  error={Boolean(formErrors.preferredStates)}
                  helperText={formErrors.preferredStates}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('preferredEducationsLabel')}
                  value={prefEducations}
                  onChange={(e) => setPrefEducations(e.target.value)}
                  placeholder={t('preferredEducationsPlaceholder')}
                  error={Boolean(formErrors.preferredEducations)}
                  helperText={formErrors.preferredEducations}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('preferredOccupationsLabel')}
                  value={prefOccupations}
                  onChange={(e) => setPrefOccupations(e.target.value)}
                  placeholder={t('preferredOccupationsPlaceholder')}
                  error={Boolean(formErrors.preferredOccupations)}
                  helperText={formErrors.preferredOccupations}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('minExpectedIncomeLabel')}
                  value={prefMinIncome}
                  onChange={(e) => setPrefMinIncome(e.target.value)}
                  placeholder={t('minExpectedIncomePlaceholder')}
                  error={Boolean(formErrors.minIncome)}
                  helperText={formErrors.minIncome}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={t('partnerExpectationsNotesLabel')}
                  value={prefNotes}
                  onChange={(e) => setPrefNotes(e.target.value)}
                  placeholder={t('partnerExpectationsNotesPlaceholder')}
                  error={Boolean(formErrors.notes)}
                  helperText={formErrors.notes}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSavePreferences}
                disabled={isSavingPreferences || !profile}
                startIcon={isSavingPreferences ? <CircularProgress size={20} color="inherit" /> : null}
              >
                {isSavingPreferences ? t('saving') : t('savePartnerPreferences')}
              </Button>
            </Box>
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 4: PHOTO GALLERY MANAGEMENT */}
        {/* ============================================================== */}
        {activeTab === 4 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  {t('galleryTitle', { current: profile?.photos?.length || 0, max: 5 })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('gallerySubtitle')}
                </Typography>
              </Box>

              <Button
                component="label"
                variant="contained"
                color="primary"
                startIcon={isUploadingPhoto ? <CircularProgress size={20} color="inherit" /> : <AddPhotoAlternateIcon />}
                disabled={isUploadingPhoto || !profile || (profile.photos?.length || 0) >= 5}
              >
                {isUploadingPhoto ? t('uploading') : t('uploadPhotoBtn')}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handlePhotoUpload}
                />
              </Button>
            </Box>

            {(profile?.photos?.length || 0) >= 5 && (
              <Alert severity="info" sx={{ mb: 3 }}>
                {t('maxPhotosNotice')}
              </Alert>
            )}

            {!profile && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                {t('createProfileForGalleryNotice')}
              </Alert>
            )}

            {/* Photo Cards Grid */}
            {profile && profile.photos && profile.photos.length > 0 ? (
              <Grid container spacing={3}>
                {profile.photos.map((photo, index) => (
                  <Grid item xs={12} sm={6} md={4} key={photo.id}>
                    <Card
                      elevation={2}
                      sx={{
                        position: 'relative',
                        borderRadius: 2,
                        overflow: 'hidden',
                        transition: 'transform 0.2s',
                        '&:hover': { transform: 'scale(1.02)' },
                      }}
                    >
                      <CardMedia
                        component="img"
                        height="240"
                        image={photo.url}
                        alt={`Photo ${index + 1}`}
                        sx={{ objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => setPreviewPhotoUrl(photo.url)}
                      />

                      {/* Primary Photo Badge */}
                      {photo.isPrimary && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                          }}
                        >
                          <Chip
                            icon={<StarIcon fontSize="small" />}
                            label={t('primaryPhotoBadge')}
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 'bold' }}
                          />
                        </Box>
                      )}

                      <CardActions sx={{ justifyContent: 'space-between', bgcolor: 'background.paper', px: 2, py: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {t('photoNumber', { index: index + 1 })}
                        </Typography>
                        <Tooltip title={t('deletePhotoTooltip')}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setPhotoToDelete(photo.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Box
                sx={{
                  py: 6,
                  textAlign: 'center',
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                }}
              >
                <PhotoLibraryIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1.5 }} />
                <Typography variant="subtitle1" fontWeight="bold">
                  {t('noPhotosTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mt: 0.5 }}>
                  {t('noPhotosDesc')}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 5: RECEIVED INTERESTS */}
        {/* ============================================================== */}
        {activeTab === 5 && (
          <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
            <ReceivedInterestsList onSuccessNotice={(msg) => setSuccessMessage(msg)} />
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 6: SENT INTERESTS */}
        {/* ============================================================== */}
        {activeTab === 6 && (
          <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
            <SentInterestsList onSuccessNotice={(msg) => setSuccessMessage(msg)} />
          </Box>
        )}

        {/* ============================================================== */}
        {/* TAB 7: IDENTITY & QUALIFICATION VERIFICATION */}
        {/* ============================================================== */}
        {activeTab === 7 && (
          <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" fontWeight="bold">
                    {t('verificationTitle')}
                  </Typography>
                  {profile?.isVerified && (
                    <Chip size="small" icon={<VerifiedIcon fontSize="small" />} label={t('verificationBadge')} color="success" />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {t('verificationDesc')}
                </Typography>
              </Box>
              <Button
                variant="contained"
                startIcon={<DescriptionIcon />}
                onClick={() => setIsUploadDocModalOpen(true)}
              >
                {t('uploadDocumentBtn')}
              </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              {t('privacyNotice')}
            </Alert>

            {isLoadingDocs ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : documentsList.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography color="text.secondary">{t('noDocumentsUploaded')}</Typography>
              </Paper>
            ) : (
              <Grid container spacing={2}>
                {documentsList.map((doc) => (
                  <Grid item xs={12} sm={6} key={doc.id}>
                    <Paper sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">{doc.documentName}</Typography>
                          <Chip size="small" label={doc.documentType} sx={{ mt: 0.5 }} />
                        </Box>
                        {doc.status === 'APPROVED' ? (
                          <Chip size="small" color="success" label={t('docStatusApproved')} />
                        ) : doc.status === 'REJECTED' ? (
                          <Chip size="small" color="error" label={t('docStatusRejected')} />
                        ) : (
                          <Chip size="small" color="warning" label={t('docStatusPending')} />
                        )}
                      </Box>
                      {doc.rejectionReason && (
                        <Alert severity="error" sx={{ my: 1, py: 0.5 }}>
                          {doc.rejectionReason}
                        </Alert>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                        <Typography variant="caption" color="text.secondary">
                          {(doc.fileSize / 1024).toFixed(0)} KB • {doc.mimeType}
                        </Typography>
                        {doc.status !== 'APPROVED' && (
                          <IconButton size="small" color="error" onClick={() => handleDeleteDocument(doc.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}
      </Paper>

      {/* Delete Photo Confirmation Dialog */}
      <Dialog open={Boolean(photoToDelete)} onClose={() => setPhotoToDelete(null)}>
        <DialogTitle>{t('deletePhotoDialogTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('deletePhotoDialogDesc')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhotoToDelete(null)} color="inherit">
            {t('common:cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleDeletePhoto} color="error" variant="contained">
            {t('deletePhotoConfirmBtn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Photo Preview Dialog */}
      <Dialog
        open={Boolean(previewPhotoUrl)}
        onClose={() => setPreviewPhotoUrl(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 1, display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
          {previewPhotoUrl && (
            <Box
              component="img"
              src={previewPhotoUrl}
              alt="Photo preview"
              sx={{ maxHeight: '80vh', maxWidth: '100%', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'background.paper' }}>
          <Button onClick={() => setPreviewPhotoUrl(null)}>{t('closePreview')}</Button>
        </DialogActions>
      </Dialog>

      {/* Submit for Approval Confirmation Dialog */}
      <Dialog
        open={isSubmitDialogOpen}
        onClose={() => !isSubmittingForApproval && setIsSubmitDialogOpen(false)}
        aria-labelledby="submit-profile-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="submit-profile-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SendIcon color="primary" />
          {profile?.status === 'REJECTED'
            ? t('resubmitDialogTitle')
            : t('submitDialogTitle')}
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ color: 'text.primary', mb: 1.5 }}>
            {t('submitDialogText1')}
          </DialogContentText>
          <Typography variant="body2" color="text.secondary">
            {t('submitDialogText2')}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setIsSubmitDialogOpen(false)}
            disabled={isSubmittingForApproval}
          >
            {t('common:cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={handleSubmitForApproval}
            variant="contained"
            color="primary"
            disabled={isSubmittingForApproval}
            startIcon={isSubmittingForApproval ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
          >
            {isSubmittingForApproval ? t('submitting') : t('confirmAndSubmit')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Document Modal */}
      <Dialog
        open={isUploadDocModalOpen}
        onClose={() => !isUploadingDoc && setIsUploadDocModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('uploadDocumentBtn')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              select
              fullWidth
              label={t('documentTypeLabel')}
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value as MatrimonialDocumentType)}
            >
              <MenuItem value="GOVERNMENT_ID">{t('docTypeGovId')}</MenuItem>
              <MenuItem value="EDUCATION_PROOF">{t('docTypeEducation')}</MenuItem>
              <MenuItem value="OCCUPATION_PROOF">{t('docTypeOccupation')}</MenuItem>
              <MenuItem value="OTHER">{t('docTypeOther')}</MenuItem>
            </TextField>

            <TextField
              fullWidth
              label={t('documentNameLabel')}
              placeholder={t('documentNamePlaceholder')}
              value={docNameInput}
              onChange={(e) => setDocNameInput(e.target.value)}
            />

            <Button
              variant="outlined"
              component="label"
              startIcon={<DescriptionIcon />}
              fullWidth
              sx={{ py: 1.5 }}
            >
              {docFileInput ? docFileInput.name : 'Select PDF or Image File (Max 5MB)'}
              <input
                type="file"
                hidden
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setDocFileInput(e.target.files[0]);
                  }
                }}
              />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsUploadDocModalOpen(false)} disabled={isUploadingDoc}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleUploadDocument}
            disabled={isUploadingDoc || !docFileInput || !docNameInput.trim()}
          >
            {isUploadingDoc ? <CircularProgress size={20} /> : t('uploadDocumentBtn')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback Snackbars */}
      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(errorMessage)}
        autoHideDuration={6000}
        onClose={() => setErrorMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorMessage(null)} sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};
