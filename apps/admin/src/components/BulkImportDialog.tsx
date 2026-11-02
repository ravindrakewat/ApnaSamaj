import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  Chip,
  IconButton,
  Divider,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  FileDownload as FileDownloadIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import {
  BulkImportPreviewSummary,
  BulkImportExecuteResult,
  BulkImportRowStatus,
} from '@apnasamaj/shared-types';
import {
  downloadImportTemplate,
  previewBulkImportApi,
  executeBulkImportApi,
} from '../services/admin.users.service';
import {
  generateImportErrorReportCsv,
  triggerCsvDownload,
} from '../utils/csv-export';

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const BulkImportDialog: React.FC<BulkImportDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [activeStep, setActiveStep] = useState(0);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Async state
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Data state
  const [previewSummary, setPreviewSummary] = useState<BulkImportPreviewSummary | null>(null);
  const [executeResult, setExecuteResult] = useState<BulkImportExecuteResult | null>(null);

  // Pagination for preview grid
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Reset dialog state on close
  const handleDialogClose = () => {
    if (isExecuting) return; // Prevent closing mid-execution
    setSelectedFile(null);
    setFileError(null);
    setGeneralError(null);
    setPreviewSummary(null);
    setExecuteResult(null);
    setActiveStep(0);
    setPage(0);
    onClose();
  };

  // 1. Download official backend template
  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setGeneralError(null);
    try {
      const { blob, filename } = await downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Failed to download template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // 2. File selection & client-side validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setGeneralError(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setFileError('Invalid file type. Please select a valid Excel (.xlsx) spreadsheet.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 5 MB.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 3. Dry-run preview request
  const handleGeneratePreview = async () => {
    if (!selectedFile) return;

    setIsPreviewing(true);
    setGeneralError(null);
    try {
      const summary = await previewBulkImportApi(selectedFile);
      setPreviewSummary(summary);
      setActiveStep(1); // Advance to preview step
      setPage(0);
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Failed to process spreadsheet preview.');
    } finally {
      setIsPreviewing(false);
    }
  };

  // 4. Download validation error report CSV
  const handleDownloadErrorReport = () => {
    if (!previewSummary) return;
    const csv = generateImportErrorReportCsv(previewSummary);
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(csv, `ApnaSamaj_Import_Errors_${dateStr}.csv`);
  };

  // 5. Execute import transaction
  const handleExecuteImport = async () => {
    if (!selectedFile || !previewSummary) return;

    setIsExecuting(true);
    setGeneralError(null);
    try {
      const result = await executeBulkImportApi(selectedFile, { skipExisting: true });
      setExecuteResult(result);
      setActiveStep(2); // Advance to results step
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Failed to execute bulk member import.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Format file size helper
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getRowStatusChip = (status: BulkImportRowStatus) => {
    switch (status) {
      case 'VALID':
        return <Chip label="Valid" color="success" size="small" />;
      case 'EXISTING_IN_DB':
        return <Chip label="Already in DB" color="info" size="small" />;
      case 'DUPLICATE_IN_FILE':
        return <Chip label="Duplicate in File" color="warning" size="small" />;
      case 'INVALID_FORMAT':
        return <Chip label="Invalid Data" color="error" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const steps = ['Upload File', 'Preview & Validate', 'Results'];

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={isExecuting}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="div" fontWeight="bold">
          Bulk Member Import (Excel)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Import multiple community members from a pre-formatted Excel workbook.
        </Typography>
      </DialogTitle>

      <Box sx={{ px: 3, pt: 1, pb: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      <Divider />

      <DialogContent sx={{ minHeight: 380, py: 3 }}>
        {generalError && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setGeneralError(null)}>
            {generalError}
          </Alert>
        )}

        {/* =================================================================== */}
        {/* STEP 1: Select File & Download Template                             */}
        {/* =================================================================== */}
        {activeStep === 0 && (
          <Box display="flex" flexDirection="column" gap={3}>
            {/* Template Download Card */}
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">
                  Need the Excel format?
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Download the official Apna Samaj template with pre-styled headers and dropdown options.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="primary"
                startIcon={
                  isDownloadingTemplate ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <DownloadIcon />
                  )
                }
                onClick={handleDownloadTemplate}
                disabled={isDownloadingTemplate}
                sx={{ textTransform: 'none' }}
              >
                {isDownloadingTemplate ? 'Downloading...' : 'Download Template (.xlsx)'}
              </Button>
            </Paper>

            {/* Upload Zone */}
            <Box
              sx={{
                border: '2px dashed',
                borderColor: fileError ? 'error.main' : selectedFile ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: selectedFile ? 'action.selected' : 'background.paper',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {!selectedFile ? (
                <Box display="flex" flexDirection="column" alignItems="center" gap={1.5}>
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight={600}>
                    Choose or drop your Excel file here
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Supports <strong>.xlsx</strong> files up to 5 MB (maximum 1,000 member rows).
                  </Typography>
                  <Button
                    variant="contained"
                    component="span"
                    size="small"
                    sx={{ mt: 1, textTransform: 'none' }}
                  >
                    Select File
                  </Button>
                </Box>
              ) : (
                <Box display="flex" alignItems="center" justifyContent="center" gap={2}>
                  <FileIcon color="primary" sx={{ fontSize: 40 }} />
                  <Box textAlign="left">
                    <Typography variant="subtitle1" fontWeight="bold">
                      {selectedFile.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatFileSize(selectedFile.size)}
                    </Typography>
                  </Box>
                  <IconButton
                    color="error"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile();
                    }}
                    title="Remove File"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              )}
            </Box>

            {fileError && <Alert severity="error">{fileError}</Alert>}

            <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.875rem' } }}>
              <strong>Important:</strong> Member accounts are created in <code>PENDING</code> status with an unusable dummy password. Members will claim their account and set their own password via the self-service SMS OTP verification page.
            </Alert>
          </Box>
        )}

        {/* =================================================================== */}
        {/* STEP 2: Preview & Validate                                          */}
        {/* =================================================================== */}
        {activeStep === 1 && previewSummary && (
          <Box display="flex" flexDirection="column" gap={2.5}>
            {/* Metric Summary Cards */}
            <Box
              display="grid"
              gridTemplateColumns={{
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(5, 1fr)',
              }}
              gap={1.5}
            >
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Total Rows
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {previewSummary.totalRows}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, textAlign: 'center', borderColor: 'success.light' }}
              >
                <Typography variant="caption" color="success.dark">
                  Ready to Import
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="success.main">
                  {previewSummary.validCount}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderColor: 'info.light' }}>
                <Typography variant="caption" color="info.dark">
                  Already in DB
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="info.main">
                  {previewSummary.existingInDbCount}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, textAlign: 'center', borderColor: 'warning.light' }}
              >
                <Typography variant="caption" color="warning.dark">
                  Duplicate in File
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="warning.main">
                  {previewSummary.duplicateInFileCount}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, textAlign: 'center', borderColor: 'error.light' }}
              >
                <Typography variant="caption" color="error.dark">
                  Invalid Data
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="error.main">
                  {previewSummary.invalidFormatCount}
                </Typography>
              </Paper>
            </Box>

            {/* Error Report Download Bar */}
            {(previewSummary.duplicateInFileCount > 0 ||
              previewSummary.existingInDbCount > 0 ||
              previewSummary.invalidFormatCount > 0) && (
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
                p={1.5}
                bgcolor="action.hover"
                borderRadius={1}
              >
                <Typography variant="body2" color="text.secondary">
                  Some rows have duplicate or invalid entries and will be skipped.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<FileDownloadIcon />}
                  onClick={handleDownloadErrorReport}
                  sx={{ textTransform: 'none' }}
                >
                  Download Error Report (CSV)
                </Button>
              </Box>
            )}

            {/* Preview Grid */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 260 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', width: 60 }}>Row</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>City / State</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Validation Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewSummary.previewRows
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((row) => (
                      <TableRow key={row.rowNumber} hover>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.fullName || '-'}</TableCell>
                        <TableCell>{row.phone || '-'}</TableCell>
                        <TableCell>
                          {[row.city, row.state].filter(Boolean).join(', ') || '-'}
                        </TableCell>
                        <TableCell>{getRowStatusChip(row.status)}</TableCell>
                        <TableCell>
                          {row.errors && row.errors.length > 0 ? (
                            <Typography variant="caption" color="error">
                              {row.errors.join('; ')}
                            </Typography>
                          ) : row.status === 'VALID' ? (
                            <Typography variant="caption" color="success.main">
                              Ready for import
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              Skipped
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  {previewSummary.previewRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          No member rows found in the uploaded file.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={previewSummary.previewRows.length}
              page={page}
              onPageChange={(_e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 25]}
            />
          </Box>
        )}

        {/* =================================================================== */}
        {/* STEP 3: Results                                                     */}
        {/* =================================================================== */}
        {activeStep === 2 && executeResult && (
          <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" py={3} gap={2}>
            <CheckCircleIcon color="success" sx={{ fontSize: 64 }} />
            <Typography variant="h5" fontWeight="bold">
              Bulk Import Completed
            </Typography>
            <Typography variant="body2" color="text.secondary" maxWidth={500}>
              New members have been successfully imported into the community database.
            </Typography>

            <Box
              display="grid"
              gridTemplateColumns="repeat(4, 1fr)"
              gap={2}
              sx={{ my: 2, width: '100%', maxWidth: 600 }}
            >
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderColor: 'success.main' }}>
                <Typography variant="caption" color="success.dark">
                  Imported
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="success.main">
                  {executeResult.importedCount}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderColor: 'info.main' }}>
                <Typography variant="caption" color="info.dark">
                  Skipped (in DB)
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="info.main">
                  {executeResult.skippedExistingCount}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderColor: 'warning.main' }}>
                <Typography variant="caption" color="warning.dark">
                  Skipped (Duplicate)
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="warning.main">
                  {executeResult.skippedDuplicateCount}
                </Typography>
              </Paper>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  textAlign: 'center',
                  borderColor: executeResult.failedCount > 0 ? 'error.main' : 'divider',
                }}
              >
                <Typography variant="caption" color="error.dark">
                  Failed
                </Typography>
                <Typography
                  variant="h5"
                  fontWeight="bold"
                  color={executeResult.failedCount > 0 ? 'error.main' : 'text.secondary'}
                >
                  {executeResult.failedCount}
                </Typography>
              </Paper>
            </Box>

            <Alert severity="info" sx={{ maxWidth: 600, textAlign: 'left' }}>
              Imported members can now claim their account at <code>/claim-account</code> using their registered phone number.
            </Alert>
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2 }}>
        {activeStep === 0 && (
          <>
            <Button onClick={handleDialogClose} color="inherit" sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleGeneratePreview}
              disabled={!selectedFile || isPreviewing}
              startIcon={isPreviewing ? <CircularProgress size={18} color="inherit" /> : <CloudUploadIcon />}
              sx={{ textTransform: 'none', px: 3 }}
            >
              {isPreviewing ? 'Processing Preview...' : 'Upload & Preview'}
            </Button>
          </>
        )}

        {activeStep === 1 && previewSummary && (
          <>
            <Button
              onClick={() => {
                setActiveStep(0);
                setPreviewSummary(null);
              }}
              color="inherit"
              disabled={isExecuting}
              sx={{ textTransform: 'none' }}
            >
              Choose Different File
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleExecuteImport}
              disabled={previewSummary.validCount === 0 || isExecuting}
              startIcon={isExecuting ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
              sx={{ textTransform: 'none', px: 3 }}
            >
              {isExecuting
                ? 'Importing Members...'
                : `Confirm & Import (${previewSummary.validCount} Members)`}
            </Button>
          </>
        )}

        {activeStep === 2 && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              handleDialogClose();
              onSuccess();
            }}
            sx={{ textTransform: 'none', px: 4 }}
          >
            Close & Refresh List
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

