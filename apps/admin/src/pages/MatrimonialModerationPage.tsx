import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Drawer,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Divider,
  Snackbar,
  Tooltip,
  MenuItem,
  Stack,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Visibility as VisibilityIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  Person as PersonIcon,
  Work as WorkIcon,
  FamilyRestroom as FamilyRestroomIcon,
  Tune as TuneIcon,
  Description as DescriptionIcon,
  Report as ReportIcon,
  History as HistoryIcon,
  Verified as VerifiedIcon,
  Block as BlockIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import {
  AdminMatrimonialProfileListItem,
  AdminMatrimonialProfileDetail,
  MatrimonialProfileStatus,
  MatrimonialModerationMetrics,
  MatrimonialDocumentItem,
  MatrimonialReportItem,
} from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminMatrimonialMetrics,
  fetchAdminMatrimonialProfiles,
  fetchAdminMatrimonialProfileDetails,
  moderateAdminMatrimonialProfile,
  moderateAdminMatrimonialPhoto,
  fetchAdminMatrimonialDocuments,
  fetchAdminDocumentSignedUrl,
  moderateAdminMatrimonialDocument,
  fetchAdminMatrimonialReports,
  moderateAdminMatrimonialReport,
  fetchAdminMatrimonialAuditLogs,
  AdminMatrimonialApiError,
} from '../services/admin.matrimonial.service';

export const MatrimonialModerationPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();

  // Navigation Tabs:
  // 0: Pending Review, 1: Approved, 2: Suspended, 3: Rejected, 4: Document Verification, 5: Reports, 6: History
  const [activeTab, setActiveTab] = useState<number>(0);

  // Metrics
  const [metrics, setMetrics] = useState<MatrimonialModerationMetrics | null>(null);

  // Profiles State
  const [profiles, setProfiles] = useState<AdminMatrimonialProfileListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Pagination for Profiles
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Review Drawer & Inspection Modal
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileDetails, setProfileDetails] = useState<AdminMatrimonialProfileDetail | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Moderation Dialogs for Profiles
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState<boolean>(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState<boolean>(false);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [suspensionReason, setSuspensionReason] = useState<string>('');
  const [isSubmittingModeration, setIsSubmittingModeration] = useState<boolean>(false);

  // Photo Preview Lightbox
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Document Verification Queue State
  const [documents, setDocuments] = useState<any[]>([]);
  const [docPage, setDocPage] = useState<number>(1);
  const [docTotalPages, setDocTotalPages] = useState<number>(1);
  const [docStatusFilter, setDocStatusFilter] = useState<string>('PENDING');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isDocRejectDialogOpen, setIsDocRejectDialogOpen] = useState<boolean>(false);
  const [docRejectionReason, setDocRejectionReason] = useState<string>('');
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);

  // Reports Queue State
  const [reports, setReports] = useState<MatrimonialReportItem[]>([]);
  const [reportPage, setReportPage] = useState<number>(1);
  const [reportTotalPages, setReportTotalPages] = useState<number>(1);
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('PENDING');
  const [selectedReport, setSelectedReport] = useState<MatrimonialReportItem | null>(null);
  const [isReportActionDialogOpen, setIsReportActionDialogOpen] = useState<boolean>(false);
  const [reportActionNotes, setReportActionNotes] = useState<string>('');
  const [reportActionType, setReportActionType] = useState<'RESOLVED' | 'DISMISSED' | 'SUSPEND_PROFILE'>('RESOLVED');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);

  // Load Metrics
  const loadMetrics = useCallback(async () => {
    try {
      const data = await fetchAdminMatrimonialMetrics();
      setMetrics(data);
    } catch {
      // Ignored if migration pending
    }
  }, []);

  const getProfileStatusQuery = (tabIndex: number): string => {
    switch (tabIndex) {
      case 0:
        return 'PENDING_APPROVAL';
      case 1:
        return 'APPROVED';
      case 2:
        return 'SUSPENDED';
      case 3:
        return 'REJECTED';
      default:
        return 'PENDING_APPROVAL';
    }
  };

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const response = await fetchAdminMatrimonialProfiles({
        status: getProfileStatusQuery(activeTab),
        page,
        limit: 10,
        search: searchTerm.trim() || undefined,
      });

      setProfiles(response.profiles);
      setPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to fetch matrimonial profiles queue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page, searchTerm]);

  // Load Documents
  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchAdminMatrimonialDocuments({
        status: docStatusFilter,
        page: docPage,
        limit: 10,
      });
      setDocuments(response.documents);
      setDocPage(response.pagination.page);
      setDocTotalPages(response.pagination.totalPages);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load verification documents.');
    } finally {
      setIsLoading(false);
    }
  }, [docStatusFilter, docPage]);

  // Load Reports
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchAdminMatrimonialReports({
        status: reportStatusFilter,
        page: reportPage,
        limit: 10,
      });
      setReports(response.reports);
      setReportPage(response.pagination.page);
      setReportTotalPages(response.pagination.totalPages);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load matrimonial reports.');
    } finally {
      setIsLoading(false);
    }
  }, [reportStatusFilter, reportPage]);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchAdminMatrimonialAuditLogs({
        page: auditPage,
        limit: 15,
      });
      setAuditLogs(response.logs);
      setAuditPage(response.pagination.page);
      setAuditTotalPages(response.pagination.totalPages);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load moderation audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [auditPage]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (activeTab <= 3) {
      loadProfiles();
    } else if (activeTab === 4) {
      loadDocuments();
    } else if (activeTab === 5) {
      loadReports();
    } else if (activeTab === 6) {
      loadAuditLogs();
    }
  }, [activeTab, loadProfiles, loadDocuments, loadReports, loadAuditLogs]);

  const handleOpenReview = async (profileId: string) => {
    setSelectedProfileId(profileId);
    setIsLoadingDetails(true);
    setProfileDetails(null);

    try {
      const details = await fetchAdminMatrimonialProfileDetails(profileId);
      setProfileDetails(details);
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load profile details.');
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!selectedProfileId) return;
    setIsSubmittingModeration(true);
    try {
      await moderateAdminMatrimonialProfile(selectedProfileId, 'APPROVED');
      setSuccessMessage('Matrimonial profile approved successfully! Member is now visible in discovery.');
      setIsApproveDialogOpen(false);
      setSelectedProfileId(null);
      await loadProfiles();
      loadMetrics();
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to approve matrimonial profile.');
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!selectedProfileId) return;
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      setErrorMessage('Please provide a specific rejection reason of at least 5 characters.');
      return;
    }
    setIsSubmittingModeration(true);
    try {
      await moderateAdminMatrimonialProfile(selectedProfileId, 'REJECTED', rejectionReason.trim());
      setSuccessMessage('Matrimonial profile rejected with feedback sent to member.');
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedProfileId(null);
      await loadProfiles();
      loadMetrics();
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to reject matrimonial profile.');
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!selectedProfileId) return;
    if (!suspensionReason || suspensionReason.trim().length < 5) {
      setErrorMessage('Please provide a specific suspension reason of at least 5 characters.');
      return;
    }
    setIsSubmittingModeration(true);
    try {
      await moderateAdminMatrimonialProfile(selectedProfileId, 'SUSPENDED', suspensionReason.trim());
      setSuccessMessage('Matrimonial profile suspended and removed from discovery.');
      setIsSuspendDialogOpen(false);
      setSuspensionReason('');
      setSelectedProfileId(null);
      await loadProfiles();
      loadMetrics();
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to suspend matrimonial profile.');
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleTogglePhotoApproval = async (photoId: string, currentApproved: boolean) => {
    try {
      const updated = await moderateAdminMatrimonialPhoto(photoId, !currentApproved);
      if (profileDetails) {
        setProfileDetails({
          ...profileDetails,
          photos: profileDetails.photos.map((ph) =>
            ph.id === photoId ? { ...ph, isApproved: updated.isApproved } : ph
          ),
        });
      }
      setSuccessMessage(`Photo visibility ${updated.isApproved ? 'approved' : 'hidden'} successfully.`);
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to update photo visibility.');
    }
  };

  // View Document in temporary signed URL
  const handleViewDocument = async (documentId: string) => {
    try {
      const res = await fetchAdminDocumentSignedUrl(documentId);
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to open document.');
    }
  };

  // Approve Document
  const handleApproveDocument = async (documentId: string) => {
    try {
      await moderateAdminMatrimonialDocument(documentId, 'APPROVED');
      setSuccessMessage('Document verified and approved! Profile marked as verified.');
      await loadDocuments();
      loadMetrics();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve document.');
    }
  };

  // Reject Document
  const handleConfirmRejectDocument = async () => {
    if (!selectedDocId || !docRejectionReason.trim()) return;
    try {
      await moderateAdminMatrimonialDocument(selectedDocId, 'REJECTED', docRejectionReason.trim());
      setSuccessMessage('Document rejected with feedback sent to member.');
      setIsDocRejectDialogOpen(false);
      setDocRejectionReason('');
      setSelectedDocId(null);
      await loadDocuments();
      loadMetrics();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject document.');
    }
  };

  // Resolve Report
  const handleConfirmReportAction = async () => {
    if (!selectedReport) return;
    try {
      const actionParam = reportActionType === 'SUSPEND_PROFILE' ? 'SUSPEND_PROFILE' : 'NONE';
      const statusParam = reportActionType === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED';

      await moderateAdminMatrimonialReport(
        selectedReport.id,
        statusParam,
        reportActionNotes.trim() || undefined,
        actionParam
      );
      setSuccessMessage('Report action completed successfully.');
      setIsReportActionDialogOpen(false);
      setSelectedReport(null);
      setReportActionNotes('');
      await loadReports();
      loadMetrics();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process report action.');
    }
  };

  const renderStatusBadge = (status: MatrimonialProfileStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <Chip size="small" icon={<HourglassEmptyIcon fontSize="small" />} label="Pending Review" color="warning" sx={{ fontWeight: 600 }} />;
      case 'APPROVED':
        return <Chip size="small" icon={<CheckCircleIcon fontSize="small" />} label="Approved" color="success" sx={{ fontWeight: 600 }} />;
      case 'SUSPENDED':
        return <Chip size="small" icon={<WarningIcon fontSize="small" />} label="Suspended" color="error" sx={{ fontWeight: 600 }} />;
      case 'REJECTED':
        return <Chip size="small" icon={<CancelIcon fontSize="small" />} label="Changes Requested" color="error" sx={{ fontWeight: 600 }} />;
      case 'DRAFT':
        return <Chip size="small" label="Draft" variant="outlined" sx={{ fontWeight: 600 }} />;
      case 'HIDDEN':
        return <Chip size="small" label="Hidden" variant="outlined" sx={{ fontWeight: 600 }} />;
      default:
        return null;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const isSelfProfile = Boolean(profileDetails && currentAdmin && profileDetails.userId === currentAdmin.id);

  if (isMigrationPending) {
    return (
      <Paper elevation={0} sx={{ p: 6, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
        <HourglassEmptyIcon sx={{ fontSize: 60, color: 'warning.main', mb: 2 }} />
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Matrimonial Database Tables Pending
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 580, mx: 'auto', mb: 3 }}>
          The Matrimonial module schema migration has not been applied to the database yet. The admin
          moderation queue will automatically become active once the database tables are migrated.
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadProfiles}>
          Retry Connection
        </Button>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Matrimonial Moderation & Verification System
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review community registrations, verify identity documents, process user reports, and manage profile visibility.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            loadMetrics();
            if (activeTab <= 3) loadProfiles();
            else if (activeTab === 4) loadDocuments();
            else if (activeTab === 5) loadReports();
            else if (activeTab === 6) loadAuditLogs();
          }}
        >
          Refresh Data
        </Button>
      </Box>

      {/* Metrics Row */}
      {metrics && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold">{metrics.totalProfiles}</Typography>
              <Typography variant="caption" color="text.secondary">Total Profiles</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 3, borderColor: 'warning.main' }}>
              <Typography variant="h6" fontWeight="bold" color="warning.main">{metrics.pendingApprovals}</Typography>
              <Typography variant="caption" color="text.secondary">Pending Review</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 3, borderColor: 'success.main' }}>
              <Typography variant="h6" fontWeight="bold" color="success.main">{metrics.approvedProfiles}</Typography>
              <Typography variant="caption" color="text.secondary">Approved</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 3, borderColor: 'error.main' }}>
              <Typography variant="h6" fontWeight="bold" color="error.main">{metrics.suspendedProfiles}</Typography>
              <Typography variant="caption" color="text.secondary">Suspended</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold">{metrics.rejectedProfiles}</Typography>
              <Typography variant="caption" color="text.secondary">Rejected</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 3, borderColor: 'info.main' }}>
              <Typography variant="h6" fontWeight="bold" color="info.main">{metrics.pendingDocuments}</Typography>
              <Typography variant="caption" color="text.secondary">Pending Docs</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, borderTop: 3, borderColor: 'error.dark' }}>
              <Typography variant="h6" fontWeight="bold" color="error.dark">{metrics.openReports}</Typography>
              <Typography variant="caption" color="text.secondary">Open Reports</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h6" fontWeight="bold">{metrics.resolvedReports}</Typography>
              <Typography variant="caption" color="text.secondary">Resolved</Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Error / Success Alerts */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <Paper elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => {
            setActiveTab(val);
            setPage(1);
          }}
          indicatorColor="secondary"
          textColor="secondary"
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab icon={<HourglassEmptyIcon />} iconPosition="start" label="Pending Review" />
          <Tab icon={<CheckCircleIcon />} iconPosition="start" label="Approved" />
          <Tab icon={<WarningIcon />} iconPosition="start" label="Suspended" />
          <Tab icon={<CancelIcon />} iconPosition="start" label="Rejected" />
          <Tab icon={<DescriptionIcon />} iconPosition="start" label="Document Verification" />
          <Tab icon={<ReportIcon />} iconPosition="start" label="User Reports" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Audit History" />
        </Tabs>

        {/* ----------------- TAB 0-3: PROFILES QUEUES ----------------- */}
        {activeTab <= 3 && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <TextField
                size="small"
                placeholder="Search by name, phone, city, occupation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    loadProfiles();
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 340 }}
              />
              <Button variant="outlined" onClick={() => { setPage(1); loadProfiles(); }}>
                Search
              </Button>
            </Box>

            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : profiles.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="body1" color="text.secondary">
                  No matrimonial profiles found in this queue.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Member Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Location</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Education & Work</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Photos</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Verification</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profiles.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight="bold">{p.fullName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {p.gender || '—'} {p.age ? `• ${p.age} yrs` : ''} • {p.maritalStatus}
                          </Typography>
                        </TableCell>
                        <TableCell>{p.phone}</TableCell>
                        <TableCell>{p.city ? `${p.city}, ${p.state || ''}` : '—'}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{p.highestEducation}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.occupation}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={<PhotoLibraryIcon fontSize="small" />}
                            label={`${p.photosCount} photos`}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {p.isVerified ? (
                              <Chip size="small" icon={<VerifiedIcon fontSize="small" />} label="ID Verified" color="primary" />
                            ) : (
                              <Typography variant="caption" color="text.secondary">Unverified</Typography>
                            )}
                            {p.isEducationVerified && (
                              <Chip size="small" label="Edu" color="info" variant="outlined" />
                            )}
                            {p.isProfessionVerified && (
                              <Chip size="small" label="Job" color="success" variant="outlined" />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{renderStatusBadge(p.status)}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="contained" onClick={() => handleOpenReview(p.id)}>
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={totalPages} page={page} onChange={(_, val) => setPage(val)} color="secondary" />
              </Box>
            )}
          </Box>
        )}

        {/* ----------------- TAB 4: DOCUMENT VERIFICATION QUEUE ----------------- */}
        {activeTab === 4 && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <TextField
                select
                size="small"
                label="Filter by Status"
                value={docStatusFilter}
                onChange={(e) => { setDocStatusFilter(e.target.value); setDocPage(1); }}
                sx={{ width: 200 }}
              >
                <MenuItem value="PENDING">Pending Review</MenuItem>
                <MenuItem value="APPROVED">Approved / Verified</MenuItem>
                <MenuItem value="REJECTED">Rejected</MenuItem>
                <MenuItem value="ALL">All Documents</MenuItem>
              </TextField>
            </Box>

            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : documents.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography color="text.secondary">No verification documents in this queue.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Member Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Document Type</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Title / Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Format</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Submitted Date</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.map((d) => (
                      <TableRow key={d.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight="bold">{d.userFullName}</Typography>
                        </TableCell>
                        <TableCell>{d.userPhone}</TableCell>
                        <TableCell>
                          <Chip size="small" label={d.documentType} variant="outlined" />
                        </TableCell>
                        <TableCell>{d.documentName}</TableCell>
                        <TableCell>
                          <Typography variant="caption">{d.mimeType} ({(d.fileSize / 1024).toFixed(0)} KB)</Typography>
                        </TableCell>
                        <TableCell>{formatDate(d.createdAt)}</TableCell>
                        <TableCell>
                          {d.status === 'APPROVED' ? (
                            <Chip size="small" color="success" label="Approved" />
                          ) : d.status === 'REJECTED' ? (
                            <Chip size="small" color="error" label="Rejected" />
                          ) : (
                            <Chip size="small" color="warning" label="Pending" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<OpenInNewIcon fontSize="small" />}
                              onClick={() => handleViewDocument(d.id)}
                            >
                              View
                            </Button>
                            {d.status === 'PENDING' && (
                              <>
                                <Button
                                  size="small"
                                  color="success"
                                  variant="contained"
                                  onClick={() => handleApproveDocument(d.id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  onClick={() => { setSelectedDocId(d.id); setIsDocRejectDialogOpen(true); }}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {docTotalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={docTotalPages} page={docPage} onChange={(_, val) => setDocPage(val)} color="secondary" />
              </Box>
            )}
          </Box>
        )}

        {/* ----------------- TAB 5: PROFILE REPORTS QUEUE ----------------- */}
        {activeTab === 5 && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <TextField
                select
                size="small"
                label="Filter by Status"
                value={reportStatusFilter}
                onChange={(e) => { setReportStatusFilter(e.target.value); setReportPage(1); }}
                sx={{ width: 200 }}
              >
                <MenuItem value="PENDING">Pending Investigation</MenuItem>
                <MenuItem value="UNDER_INVESTIGATION">Under Investigation</MenuItem>
                <MenuItem value="RESOLVED">Resolved</MenuItem>
                <MenuItem value="DISMISSED">Dismissed</MenuItem>
                <MenuItem value="ALL">All Reports</MenuItem>
              </TextField>
            </Box>

            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : reports.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography color="text.secondary">No reports in this queue.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Reported Profile</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Report Category</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Explanation / Details</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Reported By</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reports.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>
                          <Typography variant="subtitle2" fontWeight="bold">{r.reportedUserName}</Typography>
                          <Typography variant="caption" color="text.secondary">{r.reportedUserPhone}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" color="error" label={r.reason} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260 }}>
                          <Typography variant="body2" noWrap>{r.explanation || '—'}</Typography>
                        </TableCell>
                        <TableCell>{r.reporterName}</TableCell>
                        <TableCell>{formatDate(r.createdAt)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={r.status} color={r.status === 'RESOLVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => {
                              setSelectedReport(r);
                              setReportActionNotes(r.adminNotes || '');
                              setIsReportActionDialogOpen(true);
                            }}
                          >
                            Investigate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {reportTotalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={reportTotalPages} page={reportPage} onChange={(_, val) => setReportPage(val)} color="secondary" />
              </Box>
            )}
          </Box>
        )}

        {/* ----------------- TAB 6: AUDIT HISTORY ----------------- */}
        {activeTab === 6 && (
          <Box sx={{ p: 2 }}>
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : auditLogs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography color="text.secondary">No matrimonial moderation audit logs recorded yet.</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Admin Name</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Target Type</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id} hover>
                        <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{log.actorName}</TableCell>
                        <TableCell>
                          <Chip size="small" label={log.action} variant="outlined" />
                        </TableCell>
                        <TableCell>{log.targetType}</TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {JSON.stringify(log.details)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {auditTotalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={auditTotalPages} page={auditPage} onChange={(_, val) => setAuditPage(val)} color="secondary" />
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* ----------------- INSPECTION & REVIEW DRAWER ----------------- */}
      <Drawer
        anchor="right"
        open={Boolean(selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 600, md: 720 }, p: 3 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">Matrimonial Profile Inspection</Typography>
          <IconButton onClick={() => setSelectedProfileId(null)}><CloseIcon /></IconButton>
        </Box>

        {isLoadingDetails ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}><CircularProgress /></Box>
        ) : profileDetails ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 6 }}>
            {/* Self-moderation guard */}
            {isSelfProfile && (
              <Alert severity="warning">
                Security Constraint: Administrators are not permitted to approve or moderate their own matrimonial registration.
              </Alert>
            )}

            {/* Profile Overview */}
            <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    {profileDetails.user?.profile?.fullName || 'Community Member'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Phone: {profileDetails.user?.phone} • Account Status: {profileDetails.user?.status}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Registered: {formatDate(profileDetails.createdAt)}
                  </Typography>
                </Box>
                {renderStatusBadge(profileDetails.status)}
              </Box>
            </Paper>

            {/* Rejection / Suspension Notice */}
            {(profileDetails.status === 'REJECTED' || profileDetails.status === 'SUSPENDED') && profileDetails.rejectionReason && (
              <Alert severity="error">
                <strong>Reason:</strong> {profileDetails.rejectionReason}
              </Alert>
            )}

            {/* Photos Review */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Submitted Gallery Photos ({profileDetails.photos.length})
              </Typography>
              {profileDetails.photos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No photos uploaded by member.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {profileDetails.photos.map((ph) => (
                    <Grid item xs={6} sm={4} key={ph.id}>
                      <Card sx={{ border: ph.isApproved ? 1 : 2, borderColor: ph.isApproved ? 'divider' : 'error.main' }}>
                        <CardMedia
                          component="img"
                          height="140"
                          image={ph.url}
                          alt="Matrimonial Photo"
                          sx={{ cursor: 'pointer', objectFit: 'cover' }}
                          onClick={() => setPreviewPhotoUrl(ph.url)}
                        />
                        <CardActions sx={{ justifyContent: 'space-between', px: 1, py: 0.5 }}>
                          <Typography variant="caption" color={ph.isApproved ? 'success.main' : 'error.main'}>
                            {ph.isApproved ? 'Visible' : 'Hidden'}
                          </Typography>
                          <Button
                            size="small"
                            color={ph.isApproved ? 'error' : 'success'}
                            onClick={() => handleTogglePhotoApproval(ph.id, ph.isApproved)}
                          >
                            {ph.isApproved ? 'Hide' : 'Approve'}
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            <Divider />

            {/* Background Details */}
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Highest Education</Typography>
                <Typography variant="body2" fontWeight="bold">{profileDetails.highestEducation}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Occupation</Typography>
                <Typography variant="body2" fontWeight="bold">{profileDetails.occupation}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Annual Income</Typography>
                <Typography variant="body2">{profileDetails.annualIncome}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Work City</Typography>
                <Typography variant="body2">{profileDetails.workCity || '—'}, {profileDetails.workState || ''}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Sub-Caste & Gotra</Typography>
                <Typography variant="body2">{profileDetails.subCaste || '—'} / {profileDetails.gotra || '—'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Family Background</Typography>
                <Typography variant="body2">{profileDetails.familyType} • {profileDetails.familyValues}</Typography>
              </Grid>
            </Grid>

            <Divider />

            {/* Moderation Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                disabled={isSelfProfile || profileDetails.status === 'APPROVED'}
                onClick={() => setIsApproveDialogOpen(true)}
                fullWidth
              >
                Approve Profile
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                disabled={isSelfProfile}
                onClick={() => setIsRejectDialogOpen(true)}
                fullWidth
              >
                Request Changes
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<WarningIcon />}
                disabled={isSelfProfile || profileDetails.status === 'SUSPENDED'}
                onClick={() => setIsSuspendDialogOpen(true)}
                fullWidth
              >
                Suspend
              </Button>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      {/* ----------------- APPROVE DIALOG ----------------- */}
      <Dialog open={isApproveDialogOpen} onClose={() => setIsApproveDialogOpen(false)}>
        <DialogTitle>Approve Matrimonial Profile?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Approving this profile will publish it to the community discovery feed. All verified Samaj members will be able to discover and connect with this profile.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsApproveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleConfirmApprove} disabled={isSubmittingModeration}>
            {isSubmittingModeration ? <CircularProgress size={20} /> : 'Confirm Approval'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------------- REJECT DIALOG ----------------- */}
      <Dialog open={isRejectDialogOpen} onClose={() => setIsRejectDialogOpen(false)}>
        <DialogTitle>Reject / Request Profile Corrections</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Please state the specific reason for requesting changes. This explanation will be delivered confidentially to the member so they can correct and resubmit their profile.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Rejection Reason (Mandatory)"
            placeholder="e.g. Please upload clear passport-style photos, provide verified employer details..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmReject}
            disabled={isSubmittingModeration || rejectionReason.trim().length < 5}
          >
            {isSubmittingModeration ? <CircularProgress size={20} /> : 'Send Feedback & Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------------- SUSPEND DIALOG ----------------- */}
      <Dialog open={isSuspendDialogOpen} onClose={() => setIsSuspendDialogOpen(false)}>
        <DialogTitle>Suspend Matrimonial Profile</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Suspending this profile will immediately revoke discovery publication and block all matrimonial interactions.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Suspension Reason (Mandatory)"
            placeholder="e.g. Account reported for misleading information, policy violations..."
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSuspendDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmSuspend}
            disabled={isSubmittingModeration || suspensionReason.trim().length < 5}
          >
            {isSubmittingModeration ? <CircularProgress size={20} /> : 'Confirm Suspension'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------------- REJECT DOCUMENT DIALOG ----------------- */}
      <Dialog open={isDocRejectDialogOpen} onClose={() => setIsDocRejectDialogOpen(false)}>
        <DialogTitle>Reject Verification Document</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Please provide a specific reason why this verification document cannot be accepted. The member will be notified and permitted to upload a new document.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Rejection Reason (Mandatory)"
            placeholder="e.g. Document image is blurry, name does not match profile..."
            value={docRejectionReason}
            onChange={(e) => setDocRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDocRejectDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmRejectDocument}
            disabled={docRejectionReason.trim().length < 5}
          >
            Reject Document
          </Button>
        </DialogActions>
      </Dialog>

      {/* ----------------- REPORT ACTION DIALOG ----------------- */}
      <Dialog open={isReportActionDialogOpen} onClose={() => setIsReportActionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Investigate Profile Report</DialogTitle>
        <DialogContent>
          {selectedReport && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">Report Category</Typography>
              <Chip size="small" color="error" label={selectedReport.reason} sx={{ mb: 1.5 }} />
              <Typography variant="subtitle2" color="text.secondary">Reporter Explanation</Typography>
              <Paper sx={{ p: 1.5, bgcolor: 'action.hover', mb: 2 }}>
                <Typography variant="body2">{selectedReport.explanation || 'No additional explanation provided.'}</Typography>
              </Paper>
            </Box>
          )}

          <TextField
            select
            fullWidth
            label="Resolution Action"
            value={reportActionType}
            onChange={(e: any) => setReportActionType(e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="RESOLVED">Mark as Resolved (No Action on Profile)</MenuItem>
            <MenuItem value="SUSPEND_PROFILE">Suspend Reported Profile & Resolve</MenuItem>
            <MenuItem value="DISMISSED">Dismiss Report as Invalid / False</MenuItem>
          </TextField>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Admin Investigation Notes"
            placeholder="Add internal notes on resolution or findings..."
            value={reportActionNotes}
            onChange={(e) => setReportActionNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsReportActionDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleConfirmReportAction}>
            Apply Resolution
          </Button>
        </DialogActions>
      </Dialog>

      {/* Photo Lightbox */}
      <Dialog open={Boolean(previewPhotoUrl)} onClose={() => setPreviewPhotoUrl(null)} maxWidth="md">
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setPreviewPhotoUrl(null)}
            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
          {previewPhotoUrl && <img src={previewPhotoUrl} alt="Preview" style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }} />}
        </Box>
      </Dialog>
    </Box>
  );
};

export default MatrimonialModerationPage;
