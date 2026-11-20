import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Avatar,
  TextField,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  Divider,
  Dialog,
  DialogContent,
  Card,
  CardMedia,
  CardContent,
  LinearProgress,
} from '@mui/material';
import {
  Send as SendIcon,
  Lock as LockIcon,
  ErrorOutline as ErrorIcon,
  AccessTime as PendingIcon,
  Forum as ChatIcon,
  Refresh as RefreshIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
  ArrowBack as ArrowBackIcon,
  Groups as GroupsIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  InsertDriveFile as DocIcon,
  OpenInNew as OpenInNewIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import {
  GroupDetails,
  GroupPrivacy,
  ChatMessageItem,
  ChatAttachmentItem,
  ChatAttachmentInput,
  NewChatMessageEvent,
  UserTypingEvent,
} from '@apnasamaj/shared-types';
import { useAuth } from '../../context/AuthContext';
import {
  fetchGroupMessages,
  sendGroupMessageApi,
  uploadGroupAttachmentApi,
} from '../../services/chat.service';
import { connectChatSocket, getChatSocket } from '../../services/chat.socket';
import {
  resolveAttachmentDisplayUrl,
  extractYouTubeVideoDetails,
} from '../../utils/attachment';

export interface ExtendedChatMessage extends ChatMessageItem {
  isOptimistic?: boolean;
  isError?: boolean;
  errorMessage?: string;
  tempId?: string;
}

export interface GroupChatTabProps {
  group: GroupDetails;
  onJoinGroup: () => Promise<void>;
  actionLoading: boolean;
  onBack?: () => void;
  headerExtra?: React.ReactNode;
  sx?: any;
}

function formatMessageTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatMessageDateHeader(isoString: string): string {
  try {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const GroupChatTab: React.FC<GroupChatTabProps> = ({
  group,
  onJoinGroup,
  actionLoading,
  onBack,
  headerExtra,
  sx,
}) => {
  const { user } = useAuth();

  // Chat message stream state
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Migration status & operational safety flag
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);

  // Connection & socket status
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Composer state
  const [inputContent, setInputContent] = useState<string>('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Attachment & Media State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // DOM Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingActiveRef = useRef<boolean>(false);

  const isPrivateAndNonMember = group.privacy === GroupPrivacy.PRIVATE && !group.isMember;
  const canSend = Boolean(group.isMember && !isMigrationPending);

  // Auto-scroll helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // Determine if scroll is already near the bottom
  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }, []);

  // 1. Load initial history
  const loadInitialHistory = useCallback(async () => {
    if (isPrivateAndNonMember) {
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const data = await fetchGroupMessages(group.id, { limit: 30 });
      // Backend returns newest first; reverse so oldest is at top
      setMessages([...data.messages].reverse());
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);
      setIsMigrationPending(false);
      setTimeout(() => scrollToBottom('auto'), 80);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load group messages.';
      if (msg.includes('migration pending') || msg.includes('temporarily offline')) {
        setIsMigrationPending(true);
      } else {
        setHistoryError(msg);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [group.id, isPrivateAndNonMember, scrollToBottom]);

  // 2. Load older messages (cursor pagination)
  const handleLoadOlder = async () => {
    if (!nextCursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      const data = await fetchGroupMessages(group.id, { before: nextCursor, limit: 30 });
      const olderMessages = [...data.messages].reverse();

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const filteredOlder = olderMessages.filter((m) => !existingIds.has(m.id));
        return [...filteredOlder, ...prev];
      });

      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore);

      // Preserve scroll position
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - previousScrollHeight;
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load older messages.';
      if (msg.includes('migration pending')) {
        setIsMigrationPending(true);
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  // 3. Socket lifecycle and event listeners
  useEffect(() => {
    if (isPrivateAndNonMember) return;

    loadInitialHistory();

    const socket = connectChatSocket();

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
      // Join group room on server
      socket.emit(
        'join_group',
        { groupId: group.id },
        (res: { success: boolean; error?: string }) => {
          if (!res?.success) {
            setConnectionError(res?.error || 'Unable to join group room.');
          }
        }
      );
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleConnectError = (err: Error) => {
      setIsConnected(false);
      setConnectionError(err.message || 'Connection error.');
    };

    const handleNewMessage = (payload: NewChatMessageEvent) => {
      if (!payload?.message || payload.message.groupId !== group.id) return;

      const shouldScroll = isNearBottom() || payload.message.senderId === user?.id;

      setMessages((prev) => {
        // If an optimistic message matches tempId, replace it
        if (payload.tempId) {
          const optimisticIndex = prev.findIndex((m) => m.tempId === payload.tempId);
          if (optimisticIndex !== -1) {
            const nextList = [...prev];
            nextList[optimisticIndex] = { ...payload.message, isOptimistic: false };
            return nextList;
          }
        }
        // Avoid duplicates if message is already in list
        if (prev.some((m) => m.id === payload.message.id)) {
          return prev;
        }
        return [...prev, payload.message];
      });

      if (shouldScroll) {
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
    };

    const handleUserTyping = (payload: UserTypingEvent) => {
      if (payload.groupId !== group.id || payload.userId === user?.id) return;

      setTypingUsers((prev) => {
        if (payload.isTyping) {
          return prev.includes(payload.userName) ? prev : [...prev, payload.userName];
        } else {
          return prev.filter((name) => name !== payload.userName);
        }
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);

    // If socket was already connected, trigger room join directly
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit('leave_group', { groupId: group.id });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [group.id, isPrivateAndNonMember, loadInitialHistory, scrollToBottom, isNearBottom, user?.id]);

  // 4. Handle text typing and indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputContent(value);

    const socket = getChatSocket();
    if (socket && socket.connected && value.trim()) {
      if (!isTypingActiveRef.current) {
        isTypingActiveRef.current = true;
        socket.emit('typing_start', { groupId: group.id });
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        socket.emit('typing_stop', { groupId: group.id });
      }, 2500);
    } else if (!value.trim() && isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      socket?.emit('typing_stop', { groupId: group.id });
    }
  };

  // 4.1 Attachment selection & validation
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxLimits: Record<string, number> = {
      image: 10 * 1024 * 1024,
      video: 50 * 1024 * 1024,
      audio: 25 * 1024 * 1024,
      doc: 20 * 1024 * 1024,
    };

    let limit = maxLimits.doc;
    if (file.type.startsWith('image/')) limit = maxLimits.image;
    else if (file.type.startsWith('video/')) limit = maxLimits.video;
    else if (file.type.startsWith('audio/')) limit = maxLimits.audio;

    if (file.size > limit) {
      const limitMb = Math.round(limit / (1024 * 1024));
      setSendError(`File size exceeds the ${limitMb}MB limit for this media type.`);
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
    setSendError(null);
    event.target.value = '';
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 5. Send message handler (Supports text and attachments)
  const handleSendMessage = async () => {
    const trimmed = inputContent.trim();
    if (!trimmed && !selectedFile) return;

    if (trimmed.length > 2000) {
      setSendError('Message content cannot exceed 2000 characters.');
      return;
    }

    if (!group.isMember) {
      setSendError('You must join this group before sending messages.');
      return;
    }

    // Stop typing indicator immediately
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      getChatSocket()?.emit('typing_stop', { groupId: group.id });
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fileToUpload = selectedFile;

    // Reset composer immediately
    setInputContent('');
    setSelectedFile(null);
    setSendError(null);

    let optimisticAttachments: ChatAttachmentItem[] | undefined = undefined;
    if (fileToUpload) {
      let attType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'DOCUMENT';
      if (fileToUpload.type.startsWith('image/')) attType = 'IMAGE';
      else if (fileToUpload.type.startsWith('video/')) attType = 'VIDEO';
      else if (fileToUpload.type.startsWith('audio/')) attType = 'AUDIO';

      const blobUrl = URL.createObjectURL(fileToUpload);
      optimisticAttachments = [
        {
          id: `temp_att_${Date.now()}`,
          chatMessageId: tempId,
          type: attType,
          fileName: fileToUpload.name,
          fileSizeBytes: fileToUpload.size,
          mimeType: fileToUpload.type,
          storagePath: blobUrl,
          url: blobUrl,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    const optimisticMsg: ExtendedChatMessage = {
      id: tempId,
      groupId: group.id,
      senderId: user?.id || '',
      content: trimmed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: user?.id || '',
        fullName: user?.fullName || 'You',
        avatarUrl: null,
      },
      attachments: optimisticAttachments,
      isOptimistic: true,
      tempId,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // If there is an attachment to upload, perform upload first
    let attachmentInput: ChatAttachmentInput | undefined = undefined;
    if (fileToUpload) {
      setIsUploading(true);
      setUploadProgress(25);
      try {
        setUploadProgress(50);
        const uploaded = await uploadGroupAttachmentApi(group.id, fileToUpload);
        setUploadProgress(100);
        attachmentInput = {
          id: uploaded.id,
          type: uploaded.type,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          fileSizeBytes: uploaded.fileSizeBytes,
          storagePath: uploaded.storagePath,
        };
      } catch (uploadErr) {
        const errorMsg = uploadErr instanceof Error ? uploadErr.message : 'Failed to upload attachment.';
        setSendError(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? { ...m, isOptimistic: false, isError: true, errorMessage: errorMsg }
              : m
          )
        );
        setIsUploading(false);
        setUploadProgress(0);
        return;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }

    const socket = getChatSocket();
    if (socket && socket.connected) {
      socket.emit(
        'send_message',
        { groupId: group.id, content: trimmed, attachment: attachmentInput, tempId },
        (res: { success: boolean; message?: ChatMessageItem; error?: string }) => {
          if (res?.success && res.message) {
            setMessages((prev) =>
              prev.map((m) => (m.tempId === tempId ? { ...res.message!, isOptimistic: false } : m))
            );
          } else {
            const errorMsg = res?.error || 'Failed to send message.';
            if (errorMsg.includes('migration pending') || errorMsg.includes('temporarily offline')) {
              setIsMigrationPending(true);
            }
            setSendError(errorMsg);
            setMessages((prev) =>
              prev.map((m) =>
                m.tempId === tempId
                  ? { ...m, isOptimistic: false, isError: true, errorMessage: errorMsg }
                  : m
              )
            );
          }
        }
      );
    } else {
      // HTTP fallback
      try {
        const saved = await sendGroupMessageApi(group.id, trimmed, tempId, attachmentInput);
        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...saved, isOptimistic: false } : m))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to send message.';
        if (msg.includes('migration pending') || msg.includes('temporarily offline')) {
          setIsMigrationPending(true);
        }
        setSendError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? { ...m, isOptimistic: false, isError: true, errorMessage: msg }
              : m
          )
        );
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // -------------------------------------------------------------
  // RENDERING: ACCESS DENIED (PRIVATE GROUP NON-MEMBER)
  // -------------------------------------------------------------
  if (isPrivateAndNonMember) {
    return (
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          borderRadius: 3,
          bgcolor: 'background.paper',
          border: '1px dashed rgba(0,0,0,0.15)',
          position: 'relative',
          ...sx,
        }}
      >
        {onBack && (
          <Box sx={{ position: 'absolute', top: 12, left: 12, display: { xs: 'block', md: 'none' } }}>
            <IconButton size="small" onClick={onBack}>
              <ArrowBackIcon />
            </IconButton>
          </Box>
        )}
        <LockIcon sx={{ fontSize: 52, color: 'text.secondary', mb: 1.5, opacity: 0.6 }} />
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Private Group Chat
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mb: 2 }}>
          Real-time conversations in this group are private and only viewable by authorized members.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={2}
      sx={{
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        height: { xs: '580px', sm: '650px' },
        border: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
        bgcolor: '#f8fafc',
        ...sx,
      }}
    >
      {/* Chat Header Status Bar */}
      <Box
        sx={{
          py: 1.5,
          px: 2.5,
          bgcolor: '#ffffff',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box display="flex" alignItems="center" gap={1.25}>
          {onBack && (
            <IconButton
              size="small"
              onClick={onBack}
              sx={{ display: { xs: 'inline-flex', md: 'none' }, mr: 0.5 }}
            >
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Avatar
            src={group.coverUrl || undefined}
            alt={group.name}
            sx={{ width: 34, height: 34, bgcolor: 'secondary.light', color: 'secondary.contrastText' }}
          >
            <GroupsIcon sx={{ fontSize: 20 }} />
          </Avatar>
          <Box>
            <Box display="flex" alignItems="center" gap={0.75}>
              <Typography variant="subtitle2" fontWeight="bold">
                {group.name}
              </Typography>
              <Chip
                size="small"
                label="Group"
                variant="outlined"
                color="secondary"
                sx={{ height: 18, fontSize: '0.62rem' }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {group.membersCount} member{group.membersCount === 1 ? '' : 's'} • {group.privacy}
            </Typography>
          </Box>
        </Box>

        {/* Real-time Connection Indicator */}
        <Box display="flex" alignItems="center" gap={1}>
          {headerExtra}
          {isConnected ? (
            <Chip
              icon={<WifiIcon sx={{ fontSize: '13px !important', color: '#2e7d32' }} />}
              label="Live"
              size="small"
              sx={{
                bgcolor: 'rgba(46, 125, 50, 0.08)',
                color: '#2e7d32',
                fontWeight: 600,
                height: 22,
                fontSize: '0.7rem',
              }}
            />
          ) : (
            <Chip
              icon={<WifiOffIcon sx={{ fontSize: '13px !important', color: '#ed6c02' }} />}
              label="Connecting..."
              size="small"
              sx={{
                bgcolor: 'rgba(237, 108, 2, 0.08)',
                color: '#ed6c02',
                fontWeight: 600,
                height: 22,
                fontSize: '0.7rem',
              }}
            />
          )}

          <Tooltip title="Refresh Messages">
            <IconButton size="small" onClick={loadInitialHistory} disabled={loadingHistory}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Migration Pending / Operational Safety Notice */}
      {isMigrationPending && (
        <Alert
          severity="warning"
          sx={{
            m: 2,
            mb: 0,
            borderRadius: 2,
            fontSize: '0.85rem',
            border: '1px solid rgba(237, 108, 2, 0.3)',
          }}
        >
          <strong>Chat Service Temporarily Offline:</strong> The real-time chat database migration (
          <code>20261020183000_add_chat_message_model</code>) is pending deployment. Messaging is currently
          unavailable until database configuration completes.
        </Alert>
      )}

      {/* Non-member Notice for Public Groups */}
      {!group.isMember && !isMigrationPending && (
        <Alert
          severity="info"
          action={
            <Button
              color="primary"
              size="small"
              variant="contained"
              onClick={onJoinGroup}
              disabled={actionLoading}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Join Group
            </Button>
          }
          sx={{ m: 2, mb: 0, borderRadius: 2 }}
        >
          You are currently viewing this public group chat. Join this group to send messages!
        </Alert>
      )}

      {/* Connection or History Error Alert */}
      {historyError && (
        <Alert severity="error" sx={{ m: 2, mb: 0, borderRadius: 2 }}>
          {historyError}
        </Alert>
      )}
      {connectionError && !isMigrationPending && (
        <Alert severity="info" sx={{ m: 2, mb: 0, borderRadius: 2, fontSize: '0.8rem' }}>
          Real-time updates paused: {connectionError}. Falling back to standard transport.
        </Alert>
      )}

      {/* Scrollable Message History Stream */}
      <Box
        ref={messagesContainerRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {/* Loading Spinner */}
        {loadingHistory && (
          <Box display="flex" justifyContent="center" alignItems="center" py={6}>
            <CircularProgress size={32} />
          </Box>
        )}

        {/* Load More Button for Older Messages */}
        {hasMore && !loadingHistory && (
          <Box display="flex" justifyContent="center" my={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.78rem' }}
            >
              {loadingOlder ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
              {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
            </Button>
          </Box>
        )}

        {/* Empty State */}
        {!loadingHistory && messages.length === 0 && !isMigrationPending && !historyError && (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'text.secondary',
              py: 4,
            }}
          >
            <ChatIcon sx={{ fontSize: 44, opacity: 0.35, mb: 1 }} />
            <Typography variant="subtitle2" fontWeight="bold">
              No messages yet
            </Typography>
            <Typography variant="caption">
              Be the first to say hello in <strong>{group.name}</strong>!
            </Typography>
          </Box>
        )}

        {/* Render Messages */}
        {!loadingHistory &&
          messages.map((msg, index) => {
            const isSelf = msg.senderId === user?.id;
            const prevMsg = index > 0 ? messages[index - 1] : null;

            // Date divider check
            const currentDateHeader = formatMessageDateHeader(msg.createdAt);
            const prevDateHeader = prevMsg ? formatMessageDateHeader(prevMsg.createdAt) : null;
            const showDateHeader = !prevMsg || currentDateHeader !== prevDateHeader;

            return (
              <React.Fragment key={msg.id || msg.tempId || index}>
                {showDateHeader && (
                  <Box display="flex" justifyContent="center" my={1.5}>
                    <Chip
                      label={currentDateHeader}
                      size="small"
                      sx={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: 'rgba(0,0,0,0.06)',
                        height: 22,
                      }}
                    />
                  </Box>
                )}

                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: isSelf ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end',
                    gap: 1,
                  }}
                >
                  {/* Sender Avatar (Only for others) */}
                  {!isSelf && (
                    <Avatar
                      src={msg.sender?.avatarUrl || undefined}
                      alt={msg.sender?.fullName || 'Member'}
                      sx={{
                        width: 30,
                        height: 30,
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        bgcolor: 'primary.main',
                        mb: 0.25,
                      }}
                    >
                      {(msg.sender?.fullName || 'M').charAt(0).toUpperCase()}
                    </Avatar>
                  )}

                  {/* Message Bubble */}
                  <Box sx={{ maxWidth: { xs: '82%', sm: '70%' } }}>
                    {!isSelf && (
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        color="text.secondary"
                        sx={{ ml: 1, mb: 0.25, display: 'block', fontSize: '0.72rem' }}
                      >
                        {msg.sender?.fullName || 'Community Member'}
                      </Typography>
                    )}

                    <Box
                      sx={{
                        p: 1.5,
                        px: 2,
                        minWidth: msg.attachments && msg.attachments.length > 0 ? { xs: 260, sm: 300 } : 'auto',
                        borderRadius: 2.5,
                        borderBottomRightRadius: isSelf ? 0.75 : 2.5,
                        borderBottomLeftRadius: !isSelf ? 0.75 : 2.5,
                        bgcolor: isSelf ? 'primary.main' : '#ffffff',
                        color: isSelf ? '#ffffff' : 'text.primary',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        border: isSelf ? 'none' : '1px solid rgba(0,0,0,0.06)',
                        opacity: msg.isOptimistic ? 0.75 : 1,
                        position: 'relative',
                        wordBreak: 'break-word',
                      }}
                    >
                      {/* Attachments rendering */}
                      {msg.attachments?.map((att) => {
                        const displayUrl = resolveAttachmentDisplayUrl(att.url || att.storagePath);

                        if (att.type === 'IMAGE') {
                          return (
                            <Box
                              key={att.id}
                              sx={{
                                mb: 1,
                                cursor: 'pointer',
                                borderRadius: 2,
                                overflow: 'hidden',
                                bgcolor: isSelf ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                              }}
                              onClick={() => setLightboxUrl(displayUrl)}
                            >
                              <img
                                src={displayUrl}
                                alt={att.fileName}
                                style={{
                                  width: '100%',
                                  minWidth: 240,
                                  maxWidth: 360,
                                  maxHeight: 320,
                                  display: 'block',
                                  objectFit: 'cover',
                                  borderRadius: 8,
                                }}
                              />
                            </Box>
                          );
                        }

                        if (att.type === 'VIDEO') {
                          return (
                            <Box key={att.id} sx={{ mb: 1, borderRadius: 2, overflow: 'hidden' }}>
                              <video
                                controls
                                style={{
                                  width: '100%',
                                  minWidth: 240,
                                  maxWidth: 360,
                                  maxHeight: 320,
                                  display: 'block',
                                  borderRadius: 8,
                                }}
                              >
                                <source src={displayUrl} type={att.mimeType || 'video/mp4'} />
                                Your browser does not support video playback.
                              </video>
                            </Box>
                          );
                        }

                        if (att.type === 'AUDIO') {
                          return (
                            <Box key={att.id} sx={{ mb: 1, minWidth: 220 }}>
                              <audio controls style={{ width: '100%', height: 36 }}>
                                <source src={displayUrl} type={att.mimeType || 'audio/webm'} />
                              </audio>
                            </Box>
                          );
                        }

                        // Default: Document / File
                        return (
                          <Box
                            key={att.id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              p: 1,
                              mb: 1,
                              bgcolor: isSelf ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                              borderRadius: 1.5,
                            }}
                          >
                            <DocIcon sx={{ color: isSelf ? '#ffffff' : 'primary.main' }} />
                            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                              <Typography
                                variant="caption"
                                fontWeight="bold"
                                noWrap
                                display="block"
                                sx={{ color: isSelf ? '#ffffff' : 'inherit' }}
                              >
                                {att.fileName}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ opacity: 0.8, color: isSelf ? '#ffffff' : 'inherit' }}
                              >
                                {formatFileSize(att.fileSizeBytes)}
                              </Typography>
                            </Box>
                            <IconButton
                              size="small"
                              component="a"
                              href={displayUrl}
                              target="_blank"
                              download
                              sx={{ color: isSelf ? '#ffffff' : 'inherit' }}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        );
                      })}

                      {/* YouTube Link Preview Card */}
                      {(() => {
                        const yt = extractYouTubeVideoDetails(msg.content);
                        if (!yt) return null;
                        return (
                          <Card
                            sx={{
                              mb: 1,
                              maxWidth: 320,
                              bgcolor: isSelf ? 'rgba(255,255,255,0.15)' : '#f8fafc',
                              color: isSelf ? '#fff' : 'inherit',
                              border: '1px solid rgba(0,0,0,0.08)',
                            }}
                          >
                            <Box sx={{ position: 'relative' }}>
                              <CardMedia
                                component="img"
                                height="140"
                                image={yt.thumbnailUrl}
                                alt="YouTube thumbnail"
                              />
                              <Box
                                sx={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  bgcolor: 'rgba(0,0,0,0.7)',
                                  borderRadius: '50%',
                                  p: 1,
                                  display: 'flex',
                                }}
                              >
                                <PlayIcon sx={{ color: '#fff', fontSize: 28 }} />
                              </Box>
                            </Box>
                            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                              <Typography variant="caption" fontWeight="bold" noWrap display="block">
                                YouTube Video
                              </Typography>
                              <Button
                                size="small"
                                href={yt.cleanUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  color: isSelf ? '#fff' : 'primary.main',
                                  p: 0,
                                  fontSize: '0.75rem',
                                  textTransform: 'none',
                                }}
                              >
                                Watch on YouTube ↗
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })()}

                      {Boolean(msg.content) && (
                        <Typography variant="body2" sx={{ lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </Typography>
                      )}

                      {/* Timestamp & Status Icon */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 0.5,
                          mt: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.65rem',
                            color: isSelf ? 'rgba(255,255,255,0.75)' : 'text.secondary',
                          }}
                        >
                          {formatMessageTime(msg.createdAt)}
                        </Typography>

                        {isSelf && msg.isOptimistic && (
                          <PendingIcon sx={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }} />
                        )}

                        {isSelf && msg.isError && (
                          <Tooltip title={msg.errorMessage || 'Failed to send'}>
                            <ErrorIcon sx={{ fontSize: 13, color: '#f44336' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </React.Fragment>
            );
          })}

        <div ref={messagesEndRef} />
      </Box>

      {/* Typing Indicator Footer */}
      {typingUsers.length > 0 && (
        <Box sx={{ px: 3, py: 0.5, bgcolor: '#ffffff', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : `${typingUsers.join(', ')} are typing...`}
          </Typography>
        </Box>
      )}

      {/* Error feedback above composer */}
      {sendError && (
        <Box sx={{ px: 2, pt: 1, bgcolor: '#ffffff' }}>
          <Alert severity="error" onClose={() => setSendError(null)} sx={{ py: 0.25, fontSize: '0.78rem' }}>
            {sendError}
          </Alert>
        </Box>
      )}

      {/* Selected File Preview Chip / Progress */}
      {selectedFile && (
        <Box
          sx={{
            px: 2,
            pt: 1,
            pb: 0.5,
            bgcolor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Chip
            icon={<DocIcon fontSize="small" />}
            label={`${selectedFile.name} (${formatFileSize(selectedFile.size)})`}
            onDelete={isUploading ? undefined : handleClearSelectedFile}
            color="primary"
            variant="outlined"
            size="small"
            sx={{ maxWidth: 360 }}
          />
          {isUploading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, maxWidth: 220 }}>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
              />
              <Typography variant="caption" color="text.secondary">
                {uploadProgress}%
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <Divider />

      {/* Message Composer */}
      <Box
        sx={{
          p: 1.5,
          px: 2,
          bgcolor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        {/* Attachment Picker */}
        <input
          ref={fileInputRef}
          id="group-chat-file-input"
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          disabled={!canSend || isUploading}
        />
        <Tooltip title={!canSend ? 'Membership required to attach files' : 'Attach photo, video or document'}>
          <span>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={!canSend || isUploading}
              size="small"
              sx={{
                color: selectedFile ? 'primary.main' : 'text.secondary',
                bgcolor: selectedFile ? 'rgba(25, 118, 210, 0.08)' : undefined,
              }}
            >
              <AttachFileIcon />
            </IconButton>
          </span>
        </Tooltip>

        <TextField
          fullWidth
          size="small"
          placeholder={
            !group.isMember
              ? 'Join this group to participate in chat...'
              : isMigrationPending
              ? 'Chat offline (database migration pending)...'
              : 'Type a message... (Enter to send)'
          }
          value={inputContent}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={!canSend || isUploading}
          multiline
          maxRows={3}
          inputProps={{ maxLength: 2000 }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: canSend ? '#f8fafc' : '#f1f5f9',
            },
          }}
        />

        <Tooltip title={!canSend ? 'Membership required or chat offline' : 'Send Message'}>
          <span>
            <IconButton
              color="primary"
              onClick={handleSendMessage}
              disabled={!canSend || (!inputContent.trim() && !selectedFile) || isUploading}
              sx={{
                bgcolor:
                  canSend && (inputContent.trim() || selectedFile) && !isUploading
                    ? 'primary.main'
                    : undefined,
                color:
                  canSend && (inputContent.trim() || selectedFile) && !isUploading
                    ? '#ffffff'
                    : undefined,
                '&:hover': {
                  bgcolor:
                    canSend && (inputContent.trim() || selectedFile) && !isUploading
                      ? 'primary.dark'
                      : undefined,
                },
                width: 40,
                height: 40,
              }}
            >
              {isUploading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <SendIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Lightbox Dialog for Full-Resolution Image Previews */}
      <Dialog
        open={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'hidden',
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <IconButton
            onClick={() => setLightboxUrl(null)}
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: '#ffffff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
              zIndex: 10,
            }}
          >
            <CloseIcon />
          </IconButton>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Full Preview"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: 8,
                display: 'block',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
};
