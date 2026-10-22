import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  Card,
  CardContent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  HistoryEdu as HistoryEduIcon,
  Security as SecurityIcon,
  FilterAltOff as ClearFiltersIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { AuditLogItem, UserRole } from '@apnasamaj/shared-types';
import { fetchAdminAuditLogs, ListAuditLogsParams } from '../services/admin.audit-logs.service';

const KNOWN_ACTIONS = [
  { value: 'USER_STATUS_UPDATE', label: 'User Status Update' },
  { value: 'MODERATION_DELETE_POST', label: 'Post Moderation Delete' },
  { value: 'MODERATION_DELETE_COMMENT', label: 'Comment Moderation Delete' },
];

const KNOWN_TARGET_TYPES = [
  { value: 'USER', label: 'User' },
  { value: 'Post', label: 'Post' },
  { value: 'Comment', label: 'Comment' },
];

export const AuditLogsPage: React.FC = () => {
  // Data State
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(0); // 0-indexed for MUI TablePagination
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalLogs, setTotalLogs] = useState(0);

  // Filters State
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedTargetType, setSelectedTargetType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [actorIdInput, setActorIdInput] = useState<string>('');
  const [debouncedActorId, setDebouncedActorId] = useState<string>('');

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Log Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Debounce Actor ID input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedActorId(actorIdInput.trim());
      setPage(0);
    }, 400);

    return () => clearTimeout(handler);
  }, [actorIdInput]);

  const activeRequestRef = useRef(0);

  const loadAuditLogs = useCallback(async () => {
    const requestId = ++activeRequestRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params: ListAuditLogsParams = {
        page: page + 1, // API is 1-indexed
        limit: rowsPerPage,
        action: selectedAction || undefined,
        targetType: selectedTargetType || undefined,
        actorId: debouncedActorId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      const result = await fetchAdminAuditLogs(params);

      if (requestId === activeRequestRef.current) {
        setLogs(result.logs);
        setTotalLogs(result.pagination.totalLogs);
      }
    } catch (err: unknown) {
      if (requestId === activeRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, rowsPerPage, selectedAction, selectedTargetType, debouncedActorId, fromDate, toDate]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleClearFilters = () => {
    setSelectedAction('');
    setSelectedTargetType('');
    setFromDate('');
    setToDate('');
    setActorIdInput('');
    setDebouncedActorId('');
    setPage(0);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getActionChip = (action: string) => {
    switch (action) {
      case 'USER_STATUS_UPDATE':
        return <Chip label="Status Update" size="small" color="primary" variant="outlined" sx={{ fontWeight: 'bold' }} />;
      case 'MODERATION_DELETE_POST':
        return <Chip label="Delete Post" size="small" color="error" variant="filled" sx={{ fontWeight: 'bold' }} />;
      case 'MODERATION_DELETE_COMMENT':
        return <Chip label="Delete Comment" size="small" color="warning" variant="filled" sx={{ fontWeight: 'bold' }} />;
      default:
        return <Chip label={action} size="small" variant="outlined" />;
    }
  };

  const getRoleBadge = (role: UserRole) => {
    const isSuperAdmin = role === UserRole.SUPER_ADMIN;
    return (
      <Chip
        label={role.replace('_', ' ')}
        size="small"
        color={isSuperAdmin ? 'secondary' : 'default'}
        sx={{ fontSize: '0.7rem', height: 20 }}
      />
    );
  };

  const hasActiveFilters = Boolean(
    selectedAction || selectedTargetType || fromDate || toDate || debouncedActorId
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <HistoryEduIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              Audit Logs
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Immutable audit trail of administrative security operations and content moderation actions.
          </Typography>
        </Box>
        <Tooltip title="Refresh audit logs">
          <IconButton onClick={loadAuditLogs} disabled={isLoading} color="primary" sx={{ border: 1, borderColor: 'divider' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter Bar */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              fullWidth
              size="small"
              label="Action"
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Actions</MenuItem>
              {KNOWN_ACTIONS.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              select
              fullWidth
              size="small"
              label="Target Type"
              value={selectedTargetType}
              onChange={(e) => {
                setSelectedTargetType(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All Targets</MenuItem>
              {KNOWN_TARGET_TYPES.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="From Date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="To Date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2.5} sx={{ display: 'flex', gap: 1 }}>
            {hasActiveFilters && (
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                startIcon={<ClearFiltersIcon />}
                onClick={handleClearFilters}
                sx={{ textTransform: 'none', height: 40, flexShrink: 0 }}
              >
                Clear
              </Button>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={loadAuditLogs}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Logs Table */}
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ minHeight: 400, position: 'relative' }}>
          {isLoading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255, 255, 255, 0.7)',
                zIndex: 2,
              }}
            >
              <CircularProgress />
            </Box>
          )}

          <Table sx={{ minWidth: 800 }}>
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actor</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Target</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Client Info</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const actorName = log.actor.profile?.fullName || log.actor.phone;
                  const dateStr = new Date(log.createdAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <TableRow key={log.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      {/* Timestamp */}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {dateStr}
                        </Typography>
                      </TableCell>

                      {/* Action */}
                      <TableCell>{getActionChip(log.action)}</TableCell>

                      {/* Actor */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            src={log.actor.profile?.avatarUrl || undefined}
                            alt={actorName}
                            sx={{ width: 32, height: 32, fontSize: '0.875rem' }}
                          >
                            {actorName.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {actorName}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {getRoleBadge(log.actor.role)}
                            </Box>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Target */}
                      <TableCell>
                        <Box>
                          <Chip
                            label={log.targetType}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 22, mb: 0.5 }}
                          />
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                            sx={{ fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {log.targetId}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Client Info */}
                      <TableCell>
                        <Typography variant="caption" display="block" color="text.secondary">
                          IP: {log.ipAddress || '—'}
                        </Typography>
                        <Tooltip title={log.userAgent || 'None'}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              maxWidth: 150,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'block',
                            }}
                          >
                            {log.userAgent || '—'}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* Details View Button */}
                      <TableCell align="right">
                        <Tooltip title="View JSON details">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setSelectedLog(log)}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                !isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                      <HistoryEduIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
                      <Typography variant="subtitle1" fontWeight="bold">
                        No audit logs found
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {hasActiveFilters
                          ? 'Try adjusting your filters or date range.'
                          : 'No administrative security or moderation actions have been recorded yet.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={totalLogs}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Details Dialog */}
      <Dialog
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SecurityIcon color="primary" />
          <Typography variant="h6" fontWeight="bold">
            Audit Log Record Details
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Log Entry ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {selectedLog.id}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Recorded At
                  </Typography>
                  <Typography variant="body2">
                    {new Date(selectedLog.createdAt).toUTCString()}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Action Performed
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>{getActionChip(selectedLog.action)}</Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Target Entity
                  </Typography>
                  <Typography variant="body2">
                    <strong>{selectedLog.targetType}</strong> ({selectedLog.targetId})
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Actor Account
                  </Typography>
                  <Typography variant="body2">
                    {selectedLog.actor.profile?.fullName || selectedLog.actor.phone} ({selectedLog.actor.role})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    Actor ID: {selectedLog.actorId}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">
                    Client Environment
                  </Typography>
                  <Typography variant="body2">IP: {selectedLog.ipAddress || 'Not recorded'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    User-Agent: {selectedLog.userAgent || 'Not recorded'}
                  </Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                Action Context & Details (JSON)
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: '#1e1e1e',
                  color: '#d4d4d4',
                  borderRadius: 2,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  overflowX: 'auto',
                }}
              >
                <pre style={{ margin: 0 }}>
                  {selectedLog.details
                    ? JSON.stringify(selectedLog.details, null, 2)
                    : '{\n  "message": "No structured context recorded for this action."\n}'}
                </pre>
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSelectedLog(null)} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
