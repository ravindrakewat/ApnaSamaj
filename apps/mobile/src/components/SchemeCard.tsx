import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Card } from './Card';
import { Typography } from './Typography';
import { Badge } from './Badge';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';
import { ParsedGovernmentScheme } from '../api/government-schemes.api';

export interface SchemeCardProps {
  scheme: ParsedGovernmentScheme;
  onPress: (scheme: ParsedGovernmentScheme) => void;
  onPressWebsite?: (url: string) => void;
}

export function formatSchemeTime(dateString: string, lang: 'hi' | 'en'): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (3600 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 3600 * 1000));

    if (diffMins < 1) return lang === 'hi' ? 'अभी-अभी' : 'Just now';
    if (diffMins < 60) return lang === 'hi' ? `${diffMins} मिनट पहले` : `${diffMins}m ago`;
    if (diffHours < 24) return lang === 'hi' ? `${diffHours} घंटे पहले` : `${diffHours}h ago`;
    if (diffDays < 7) return lang === 'hi' ? `${diffDays} दिन पहले` : `${diffDays}d ago`;

    return date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const SchemeCard: React.FC<SchemeCardProps> = ({
  scheme,
  onPress,
  onPressWebsite,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const categoryLabels: Record<string, { hi: string; en: string; variant: 'info' | 'success' | 'warning' | 'default' }> = {
    EDUCATION: { hi: 'शिक्षा व छात्रवृत्ति', en: 'Education', variant: 'info' },
    EMPLOYMENT: { hi: 'रोजगार व कौशल', en: 'Employment', variant: 'success' },
    AGRICULTURE: { hi: 'किसान कल्याण', en: 'Agriculture', variant: 'success' },
    WOMEN_CHILD: { hi: 'महिला एवं बाल विकास', en: 'Women & Child', variant: 'warning' },
    HEALTH: { hi: 'स्वास्थ्य व चिकित्सा', en: 'Health', variant: 'info' },
    HOUSING: { hi: 'आवास विकास', en: 'Housing', variant: 'info' },
    SOCIAL_SECURITY: { hi: 'सामाजिक सुरक्षा', en: 'Social Security', variant: 'warning' },
    OTHER: { hi: 'जनकल्याण योजना', en: 'Welfare Scheme', variant: 'default' },
  };

  const catInfo = categoryLabels[scheme.category] || categoryLabels.OTHER;
  const categoryLabel = isHindi ? catInfo.hi : catInfo.en;
  const timeFormatted = formatSchemeTime(scheme.createdAt, language as 'hi' | 'en');

  return (
    <Card style={styles.cardContainer}>
      <Pressable
        onPress={() => onPress(scheme)}
        accessibilityRole="button"
        accessibilityLabel={`${scheme.title}, ${scheme.department}`}
        style={styles.touchArea}
      >
        {/* 1. Header Badges: Category & State */}
        <View style={styles.headerRow}>
          <Badge label={`🏛️ ${categoryLabel}`} variant={catInfo.variant} size="sm" />
          <View style={styles.locationPill}>
            <Typography variant="xs" color="#475569" numberOfLines={1}>
              📍 {scheme.locationState}
            </Typography>
          </View>
        </View>

        {/* 2. Scheme Title */}
        <Typography
          variant="md"
          weight="bold"
          color="#0F172A"
          style={styles.title}
          numberOfLines={2}
        >
          {scheme.title}
        </Typography>

        {/* 3. Department */}
        <Typography
          variant="xs"
          weight="semibold"
          color="#1E40AF"
          style={styles.department}
          numberOfLines={1}
        >
          🏛️ {scheme.department}
        </Typography>

        {/* 4. Target Beneficiaries */}
        {scheme.targetBeneficiaries ? (
          <View style={styles.beneficiariesRow}>
            <Typography variant="xs" color="#334155" numberOfLines={1}>
              <Typography variant="xs" weight="bold" color="#0F172A">
                {isHindi ? '🎯 पात्र: ' : '🎯 For: '}
              </Typography>
              {scheme.targetBeneficiaries}
            </Typography>
          </View>
        ) : null}

        {/* 5. Key Highlights / Deadline / Official Link Badges */}
        <View style={styles.highlightsRow}>
          {scheme.deadline ? (
            <View style={styles.deadlineBadge}>
              <Typography variant="xs" weight="semibold" color="#991B1B">
                ⏰ {isHindi ? 'अंतिम तिथि: ' : 'Deadline: '}{scheme.deadline}
              </Typography>
            </View>
          ) : null}

          {scheme.officialWebsite ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                if (onPressWebsite && scheme.officialWebsite) {
                  onPressWebsite(scheme.officialWebsite);
                } else {
                  onPress(scheme);
                }
              }}
              style={styles.websitePill}
              hitSlop={6}
            >
              <Typography variant="xs" weight="bold" color="#0369A1">
                🌐 {isHindi ? 'आधिकारिक पोर्टल' : 'Official Portal'} ↗️
              </Typography>
            </Pressable>
          ) : null}
        </View>

        {/* 6. Footer: Author & Timestamp & View Action */}
        <View style={styles.footerRow}>
          <Typography variant="xs" color="#64748B" style={styles.postedText}>
            {isHindi ? 'साझाकर्ता: ' : 'Posted by: '}{scheme.authorName} • {timeFormatted}
          </Typography>

          <View style={styles.viewDetailsBtn}>
            <Typography variant="xs" weight="bold" color={theme.colors.primary}>
              {isHindi ? 'विवरण देखें →' : 'View Details →'}
            </Typography>
          </View>
        </View>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 12,
    padding: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  touchArea: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '45%',
  },
  title: {
    marginBottom: 4,
    lineHeight: 22,
  },
  department: {
    marginBottom: 6,
  },
  beneficiariesRow: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  highlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  deadlineBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  websitePill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 2,
  },
  postedText: {
    flex: 1,
    marginRight: 8,
  },
  viewDetailsBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
});

