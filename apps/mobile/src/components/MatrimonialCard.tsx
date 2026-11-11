import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { PublicMatrimonialProfileListItem } from '@apnasamaj/shared-types';
import { Card } from './Card';
import { Typography } from './Typography';
import { Badge } from './Badge';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export interface MatrimonialCardProps {
  profile: PublicMatrimonialProfileListItem;
  onPress: (profileId: string) => void;
  onSendInterest?: (profile: PublicMatrimonialProfileListItem) => void;
  isOwnProfile?: boolean;
}

export function formatHeightCm(cm?: number | null): string {
  if (!cm || cm <= 0) return '';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${cm} cm (${feet}'${inches}")`;
}

export const MatrimonialCard: React.FC<MatrimonialCardProps> = ({
  profile,
  onPress,
  onSendInterest,
  isOwnProfile = false,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const [imageError, setImageError] = useState(false);

  const initial = profile.fullName ? profile.fullName.trim().charAt(0).toUpperCase() : 'वि';
  const photoUrl = profile.primaryPhotoUrl || profile.avatarUrl;

  // Location string
  const locationParts = [profile.city, profile.state].filter(Boolean);
  const locationText = locationParts.join(', ');

  // Localized Gender
  const genderLabel =
    profile.gender === 'FEMALE'
      ? language === 'hi'
        ? '👰 वधू'
        : 'Bride'
      : profile.gender === 'MALE'
        ? language === 'hi'
          ? '🤵 वर'
          : 'Groom'
        : '';

  // Localized Marital Status
  const maritalLabel = (() => {
    switch (profile.maritalStatus) {
      case 'NEVER_MARRIED':
        return language === 'hi' ? 'अविवाहित' : 'Never Married';
      case 'DIVORCED':
        return language === 'hi' ? 'तलाकशुदा' : 'Divorced';
      case 'WIDOWED':
        return language === 'hi' ? 'विधवा/विधुर' : 'Widowed';
      case 'AWAITING_DIVORCE':
        return language === 'hi' ? 'तलाक प्रक्रियाधीन' : 'Awaiting Divorce';
      default:
        return profile.maritalStatus || '';
    }
  })();

  // Localized Manglik
  const manglikLabel = (() => {
    switch (profile.manglik) {
      case 'MANGLIK':
        return language === 'hi' ? 'मांगलिक' : 'Manglik';
      case 'NON_MANGLIK':
        return language === 'hi' ? 'अमांगलिक' : 'Non-Manglik';
      case 'ANSHIK':
        return language === 'hi' ? 'आंशिक मांगलिक' : 'Anshik';
      default:
        return null;
    }
  })();

  const interestStatus = profile.interestStatus;

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(profile.id)}
        style={styles.pressableArea}
        android_ripple={{ color: '#E0F2FE', borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${profile.fullName}, ${profile.age ? `${profile.age} years, ` : ''}${profile.occupation || ''}`}
      >
        <View style={styles.topRow}>
          {/* 1. Candidate Photo / Initial Fallback */}
          <View style={styles.photoContainer}>
            {photoUrl && !imageError ? (
              <Image
                source={{ uri: photoUrl }}
                style={styles.photo}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.photoFallback}>
                <Typography variant="xl" weight="bold" color="#0369A1">
                  {initial}
                </Typography>
              </View>
            )}

            {/* Photos Count Badge */}
            {profile.photosCount > 1 ? (
              <View style={styles.photoCountBadge}>
                <Typography variant="xs" color="#FFFFFF" weight="bold" style={styles.photoCountText}>
                  📷 {profile.photosCount}
                </Typography>
              </View>
            ) : null}
          </View>

          {/* 2. Candidate Summary Column */}
          <View style={styles.detailsContainer}>
            {/* Name + Verified Pill */}
            <View style={styles.headerRow}>
              <Typography
                variant="md"
                weight="bold"
                color="#0F172A"
                numberOfLines={1}
                style={styles.nameText}
              >
                {profile.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
              </Typography>

              {profile.isVerified ? (
                <View style={styles.verifiedBadge}>
                  <Typography variant="xs" weight="bold" color="#16A34A" style={styles.verifiedText}>
                    ✓ {language === 'hi' ? 'सत्यापित' : 'Verified'}
                  </Typography>
                </View>
              ) : null}
            </View>

            {/* Bride/Groom + Marital Status Badges */}
            <View style={styles.badgeRow}>
              {genderLabel ? (
                <View
                  style={[
                    styles.roleBadge,
                    profile.gender === 'FEMALE' ? styles.brideBadge : styles.groomBadge,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight="bold"
                    color={profile.gender === 'FEMALE' ? '#BE185D' : '#0369A1'}
                  >
                    {genderLabel}
                  </Typography>
                </View>
              ) : null}

              {maritalLabel ? (
                <View style={styles.maritalBadge}>
                  <Typography variant="xs" weight="medium" color="#475569">
                    {maritalLabel}
                  </Typography>
                </View>
              ) : null}
            </View>

            {/* Age • Height • Sub-Caste */}
            <Typography variant="xs" color="#64748B" style={styles.metricsLine} numberOfLines={1}>
              {[
                profile.age ? `${profile.age} ${language === 'hi' ? 'वर्ष' : 'yrs'}` : null,
                formatHeightCm(profile.heightCm),
                profile.subCaste ? (language === 'hi' ? `उपजाति: ${profile.subCaste}` : profile.subCaste) : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Typography>

            {/* Career & Education */}
            <Typography
              variant="xs"
              weight="semibold"
              color="#334155"
              numberOfLines={1}
              style={styles.careerLine}
            >
              {[profile.occupation, profile.highestEducation].filter(Boolean).join(' • ') || (language === 'hi' ? 'विवरण उपलब्ध नहीं' : 'Details not specified')}
            </Typography>

            {/* Location */}
            {locationText ? (
              <View style={styles.locationRow}>
                <Typography variant="xs" color="#94A3B8" style={styles.pinIcon}>
                  📍
                </Typography>
                <Typography variant="xs" color="#64748B" numberOfLines={1} style={styles.locationText}>
                  {locationText}
                </Typography>
              </View>
            ) : null}
          </View>
        </View>

        {/* 3. Footer: Gotra / Manglik Chips & Interest Action */}
        <View style={styles.footerRow}>
          <View style={styles.chipsRow}>
            {profile.gotra ? (
              <View style={styles.tagChip}>
                <Typography variant="xs" color="#475569" weight="medium">
                  {language === 'hi' ? `गोत्र: ${profile.gotra}` : `Gotra: ${profile.gotra}`}
                </Typography>
              </View>
            ) : null}

            {manglikLabel ? (
              <View
                style={[
                  styles.tagChip,
                  profile.manglik === 'MANGLIK' ? styles.manglikActiveChip : styles.tagChipDefault,
                ]}
              >
                <Typography
                  variant="xs"
                  weight="medium"
                  color={profile.manglik === 'MANGLIK' ? '#B45309' : '#475569'}
                >
                  {manglikLabel}
                </Typography>
              </View>
            ) : null}

            {profile.diet ? (
              <View style={[styles.tagChip, styles.dietChip]}>
                <Typography variant="xs" weight="medium" color="#15803D">
                  {profile.diet === 'VEGETARIAN' ? (language === 'hi' ? 'शाकाहारी' : 'Veg') : profile.diet}
                </Typography>
              </View>
            ) : null}
          </View>

          {/* Interest Action / Status Indicator */}
          <View style={styles.actionContainer}>
            {isOwnProfile ? (
              <View style={styles.ownProfileBadge}>
                <Typography variant="xs" weight="bold" color="#1976D2">
                  👤 {language === 'hi' ? 'आपकी प्रोफ़ाइल' : 'Your Profile'}
                </Typography>
              </View>
            ) : interestStatus === 'PENDING' ? (
              <View style={[styles.statusPill, styles.pendingPill]}>
                <Typography variant="xs" weight="bold" color="#C2410C">
                  ⏳ {language === 'hi' ? 'रुचि भेजी गई' : 'Interest Sent'}
                </Typography>
              </View>
            ) : interestStatus === 'ACCEPTED' ? (
              <View style={[styles.statusPill, styles.acceptedPill]}>
                <Typography variant="xs" weight="bold" color="#15803D">
                  💖 {language === 'hi' ? 'स्वीकृत' : 'Connected'}
                </Typography>
              </View>
            ) : interestStatus === 'DECLINED' ? (
              <View style={[styles.statusPill, styles.declinedPill]}>
                <Typography variant="xs" weight="bold" color="#B91C1C">
                  ✕ {language === 'hi' ? 'अस्वीकृत' : 'Declined'}
                </Typography>
              </View>
            ) : onSendInterest ? (
              <Pressable
                onPress={() => onSendInterest(profile)}
                style={styles.expressInterestBtn}
                android_ripple={{ color: '#1565C0', borderless: false }}
                accessibilityRole="button"
                accessibilityLabel={language === 'hi' ? 'रुचि भेजें' : 'Express Interest'}
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  💌 {language === 'hi' ? 'रुचि भेजें' : 'Interest'}
                </Typography>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    padding: 0,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  pressableArea: {
    padding: 12,
  },
  topRow: {
    flexDirection: 'row',
  },
  photoContainer: {
    position: 'relative',
    marginRight: 12,
  },
  photo: {
    width: 84,
    height: 104,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  photoFallback: {
    width: 84,
    height: 104,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  photoCountText: {
    fontSize: 10,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameText: {
    flex: 1,
    fontSize: 15.5,
    marginRight: 6,
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedText: {
    fontSize: 10.5,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  brideBadge: {
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#FBCFE8',
  },
  groomBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  maritalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricsLine: {
    fontSize: 12,
    marginBottom: 3,
  },
  careerLine: {
    fontSize: 12.5,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIcon: {
    fontSize: 11,
    marginRight: 3,
  },
  locationText: {
    fontSize: 12,
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  tagChip: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  tagChipDefault: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  manglikActiveChip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dietChip: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  actionContainer: {
    alignItems: 'flex-end',
  },
  ownProfileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pendingPill: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  acceptedPill: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  declinedPill: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  expressInterestBtn: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
