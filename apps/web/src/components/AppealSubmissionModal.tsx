import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  MenuItem,
  Stack,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Gavel as GavelIcon,
  Send as SendIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { PostAppealItem, SubmitPostAppealRequest } from '@apnasamaj/shared-types';
import { submitAppealApi } from '../services/appeals.service';

const COMMON_REASONS = [
  'Content complies with community guidelines',
  'Context was misunderstood or taken out of context',
  'Factually accurate and relevant community information',
  'Fair use / educational or cultural purpose',
  'Other legitimate reason',
];

export interface AppealSubmissionModalProps {
  open: boolean;
  postId?: string;
  isLocked?: boolean;
  onClose: () => void;
  onSuccess?: (appeal: PostAppealItem) => void;
}

export const AppealSubmissionModal: React.FC<AppealSubmissionModalProps> = ({
  open,
  postId: initialPostId = '',
  isLocked = false,
  onClose,
  onSuccess,
}) => {
  const [postId, setPostId] = useState<string>(initialPostId);
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const locked = isLocked || Boolean(initialPostId && initialPostId.trim().length > 0);

  // Sync initialPostId if changed
  useEffect(() => {
    if (initialPostId) {
      setPostId(initialPostId.trim());
    }
  }, [initialPostId]);

  const effectiveReason =
    selectedReason === 'Other legitimate reason' && customReason.trim()
      ? customReason.trim()
      : selectedReason;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPostId = postId.trim();
    if (!trimmedPostId) {
      setError('Please provide the ID of the moderated post.');
      return;
    }

    if (!effectiveReason || effectiveReason.length < 3) {
      setError('Please provide a valid appeal reason (at least 3 characters).');
      return;
    }

    if (effectiveReason.length > 100) {
      setError('Reason must not exceed 100 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: SubmitPostAppealRequest = {
        postId: trimmedPostId,
        reason: effectiveReason,
        details: details.trim() || undefined,
      };

      const appeal = await submitAppealApi(payload);
      if (onSuccess) {
        onSuccess(appeal);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GavelIcon color="primary" /> Appeal Moderation Decision
          </Box>
          {locked && (
            <Chip
              size="small"
              icon={<LockIcon fontSize="small" />}
              label="Prefilled from Notice"
              color="primary"
              variant="outlined"
            />
          )}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              If you believe your post was removed in error, you may submit an appeal. Community moderators will review your statement and the original post content.
            </Typography>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label="Moderated Post ID"
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              disabled={locked}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              helperText={
                locked
                  ? 'Post ID prefilled from moderation removal notice (Locked).'
                  : 'The unique ID of your removed post from the moderation notification.'
              }
              InputProps={{
                endAdornment: locked ? (
                  <InputAdornment position="end">
                    <LockIcon color="action" fontSize="small" />
                  </InputAdornment>
                ) : undefined,
              }}
              required
            />

            <TextField
              select
              fullWidth
              label="Primary Reason for Appeal"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
            >
              {COMMON_REASONS.map((reason) => (
                <MenuItem key={reason} value={reason}>
                  {reason}
                </MenuItem>
              ))}
            </TextField>

            {selectedReason === 'Other legitimate reason' && (
              <TextField
                fullWidth
                label="Specify Reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Brief reason for appeal (max 100 chars)"
                inputProps={{ maxLength: 100 }}
                required
              />
            )}

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Additional Clarification (Optional)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide any additional context or explanation to help moderators evaluate your appeal..."
              inputProps={{ maxLength: 1000 }}
              helperText={`${details.length}/1000 characters`}
            />

            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                • You can only appeal posts that were created by you.<br />
                • Only one active appeal can be submitted per post at a time.<br />
                • You will receive a notification once moderators reach a decision.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : <SendIcon />}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AppealSubmissionModal;
