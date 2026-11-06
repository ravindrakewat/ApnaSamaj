import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { voiceRecordingService, VoiceRecordingStatus } from '../../services/audio/voice-recording.service';
import { voicePlaybackService, PlaybackState } from '../../services/audio/voice-playback.service';
import { AudioWaveform } from './AudioWaveform';

export interface RecordedVoiceNote {
  uri: string;
  durationSeconds: number;
  durationMillis: number;
  amplitudes: number[];
}

interface VoiceRecorderProps {
  onSend: (voiceNote: RecordedVoiceNote) => void;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSend, disabled = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const [previewNote, setPreviewNote] = useState<RecordedVoiceNote | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(0);

  useEffect(() => {
    // Subscribe to playback status for preview
    const unsubscribe = voicePlaybackService.addListener((state: PlaybackState) => {
      if (previewNote && state.audioId === 'recording_preview') {
        setPreviewPlaying(state.isPlaying);
        setPreviewPosition(state.positionMillis);
      }
    });

    return () => {
      unsubscribe();
      // Ensure recording and preview stop if component unmounts
      if (voiceRecordingService.getIsRecording()) {
        voiceRecordingService.cancelRecording().catch(() => {});
      }
      voicePlaybackService.stop().catch(() => {});
    };
  }, [previewNote]);

  const formatTime = (millis: number): string => {
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    if (disabled) return;

    try {
      // Stop any existing playback first
      await voicePlaybackService.stop();
      setPreviewNote(null);

      await voiceRecordingService.startRecording((status: VoiceRecordingStatus) => {
        setIsRecording(status.isRecording);
        setIsPaused(status.isPaused);
        setDurationMillis(status.durationMillis);
        setAmplitudes(voiceRecordingService.getAmplitudes());
      });

      setIsRecording(true);
      setIsPaused(false);
      setDurationMillis(0);
    } catch (err: any) {
      if (err?.message === 'PERMISSION_DENIED') {
        Alert.alert(
          'माइक्रोफ़ोन अनुमति आवश्यक है (Microphone Permission Required)',
          'आवाज़ संदेश रिकॉर्ड करने के लिए कृपया माइक्रोफ़ोन अनुमति दें। (Please grant microphone permission to record voice notes.)'
        );
      } else {
        Alert.alert('त्रुटि (Error)', err?.message || 'रिकॉर्डिंग प्रारंभ नहीं हो सकी।');
      }
      setIsRecording(false);
    }
  };

  const handlePauseResume = async () => {
    if (isPaused) {
      await voiceRecordingService.resumeRecording();
      setIsPaused(false);
    } else {
      await voiceRecordingService.pauseRecording();
      setIsPaused(true);
    }
  };

  const handleCancel = async () => {
    try {
      await voiceRecordingService.cancelRecording();
      await voicePlaybackService.stop();
    } finally {
      setIsRecording(false);
      setIsPaused(false);
      setDurationMillis(0);
      setAmplitudes([]);
      setPreviewNote(null);
    }
  };

  const handleStopAndPreview = async () => {
    try {
      const result = await voiceRecordingService.stopRecording();
      setIsRecording(false);
      setIsPaused(false);
      setPreviewNote(result);
    } catch (err: any) {
      Alert.alert('त्रुटि (Error)', 'रिकॉर्डिंग रोकने में समस्या आई।');
      handleCancel();
    }
  };

  const handleTogglePreviewPlay = async () => {
    if (!previewNote) return;

    if (previewPlaying) {
      await voicePlaybackService.pause();
    } else {
      await voicePlaybackService.play({
        audioId: 'recording_preview',
        uri: previewNote.uri,
      });
    }
  };

  const handleSend = async () => {
    if (previewNote) {
      await voicePlaybackService.stop();
      onSend(previewNote);
      setPreviewNote(null);
      setDurationMillis(0);
      setAmplitudes([]);
      return;
    }

    if (isRecording) {
      try {
        const result = await voiceRecordingService.stopRecording();
        setIsRecording(false);
        setIsPaused(false);
        onSend(result);
        setDurationMillis(0);
        setAmplitudes([]);
      } catch (err: any) {
        Alert.alert('त्रुटि (Error)', 'संदेश भेजने में त्रुटि हुई।');
        handleCancel();
      }
    }
  };

  // 1. Idle state: Render round microphone button next to composer
  if (!isRecording && !previewNote) {
    return (
      <TouchableOpacity
        style={[styles.micButton, disabled && styles.disabledButton]}
        onPress={handleStartRecording}
        disabled={disabled}
        accessibilityLabel="वॉइस नोट रिकॉर्ड करें (Record voice note)"
        accessibilityRole="button"
        activeOpacity={0.8}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </TouchableOpacity>
    );
  }

  // 2. Preview mode before sending
  if (previewNote) {
    const previewProgress =
      previewNote.durationMillis > 0
        ? Math.min(1, previewPosition / previewNote.durationMillis)
        : 0;

    return (
      <View style={styles.activeRecordingContainer}>
        {/* Discard button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          accessibilityLabel="रद्द करें (Cancel)"
          accessibilityRole="button"
        >
          <Text style={styles.cancelIcon}>🗑️</Text>
        </TouchableOpacity>

        {/* Play/Pause preview */}
        <TouchableOpacity
          style={styles.previewPlayButton}
          onPress={handleTogglePreviewPlay}
          accessibilityLabel="सुनें (Preview)"
          accessibilityRole="button"
        >
          <Text style={styles.previewPlayIcon}>{previewPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        {/* Waveform Scrubber */}
        <AudioWaveform
          progress={previewProgress}
          amplitudes={previewNote.amplitudes}
          onSeek={(percentage) => {
            const target = percentage * previewNote.durationMillis;
            voicePlaybackService.seek(target);
          }}
        />

        {/* Duration badge */}
        <Text style={styles.timerText}>
          {formatTime(previewPlaying ? previewPosition : previewNote.durationMillis)}
        </Text>

        {/* Send button */}
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSend}
          accessibilityLabel="भेजें (Send voice note)"
          accessibilityRole="button"
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. Active recording mode
  return (
    <View style={styles.activeRecordingContainer}>
      {/* Cancel button */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={handleCancel}
        accessibilityLabel="रद्द करें (Cancel recording)"
        accessibilityRole="button"
      >
        <Text style={styles.cancelIcon}>🗑️</Text>
      </TouchableOpacity>

      {/* Red recording blinker & timer */}
      <View style={styles.recordingStatusBadge}>
        <View style={[styles.redDot, isPaused && styles.pausedDot]} />
        <Text style={styles.timerText}>{formatTime(durationMillis)}</Text>
      </View>

      {/* Live Waveform */}
      <AudioWaveform progress={1} amplitudes={amplitudes} barCount={20} />

      {/* Pause/Resume button */}
      <TouchableOpacity
        style={styles.pauseButton}
        onPress={handlePauseResume}
        accessibilityLabel={isPaused ? 'रिकॉर्डिंग फिर से शुरू करें' : 'रिकॉर्डिंग रोकें'}
        accessibilityRole="button"
      >
        <Text style={styles.pauseIcon}>{isPaused ? '▶' : '⏸'}</Text>
      </TouchableOpacity>

      {/* Stop & Preview button */}
      <TouchableOpacity
        style={styles.previewStopButton}
        onPress={handleStopAndPreview}
        accessibilityLabel="सुनें (Preview)"
        accessibilityRole="button"
      >
        <Text style={styles.previewStopIcon}>⏹</Text>
      </TouchableOpacity>

      {/* Send immediately button */}
      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSend}
        accessibilityLabel="भेजें (Send)"
        accessibilityRole="button"
      >
        <Text style={styles.sendIcon}>➤</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  disabledButton: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  micIcon: {
    fontSize: 20,
    color: '#ffffff',
  },
  activeRecordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flex: 1,
    height: 48,
  },
  cancelButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelIcon: {
    fontSize: 18,
  },
  recordingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  pausedDot: {
    backgroundColor: '#f59e0b',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    minWidth: 42,
  },
  pauseButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseIcon: {
    fontSize: 14,
    color: '#475569',
  },
  previewPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  previewPlayIcon: {
    fontSize: 14,
    color: '#0284c7',
  },
  previewStopButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewStopIcon: {
    fontSize: 14,
    color: '#475569',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  sendIcon: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
