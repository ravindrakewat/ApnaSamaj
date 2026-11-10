import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { Audio, Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Typography } from '../Typography';
import { formatVideoDuration } from '../../utils/video';
import { useLocalization } from '../../hooks/useLocalization';

export interface NativeVideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onPlaybackError?: (error: string) => void;
  autoPlay?: boolean;
}

export const NativeVideoPlayer: React.FC<NativeVideoPlayerProps> = ({
  videoUrl,
  thumbnailUrl,
  isFullscreen = false,
  onToggleFullscreen,
  onPlaybackError,
  autoPlay = true,
}) => {
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const videoRef = useRef<Video>(null);

  // Playback States
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);

  // Auto-hide controls timer
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // Mandatory Low-RAM cleanup on unmount: immediately unload video decoder handles
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.unloadAsync().catch(() => { });
      }
    };
  }, []);

  // Configure audio mode for video playback (enables sound in silent mode & audio routing)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const setupAudio = async () => {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch (err) {
          console.warn('[NativeVideoPlayer] Setup audio mode warning:', err);
        }
      };
      setupAudio();
    }
  }, []);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        setHasError(true);
        const err = status.error || 'Video playback failed';
        setErrorMessage(err);
        setIsBuffering(false);
        if (onPlaybackError) onPlaybackError(err);
      }
      return;
    }

    setIsLoaded(true);
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
    setPositionMillis(status.positionMillis || 0);
    setDurationMillis(status.durationMillis || 0);
    setIsMuted(Boolean(status.isMuted));
    setHasError(false);

    // Auto loop / replay when finished
    if (status.didJustFinish) {
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const handleTogglePlay = async () => {
    resetControlsTimer();
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        if (positionMillis >= durationMillis && durationMillis > 0) {
          await videoRef.current.replayAsync();
        } else {
          await videoRef.current.playAsync();
        }
      }
    } catch (err: any) {
      console.warn('[NativeVideoPlayer] Toggle play error:', err);
    }
  };

  const handleToggleMute = async () => {
    resetControlsTimer();
    if (!videoRef.current) return;

    try {
      const nextMuted = !isMuted;
      await videoRef.current.setIsMutedAsync(nextMuted);
      setIsMuted(nextMuted);
    } catch (err: any) {
      console.warn('[NativeVideoPlayer] Toggle mute error:', err);
    }
  };

  const handleSeek = async (ratio: number) => {
    resetControlsTimer();
    if (!videoRef.current || durationMillis <= 0) return;

    try {
      const targetPosition = Math.floor(ratio * durationMillis);
      await videoRef.current.setPositionAsync(targetPosition);
    } catch (err: any) {
      console.warn('[NativeVideoPlayer] Seek error:', err);
    }
  };

  const handleProgressBarPress = (e: any) => {
    const { locationX } = e.nativeEvent;
    // Assuming container width or measure
    const screenWidth = Dimensions.get('window').width;
    const progressWidth = screenWidth - 40; // Approx padding
    const ratio = Math.max(0, Math.min(1, locationX / progressWidth));
    handleSeek(ratio);
  };

  const handleRetry = async () => {
    setHasError(false);
    setErrorMessage(null);
    setIsBuffering(true);
    if (videoRef.current) {
      try {
        await videoRef.current.unloadAsync();
        await videoRef.current.loadAsync(
          { uri: videoUrl },
          { shouldPlay: true },
          false
        );
      } catch (err: any) {
        setHasError(true);
        setErrorMessage(err.message || 'Retry failed');
      }
    }
  };

  const progressPercent =
    durationMillis > 0 ? (positionMillis / durationMillis) * 100 : 0;

  // Web Platform: Standard HTML5 Video with Full Browser Controls & Audio
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, isFullscreen && styles.fullscreenContainer]}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <video
            src={videoUrl}
            poster={thumbnailUrl || undefined}
            controls
            autoPlay={autoPlay}
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000000',
            }}
            onError={() => {
              setHasError(true);
              const err = isHindi
                ? 'वीडियो लोड करने में असमर्थ'
                : 'Unable to load video format or stream';
              setErrorMessage(err);
              if (onPlaybackError) onPlaybackError(err);
            }}
          />
        </div>
        {hasError && (
          <View style={styles.centerOverlay}>
            <Typography variant="lg" color="#EF4444" weight="bold">
              ⚠️
            </Typography>
            <Typography variant="sm" weight="semibold" color="#FFFFFF" align="center" style={styles.errorTitle}>
              {isHindi ? 'वीडियो लोड करने में असमर्थ' : 'Unable to play video'}
            </Typography>
            <Typography variant="xs" color="#94A3B8" align="center" style={styles.errorSubtext}>
              {errorMessage || (isHindi ? 'कृपया नेटवर्क की जांच करें।' : 'Check connection or format.')}
            </Typography>
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.container, isFullscreen && styles.fullscreenContainer]}
      onPress={() => {
        if (showControls) {
          setShowControls(false);
        } else {
          resetControlsTimer();
        }
      }}
    >
      {/* Native Video Stream View */}
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.videoPlayer}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={autoPlay}
        isMuted={isMuted}
        volume={1.0}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        useNativeControls={false}
      />

      {/* Buffering Indicator */}
      {isBuffering && !hasError && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Typography variant="xs" color="#E2E8F0" style={styles.bufferText}>
            {isHindi ? 'लोड हो रहा है...' : 'Buffering...'}
          </Typography>
        </View>
      )}

      {/* Error Overlay with Retry */}
      {hasError && (
        <View style={styles.centerOverlay}>
          <Typography variant="lg" color="#EF4444" weight="bold">
            ⚠️
          </Typography>
          <Typography variant="sm" weight="semibold" color="#FFFFFF" align="center" style={styles.errorTitle}>
            {isHindi ? 'वीडियो चलाने में त्रुटि हुई' : 'Unable to play video'}
          </Typography>
          <Typography variant="xs" color="#94A3B8" align="center" style={styles.errorSubtext}>
            {errorMessage || (isHindi ? 'कृपया नेटवर्क की जांच करें।' : 'Check connection or format.')}
          </Typography>
          <Pressable
            style={styles.retryButton}
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry playback"
          >
            <Typography variant="xs" weight="bold" color="#FFFFFF">
              {isHindi ? 'पुनः प्रयास करें' : 'Retry'}
            </Typography>
          </Pressable>
        </View>
      )}

      {/* Controls Overlay (Fade in/out) */}
      {showControls && !hasError && (
        <View style={styles.controlsOverlay}>
          {/* Big Center Play/Pause Button */}
          <Pressable
            style={styles.bigPlayButton}
            onPress={handleTogglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          >
            <Typography variant="title" color="#FFFFFF" style={styles.bigPlayIcon}>
              {isPlaying ? '⏸' : '▶'}
            </Typography>
          </Pressable>

          {/* Bottom Controls Bar */}
          <View style={styles.bottomBar}>
            {/* Scrubber / Progress Bar */}
            <Pressable
              style={styles.progressBarBackground}
              onPress={handleProgressBarPress}
              hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
            >
              <View
                style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progressPercent))}%` }]}
              />
              <View
                style={[styles.progressThumb, { left: `${Math.min(98, Math.max(0, progressPercent))}%` }]}
              />
            </Pressable>

            {/* Bottom Actions Row */}
            <View style={styles.bottomActionsRow}>
              {/* Mini Play/Pause */}
              <Pressable
                onPress={handleTogglePlay}
                style={styles.actionIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              >
                <Typography variant="md" color="#FFFFFF">
                  {isPlaying ? '⏸' : '▶'}
                </Typography>
              </Pressable>

              {/* Time display */}
              <Typography variant="xs" weight="medium" color="#E2E8F0" style={styles.timeText}>
                {formatVideoDuration(positionMillis)} / {formatVideoDuration(durationMillis)}
              </Typography>

              <View style={styles.spacer} />

              {/* Mute/Unmute */}
              <Pressable
                onPress={handleToggleMute}
                style={styles.actionIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
              >
                <Typography variant="md" color="#FFFFFF">
                  {isMuted ? '🔇' : '🔊'}
                </Typography>
              </Pressable>

              {/* Fullscreen Button */}
              {onToggleFullscreen && (
                <Pressable
                  onPress={onToggleFullscreen}
                  style={styles.actionIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle fullscreen"
                >
                  <Typography variant="md" color="#FFFFFF">
                    {isFullscreen ? '⤦' : '⛶'}
                  </Typography>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenContainer: {
    width: '100%',
    height: '100%',
    aspectRatio: undefined,
    borderRadius: 0,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  bufferText: {
    marginTop: 8,
  },
  errorTitle: {
    marginTop: 6,
    marginBottom: 4,
  },
  errorSubtext: {
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bigPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  bigPlayIcon: {
    marginLeft: 4,
  },
  bottomBar: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 8,
    position: 'relative',
    justifyContent: 'center',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0284C7',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    top: -4,
    marginLeft: -6,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconBtn: {
    padding: 4,
  },
  timeText: {
    marginLeft: 8,
  },
  spacer: {
    flex: 1,
  },
});

