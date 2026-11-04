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

export function formatHeightCm(cm: number): string {
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
  const { language, t } = useLocalization();
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
        ? 'वधू (Bride)'
        : 'Bride'
      : profile.gender === 'MALE'
        ? language === 'hi'
          ? 'वर (Groom)'
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
        return language === 'hi' ? 'आंशिक मांगलिक' : 'Anshik Manglik';
      default:
        return null;
    }
  })();

  // Interest Status label and color
  const interestStatus = profile.interestStatus;

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(profile.id)}
        style={styles.pressableArea}
        android_ripple={{ color: theme.colors.primaryLight, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${profile.fullName}, ${profile.age ? `${profile.age} years, ` : ''}${profile.occupation || ''}`}
      >
        <View style={styles.topRow}>
          {/* Avatar / Photo */}
          <View style={styles.photoContainer}>
            {photoUrl && !imageError ? (
              <Image
                source={{ uri: photoUrl }}
                style={[styles.photo, { borderColor: theme.colors.border }]}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.photoFallback,
                  {
                    backgroundColor: theme.colors.primaryLight,
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <Typography variant="lg" weight="bold" color={theme.colors.primaryDark}>
                  {initial}
                </Typography>
              </View>
            )}

            {profile.photosCount > 1 ? (
              <View style={[styles.photoCountBadge, { backgroundColor: 'rgba(0, 0, 0, 0.65)' }]}>
                <Typography variant="xs" color="#FFFFFF" weight="medium">
                  📷 {profile.photosCount}
                </Typography>
              </View>
            ) : null}
          </View>

          {/* Details Column */}
          <View style={styles.detailsContainer}>
            {/* Header: Name & Verification */}
            <View style={styles.headerRow}>
              <Typography
                variant="md"
                weight="bold"
                color={theme.colors.textPrimary}
                numberOfLines={1}
                style={styles.nameText}
              >
                {profile.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
              </Typography>

              {profile.isVerified ? (
                <View style={[styles.verifiedBadge, { backgroundColor: '#E8F5E9' }]}>
                  <Typography variant="xs" weight="bold" color="#2E7D32">
                    ✓ {language === 'hi' ? 'सत्यापित' : 'Verified'}
                  </Typography>
                </View>
              ) : null}
            </View>

            {/* Sub-header: Gender & Marital Status */}
            <View style={styles.metaRow}>
              {genderLabel ? (
                <Badge
                  label={genderLabel}
                  variant={profile.gender === 'FEMALE' ? 'warning' : 'info'}
                  size="sm"
                />
              ) : null}
              {maritalLabel ? (
                <Badge label={maritalLabel} variant="info" size="sm" />
              ) : null}
            </View>

            {/* Age, Height, Sub-caste */}
            <Typography variant="xs" color={theme.colors.textSecondary} style={styles.statLine}>
              {[
                profile.age ? `${profile.age} ${language === 'hi' ? 'वर्ष' : 'yrs'}` : null,
                formatHeightCm(profile.heightCm),
                profile.subCaste ? (language === 'hi' ? `उपजाति: ${profile.subCaste}` : profile.subCaste) : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Typography>

            {/* Profession & Education */}
            <Typography
              variant="xs"
              weight="medium"
              color={theme.colors.textPrimary}
              numberOfLines={1}
              style={styles.careerLine}
            >
              {[profile.occupation, profile.highestEducation].filter(Boolean).join(' • ')}
            </Typography>

            {/* Location */}
            {locationText ? (
              <View style={styles.locationRow}>
                <Typography variant="xs" color={theme.colors.textMuted} style={styles.pinIcon}>
                  📍
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
                  {locationText}
                </Typography>
              </View>
            ) : null}
          </View>
        </View>

        {/* Footer: Tags & Interest Action */}
        <View style={[styles.footerRow, { borderTopColor: theme.colors.border }]}>
          <View style={styles.chipsRow}>
            {profile.gotra ? (
              <Badge label={`गोत्र: ${profile.gotra}`} variant="default" size="sm" />
            ) : null}
            {manglikLabel ? (
              <Badge label={manglikLabel} variant="warning" size="sm" />
            ) : null}
            {profile.diet ? (
              <Badge
                label={profile.diet === 'VEGETARIAN' ? (language === 'hi' ? 'शाकाहारी' : 'Veg') : profile.diet}
                variant="success"
                size="sm"
              />
            ) : null}
          </View>

          {/* Interest Action / Status */}
          <View style={styles.actionContainer}>
            {isOwnProfile ? (
              <Badge
                label={language === 'hi' ? 'आपकी प्रोफ़ाइल' : 'Your Profile'}
                variant="info"
                size="sm"
              />
            ) : interestStatus === 'PENDING' ? (
              <View style={[styles.statusPill, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }]}>
                <Typography variant="xs" weight="semibold" color="#E65100">
                  ⏳ {language === 'hi' ? 'रुचि भेजी गई' : 'Interest Sent'}
                </Typography>
              </View>
            ) : interestStatus === 'ACCEPTED' ? (
              <View style={[styles.statusPill, { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' }]}>
                <Typography variant="xs" weight="semibold" color="#2E7D32">
                  💖 {language === 'hi' ? 'स्वीकृत' : 'Connected'}
                </Typography>
              </View>
            ) : interestStatus === 'DECLINED' ? (
              <View style={[styles.statusPill, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
                <Typography variant="xs" weight="semibold" color="#C62828">
                  ✕ {language === 'hi' ? 'अस्वीकृत' : 'Declined'}
                </Typography>
              </View>
            ) : onSendInterest ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onSendInterest(profile);
                }}
                style={[styles.expressInterestBtn, { backgroundColor: theme.colors.primary }]}
                android_ripple={{ color: theme.colors.primaryDark }}
                accessibilityRole="button"
                accessibilityLabel={language === 'hi' ? 'रुचि व्यक्त करें' : 'Express Interest'}
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  💌 {language === 'hi' ? 'रुचि भेजें' : 'Express Interest'}
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
    overflow: 'hidden',
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
    width: 80,
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
  },
  photoFallback: {
    width: 80,
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
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
    marginRight: 6,
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statLine: {
    marginBottom: 2,
  },
  careerLine: {
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIcon: {
    marginRight: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  actionContainer: {
    alignItems: 'flex-end',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  expressInterestBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
