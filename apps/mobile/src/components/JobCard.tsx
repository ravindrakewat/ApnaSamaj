import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Typography } from './Typography';
import { Badge } from './Badge';
import { ProfileAvatar } from './ProfileAvatar';
import { ParsedJobListing } from '../api/employment.api';
import { useLocalization } from '../hooks/useLocalization';
import { useTheme } from '../hooks/useTheme';

export interface JobCardProps {
  job: ParsedJobListing;
  onPress: () => void;
  onApplyPress?: () => void;
}

export function formatJobTime(dateString: string, language: 'en' | 'hi' = 'en'): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) {
      return language === 'hi' ? 'अभी-अभी' : 'Just now';
    }
    if (diffHours < 24) {
      return language === 'hi' ? `${diffHours} घंटे पहले` : `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return language === 'hi' ? 'कल' : 'Yesterday';
    }
    if (diffDays < 7) {
      return language === 'hi' ? `${diffDays} दिन पहले` : `${diffDays}d ago`;
    }
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

export const JobCard: React.FC<JobCardProps> = ({ job, onPress, onApplyPress }) => {
  const theme = useTheme();
  const { language } = useLocalization();

  const formattedTime = formatJobTime(job.createdAt, language as 'en' | 'hi');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardContainer,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${job.title} at ${job.company}, ${job.location}`}
    >
      {/* Top Header: Title and Time */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <Typography
            variant="sm"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={2}
            style={styles.jobTitle}
          >
            {job.title}
          </Typography>
          <Typography
            variant="xs"
            weight="semibold"
            color="#2563EB"
            numberOfLines={1}
            style={styles.companyName}
          >
            🏢 {job.company}
          </Typography>
        </View>

        <View style={styles.timeBadgeWrapper}>
          <Badge label={job.employmentType} variant="info" size="sm" />
          {formattedTime ? (
            <Typography variant="xs" color="#64748B" style={styles.timeText}>
              {formattedTime}
            </Typography>
          ) : null}
        </View>
      </View>

      {/* Meta Pills: Location, Salary, Experience */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Typography variant="xs" color="#475569" numberOfLines={1}>
            📍 {job.location}
          </Typography>
        </View>

        {job.salary && job.salary !== 'As per norms' && (
          <View style={styles.metaItem}>
            <Typography variant="xs" color="#16A34A" weight="semibold" numberOfLines={1}>
              💰 {job.salary}
            </Typography>
          </View>
        )}

        <View style={styles.metaItem}>
          <Typography variant="xs" color="#475569" numberOfLines={1}>
            💼 {job.experience}
          </Typography>
        </View>
      </View>

      {/* Description Snippet */}
      {job.description ? (
        <Typography
          variant="xs"
          color="#334155"
          numberOfLines={2}
          style={styles.descriptionSnippet}
        >
          {job.description.replace(/^(🏢|📍|💰|💼|⏱️|📞)[^\n]*\n?/gm, '').trim()}
        </Typography>
      ) : null}

      {/* Footer: Posted By & Action Buttons */}
      <View style={[styles.footerRow, { borderTopColor: theme.colors.border }]}>
        <View style={styles.postedByWrapper}>
          <ProfileAvatar
            uri={job.authorAvatarUrl}
            name={job.authorName}
            size="xs"
          />
          <View style={styles.postedByText}>
            <Typography variant="xs" weight="medium" color="#475569" numberOfLines={1}>
              {job.authorName}
            </Typography>
            <Typography variant="xs" color="#94A3B8" style={{ fontSize: 10 }}>
              {language === 'hi' ? 'द्वारा पोस्ट किया गया' : 'Posted by'}
            </Typography>
          </View>
        </View>

        <Pressable
          onPress={onApplyPress || onPress}
          style={[styles.applyButton, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'आवेदन करें' : 'Apply'}
        >
          <Typography variant="xs" weight="bold" color="#FFFFFF">
            {language === 'hi' ? 'आवेदन करें ➔' : 'Apply ➔'}
          </Typography>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  titleWrapper: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 4,
  },
  companyName: {
    fontSize: 12,
  },
  timeBadgeWrapper: {
    alignItems: 'flex-end',
    gap: 4,
  },
  timeText: {
    fontSize: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  metaItem: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  descriptionSnippet: {
    lineHeight: 18,
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  postedByWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  postedByText: {
    flex: 1,
  },
  applyButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

