import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { PublicDirectoryMember } from '@apnasamaj/shared-types';
import { Card } from './Card';
import { Typography } from './Typography';
import { Badge } from './Badge';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export interface MemberCardProps {
  member: PublicDirectoryMember;
  onPress: (memberId: string) => void;
}

export const MemberCard: React.FC<MemberCardProps> = ({ member, onPress }) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const [imageError, setImageError] = useState(false);

  const initial = member.fullName ? member.fullName.trim().charAt(0).toUpperCase() : 'स';

  // Format location string
  const locationParts = [member.city, member.state].filter(Boolean);
  const locationText = locationParts.join(', ');

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(member.id)}
        style={styles.pressableArea}
        android_ripple={{ color: theme.colors.primaryLight, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${member.fullName}, ${locationText || (language === 'hi' ? 'सदस्य' : 'Member')}`}
      >
        <View style={styles.contentRow}>
          {/* Avatar or Initials Circle */}
          {member.avatarUrl && !imageError ? (
            <Image
              source={{ uri: member.avatarUrl }}
              style={[styles.avatar, { borderColor: theme.colors.border }]}
              onError={() => setImageError(true)}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                {
                  backgroundColor: theme.colors.primaryLight,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <Typography variant="md" weight="bold" color={theme.colors.primaryDark}>
                {initial}
              </Typography>
            </View>
          )}

          {/* Member Details */}
          <View style={styles.detailsContainer}>
            <View style={styles.headerRow}>
              <Typography
                variant="sm"
                weight="bold"
                color={theme.colors.textPrimary}
                numberOfLines={1}
                style={styles.nameText}
              >
                {member.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
              </Typography>

              {member.gotra ? (
                <Badge
                  label={language === 'hi' ? `गोत्र: ${member.gotra}` : member.gotra}
                  variant="info"
                  size="sm"
                />
              ) : null}
            </View>

            {/* Location & Sub-Caste */}
            <View style={styles.metaRow}>
              {locationText ? (
                <View style={styles.locationItem}>
                  <Typography variant="xs" color={theme.colors.textMuted} style={styles.pinIcon}>
                    📍
                  </Typography>
                  <Typography
                    variant="xs"
                    color={theme.colors.textSecondary}
                    numberOfLines={1}
                    style={styles.locationText}
                  >
                    {locationText}
                  </Typography>
                </View>
              ) : (
                <Typography variant="xs" color={theme.colors.textMuted}>
                  {language === 'hi' ? 'स्थान: निर्दिष्ट नहीं' : 'Location: Not specified'}
                </Typography>
              )}

              {member.subCaste ? (
                <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
                  • {member.subCaste}
                </Typography>
              ) : null}
            </View>

            {/* Bio snippet if available */}
            {member.bio ? (
              <Typography
                variant="xs"
                color={theme.colors.textMuted}
                numberOfLines={1}
                style={styles.bioSnippet}
              >
                {member.bio}
              </Typography>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 8,
    padding: 0,
    overflow: 'hidden',
  },
  pressableArea: {
    padding: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  nameText: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    maxWidth: '70%',
  },
  pinIcon: {
    fontSize: 10,
    lineHeight: 12,
  },
  locationText: {
    flexShrink: 1,
  },
  bioSnippet: {
    marginTop: 4,
    fontStyle: 'italic',
  },
});

