import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Button,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  Assessment as AssessmentIcon,
  Timer as TimerIcon,
  WarningAmber as WarningIcon,
  CheckCircleOutline as CheckIcon,
  DeleteForever as DeleteIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import {
  ModerationAnalyticsResponseData,
  ReportPostReason,
} from '@apnasamaj/shared-types';
import { fetchModerationAnalytics } from '../services/admin.moderation.service';
import { getActiveCommunitySlug } from '../services/api.client';

const REASON_LABELS: Record<ReportPostReason, string> = {
  SPAM: 'Spam / Commercial Solicitation',
  HARASSMENT: 'Harassment or Bullying',
  HATE_SPEECH: 'Hate Speech / Slurs',
  INAPPROPRIATE_CONTENT: 'Inappropriate Content',
  MISINFORMATION: 'Misinformation',
  OTHER: 'Other Violation',
};

const REASON_COLORS: Record<ReportPostReason, string> = {
  SPAM: '#ed6c02', // Warning Orange
  HARASSMENT: '#d32f2f', // Error Red
  HATE_SPEECH: '#c2185b', // Deep Pink/Red
  INAPPROPRIATE_CONTENT: '#f57c00', // Amber Orange
  MISINFORMATION: '#0288d1', // Info Blue
  OTHER: '#757575', // Grey
};

export const ModerationAnalyticsPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<ModerationAnalyticsResponseData | null>(null);
  const [days, setDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeCommunity = getActiveCommunitySlug() || 'kewat';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchModerationAnalytics(days);
      setAnalytics(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load community moderation analytics.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatResolutionTime = (minutes: number | null, hours: number | null): string => {
    if (minutes === null || hours === null) {
      return 'N/A (No reports resolved)';
    }
    if (hours >= 1) {
      return `${hours} hrs`;
    }
    return `${minutes} mins`;
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AssessmentIcon color="secondary" sx={{ fontSize: 32 }} />
            <Typography variant="h5" component="h1" fontWeight="bold">
              Moderation Analytics
            </Typography>
            <Chip
              label={`${activeCommunity.toUpperCase()} SAMAJ`}
              color="secondary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Community-scoped violation tracking, report resolution efficiency, and category breakdown.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="days-select-label">Timeframe</InputLabel>
            <Select
              labelId="days-select-label"
              value={days}
              label="Timeframe"
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <MenuItem value={7}>Last 7 Days</MenuItem>
              <MenuItem value={14}>Last 14 Days</MenuItem>
              <MenuItem value={30}>Last 30 Days</MenuItem>
              <MenuItem value={90}>Last 90 Days</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<RefreshIcon />}
            onClick={loadData}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading Indicator */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
          <CircularProgress color="secondary" size={48} />
        </Box>
      ) : !analytics ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary">
            No moderation analytics data available for this community.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary" fontWeight="bold">
                    TOTAL REPORTS
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" sx={{ my: 1 }}>
                    {analytics.totalReports}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analytics.reportsLast7Days} in last 7d • {analytics.reportsLast30Days} in 30d
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1, borderTop: '3px solid #ed6c02' }}>
                <CardContent>
                  <Typography variant="caption" color="warning.main" fontWeight="bold">
                    PENDING REVIEW
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="warning.main" sx={{ my: 1 }}>
                    {analytics.pendingReports}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analytics.totalReports > 0
                      ? `${Math.round((analytics.pendingReports / analytics.totalReports) * 100)}% of total`
                      : 'All caught up'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1, borderTop: '3px solid #d32f2f' }}>
                <CardContent>
                  <Typography variant="caption" color="error.main" fontWeight="bold">
                    ACTIONED
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.main" sx={{ my: 1 }}>
                    {analytics.actionedReports}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analytics.totalReports > 0
                      ? `${Math.round((analytics.actionedReports / analytics.totalReports) * 100)}% action rate`
                      : '0% action rate'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1, borderTop: '3px solid #2e7d32' }}>
                <CardContent>
                  <Typography variant="caption" color="success.main" fontWeight="bold">
                    DISMISSED
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main" sx={{ my: 1 }}>
                    {analytics.dismissedReports}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {analytics.totalReports > 0
                      ? `${Math.round((analytics.dismissedReports / analytics.totalReports) * 100)}% dismissed`
                      : '0% dismissed'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1, borderTop: '3px solid #9c27b0' }}>
                <CardContent>
                  <Typography variant="caption" color="secondary.main" fontWeight="bold">
                    POSTS REMOVED
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="secondary.main" sx={{ my: 1 }}>
                    {analytics.postsRemovedCount}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Violating content purged
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={4} lg={2}>
              <Card sx={{ height: '100%', borderRadius: 2, boxShadow: 1, borderTop: '3px solid #0288d1' }}>
                <CardContent>
                  <Typography variant="caption" color="info.main" fontWeight="bold">
                    AVG. RESOLUTION TIME
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" color="info.main" sx={{ my: 1.25 }}>
                    {formatResolutionTime(
                      analytics.averageResolutionTimeMinutes,
                      analytics.averageResolutionTimeHours
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Resolved reports only
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Row 2: Reports by Reason & Resolution Statistics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Reports by Reason Breakdown */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                  Reports Grouped by Reason
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {Object.entries(analytics.reportsByReason).map(([reason, count]) => {
                  const percentage =
                    analytics.totalReports > 0
                      ? Math.round((count / analytics.totalReports) * 100)
                      : 0;
                  const label = REASON_LABELS[reason as ReportPostReason] || reason;
                  const color = REASON_COLORS[reason as ReportPostReason] || '#757575';

                  return (
                    <Box key={reason} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {count} ({percentage}%)
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percentage}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: color,
                          },
                        }}
                      />
                    </Box>
                  );
                })}
              </Paper>
            </Grid>

            {/* Resolution Statistics & Efficiency */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                  Moderation Efficiency & Resolution Rates
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      RESOLUTION EFFICIENCY
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
                      <Typography variant="body2">
                        Resolved ({analytics.actionedReports + analytics.dismissedReports} of{' '}
                        {analytics.totalReports})
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {analytics.totalReports > 0
                          ? Math.round(
                              ((analytics.actionedReports + analytics.dismissedReports) /
                                analytics.totalReports) *
                                100
                            )
                          : 100}
                        %
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        analytics.totalReports > 0
                          ? ((analytics.actionedReports + analytics.dismissedReports) /
                              analytics.totalReports) *
                            100
                          : 100
                      }
                      color="secondary"
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      ACTION / TAKEDOWN RATE
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
                      <Typography variant="body2">Violations confirmed & actioned</Typography>
                      <Typography variant="body2" fontWeight="bold" color="error.main">
                        {analytics.totalReports > 0
                          ? Math.round((analytics.actionedReports / analytics.totalReports) * 100)
                          : 0}
                        %
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        analytics.totalReports > 0
                          ? (analytics.actionedReports / analytics.totalReports) * 100
                          : 0
                      }
                      color="error"
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold">
                      DISMISSAL RATE
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 0.5 }}>
                      <Typography variant="body2">Non-violating reports dismissed</Typography>
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {analytics.totalReports > 0
                          ? Math.round((analytics.dismissedReports / analytics.totalReports) * 100)
                          : 0}
                        %
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        analytics.totalReports > 0
                          ? (analytics.dismissedReports / analytics.totalReports) * 100
                          : 0
                      }
                      color="success"
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>

                  <Box sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Average report resolution time is computed strictly on completed reviews and excludes pending reports.
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          {/* Row 3: Daily Activity Trends Table */}
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
              Daily Activity Trends (Last {days} Days)
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <TableContainer sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      Reports Received
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      Reports Resolved
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      Actioned
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      Dismissed
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.dailyTrends
                    .filter((t) => t.received > 0 || t.resolved > 0)
                    .map((trend) => (
                      <TableRow key={trend.date} hover>
                        <TableCell>{trend.date}</TableCell>
                        <TableCell align="right">
                          <Chip label={trend.received} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={trend.resolved}
                            size="small"
                            color={trend.resolved > 0 ? 'secondary' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="error.main" fontWeight="medium">
                            {trend.actioned}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="success.main" fontWeight="medium">
                            {trend.dismissed}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  {analytics.dailyTrends.every((t) => t.received === 0 && t.resolved === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No report activity recorded in the selected {days}-day window.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

