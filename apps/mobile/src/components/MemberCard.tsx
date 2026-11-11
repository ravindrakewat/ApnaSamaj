import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { PublicDirectoryMember } from '@apnasamaj/shared-types';
import { Card } from './Card';
import { Typography } from './Typography';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export interface MemberCardProps {
  member: PublicDirectoryMember;
  onPress: (memberId: string) => void;
}

const HINDI_MONTHS = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];

const ENGLISH_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const MemberCard: React.FC<MemberCardProps> = ({ member, onPress }) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const [imageError, setImageError] = useState(false);

  const initial = member.fullName ? member.fullName.trim().charAt(0).toUpperCase() : 'स';

  // Format location string: City, State
  const locationParts = [member.city, member.state].filter(Boolean);
  const locationText = locationParts.join(', ');

  // Format membership date if available
  let joinedText = '';
  if (member.joinedAt) {
    try {
      const d = new Date(member.joinedAt);
      if (!isNaN(d.getTime())) {
        const monthName = language === 'hi' ? HINDI_MONTHS[d.getMonth()] : ENGLISH_MONTHS[d.getMonth()];
        const year = d.getFullYear();
        joinedText = language === 'hi' ? `सदस्य: ${monthName} ${year}` : `Member since ${monthName} ${year}`;
      }
    } catch {
      // Ignored if invalid date
    }
  }

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(member.id)}
        style={styles.pressableArea}
        android_ripple={{ color: '#E0F2FE', borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${member.fullName}, ${locationText || (language === 'hi' ? 'सदस्य' : 'Member')}`}
      >
        <View style={styles.contentRow}>
          {/* 1. Avatar with subtle border ring */}
          {member.avatarUrl && !imageError ? (
            <Image
              source={{ uri: member.avatarUrl }}
              style={styles.avatar}
              onError={() => setImageError(true)}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Typography variant="md" weight="bold" color="#0369A1" style={styles.initialText}>
                {initial}
              </Typography>
            </View>
          )}

          {/* 2. Details Column */}
          <View style={styles.detailsContainer}>
            {/* Top Row: Full Name + Chevron */}
            <View style={styles.nameRow}>
              <Typography
                variant="sm"
                weight="bold"
                color="#0F172A"
                numberOfLines={1}
                style={styles.nameText}
              >
                {member.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
              </Typography>
              <Typography variant="sm" color="#94A3B8" style={styles.chevron}>
                ›
              </Typography>
            </View>

            {/* Badges Row: Gotra & Sub-Caste */}
            {(member.gotra || member.subCaste) && (
              <View style={styles.badgesRow}>
                {member.gotra ? (
                  <View style={styles.gotraPill}>
                    <Typography variant="xs" style={styles.pillEmoji}>
                      🏛️
                    </Typography>
                    <Typography
                      variant="xs"
                      weight="semibold"
                      color="#0284C7"
                      numberOfLines={1}
                      style={styles.gotraText}
                    >
                      {language === 'hi' ? `गोत्र: ${member.gotra}` : `Gotra: ${member.gotra}`}
                    </Typography>
                  </View>
                ) : null}

                {member.subCaste ? (
                  <View style={styles.subCastePill}>
                    <Typography variant="xs" style={styles.pillEmoji}>
                      🏷️
                    </Typography>
                    <Typography
                      variant="xs"
                      weight="medium"
                      color="#475569"
                      numberOfLines={1}
                      style={styles.subCasteText}
                    >
                      {member.subCaste}
                    </Typography>
                  </View>
                ) : null}
              </View>
            )}

            {/* Location Row */}
            <View style={styles.locationRow}>
              <Typography variant="xs" color="#64748B" style={styles.pinIcon}>
                📍
              </Typography>
              <Typography
                variant="xs"
                color="#64748B"
                numberOfLines={1}
                style={styles.locationText}
              >
                {locationText || (language === 'hi' ? 'स्थान: निर्दिष्ट नहीं' : 'Location: Not specified')}
              </Typography>
            </View>

            {/* Bio snippet if available */}
            {member.bio ? (
              <Typography
                variant="xs"
                color="#64748B"
                numberOfLines={1}
                style={styles.bioSnippet}
              >
                "{member.bio}"
              </Typography>
            ) : null}

            {/* Membership date snippet */}
            {joinedText ? (
              <View style={styles.joinedRow}>
                <Typography variant="xs" color="#94A3B8" style={styles.joinedText}>
                  {joinedText}
                </Typography>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 10,
    padding: 0,
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
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  initialText: {
    fontSize: 20,
    lineHeight: 24,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameText: {
    fontSize: 15.5,
    lineHeight: 20,
    letterSpacing: -0.2,
    flex: 1,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  gotraPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: '75%',
  },
  subCastePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: '50%',
  },
  pillEmoji: {
    fontSize: 10,
    marginRight: 4,
  },
  gotraText: {
    fontSize: 11,
    lineHeight: 15,
  },
  subCasteText: {
    fontSize: 11,
    lineHeight: 15,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  pinIcon: {
    fontSize: 11,
    lineHeight: 14,
  },
  locationText: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  bioSnippet: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 2,
  },
  joinedRow: {
    marginTop: 4,
  },
  joinedText: {
    fontSize: 10.5,
    lineHeight: 14,
  },
});
