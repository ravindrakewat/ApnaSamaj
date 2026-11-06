import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ChatAttachmentItem } from '@apnasamaj/shared-types';
import { voicePlaybackService, PlaybackState } from '../../services/audio/voice-playback.service';
import { AudioWaveform } from './AudioWaveform';

interface ChatAudioMessageProps {
  attachment: ChatAttachmentItem & { localUri?: string; duration?: number };
  isCurrentUser: boolean;
  deliveryStatus?: 'pending' | 'sending' | 'sent' | 'read' | 'failed';
  onRetry?: () => void;
}

export const ChatAudioMessage: React.FC<ChatAudioMessageProps> = ({
  attachment,
  isCurrentUser,
  deliveryStatus,
  onRetry,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState((attachment.duration || 0) * 1000);
  const [rate, setRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);

  const audioId = attachment.id || attachment.storagePath || attachment.localUri || 'voice_msg';
  const effectiveUri = attachment.localUri || attachment.url || '';

  useEffect(() => {
    const unsubscribe = voicePlaybackService.addListener((state: PlaybackState) => {
      if (state.audioId === audioId) {
        setIsPlaying(state.isPlaying);
        setPositionMillis(state.positionMillis);
        if (state.durationMillis > 0) {
          setDurationMillis(state.durationMillis);
        }
        setRate(state.rate);
      } else if (isPlaying) {
        setIsPlaying(false);
        setPositionMillis(0);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [audioId, isPlaying]);

  const formatDuration = (millis: number): string => {
    const totalSecs = Math.max(0, Math.floor(millis / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTogglePlay = async () => {
    if (isLoading) return;

    if (isPlaying) {
      await voicePlaybackService.pause();
      return;
    }

    try {
      setIsLoading(true);
      await voicePlaybackService.play({
        audioId,
        uri: effectiveUri,
        attachmentId: attachment.id,
        initialPositionMillis: positionMillis > 0 ? positionMillis : 0,
      });
    } catch (err) {
      console.warn('[ChatAudioMessage] Playback error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeek = (percentage: number) => {
    const total = durationMillis > 0 ? durationMillis : (attachment.duration || 1) * 1000;
    const target = percentage * total;
    voicePlaybackService.seek(target);
  };

  const handleSpeedToggle = async () => {
    const nextRate = await voicePlaybackService.togglePlaybackRate();
    setRate(nextRate);
  };

  const progress = durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;
  const isFailed = deliveryStatus === 'failed';

  return (
    <View style={[styles.container, isCurrentUser ? styles.userContainer : styles.otherContainer]}>
      <View style={styles.contentRow}>
        {/* Play/Pause Button */}
        <TouchableOpacity
          style={[styles.playButton, isCurrentUser ? styles.userPlayButton : styles.otherPlayButton]}
          onPress={handleTogglePlay}
          disabled={isLoading || isFailed}
          accessibilityLabel={isPlaying ? 'आवाज़ रोकें (Pause voice message)' : 'आवाज़ सुनें (Play voice message)'}
          accessibilityRole="button"
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={isCurrentUser ? '#0284c7' : '#ffffff'} />
          ) : (
            <Text style={[styles.playIcon, isCurrentUser ? styles.userPlayIcon : styles.otherPlayIcon]}>
              {isPlaying ? '⏸' : '▶'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Waveform Scrubber */}
        <AudioWaveform
          progress={progress}
          isCurrentUser={isCurrentUser}
          onSeek={handleSeek}
          barCount={26}
        />

        {/* Rate toggle pill (shows 1x, 1.5x, 2x) */}
        {isPlaying && (
          <TouchableOpacity
            style={styles.ratePill}
            onPress={handleSpeedToggle}
            accessibilityLabel={`गति बदलें (${rate}x)`}
            accessibilityRole="button"
          >
            <Text style={styles.rateText}>{rate}x</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Meta Footer: Timer and Delivery Status */}
      <View style={styles.footerRow}>
        <Text style={[styles.durationText, isCurrentUser ? styles.userMetaText : styles.otherMetaText]}>
          {isPlaying ? `${formatDuration(positionMillis)} / ` : ''}
          {formatDuration(durationMillis > 0 ? durationMillis : (attachment.duration || 0) * 1000)}
        </Text>

        {isFailed && onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton} accessibilityRole="button">
            <Text style={styles.retryText}>⚠️ पुनः प्रयास करें (Retry)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    minWidth: 220,
    maxWidth: 290,
  },
  userContainer: {
    backgroundColor: 'transparent',
  },
  otherContainer: {
    backgroundColor: 'transparent',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userPlayButton: {
    backgroundColor: '#e0f2fe',
  },
  otherPlayButton: {
    backgroundColor: '#0284c7',
  },
  playIcon: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  userPlayIcon: {
    color: '#0284c7',
    marginLeft: 2,
  },
  otherPlayIcon: {
    color: '#ffffff',
    marginLeft: 2,
  },
  ratePill: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
  },
  rateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '500',
  },
  userMetaText: {
    color: '#475569',
  },
  otherMetaText: {
    color: '#64748b',
  },
  retryButton: {
    marginLeft: 8,
  },
  retryText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
});
