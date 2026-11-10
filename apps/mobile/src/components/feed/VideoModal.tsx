import React from 'react';
import { PostMediaItem } from '@apnasamaj/shared-types';
import { UnifiedVideoModal } from '../video/UnifiedVideoModal';

export interface VideoModalProps {
  visible: boolean;
  media: PostMediaItem | null;
  postTitle?: string | null;
  authorName?: string | null;
  onClose: () => void;
}

/**
 * Backward-compatible proxy to UnifiedVideoModal.
 * Enables in-app playback for both YouTube videos and user-uploaded videos without external redirection.
 */
export const VideoModal: React.FC<VideoModalProps> = (props) => {
  return <UnifiedVideoModal {...props} />;
};
