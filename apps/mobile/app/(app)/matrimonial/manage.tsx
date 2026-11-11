import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  MaritalStatus,
  ManglikStatus,
  EmploymentSector,
  FamilyType,
  FamilyValues,
  DietType,
  HabitFrequency,
  OwnMatrimonialProfile,
  MatrimonialPhotoItem,
} from '@apnasamaj/shared-types';
import {
  UpsertMatrimonialProfileInput,
  UpdatePartnerPreferenceInput,
} from '@apnasamaj/validation';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
  AppHeader,
  ConfirmationDialog,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { matrimonialApi } from '../../../src/api/matrimonial.api';
import { formatHeightCm } from '../../../src/components/MatrimonialCard';

const TOTAL_STEPS = 7;

export default function MatrimonialProfileManageScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState<boolean>(false);
  const [existingProfile, setExistingProfile] = useState<OwnMatrimonialProfile | null>(null);

  // Photo management state
  const [photos, setPhotos] = useState<Array<{ id?: string; uri: string; isPrimary?: boolean }>>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [photoToDelete, setPhotoToDelete] = useState<{ id?: string; uri: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Step 1: Basic Information State
  // ---------------------------------------------------------------------------
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>('NEVER_MARRIED');
  const [heightCm, setHeightCm] = useState<string>('165');
  const [weightKg, setWeightKg] = useState<string>('');
  const [motherTongue, setMotherTongue] = useState<string>('Hindi');
  const [religion, setReligion] = useState<string>('Hindu');
  const [caste, setCaste] = useState<string>('');
  const [subCaste, setSubCaste] = useState<string>('');
  const [gotra, setGotra] = useState<string>('');
  const [manglik, setManglik] = useState<ManglikStatus>('DONT_KNOW');
  const [birthTime, setBirthTime] = useState<string>('');
  const [birthCity, setBirthCity] = useState<string>('');
  const [rashi, setRashi] = useState<string>('');
  const [nakshatra, setNakshatra] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Step 2: Education & Career State
  // ---------------------------------------------------------------------------
  const [highestEducation, setHighestEducation] = useState<string>('');
  const [educationDetails, setEducationDetails] = useState<string>('');
  const [employedIn, setEmployedIn] = useState<EmploymentSector>('PRIVATE_SECTOR');
  const [occupation, setOccupation] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [annualIncome, setAnnualIncome] = useState<string>('5-10 LPA');
  const [workCity, setWorkCity] = useState<string>('');
  const [workState, setWorkState] = useState<string>('');
  const [workCountry, setWorkCountry] = useState<string>('India');

  // ---------------------------------------------------------------------------
  // Step 3: Family Information State
  // ---------------------------------------------------------------------------
  const [familyType, setFamilyType] = useState<FamilyType>('NUCLEAR');
  const [familyValues, setFamilyValues] = useState<FamilyValues>('TRADITIONAL');
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

  // ---------------------------------------------------------------------------
  // Step 4: Lifestyle & Bio State
  // ---------------------------------------------------------------------------
  const [diet, setDiet] = useState<DietType>('VEGETARIAN');
  const [smoking, setSmoking] = useState<HabitFrequency>('NO');
  const [drinking, setDrinking] = useState<HabitFrequency>('NO');
  const [aboutMe, setAboutMe] = useState<string>('');
  const [partnerExpectations, setPartnerExpectations] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Step 5: Partner Preferences State
  // ---------------------------------------------------------------------------
  const [prefMinAge, setPrefMinAge] = useState<string>('21');
  const [prefMaxAge, setPrefMaxAge] = useState<string>('30');
  const [prefMinHeightCm, setPrefMinHeightCm] = useState<string>('150');
  const [prefMaxHeightCm, setPrefMaxHeightCm] = useState<string>('185');
  const [prefMaritalStatuses, setPrefMaritalStatuses] = useState<MaritalStatus[]>(['NEVER_MARRIED']);
  const [prefManglik, setPrefManglik] = useState<ManglikStatus | null>(null);
  const [prefDiet, setPrefDiet] = useState<DietType | null>(null);
  const [prefEducations, setPrefEducations] = useState<string>('');
  const [prefOccupations, setPrefOccupations] = useState<string>('');
  const [prefCities, setPrefCities] = useState<string>('');
  const [prefStates, setPrefStates] = useState<string>('');
  const [prefMinIncome, setPrefMinIncome] = useState<string>('');
  const [prefNotes, setPrefNotes] = useState<string>('');

  // Validation Error state
  const [stepError, setStepError] = useState<string | null>(null);

  /**
   * Load existing matrimonial profile on mount
   */
  const loadProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const data = await matrimonialApi.getMyProfile();
      if (data) {
        setExistingProfile(data);
        setMode('edit');

        // Prepopulate Step 1
        setMaritalStatus(data.maritalStatus);
        setHeightCm(String(data.heightCm));
        if (data.weightKg) setWeightKg(String(data.weightKg));
        if (data.motherTongue) setMotherTongue(data.motherTongue);
        if (data.religion) setReligion(data.religion);
        if (data.caste) setCaste(data.caste);
        if (data.subCaste) setSubCaste(data.subCaste);
        if (data.gotra) setGotra(data.gotra);
        if (data.manglik) setManglik(data.manglik);
        if (data.birthTime) setBirthTime(data.birthTime);
        if (data.birthCity) setBirthCity(data.birthCity);
        if (data.rashi) setRashi(data.rashi);
        if (data.nakshatra) setNakshatra(data.nakshatra);

        // Prepopulate Step 2
        setHighestEducation(data.highestEducation || '');
        if (data.educationDetails) setEducationDetails(data.educationDetails);
        setEmployedIn(data.employedIn);
        setOccupation(data.occupation || '');
        if (data.companyName) setCompanyName(data.companyName);
        setAnnualIncome(data.annualIncome || '');
        if (data.workCity) setWorkCity(data.workCity);
        if (data.workState) setWorkState(data.workState);
        if (data.workCountry) setWorkCountry(data.workCountry);

        // Prepopulate Step 3
        setFamilyType(data.familyType);
        setFamilyValues(data.familyValues);
        if (data.fatherName) setFatherName(data.fatherName);
        if (data.fatherOccupation) setFatherOccupation(data.fatherOccupation);
        if (data.motherName) setMotherName(data.motherName);
        if (data.motherOccupation) setMotherOccupation(data.motherOccupation);
        setBrothersCount(String(data.brothersCount || 0));
        setBrothersMarried(String(data.brothersMarried || 0));
        setSistersCount(String(data.sistersCount || 0));
        setSistersMarried(String(data.sistersMarried || 0));
        if (data.familyNativePlace) setFamilyNativePlace(data.familyNativePlace);
        if (data.aboutFamily) setAboutFamily(data.aboutFamily);

        // Prepopulate Step 4
        setDiet(data.diet);
        setSmoking(data.smoking);
        setDrinking(data.drinking);
        if (data.aboutMe) setAboutMe(data.aboutMe);
        if (data.partnerExpectations) setPartnerExpectations(data.partnerExpectations);

        // Prepopulate Step 5
        if (data.partnerPreference) {
          const pref = data.partnerPreference;
          setPrefMinAge(String(pref.minAge || 18));
          setPrefMaxAge(String(pref.maxAge || 45));
          setPrefMinHeightCm(String(pref.minHeightCm || 140));
          setPrefMaxHeightCm(String(pref.maxHeightCm || 210));
          if (pref.maritalStatuses) setPrefMaritalStatuses(pref.maritalStatuses);
          if (pref.manglik) setPrefManglik(pref.manglik);
          if (pref.diet) setPrefDiet(pref.diet);
          if (pref.preferredEducations) setPrefEducations(pref.preferredEducations.join(', '));
          if (pref.preferredOccupations) setPrefOccupations(pref.preferredOccupations.join(', '));
          if (pref.preferredCities) setPrefCities(pref.preferredCities.join(', '));
          if (pref.preferredStates) setPrefStates(pref.preferredStates.join(', '));
          if (pref.minIncome) setPrefMinIncome(pref.minIncome);
          if (pref.notes) setPrefNotes(pref.notes);
        }

        // Prepopulate Step 6 (Photos)
        if (data.photos && data.photos.length > 0) {
          setPhotos(data.photos.map((p) => ({ id: p.id, uri: p.url, isPrimary: p.isPrimary })));
        }
      } else {
        setMode('create');
      }
    } catch (err: unknown) {
      console.warn('[MatrimonialManage] Error loading profile:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  /**
   * Validate current step fields before navigating forward
   */
  const validateStep = (step: number): boolean => {
    setStepError(null);

    if (step === 1) {
      const h = parseInt(heightCm, 10);
      if (isNaN(h) || h < 120 || h > 250) {
        setStepError(
          language === 'hi'
            ? 'ऊंचाई 120 सेमी से 250 सेमी के बीच होनी चाहिए।'
            : 'Height must be between 120 cm and 250 cm.'
        );
        return false;
      }
      if (weightKg.trim()) {
        const w = parseInt(weightKg, 10);
        if (isNaN(w) || w < 30 || w > 300) {
          setStepError(
            language === 'hi'
              ? 'वजन 30 किग्रा से 300 किग्रा के बीच होना चाहिए।'
              : 'Weight must be between 30 kg and 300 kg.'
          );
          return false;
        }
      }
    }

    if (step === 2) {
      if (!highestEducation.trim()) {
        setStepError(
          language === 'hi'
            ? 'कृपया उच्चतम शिक्षा दर्ज करें।'
            : 'Highest education qualification is required.'
        );
        return false;
      }
      if (!occupation.trim()) {
        setStepError(
          language === 'hi' ? 'कृपया व्यवसाय दर्ज करें।' : 'Occupation is required.'
        );
        return false;
      }
      if (!annualIncome.trim()) {
        setStepError(
          language === 'hi' ? 'कृपया वार्षिक आय दर्ज करें।' : 'Annual income is required.'
        );
        return false;
      }
    }

    if (step === 3) {
      const bTotal = parseInt(brothersCount, 10) || 0;
      const bMarried = parseInt(brothersMarried, 10) || 0;
      if (bMarried > bTotal) {
        setStepError(
          language === 'hi'
            ? 'विवाहित भाइयों की संख्या कुल भाइयों से अधिक नहीं हो सकती।'
            : 'Married brothers cannot exceed total brothers count.'
        );
        return false;
      }

      const sTotal = parseInt(sistersCount, 10) || 0;
      const sMarried = parseInt(sistersMarried, 10) || 0;
      if (sMarried > sTotal) {
        setStepError(
          language === 'hi'
            ? 'विवाहित बहनों की संख्या कुल बहनों से अधिक नहीं हो सकती।'
            : 'Married sisters cannot exceed total sisters count.'
        );
        return false;
      }
    }

    if (step === 5) {
      const minA = parseInt(prefMinAge, 10) || 18;
      const maxA = parseInt(prefMaxAge, 10) || 80;
      if (minA > maxA) {
        setStepError(
          language === 'hi'
            ? 'न्यूनतम आयु अधिकतम आयु से अधिक नहीं हो सकती।'
            : 'Minimum age cannot be greater than maximum age.'
        );
        return false;
      }
      const minH = parseInt(prefMinHeightCm, 10) || 120;
      const maxH = parseInt(prefMaxHeightCm, 10) || 250;
      if (minH > maxH) {
        setStepError(
          language === 'hi'
            ? 'न्यूनतम ऊंचाई अधिकतम ऊंचाई से अधिक नहीं हो सकती।'
            : 'Minimum height cannot be greater than maximum height.'
        );
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < TOTAL_STEPS) {
        setCurrentStep((prev) => prev + 1);
      }
    }
  };

  const handleBack = () => {
    setStepError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    } else {
      router.back();
    }
  };

  /**
   * Photo Picker & Immediate Upload (if profile exists)
   */
  const handlePickPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert(
        language === 'hi' ? 'सीमा पूर्ण' : 'Limit Reached',
        language === 'hi'
          ? 'आप अधिकतम 5 तस्वीरें अपलोड कर सकते हैं।'
          : 'You can upload a maximum of 5 photos.'
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        language === 'hi' ? 'अनुमति अस्वीकृत' : 'Permission Denied',
        language === 'hi'
          ? 'तस्वीरें चुनने के लिए फ़ोटो लाइब्रेरी की अनुमति आवश्यक है।'
          : 'Photo library permission is required to select photos.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.85,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];

    // If profile already exists in edit mode, upload to backend immediately
    if (existingProfile?.id) {
      setIsUploadingPhoto(true);
      try {
        const uploaded = await matrimonialApi.uploadPhoto(
          {
            uri: asset.uri,
            name: asset.fileName || `matrimonial_${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          },
          photos.length === 0
        );
        setPhotos((prev) => [
          ...prev,
          { id: uploaded.id, uri: uploaded.url, isPrimary: uploaded.isPrimary },
        ]);
        Alert.alert(
          language === 'hi' ? 'सफल' : 'Success',
          language === 'hi' ? 'तस्वीर सफलतापूर्वक अपलोड हुई।' : 'Photo uploaded successfully.'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
      } finally {
        setIsUploadingPhoto(false);
      }
    } else {
      // In create wizard, store locally until final submission
      setPhotos((prev) => [
        ...prev,
        { uri: asset.uri, isPrimary: prev.length === 0 },
      ]);
    }
  };

  /**
   * Delete a gallery photo
   */
  const confirmDeletePhoto = async () => {
    if (!photoToDelete) return;

    if (photoToDelete.id) {
      try {
        await matrimonialApi.deletePhoto(photoToDelete.id);
        setPhotos((prev) => prev.filter((p) => p.id !== photoToDelete.id));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to delete photo.';
        Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
      }
    } else {
      setPhotos((prev) => prev.filter((p) => p.uri !== photoToDelete.uri));
    }
    setPhotoToDelete(null);
  };

  /**
   * Prepare payload and submit to backend
   */
  const handleSaveProfile = async (andSubmitApproval: boolean = false) => {
    // Validate required steps
    for (let s = 1; s <= 5; s++) {
      if (!validateStep(s)) {
        setCurrentStep(s);
        return;
      }
    }

    setIsSaving(true);
    try {
      const profilePayload: UpsertMatrimonialProfileInput = {
        maritalStatus,
        heightCm: parseInt(heightCm, 10) || 165,
        weightKg: weightKg.trim() ? parseInt(weightKg, 10) : null,
        motherTongue: motherTongue.trim() || 'Hindi',
        religion: religion.trim() || 'Hindu',
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
        brothersCount: parseInt(brothersCount, 10) || 0,
        brothersMarried: parseInt(brothersMarried, 10) || 0,
        sistersCount: parseInt(sistersCount, 10) || 0,
        sistersMarried: parseInt(sistersMarried, 10) || 0,
        familyNativePlace: familyNativePlace.trim() || null,
        aboutFamily: aboutFamily.trim() || null,
        diet,
        smoking,
        drinking,
        aboutMe: aboutMe.trim() || null,
        partnerExpectations: partnerExpectations.trim() || null,
      };

      // 1. Save Profile
      const savedProfile = await matrimonialApi.upsertMyProfile(profilePayload);
      setExistingProfile(savedProfile);

      // 2. Save Partner Preferences
      const prefPayload: UpdatePartnerPreferenceInput = {
        minAge: parseInt(prefMinAge, 10) || 18,
        maxAge: parseInt(prefMaxAge, 10) || 45,
        minHeightCm: parseInt(prefMinHeightCm, 10) || 140,
        maxHeightCm: parseInt(prefMaxHeightCm, 10) || 210,
        maritalStatuses: prefMaritalStatuses,
        manglik: prefManglik,
        diet: prefDiet,
        preferredEducations: prefEducations.split(',').map((s) => s.trim()).filter(Boolean),
        preferredOccupations: prefOccupations.split(',').map((s) => s.trim()).filter(Boolean),
        preferredCities: prefCities.split(',').map((s) => s.trim()).filter(Boolean),
        preferredStates: prefStates.split(',').map((s) => s.trim()).filter(Boolean),
        minIncome: prefMinIncome.trim() || null,
        notes: prefNotes.trim() || null,
      };
      await matrimonialApi.upsertMyPreferences(prefPayload);

      // 3. Upload any pending local photos in create mode
      if (mode === 'create' && photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          if (!p.id) {
            try {
              await matrimonialApi.uploadPhoto(
                {
                  uri: p.uri,
                  name: `matrimonial_${Date.now()}_${i}.jpg`,
                  type: 'image/jpeg',
                },
                i === 0
              );
            } catch (pErr) {
              console.warn('[MatrimonialManage] Error uploading photo:', pErr);
            }
          }
        }
      }

      // 4. Submit for Approval if requested
      if (andSubmitApproval) {
        setIsSubmittingApproval(true);
        await matrimonialApi.submitMyProfile();
      }

      Alert.alert(
        language === 'hi' ? 'सफलता' : 'Success',
        andSubmitApproval
          ? language === 'hi'
            ? 'आपका विवाह बायोडाटा सफलतापूर्वक सहेज लिया गया है और व्यवस्थापक अनुमोदन के लिए प्रस्तुत कर दिया गया है।'
            : 'Your matrimonial profile has been saved and submitted for admin approval.'
          : language === 'hi'
            ? 'आपका विवाह बायोडाटा सफलतापूर्वक सहेज लिया गया है।'
            : 'Your matrimonial profile has been saved successfully.',
        [
          {
            text: language === 'hi' ? 'ठीक है' : 'OK',
            onPress: () => router.replace('/(app)/matrimonial' as any),
          },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save matrimonial profile.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsSaving(false);
      setIsSubmittingApproval(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Typography variant="sm" color="#64748B" style={{ marginTop: 12 }}>
          {language === 'hi' ? 'बायोडाटा विवरण लोड हो रहा है...' : 'Loading profile details...'}
        </Typography>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 1. Header with back and language switcher */}
      <AppHeader
        mode="detail"
        title={
          mode === 'edit'
            ? language === 'hi' ? 'बायोडाटा संपादित करें' : 'Edit Matrimonial Profile'
            : language === 'hi' ? 'नया विवाह बायोडाटा' : 'Create Matrimonial Profile'
        }
        communitySlug={communitySlug}
        showBackButton={true}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        onBackPress={handleBack}
      />

      {/* Moderation Status Banner if in Edit Mode */}
      {existingProfile && (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor:
                existingProfile.status === 'APPROVED'
                  ? '#ECFDF5'
                  : existingProfile.status === 'REJECTED'
                    ? '#FEF2F2'
                    : '#FFFBEB',
            },
          ]}
        >
          <View style={styles.statusBannerContent}>
            <Badge
              label={
                existingProfile.status === 'APPROVED'
                  ? language === 'hi' ? 'सत्यापित व स्वीकृत' : 'Approved'
                  : existingProfile.status === 'PENDING_APPROVAL'
                    ? language === 'hi' ? 'अनुमोदन लंबित' : 'Pending Approval'
                    : existingProfile.status === 'REJECTED'
                      ? language === 'hi' ? 'अस्वीकृत' : 'Rejected'
                      : language === 'hi' ? 'ड्राफ्ट' : 'Draft'
              }
              variant={
                existingProfile.status === 'APPROVED'
                  ? 'success'
                  : existingProfile.status === 'REJECTED'
                    ? 'error'
                    : 'warning'
              }
              size="sm"
            />
            {existingProfile.status === 'REJECTED' && existingProfile.rejectionReason && (
              <Typography variant="xs" color="#EF4444" style={{ marginTop: 4 }}>
                {language === 'hi' ? 'कारण: ' : 'Reason: '}
                {existingProfile.rejectionReason}
              </Typography>
            )}
          </View>
        </View>
      )}

      {/* 2. Step Progress Bar */}
      <View style={styles.stepperContainer}>
        <View style={styles.stepPillsRow}>
          {[1, 2, 3, 4, 5, 6, 7].map((s) => {
            const isActive = s === currentStep;
            const isCompleted = s < currentStep;
            return (
              <Pressable
                key={s}
                onPress={() => {
                  if (mode === 'edit' || s < currentStep) {
                    if (validateStep(currentStep)) setCurrentStep(s);
                  }
                }}
                style={[
                  styles.stepPill,
                  isActive && styles.stepPillActive,
                  isCompleted && styles.stepPillCompleted,
                ]}
              >
                <Typography
                  variant="xs"
                  weight="bold"
                  color={isActive ? '#FFFFFF' : isCompleted ? '#1976D2' : '#64748B'}
                >
                  {s}
                </Typography>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.stepTitleRow}>
          <Typography variant="xs" color="#64748B">
            {language === 'hi' ? `चरण ${currentStep} / ${TOTAL_STEPS}` : `Step ${currentStep} of ${TOTAL_STEPS}`}
          </Typography>
          <Typography variant="xs" weight="bold" color="#1976D2">
            {currentStep === 1
              ? language === 'hi' ? 'व्यक्तिगत जानकारी' : 'Basic Details'
              : currentStep === 2
                ? language === 'hi' ? 'शिक्षा व कार्य' : 'Education & Career'
                : currentStep === 3
                  ? language === 'hi' ? 'पारिवारिक विवरण' : 'Family Details'
                  : currentStep === 4
                    ? language === 'hi' ? 'जीवनशैली व परिचय' : 'Lifestyle & Bio'
                    : currentStep === 5
                      ? language === 'hi' ? 'जीवनसाथी प्राथमिकताएं' : 'Partner Preferences'
                      : currentStep === 6
                        ? language === 'hi' ? 'तस्वीरें (Photos)' : 'Profile Photos'
                        : language === 'hi' ? 'पूर्वावलोकन व जमा करें' : 'Preview & Submit'}
          </Typography>
        </View>
      </View>

      {/* Step Error Banner */}
      {stepError && (
        <View style={styles.errorBanner}>
          <Typography variant="xs" color="#EF4444" weight="semibold">
            ⚠️ {stepError}
          </Typography>
        </View>
      )}

      {/* 3. Step Content Area */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 100, 120) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ================================================================= */}
        {/* STEP 1: Basic Information */}
        {/* ================================================================= */}
        {currentStep === 1 && (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              👤 {language === 'hi' ? 'व्यक्तिगत जानकारी' : 'Personal Information'}
            </Typography>

            {/* Marital Status */}
            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'वैवाहिक स्थिति (Marital Status) *' : 'Marital Status *'}
            </Typography>
            <View style={styles.chipsGrid}>
              {[
                { key: 'NEVER_MARRIED', labelHi: 'अविवाहित', labelEn: 'Never Married' },
                { key: 'DIVORCED', labelHi: 'तलाकशुदा', labelEn: 'Divorced' },
                { key: 'WIDOWED', labelHi: 'विधवा / विधुर', labelEn: 'Widowed' },
                { key: 'AWAITING_DIVORCE', labelHi: 'तलाक प्रतीक्षारत', labelEn: 'Awaiting Divorce' },
              ].map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMaritalStatus(m.key as MaritalStatus)}
                  style={[
                    styles.chipOption,
                    maritalStatus === m.key && styles.chipOptionSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={maritalStatus === m.key ? 'bold' : 'regular'}
                    color={maritalStatus === m.key ? '#1976D2' : '#334155'}
                  >
                    {language === 'hi' ? m.labelHi : m.labelEn}
                  </Typography>
                </Pressable>
              ))}
            </View>

            {/* Height & Weight */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'ऊंचाई (सेमी) *' : 'Height (cm) *'}
                </Typography>
                <Input
                  value={heightCm}
                  onChangeText={setHeightCm}
                  placeholder="165"
                  keyboardType="number-pad"
                  containerStyle={{ marginBottom: 4 }}
                />
                <Typography variant="xs" color="#64748B" style={{ fontSize: 10 }}>
                  {formatHeightCm(parseInt(heightCm, 10) || 165)}
                </Typography>
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'वजन (किग्रा)' : 'Weight (kg)'}
                </Typography>
                <Input
                  value={weightKg}
                  onChangeText={setWeightKg}
                  placeholder="65"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Sub-Caste and Gotra */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'उपजाति (Sub-Caste)' : 'Sub-Caste'}
                </Typography>
                <Input
                  value={subCaste}
                  onChangeText={setSubCaste}
                  placeholder={language === 'hi' ? 'जैसे: कश्यप, कहार' : 'e.g. Kashyap'}
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'गोत्र (Gotra)' : 'Gotra'}
                </Typography>
                <Input
                  value={gotra}
                  onChangeText={setGotra}
                  placeholder={language === 'hi' ? 'जैसे: भारद्वाज' : 'e.g. Bharadwaj'}
                />
              </View>
            </View>

            {/* Manglik Status */}
            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'मांगलिक स्थिति (Manglik) *' : 'Manglik Status *'}
            </Typography>
            <View style={styles.chipsGrid}>
              {[
                { key: 'NON_MANGLIK', labelHi: 'गैर-मांगलिक', labelEn: 'Non-Manglik' },
                { key: 'MANGLIK', labelHi: 'मांगलिक', labelEn: 'Manglik' },
                { key: 'ANSHIK', labelHi: 'आंशिक मांगलिक', labelEn: 'Anshik' },
                { key: 'DONT_KNOW', labelHi: 'पता नहीं', labelEn: "Don't Know" },
              ].map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setManglik(m.key as ManglikStatus)}
                  style={[
                    styles.chipOption,
                    manglik === m.key && styles.chipOptionSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={manglik === m.key ? 'bold' : 'regular'}
                    color={manglik === m.key ? '#1976D2' : '#334155'}
                  >
                    {language === 'hi' ? m.labelHi : m.labelEn}
                  </Typography>
                </Pressable>
              ))}
            </View>

            {/* Birth Details (Horoscope) */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'जन्म समय (HH:MM)' : 'Birth Time'}
                </Typography>
                <Input
                  value={birthTime}
                  onChangeText={setBirthTime}
                  placeholder="14:30"
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'जन्म स्थान' : 'Birth City'}
                </Typography>
                <Input
                  value={birthCity}
                  onChangeText={setBirthCity}
                  placeholder={language === 'hi' ? 'शहर का नाम' : 'City name'}
                />
              </View>
            </View>
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Education & Career */}
        {/* ================================================================= */}
        {currentStep === 2 && (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              🎓 {language === 'hi' ? 'शिक्षा व कार्य विवरण' : 'Education & Career'}
            </Typography>

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'उच्चतम शिक्षा *' : 'Highest Education *'}
            </Typography>
            <Input
              value={highestEducation}
              onChangeText={setHighestEducation}
              placeholder={language === 'hi' ? 'जैसे: B.Tech, MBA, MBBS, B.Com' : 'e.g. B.Tech, MBA, M.Sc'}
            />

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'शिक्षा विवरण (वैकल्पिक)' : 'Education Details (Optional)'}
            </Typography>
            <Input
              value={educationDetails}
              onChangeText={setEducationDetails}
              placeholder={language === 'hi' ? 'कॉलेज या विशेषज्ञता' : 'College or specialization'}
            />

            {/* Employment Sector */}
            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'कार्य क्षेत्र (Employment Sector) *' : 'Employment Sector *'}
            </Typography>
            <View style={styles.chipsGrid}>
              {[
                { key: 'PRIVATE_SECTOR', labelHi: 'निजी क्षेत्र (Private)', labelEn: 'Private Sector' },
                { key: 'GOVERNMENT_PSU', labelHi: 'सरकारी / PSU', labelEn: 'Government / PSU' },
                { key: 'BUSINESS_SELF_EMPLOYED', labelHi: 'व्यवसाय / स्वयंरोजगार', labelEn: 'Business' },
                { key: 'DEFENSE', labelHi: 'रक्षा सेवाएं (Defense)', labelEn: 'Defense' },
                { key: 'NOT_WORKING', labelHi: 'कार्यरत नहीं', labelEn: 'Not Working' },
              ].map((sec) => (
                <Pressable
                  key={sec.key}
                  onPress={() => setEmployedIn(sec.key as EmploymentSector)}
                  style={[
                    styles.chipOption,
                    employedIn === sec.key && styles.chipOptionSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={employedIn === sec.key ? 'bold' : 'regular'}
                    color={employedIn === sec.key ? '#1976D2' : '#334155'}
                  >
                    {language === 'hi' ? sec.labelHi : sec.labelEn}
                  </Typography>
                </Pressable>
              ))}
            </View>

            {/* Occupation & Company */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'व्यवसाय (Occupation) *' : 'Occupation *'}
                </Typography>
                <Input
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder={language === 'hi' ? 'जैसे: Software Engineer' : 'e.g. Teacher, Doctor'}
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'वार्षिक आय *' : 'Annual Income *'}
                </Typography>
                <Input
                  value={annualIncome}
                  onChangeText={setAnnualIncome}
                  placeholder={language === 'hi' ? 'जैसे: 8-10 लाख' : 'e.g. 8-10 LPA'}
                />
              </View>
            </View>

            {/* Work Location */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'कार्य शहर' : 'Work City'}
                </Typography>
                <Input
                  value={workCity}
                  onChangeText={setWorkCity}
                  placeholder={language === 'hi' ? 'जैसे: इंदौर' : 'e.g. Indore'}
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'कार्य राज्य' : 'Work State'}
                </Typography>
                <Input
                  value={workState}
                  onChangeText={setWorkState}
                  placeholder={language === 'hi' ? 'जैसे: मध्य प्रदेश' : 'e.g. MP'}
                />
              </View>
            </View>
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 3: Family Details */}
        {/* ================================================================= */}
        {currentStep === 3 && (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              👨‍👩‍👧‍👦 {language === 'hi' ? 'पारिवारिक विवरण' : 'Family Details'}
            </Typography>

            {/* Family Type & Values */}
            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'परिवार का प्रकार *' : 'Family Type *'}
            </Typography>
            <View style={styles.chipsGrid}>
              {[
                { key: 'NUCLEAR', labelHi: 'एकल परिवार (Nuclear)', labelEn: 'Nuclear' },
                { key: 'JOINT', labelHi: 'संयुक्त परिवार (Joint)', labelEn: 'Joint' },
              ].map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFamilyType(f.key as FamilyType)}
                  style={[
                    styles.chipOption,
                    familyType === f.key && styles.chipOptionSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={familyType === f.key ? 'bold' : 'regular'}
                    color={familyType === f.key ? '#1976D2' : '#334155'}
                  >
                    {language === 'hi' ? f.labelHi : f.labelEn}
                  </Typography>
                </Pressable>
              ))}
            </View>

            {/* Parents Occupation */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'पिता का व्यवसाय' : "Father's Occupation"}
                </Typography>
                <Input
                  value={fatherOccupation}
                  onChangeText={setFatherOccupation}
                  placeholder={language === 'hi' ? 'जैसे: किसान, व्यापारी' : 'e.g. Businessman'}
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'माता का व्यवसाय' : "Mother's Occupation"}
                </Typography>
                <Input
                  value={motherOccupation}
                  onChangeText={setMotherOccupation}
                  placeholder={language === 'hi' ? 'जैसे: गृहिणी' : 'e.g. Homemaker'}
                />
              </View>
            </View>

            {/* Siblings Count */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'कुल भाई' : 'Brothers'}
                </Typography>
                <Input
                  value={brothersCount}
                  onChangeText={setBrothersCount}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'विवाहित भाई' : 'Married Brothers'}
                </Typography>
                <Input
                  value={brothersMarried}
                  onChangeText={setBrothersMarried}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'कुल बहनें' : 'Sisters'}
                </Typography>
                <Input
                  value={sistersCount}
                  onChangeText={setSistersCount}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'विवाहित बहनें' : 'Married Sisters'}
                </Typography>
                <Input
                  value={sistersMarried}
                  onChangeText={setSistersMarried}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'मूल निवास / पैतृक स्थान' : 'Native Place'}
            </Typography>
            <Input
              value={familyNativePlace}
              onChangeText={setFamilyNativePlace}
              placeholder={language === 'hi' ? 'जैसे: रीवा, मध्य प्रदेश' : 'e.g. Rewa, MP'}
            />
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 4: Lifestyle & Bio */}
        {/* ================================================================= */}
        {currentStep === 4 && (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              🥗 {language === 'hi' ? 'खान-पान व आदतें' : 'Lifestyle & Habits'}
            </Typography>

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'आहार (Diet) *' : 'Diet *'}
            </Typography>
            <View style={styles.chipsGrid}>
              {[
                { key: 'VEGETARIAN', labelHi: 'शाकाहारी (Veg)', labelEn: 'Vegetarian' },
                { key: 'EGGETARIAN', labelHi: 'अंडा युक्त', labelEn: 'Eggetarian' },
                { key: 'NON_VEGETARIAN', labelHi: 'मांसाहारी (Non-Veg)', labelEn: 'Non-Vegetarian' },
                { key: 'JAIN', labelHi: 'जैन शाकाहार', labelEn: 'Jain' },
              ].map((d) => (
                <Pressable
                  key={d.key}
                  onPress={() => setDiet(d.key as DietType)}
                  style={[
                    styles.chipOption,
                    diet === d.key && styles.chipOptionSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={diet === d.key ? 'bold' : 'regular'}
                    color={diet === d.key ? '#1976D2' : '#334155'}
                  >
                    {language === 'hi' ? d.labelHi : d.labelEn}
                  </Typography>
                </Pressable>
              ))}
            </View>

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'अपने बारे में संक्षेप में (About Me)' : 'About Myself'}
            </Typography>
            <Input
              value={aboutMe}
              onChangeText={setAboutMe}
              placeholder={
                language === 'hi'
                  ? 'अपनी रुचि, स्वभाव और जीवन मूल्यों के बारे में बताएं...'
                  : 'Describe your personality, interests and values...'
              }
              multiline
              numberOfLines={4}
              maxLength={2000}
            />

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'जीवनसाथी से अपेक्षाएं' : 'Partner Expectations'}
            </Typography>
            <Input
              value={partnerExpectations}
              onChangeText={setPartnerExpectations}
              placeholder={
                language === 'hi'
                  ? 'जीवनसाथी की शिक्षा, स्वभाव या परिवार के बारे में अपेक्षाएं...'
                  : 'What qualities and values are you looking for in a partner?'
              }
              multiline
              numberOfLines={4}
              maxLength={2000}
            />
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 5: Partner Preferences */}
        {/* ================================================================= */}
        {currentStep === 5 && (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              🤝 {language === 'hi' ? 'जीवनसाथी प्राथमिकताएं' : 'Partner Preferences'}
            </Typography>

            {/* Age Range */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'न्यूनतम आयु *' : 'Min Age *'}
                </Typography>
                <Input
                  value={prefMinAge}
                  onChangeText={setPrefMinAge}
                  placeholder="21"
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'अधिकतम आयु *' : 'Max Age *'}
                </Typography>
                <Input
                  value={prefMaxAge}
                  onChangeText={setPrefMaxAge}
                  placeholder="28"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Height Range */}
            <View style={styles.rowTwoCol}>
              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'न्यूनतम ऊंचाई (सेमी) *' : 'Min Height (cm) *'}
                </Typography>
                <Input
                  value={prefMinHeightCm}
                  onChangeText={setPrefMinHeightCm}
                  placeholder="145"
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.colFlex}>
                <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
                  {language === 'hi' ? 'अधिकतम ऊंचाई (सेमी) *' : 'Max Height (cm) *'}
                </Typography>
                <Input
                  value={prefMaxHeightCm}
                  onChangeText={setPrefMaxHeightCm}
                  placeholder="180"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Preferred Cities and Notes */}
            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'पसंदीदा शहर (अल्पविराम से अलग करें)' : 'Preferred Cities (comma separated)'}
            </Typography>
            <Input
              value={prefCities}
              onChangeText={setPrefCities}
              placeholder={language === 'hi' ? 'जैसे: इंदौर, भोपाल, जबलपुर' : 'e.g. Indore, Bhopal'}
            />

            <Typography variant="xs" weight="semibold" color="#475569" style={styles.fieldLabel}>
              {language === 'hi' ? 'अतिरिक्त प्राथमिकताएं' : 'Additional Preference Notes'}
            </Typography>
            <Input
              value={prefNotes}
              onChangeText={setPrefNotes}
              placeholder={language === 'hi' ? 'कोई विशेष प्राथमिकता या शर्त...' : 'Any specific preference...'}
              multiline
              numberOfLines={3}
            />
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 6: Profile Photos */}
        {/* ================================================================= */}
        {currentStep === 6 && (
          <Card style={styles.sectionCard}>
            <View style={styles.photoHeaderRow}>
              <Typography variant="sm" weight="bold" color="#0F172A">
                📷 {language === 'hi' ? 'गैलरी तस्वीरें' : 'Profile Photos'} ({photos.length}/5)
              </Typography>
              {photos.length < 5 && (
                <Button
                  title={language === 'hi' ? '+ फ़ोटो जोड़ें' : '+ Add Photo'}
                  onPress={handlePickPhoto}
                  variant="outline"
                  size="sm"
                  loading={isUploadingPhoto}
                />
              )}
            </View>

            <Typography variant="xs" color="#64748B" style={styles.photoHelpText}>
              {language === 'hi'
                ? 'स्पष्ट और शालीन तस्वीरें जोड़ें। पहली तस्वीर मुख्य फ़ोटो के रूप में प्रदर्शित होगी।'
                : 'Upload clear and appropriate portrait photos. The first photo is your primary profile photo.'}
            </Typography>

            {photos.length === 0 ? (
              <View style={styles.emptyPhotosBox}>
                <Typography variant="lg" style={{ marginBottom: 6 }}>
                  🖼️
                </Typography>
                <Typography variant="sm" weight="semibold" color="#0F172A">
                  {language === 'hi' ? 'कोई तस्वीर नहीं जोड़ी गई' : 'No Photos Added Yet'}
                </Typography>
                <Typography variant="xs" color="#64748B" align="center" style={{ marginTop: 4 }}>
                  {language === 'hi'
                    ? 'तस्वीरें जोड़ने से प्रस्ताव मिलने की संभावना कई गुना बढ़ जाती है।'
                    : 'Adding photos significantly increases your proposal response rate.'}
                </Typography>
              </View>
            ) : (
              <View style={styles.photosGrid}>
                {photos.map((item, index) => (
                  <View key={item.id || item.uri} style={styles.photoCard}>
                    <Image source={{ uri: item.uri }} style={styles.photoThumbnail} resizeMode="cover" />
                    {index === 0 && (
                      <View style={styles.primaryBadgePill}>
                        <Typography variant="xs" color="#FFFFFF" weight="bold" style={{ fontSize: 9 }}>
                          {language === 'hi' ? 'मुख्य' : 'Primary'}
                        </Typography>
                      </View>
                    )}
                    <Pressable
                      onPress={() => setPhotoToDelete(item)}
                      style={styles.deletePhotoIconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete photo"
                    >
                      <Typography variant="xs" color="#FFFFFF" weight="bold">
                        ✕
                      </Typography>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* ================================================================= */}
        {/* STEP 7: Preview & Final Submission */}
        {/* ================================================================= */}
        {currentStep === 7 && (
          <View style={styles.previewContainer}>
            <Card style={styles.sectionCard}>
              <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionHeader}>
                📋 {language === 'hi' ? 'बायोडाटा पूर्वावलोकन (Summary)' : 'Biodata Summary Preview'}
              </Typography>

              {/* Basic Section Summary */}
              <View style={styles.previewSection}>
                <View style={styles.previewSectionTitleRow}>
                  <Typography variant="sm" weight="bold" color="#1976D2">
                    1. {language === 'hi' ? 'व्यक्तिगत जानकारी' : 'Basic Information'}
                  </Typography>
                  <Pressable onPress={() => setCurrentStep(1)}>
                    <Typography variant="xs" color="#1976D2" weight="bold">
                      {language === 'hi' ? 'बदलें ✏️' : 'Edit ✏️'}
                    </Typography>
                  </Pressable>
                </View>
                <Typography variant="xs" color="#334155">
                  {maritalStatus} • {formatHeightCm(parseInt(heightCm, 10) || 165)} • {religion} • {subCaste || 'N/A'} • {gotra || 'N/A'}
                </Typography>
              </View>

              {/* Education / Occupation Summary */}
              <View style={styles.previewSection}>
                <View style={styles.previewSectionTitleRow}>
                  <Typography variant="sm" weight="bold" color="#1976D2">
                    2. {language === 'hi' ? 'शिक्षा व कार्य' : 'Education & Career'}
                  </Typography>
                  <Pressable onPress={() => setCurrentStep(2)}>
                    <Typography variant="xs" color="#1976D2" weight="bold">
                      {language === 'hi' ? 'बदलें ✏️' : 'Edit ✏️'}
                    </Typography>
                  </Pressable>
                </View>
                <Typography variant="xs" color="#334155">
                  {highestEducation} • {occupation} ({employedIn}) • {annualIncome} • {workCity}, {workState}
                </Typography>
              </View>

              {/* Family Summary */}
              <View style={styles.previewSection}>
                <View style={styles.previewSectionTitleRow}>
                  <Typography variant="sm" weight="bold" color="#1976D2">
                    3. {language === 'hi' ? 'पारिवारिक विवरण' : 'Family Details'}
                  </Typography>
                  <Pressable onPress={() => setCurrentStep(3)}>
                    <Typography variant="xs" color="#1976D2" weight="bold">
                      {language === 'hi' ? 'बदलें ✏️' : 'Edit ✏️'}
                    </Typography>
                  </Pressable>
                </View>
                <Typography variant="xs" color="#334155">
                  {familyType} Family • {familyNativePlace || 'Native place not specified'}
                </Typography>
              </View>

              {/* Partner Preferences Summary */}
              <View style={styles.previewSection}>
                <View style={styles.previewSectionTitleRow}>
                  <Typography variant="sm" weight="bold" color="#1976D2">
                    4. {language === 'hi' ? 'जीवनसाथी प्राथमिकताएं' : 'Partner Preferences'}
                  </Typography>
                  <Pressable onPress={() => setCurrentStep(5)}>
                    <Typography variant="xs" color="#1976D2" weight="bold">
                      {language === 'hi' ? 'बदलें ✏️' : 'Edit ✏️'}
                    </Typography>
                  </Pressable>
                </View>
                <Typography variant="xs" color="#334155">
                  Age: {prefMinAge}-{prefMaxAge} yrs • Height: {prefMinHeightCm}-{prefMaxHeightCm} cm
                </Typography>
              </View>

              {/* Photos Summary */}
              <View style={styles.previewSection}>
                <View style={styles.previewSectionTitleRow}>
                  <Typography variant="sm" weight="bold" color="#1976D2">
                    5. {language === 'hi' ? 'फ़ोटो' : 'Photos'} ({photos.length})
                  </Typography>
                  <Pressable onPress={() => setCurrentStep(6)}>
                    <Typography variant="xs" color="#1976D2" weight="bold">
                      {language === 'hi' ? 'बदलें ✏️' : 'Edit ✏️'}
                    </Typography>
                  </Pressable>
                </View>
                <Typography variant="xs" color="#334155">
                  {photos.length > 0
                    ? language === 'hi'
                      ? `${photos.length} तस्वीरें संलग्न हैं।`
                      : `${photos.length} photos attached.`
                    : language === 'hi'
                      ? 'कोई तस्वीर नहीं जोड़ी गई।'
                      : 'No photos attached.'}
                </Typography>
              </View>
            </Card>

            {/* Action Buttons */}
            <View style={styles.submitActionsWrapper}>
              <Button
                title={language === 'hi' ? 'ड्राफ्ट के रूप में सहेजें' : 'Save as Draft'}
                onPress={() => handleSaveProfile(false)}
                variant="outline"
                loading={isSaving && !isSubmittingApproval}
                style={{ marginBottom: 10 }}
              />

              <Button
                title={
                  language === 'hi'
                    ? 'सत्यापन व अनुमोदन हेतु जमा करें'
                    : 'Submit for Admin Approval'
                }
                onPress={() => handleSaveProfile(true)}
                variant="primary"
                loading={isSaving && isSubmittingApproval}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* 4. Bottom Sticky Navigation Bar */}
      {currentStep < 7 && (
        <View
          style={[
            styles.bottomStickyBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Button
            title={
              currentStep === 1
                ? language === 'hi' ? 'रद्द करें' : 'Cancel'
                : language === 'hi' ? '← पिछला' : '← Previous'
            }
            onPress={handleBack}
            variant="outline"
            style={styles.navBtnHalf}
          />

          <Button
            title={
              currentStep === 6
                ? language === 'hi' ? 'समीक्षा करें →' : 'Review →'
                : language === 'hi' ? 'आगे बढ़ें →' : 'Next →'
            }
            onPress={handleNext}
            variant="primary"
            style={styles.navBtnHalf}
          />
        </View>
      )}

      {/* Confirmation Dialog for Photo Deletion */}
      <ConfirmationDialog
        visible={Boolean(photoToDelete)}
        title={language === 'hi' ? 'तस्वीर हटाएं?' : 'Delete Photo?'}
        message={
          language === 'hi'
            ? 'क्या आप वाकई इस तस्वीर को अपनी बायोडाटा गैलरी से हटाना चाहते हैं?'
            : 'Are you sure you want to remove this photo from your matrimonial gallery?'
        }
        confirmLabel={language === 'hi' ? 'हटाएं' : 'Delete'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        onConfirm={confirmDeletePhoto}
        onCancel={() => setPhotoToDelete(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  statusBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CBD5E1',
  },
  statusBannerContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  stepperContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  stepPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPillActive: {
    backgroundColor: '#1976D2',
  },
  stepPillCompleted: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#1976D2',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  scrollContent: {
    padding: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  sectionHeader: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  fieldLabel: {
    marginBottom: 6,
    marginTop: 10,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chipOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1976D2',
  },
  rowTwoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  colFlex: {
    flex: 1,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  photoHelpText: {
    marginBottom: 14,
    lineHeight: 16,
  },
  emptyPhotosBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoCard: {
    width: 100,
    height: 125,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  primaryBadgePill: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#1976D2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deletePhotoIconBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    gap: 16,
  },
  previewSection: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  previewSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  submitActionsWrapper: {
    marginTop: 8,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  navBtnHalf: {
    flex: 1,
  },
});
