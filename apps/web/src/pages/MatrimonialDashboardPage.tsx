import React, { useState, useEffect, useCallback } from 'react';
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
} from '@mui/icons-material';
import {
  OwnMatrimonialProfile,
  MatrimonialProfileStatus,
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
      setSuccessMessage('Matrimonial profile saved successfully!');
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
      setSuccessMessage('Photo removed from gallery.');
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
          label="Draft — Not Visible in Discovery"
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
          label="Pending Samaj Admin Approval"
          color="warning"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'APPROVED') {
      return (
        <Chip
          icon={<CheckCircleIcon fontSize="small" />}
          label="Approved & Visible in Discovery"
          color="success"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'REJECTED') {
      return (
        <Chip
          icon={<CancelIcon fontSize="small" />}
          label="Changes Requested / Rejected"
          color="error"
          sx={{ fontWeight: 600 }}
        />
      );
    }
    if (status === 'HIDDEN') {
      return (
        <Chip
          icon={<VisibilityOffIcon fontSize="small" />}
          label="Hidden"
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
            Loading your matrimonial profile...
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
            Matrimonial Service Unavailable
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
            Matrimonial service is not available yet; database setup is pending. Our community engineering team
            is preparing the matrimonial database tables. Please check back shortly.
          </Typography>
          <Button variant="outlined" color="primary" onClick={loadProfile}>
            Retry Connection
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
              My Matrimonial Profile
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your personal bio, family background, partner expectations, and matrimonial photos.
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
                {profile.status === 'REJECTED' ? 'Resubmit for Approval' : 'Submit for Approval'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Read-only Moderation Feedback & Guidelines */}
        {profile?.status === 'REJECTED' && profile.rejectionReason && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold">
              Administrator Feedback:
            </Typography>
            <Typography variant="body2">{profile.rejectionReason}</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              Please update your profile according to the feedback above, save your changes, and click "Resubmit for Approval".
            </Typography>
          </Alert>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          Community profiles are reviewed and moderated by Samaj administrators prior to publication. Members
          cannot approve their own profiles. Sensitive contact information is strictly protected and never shown in discovery.
        </Alert>

        {!profile && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            You have not created your matrimonial profile yet. Complete the details below and click Save Profile to create your draft profile.
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
          <Tab icon={<PersonIcon />} iconPosition="start" label="Personal Details" />
          <Tab icon={<WorkIcon />} iconPosition="start" label="Education & Career" />
          <Tab icon={<FamilyRestroomIcon />} iconPosition="start" label="Family & Lifestyle" />
          <Tab icon={<TuneIcon />} iconPosition="start" label="Partner Preferences" />
          <Tab
            icon={<PhotoLibraryIcon />}
            iconPosition="start"
            label={`Gallery (${profile?.photos?.length || 0}/5)`}
          />
          <Tab
            icon={<CallReceivedIcon />}
            iconPosition="start"
            label="Received Interests"
          />
          <Tab
            icon={<CallMadeIcon />}
            iconPosition="start"
            label="Sent Interests"
          />
        </Tabs>

        {/* ============================================================== */}
        {/* TAB 0: PERSONAL & ASTROLOGY DETAILS */}
        {/* ============================================================== */}
        {activeTab === 0 && (
          <Box sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
              Personal Background & Astrology
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label="Marital Status"
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus)}
                  error={Boolean(formErrors.maritalStatus)}
                  helperText={formErrors.maritalStatus}
                >
                  {MARITAL_STATUS_OPTIONS.map((opt) => (
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
                  label="Height (cm)"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  error={Boolean(formErrors.heightCm)}
                  helperText={formErrors.heightCm || 'Between 120 - 250 cm'}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Weight (kg, optional)"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  error={Boolean(formErrors.weightKg)}
                  helperText={formErrors.weightKg}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Mother Tongue"
                  value={motherTongue}
                  onChange={(e) => setMotherTongue(e.target.value)}
                  error={Boolean(formErrors.motherTongue)}
                  helperText={formErrors.motherTongue}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Religion"
                  value={religion}
                  onChange={(e) => setReligion(e.target.value)}
                  error={Boolean(formErrors.religion)}
                  helperText={formErrors.religion}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Caste / Community"
                  value={caste}
                  onChange={(e) => setCaste(e.target.value)}
                  error={Boolean(formErrors.caste)}
                  helperText={formErrors.caste}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Sub-Caste (optional)"
                  value={subCaste}
                  onChange={(e) => setSubCaste(e.target.value)}
                  error={Boolean(formErrors.subCaste)}
                  helperText={formErrors.subCaste}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Gotra (optional)"
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
                  label="Manglik Status"
                  value={manglik}
                  onChange={(e) => setManglik(e.target.value as ManglikStatus)}
                  error={Boolean(formErrors.manglik)}
                  helperText={formErrors.manglik}
                >
                  {MANGLIK_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Birth Time (HH:MM format, optional)"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  placeholder="e.g. 14:30"
                  error={Boolean(formErrors.birthTime)}
                  helperText={formErrors.birthTime}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Birth City (optional)"
                  value={birthCity}
                  onChange={(e) => setBirthCity(e.target.value)}
                  error={Boolean(formErrors.birthCity)}
                  helperText={formErrors.birthCity}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Rashi (optional)"
                  value={rashi}
                  onChange={(e) => setRashi(e.target.value)}
                  error={Boolean(formErrors.rashi)}
                  helperText={formErrors.rashi}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Nakshatra (optional)"
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
                  label="About Me (Personal Bio)"
                  value={aboutMe}
                  onChange={(e) => setAboutMe(e.target.value)}
                  placeholder="Tell prospective matches about your personality, interests, values, and life goals..."
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
                {isSavingProfile ? 'Saving...' : 'Save Personal Details'}
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
              Education & Professional Career
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  required
                  label="Highest Education"
                  value={highestEducation}
                  onChange={(e) => setHighestEducation(e.target.value)}
                  placeholder="e.g. B.Tech in Computer Science, MBA, MBBS"
                  error={Boolean(formErrors.highestEducation)}
                  helperText={formErrors.highestEducation}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Education Details (College / University, optional)"
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
                  label="Company / Business Name (optional)"
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
                  label="Annual Income"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  placeholder="e.g. 10 - 15 LPA, 5 - 7 Lakhs"
                  error={Boolean(formErrors.annualIncome)}
                  helperText={formErrors.annualIncome}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Work City (optional)"
                  value={workCity}
                  onChange={(e) => setWorkCity(e.target.value)}
                  error={Boolean(formErrors.workCity)}
                  helperText={formErrors.workCity}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Work State (optional)"
                  value={workState}
                  onChange={(e) => setWorkState(e.target.value)}
                  error={Boolean(formErrors.workState)}
                  helperText={formErrors.workState}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Work Country"
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
                {isSavingProfile ? 'Saving...' : 'Save Education & Career'}
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
              Family Background & Lifestyle Habits
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label="Family Type"
                  value={familyType}
                  onChange={(e) => setFamilyType(e.target.value as FamilyType)}
                  error={Boolean(formErrors.familyType)}
                  helperText={formErrors.familyType}
                >
                  {FAMILY_TYPE_OPTIONS.map((opt) => (
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
                  label="Family Values"
                  value={familyValues}
                  onChange={(e) => setFamilyValues(e.target.value as FamilyValues)}
                  error={Boolean(formErrors.familyValues)}
                  helperText={formErrors.familyValues}
                >
                  {FAMILY_VALUES_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Father's Name (optional)"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  error={Boolean(formErrors.fatherName)}
                  helperText={formErrors.fatherName}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Father's Occupation (optional)"
                  value={fatherOccupation}
                  onChange={(e) => setFatherOccupation(e.target.value)}
                  error={Boolean(formErrors.fatherOccupation)}
                  helperText={formErrors.fatherOccupation}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Mother's Name (optional)"
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  error={Boolean(formErrors.motherName)}
                  helperText={formErrors.motherName}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Mother's Occupation (optional)"
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
                  label="Total Brothers"
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
                  label="Married Brothers"
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
                  label="Total Sisters"
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
                  label="Married Sisters"
                  value={sistersMarried}
                  onChange={(e) => setSistersMarried(e.target.value)}
                  error={Boolean(formErrors.sistersMarried)}
                  helperText={formErrors.sistersMarried}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Ancestral / Native Place (optional)"
                  value={familyNativePlace}
                  onChange={(e) => setFamilyNativePlace(e.target.value)}
                  placeholder="Village / Town"
                  error={Boolean(formErrors.familyNativePlace)}
                  helperText={formErrors.familyNativePlace}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  label="Diet Preference"
                  value={diet}
                  onChange={(e) => setDiet(e.target.value as DietType)}
                  error={Boolean(formErrors.diet)}
                  helperText={formErrors.diet}
                >
                  {DIET_OPTIONS.map((opt) => (
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
                  label="Smoking Habit"
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value as HabitFrequency)}
                  error={Boolean(formErrors.smoking)}
                  helperText={formErrors.smoking}
                >
                  {HABIT_OPTIONS.map((opt) => (
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
                  label="Drinking Habit"
                  value={drinking}
                  onChange={(e) => setDrinking(e.target.value as HabitFrequency)}
                  error={Boolean(formErrors.drinking)}
                  helperText={formErrors.drinking}
                >
                  {HABIT_OPTIONS.map((opt) => (
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
                  label="About Family (optional)"
                  value={aboutFamily}
                  onChange={(e) => setAboutFamily(e.target.value)}
                  placeholder="Share a brief overview of your family background, values, and traditions..."
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
                {isSavingProfile ? 'Saving...' : 'Save Family & Lifestyle'}
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
              Partner Preferences & Expectations
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Specify the criteria and attributes you are looking for in an ideal life partner.
            </Typography>

            {!profile && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                Please create your matrimonial profile first before configuring partner preferences.
              </Alert>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min Age"
                  value={prefMinAge}
                  onChange={(e) => setPrefMinAge(e.target.value)}
                  error={Boolean(formErrors.minAge)}
                  helperText={formErrors.minAge || 'At least 18'}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Age"
                  value={prefMaxAge}
                  onChange={(e) => setPrefMaxAge(e.target.value)}
                  error={Boolean(formErrors.maxAge)}
                  helperText={formErrors.maxAge || 'Up to 80'}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Min Height (cm)"
                  value={prefMinHeight}
                  onChange={(e) => setPrefMinHeight(e.target.value)}
                  error={Boolean(formErrors.minHeightCm)}
                  helperText={formErrors.minHeightCm || 'Min 120 cm'}
                />
              </Grid>

              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Height (cm)"
                  value={prefMaxHeight}
                  onChange={(e) => setPrefMaxHeight(e.target.value)}
                  error={Boolean(formErrors.maxHeightCm)}
                  helperText={formErrors.maxHeightCm || 'Max 250 cm'}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="marital-status-pref-label">Acceptable Marital Statuses</InputLabel>
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
                    input={<OutlinedInput label="Acceptable Marital Statuses" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((val) => (
                          <Chip
                            key={val}
                            label={MARITAL_STATUS_OPTIONS.find((o) => o.value === val)?.label || val}
                            size="small"
                          />
                        ))}
                      </Box>
                    )}
                  >
                    {MARITAL_STATUS_OPTIONS.map((opt) => (
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
                  label="Manglik Preference"
                  value={prefManglik}
                  onChange={(e) => setPrefManglik(e.target.value as ManglikStatus)}
                  error={Boolean(formErrors.manglik)}
                  helperText={formErrors.manglik}
                >
                  {MANGLIK_OPTIONS.map((opt) => (
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
                  label="Diet Preference"
                  value={prefDiet}
                  onChange={(e) => setPrefDiet(e.target.value as DietType)}
                  error={Boolean(formErrors.diet)}
                  helperText={formErrors.diet}
                >
                  {DIET_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Preferred Cities (comma-separated, optional)"
                  value={prefCities}
                  onChange={(e) => setPrefCities(e.target.value)}
                  placeholder="e.g. Indore, Bhopal, Mumbai, Delhi"
                  error={Boolean(formErrors.preferredCities)}
                  helperText={formErrors.preferredCities}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Preferred States (comma-separated, optional)"
                  value={prefStates}
                  onChange={(e) => setPrefStates(e.target.value)}
                  placeholder="e.g. Madhya Pradesh, Maharashtra"
                  error={Boolean(formErrors.preferredStates)}
                  helperText={formErrors.preferredStates}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Preferred Educations (comma-separated, optional)"
                  value={prefEducations}
                  onChange={(e) => setPrefEducations(e.target.value)}
                  placeholder="e.g. B.Tech, MBA, MCA, CA"
                  error={Boolean(formErrors.preferredEducations)}
                  helperText={formErrors.preferredEducations}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Preferred Occupations (comma-separated, optional)"
                  value={prefOccupations}
                  onChange={(e) => setPrefOccupations(e.target.value)}
                  placeholder="e.g. Software Engineer, Doctor, Banking"
                  error={Boolean(formErrors.preferredOccupations)}
                  helperText={formErrors.preferredOccupations}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Minimum Expected Income (optional)"
                  value={prefMinIncome}
                  onChange={(e) => setPrefMinIncome(e.target.value)}
                  placeholder="e.g. 6 LPA"
                  error={Boolean(formErrors.minIncome)}
                  helperText={formErrors.minIncome}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Partner Expectations & Notes (optional)"
                  value={prefNotes}
                  onChange={(e) => setPrefNotes(e.target.value)}
                  placeholder="Describe your expectations regarding education, cultural background, and values in a partner..."
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
                {isSavingPreferences ? 'Saving...' : 'Save Partner Preferences'}
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
                  Matrimonial Photos ({profile?.photos?.length || 0} / 5)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add up to 5 clear photos. The first photo is automatically designated as your primary profile photo.
                </Typography>
              </Box>

              <Button
                component="label"
                variant="contained"
                color="primary"
                startIcon={isUploadingPhoto ? <CircularProgress size={20} color="inherit" /> : <AddPhotoAlternateIcon />}
                disabled={isUploadingPhoto || !profile || (profile.photos?.length || 0) >= 5}
              >
                {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
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
                You have reached the maximum limit of 5 matrimonial gallery photos. To upload a different photo, please delete one first.
              </Alert>
            )}

            {!profile && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                Please create your matrimonial profile first before uploading gallery photos.
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
                            label="Primary Photo"
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 'bold' }}
                          />
                        </Box>
                      )}

                      <CardActions sx={{ justifyContent: 'space-between', bgcolor: 'background.paper', px: 2, py: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Photo #{index + 1}
                        </Typography>
                        <Tooltip title="Delete photo">
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
                  No Photos Uploaded Yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mt: 0.5 }}>
                  Add genuine, recent photos to improve responses and discovery connections within the community.
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
      </Paper>

      {/* Delete Photo Confirmation Dialog */}
      <Dialog open={Boolean(photoToDelete)} onClose={() => setPhotoToDelete(null)}>
        <DialogTitle>Delete Gallery Photo?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this matrimonial photo? This action cannot be undone.
            If this was your primary photo, another photo from your gallery will automatically be selected as primary.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhotoToDelete(null)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDeletePhoto} color="error" variant="contained">
            Delete Photo
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
          <Button onClick={() => setPreviewPhotoUrl(null)}>Close Preview</Button>
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
            ? 'Resubmit Profile for Review?'
            : 'Submit Matrimonial Profile for Approval?'}
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ color: 'text.primary', mb: 1.5 }}>
            Your matrimonial profile will be submitted to community administrators for verification. Once approved, your profile will become visible to verified members in discovery.
          </DialogContentText>
          <Typography variant="body2" color="text.secondary">
            Please make sure you have saved your personal details, education, occupation, and partner preferences accurately before submitting.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setIsSubmitDialogOpen(false)}
            disabled={isSubmittingForApproval}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitForApproval}
            variant="contained"
            color="primary"
            disabled={isSubmittingForApproval}
            startIcon={isSubmittingForApproval ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
          >
            {isSubmittingForApproval ? 'Submitting...' : 'Confirm & Submit'}
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
