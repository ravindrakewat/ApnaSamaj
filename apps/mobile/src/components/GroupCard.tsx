import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import { GroupListItem } from '@apnasamaj/shared-types';
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
        android_ripple={{ color: '#E0F2FE', borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, ${isPrivate ? (language === 'hi' ? 'निजी समूह' : 'Private Group') : (language === 'hi' ? 'सार्वजनिक समूह' : 'Public Group')}`}
      >
        <View style={styles.contentRow}>
          {/* 1. Group Cover / Logo */}
          {group.coverUrl && !imageError ? (
            <Image
              source={{ uri: group.coverUrl }}
              style={styles.coverImage}
              onError={() => setImageError(true)}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.coverFallback}>
              <Typography variant="lg" weight="bold" color="#0369A1" style={styles.fallbackInitial}>
                {initial}
              </Typography>
            </View>
          )}

          {/* 2. Details Column */}
          <View style={styles.detailsContainer}>
            {/* Header: Group Name + Privacy Badge */}
            <View style={styles.headerRow}>
              <Typography
                variant="sm"
                weight="bold"
                color="#0F172A"
                numberOfLines={1}
                style={styles.nameText}
              >
                {group.name}
              </Typography>

              <Badge
                label={isPrivate ? (language === 'hi' ? '🔒 निजी' : '🔒 Private') : (language === 'hi' ? 'सार्वजनिक' : 'Public')}
                variant={isPrivate ? 'warning' : 'info'}
                size="sm"
              />
            </View>

            {/* Description Snippet */}
            <Typography
              variant="xs"
              color="#475569"
              numberOfLines={2}
              style={styles.descText}
            >
              {group.description || (language === 'hi' ? 'कोई विवरण उपलब्ध नहीं है।' : 'No description provided.')}
            </Typography>

            {/* Meta Stats & Role / Action Row */}
            <View style={styles.footerRow}>
              <View style={styles.statsRow}>
                <Typography variant="xs" color="#64748B" style={styles.statsText}>
                  👥 {group.membersCount} {language === 'hi' ? 'सदस्य' : 'members'}
                </Typography>
                <Typography variant="xs" color="#CBD5E1">
                  •
                </Typography>
                <Typography variant="xs" color="#64748B" style={styles.statsText}>
                  💬 {group.postsCount} {language === 'hi' ? 'चर्चाएं' : 'posts'}
                </Typography>
              </View>

              {/* Membership Status Badge or Join Action */}
              {group.isMember ? (
                <View style={styles.memberStatusWrap}>
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
                  <Typography variant="sm" color="#94A3B8" style={styles.chevron}>
                    ›
                  </Typography>
                </View>
              ) : !isPrivate && onJoin ? (
                <Button
                  title={language === 'hi' ? '+ जुड़ें' : '+ Join'}
                  size="sm"
                  variant="outline"
                  loading={isJoining}
                  disabled={isJoining}
                  onPress={handleJoinPress}
                  style={styles.joinBtn}
                />
              ) : (
                <Typography variant="sm" color="#94A3B8" style={styles.chevron}>
                  ›
                </Typography>
              )}
            </View>
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
  coverImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  coverFallback: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  fallbackInitial: {
    fontSize: 22,
    lineHeight: 26,
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
    fontSize: 15.5,
    lineHeight: 20,
    letterSpacing: -0.2,
    flex: 1,
  },
  descText: {
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statsText: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  memberStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chevron: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  joinBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
});
