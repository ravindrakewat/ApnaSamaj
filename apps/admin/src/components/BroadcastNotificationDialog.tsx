import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  Paper,
  Divider,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Campaign as CampaignIcon,
  NotificationsActive as NotificationsActiveIcon,
  Send as SendIcon,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
  BroadcastNotificationPayload,
  BroadcastTargetAudience,
  sendAdminBroadcast,
} from '../services/admin.notifications.service';

interface BroadcastNotificationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const BroadcastNotificationDialog: React.FC<BroadcastNotificationDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetAudience, setTargetAudience] = useState<BroadcastTargetAudience>('ALL_MEMBERS');
  const [actionUrl, setActionUrl] = useState('');
  const [isHighPriority, setIsHighPriority] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setTargetAudience('ALL_MEMBERS');
    setActionUrl('');
    setIsHighPriority(false);
    setError(null);
  };

  const handleClose = () => {
    if (!isSending) {
      resetForm();
      onClose();
    }
  };

  const handleSend = async () => {
    if (!title.trim()) {
      setError('Notification title is required.');
      return;
    }
    if (!body.trim()) {
      setError('Notification message body is required.');
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      const payload: BroadcastNotificationPayload = {
        title: title.trim(),
        body: body.trim(),
        targetAudience,
        actionUrl: actionUrl.trim() || undefined,
        priority: isHighPriority ? 'HIGH' : 'NORMAL',
      };

      const result = await sendAdminBroadcast(payload);
      if (onSuccess) {
        onSuccess(result.message || 'Broadcast notification sent successfully.');
      }
      resetForm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch broadcast notification.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <CampaignIcon color="secondary" sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="h6" fontWeight="bold">
            Community Broadcast / सामूहिक प्रसारण
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Deliver real-time notifications and announcements to community members.
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Stack spacing={2.5}>
          {/* Target Audience Dropdown */}
          <FormControl fullWidth size="small">
            <InputLabel id="broadcast-audience-label">Target Audience / लक्षित सदस्य</InputLabel>
            <Select
              labelId="broadcast-audience-label"
              value={targetAudience}
              label="Target Audience / लक्षित सदस्य"
              onChange={(e) => setTargetAudience(e.target.value as BroadcastTargetAudience)}
            >
              <MenuItem value="ALL_MEMBERS">
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    All Registered Members (सभी पंजीकृत सदस्य)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Broadcast to every active user in this community.
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="VERIFIED_ONLY">
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    Verified Members Only (सत्यापित सदस्य)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Broadcast exclusively to members with confirmed phone & identity verification.
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="ADMINS_MODS">
                <Box>
                  <Typography variant="body2" fontWeight="bold">
                    Administrators & Moderators (संचालक एवं व्यवस्थापक)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Urgent notices for platform staff and community committee members.
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Title Field */}
          <TextField
            fullWidth
            required
            label="Announcement Title / शीर्षक"
            placeholder="e.g. Annual Community Gathering 2026 / वार्षिक समाज सम्मेलन"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            size="small"
          />

          {/* Message Body Field */}
          <TextField
            fullWidth
            required
            multiline
            rows={3}
            label="Message Body / संदेश विवरण"
            placeholder="Enter the full text of your announcement or community notification..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {/* Optional Action URL */}
          <TextField
            fullWidth
            label="Action Deep-Link URL / लिंक (Optional)"
            placeholder="e.g. /events or /government-schemes"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            size="small"
            helperText="Users will navigate directly here when clicking the notification."
          />

          {/* Priority Toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={isHighPriority}
                onChange={(e) => setIsHighPriority(e.target.checked)}
                color="secondary"
              />
            }
            label={
              <Box>
                <Typography variant="body2" fontWeight="bold">
                  High Priority / उच्च प्राथमिकता
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Triggers immediate priority mobile push notification and in-app banner.
                </Typography>
              </Box>
            }
          />

          {/* Live Preview Card */}
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight="bold"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}
            >
              <VisibilityIcon fontSize="small" /> LIVE NOTIFICATION PREVIEW (मोबाइल एवं वेब पूर्वावलोकन)
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: 'background.default',
                borderColor: isHighPriority ? 'secondary.main' : 'divider',
              }}
            >
              <Box display="flex" alignItems="flex-start" gap={1.5}>
                <Avatar sx={{ bgcolor: isHighPriority ? 'secondary.main' : 'primary.main', width: 36, height: 36 }}>
                  <NotificationsActiveIcon fontSize="small" />
                </Avatar>
                <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                    <Typography variant="subtitle2" fontWeight="bold" noWrap>
                      {title.trim() || 'Notification Title'}
                    </Typography>
                    {isHighPriority && (
                      <Chip label="High Priority" color="secondary" size="small" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                    {body.trim() || 'Announcement details will appear here as received by members.'}
                  </Typography>
                  {actionUrl.trim() && (
                    <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 0.5 }}>
                      Action: {actionUrl.trim()}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Paper>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isSending} color="inherit">
          Cancel / रद्द करें
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={isSending ? <CircularProgress size={16} /> : <SendIcon />}
          onClick={handleSend}
          disabled={isSending || !title.trim() || !body.trim()}
          sx={{ fontWeight: 'bold' }}
        >
          {isSending ? 'Dispatching...' : 'Dispatch Broadcast / प्रसारण भेजें'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
