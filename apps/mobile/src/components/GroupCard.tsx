import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { GroupListItem, GroupPrivacy } from '@apnasamaj/shared-types';
import { Card } from './Card';
import { Typography } from './Typography';
import { Badge } from './Badge';
import { Button } from './Button';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export interface GroupCardProps {
  group: GroupListItem;
  onPress: (slug: string) => void;
  onJoin?: (groupId: string) => Promise<void>;
  isJoining?: boolean;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  onPress,
  onJoin,
  isJoining = false,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const [imageError, setImageError] = useState(false);

  const initial = group.name ? group.name.trim().charAt(0).toUpperCase() : 'स';
  const isPrivate = group.privacy === 'PRIVATE';

  const handleJoinPress = () => {
    if (onJoin && !group.isMember && !isPrivate && !isJoining) {
      onJoin(group.id);
    }
  };

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(group.slug)}
        style={styles.pressableArea}
        android_ripple={{ color: theme.colors.primaryLight, borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, ${isPrivate ? 'निजी समूह' : 'सार्वजनिक समूह'}`}
      >
        <View style={styles.contentRow}>
          {/* Group Cover / Thumbnail or Initials Icon */}
          {group.coverUrl && !imageError ? (
            <Image
              source={{ uri: group.coverUrl }}
              style={[styles.coverImage, { borderColor: theme.colors.border }]}
              onError={() => setImageError(true)}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.coverFallback,
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

          {/* Group Details */}
          <View style={styles.detailsContainer}>
            <View style={styles.headerRow}>
              <Typography
                variant="sm"
                weight="bold"
                color={theme.colors.textPrimary}
                numberOfLines={1}
                style={styles.nameText}
              >
                {group.name}
              </Typography>

              <Badge
                label={isPrivate ? (language === 'hi' ? 'निजी' : 'Private') : (language === 'hi' ? 'सार्वजनिक' : 'Public')}
                variant={isPrivate ? 'warning' : 'info'}
                size="sm"
              />
            </View>

            {/* Description Snippet */}
            <Typography
              variant="xs"
              color={theme.colors.textSecondary}
              numberOfLines={2}
              style={styles.descText}
            >
              {group.description || (language === 'hi' ? 'कोई विवरण उपलब्ध नहीं है।' : 'No description provided.')}
            </Typography>

            {/* Meta & Stats Row */}
            <View style={styles.footerRow}>
              <View style={styles.statsRow}>
                <Typography variant="xs" color={theme.colors.textMuted}>
                  👥 {group.membersCount} {language === 'hi' ? 'सदस्य' : 'members'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted}>
                  • 💬 {group.postsCount} {language === 'hi' ? 'चर्चाएं' : 'posts'}
                </Typography>
              </View>

              {/* Membership Status or Action */}
              {group.isMember ? (
                <Badge
                  label={
                    group.myRole === 'ADMIN'
                      ? (language === 'hi' ? 'प्रशासक' : 'Admin')
                      : group.myRole === 'MODERATOR'
                      ? (language === 'hi' ? 'मॉडरेटर' : 'Mod')
                      : (language === 'hi' ? 'सदस्य' : 'Member')
                  }
                  variant="success"
                  size="sm"
                />
              ) : !isPrivate && onJoin ? (
                <Button
                  title={language === 'hi' ? 'जुड़ें' : 'Join'}
                  size="sm"
                  variant="outline"
                  loading={isJoining}
                  disabled={isJoining}
                  onPress={handleJoinPress}
                  style={styles.joinBtn}
                />
              ) : null}
            </View>
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
    gap: 12,
  },
  coverImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverFallback: {
    width: 64,
    height: 64,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'space-between',
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
  descText: {
    marginBottom: 6,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  joinBtn: {
    height: 32,
    paddingHorizontal: 10,
  },
});

