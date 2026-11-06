import { Audio } from 'expo-av';
import { Platform, AppState, AppStateStatus } from 'react-native';

export interface VoiceRecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  durationMillis: number;
  metering?: number; // dB normalized or raw
  uri?: string | null;
}

export type RecordingStatusCallback = (status: VoiceRecordingStatus) => void;

/**
 * Voice Recording Service
 *
 * Manages audio recording lifecycle for WhatsApp-style voice notes in Apna Samaj Mobile.
 * Compatible with Hermes, Expo SDK 52, Android, iOS, and Web.
 *
 * Guarantees:
 * 1. Permissions on demand: Only prompts when recording starts.
 * 2. Single recording lock: Prevents concurrent overlapping recordings.
 * 3. Safe cleanup: Cancelling or unmounting releases hardware audio resources.
 * 4. High Quality AAC / M4A: Uses standard platform audio encoding presets.
 */
export class VoiceRecordingService {
  private recording: Audio.Recording | null = null;
  private isRecordingActive: boolean = false;
  private isRecordingPaused: boolean = false;
  private durationMillis: number = 0;
  private statusListeners: Set<RecordingStatusCallback> = new Set();
  private updateInterval: any = null;
  private recordingUri: string | null = null;
  private amplitudes: number[] = [];

  constructor() {
    try {
      AppState?.addEventListener?.('change', async (nextState: AppStateStatus) => {
        if (nextState !== 'active' && this.isRecordingActive && !this.isRecordingPaused) {
          try {
            await this.pauseRecording();
          } catch (err) {
            console.warn('[VoiceRecordingService] Background pause error:', err);
          }
        }
      });
    } catch { }
  }

  /**
   * Requests audio recording permissions only when needed.
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      const response = await Audio.requestPermissionsAsync();
      return response.granted;
    } catch (err) {
      console.warn('[VoiceRecordingService] Permission request failed:', err);
      return false;
    }
  }

  /**
   * Checks current microphone permission without prompting.
   */
  public async getPermissions(): Promise<boolean> {
    try {
      const response = await Audio.getPermissionsAsync();
      return response.granted;
    } catch {
      return false;
    }
  }

  /**
   * Starts a new audio voice recording.
   * Throws clear errors if permission is denied or recording is already in progress.
   */
  public async startRecording(onStatusUpdate?: RecordingStatusCallback): Promise<void> {
    if (this.isRecordingActive) {
      throw new Error('Recording is already in progress.');
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('PERMISSION_DENIED');
    }

    try {
      // Set audio mode for recording on iOS and Android
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();

      // Configure high-quality AAC/M4A preset with metering enabled
      const options = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      };

      await recording.prepareToRecordAsync(options);

      this.recording = recording;
      this.isRecordingActive = true;
      this.isRecordingPaused = false;
      this.durationMillis = 0;
      this.amplitudes = [];
      this.recordingUri = null;

      if (onStatusUpdate) {
        this.statusListeners.add(onStatusUpdate);
      }

      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.canRecord) return;

        this.durationMillis = status.durationMillis;
        this.isRecordingPaused = !status.isRecording;

        // Collect normalized metering amplitude (0.0 to 1.0)
        if (status.metering !== undefined) {
          // status.metering ranges from -160 to 0 dB
          const normalized = Math.max(0, Math.min(1, (status.metering + 160) / 160));
          if (this.amplitudes.length < 60) {
            this.amplitudes.push(normalized);
          } else {
            // Downsample
            this.amplitudes.shift();
            this.amplitudes.push(normalized);
          }
        }

        this.notifyStatusListeners({
          isRecording: status.isRecording,
          isPaused: !status.isRecording,
          durationMillis: status.durationMillis,
          metering: status.metering,
        });
      });

      // Throttle status updates to ~100ms
      await recording.setProgressUpdateInterval(100);
      await recording.startAsync();
    } catch (err: any) {
      this.cleanupState();
      throw new Error(`Failed to start recording: ${err?.message || 'Unknown audio error'}`);
    }
  }

  /**
   * Pauses an active recording.
   */
  public async pauseRecording(): Promise<void> {
    if (!this.recording || !this.isRecordingActive || this.isRecordingPaused) {
      return;
    }

    try {
      await this.recording.pauseAsync();
      this.isRecordingPaused = true;
      this.notifyStatusListeners({
        isRecording: false,
        isPaused: true,
        durationMillis: this.durationMillis,
      });
    } catch (err: any) {
      console.warn('[VoiceRecordingService] pauseRecording error:', err);
    }
  }

  /**
   * Resumes a paused recording.
   */
  public async resumeRecording(): Promise<void> {
    if (!this.recording || !this.isRecordingActive || !this.isRecordingPaused) {
      return;
    }

    try {
      await this.recording.startAsync();
      this.isRecordingPaused = false;
      this.notifyStatusListeners({
        isRecording: true,
        isPaused: false,
        durationMillis: this.durationMillis,
      });
    } catch (err: any) {
      console.warn('[VoiceRecordingService] resumeRecording error:', err);
    }
  }

  /**
   * Stops recording and returns the final recording result.
   */
  public async stopRecording(): Promise<{
    uri: string;
    durationMillis: number;
    durationSeconds: number;
    amplitudes: number[];
  }> {
    if (!this.recording) {
      throw new Error('No active recording to stop.');
    }

    try {
      const status = await this.recording.getStatusAsync();
      const finalDuration = status.durationMillis || this.durationMillis;

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();

      if (!uri) {
        throw new Error('Recording stopped but no URI was generated.');
      }

      this.recordingUri = uri;
      const result = {
        uri,
        durationMillis: finalDuration,
        durationSeconds: Math.max(1, Math.round(finalDuration / 1000)),
        amplitudes: [...this.amplitudes],
      };

      this.cleanupState();
      return result;
    } catch (err: any) {
      this.cleanupState();
      throw new Error(`Failed to stop recording: ${err?.message || 'Audio error'}`);
    }
  }

  /**
   * Cancels the recording and cleans up temporary resources without saving.
   */
  public async cancelRecording(): Promise<void> {
    if (!this.recording) {
      this.cleanupState();
      return;
    }

    try {
      await this.recording.stopAndUnloadAsync();
    } catch {
      // Ignore if already stopped
    } finally {
      this.cleanupState();
    }
  }

  /**
   * Subscribes to status updates.
   */
  public addStatusListener(callback: RecordingStatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  public getIsRecording(): boolean {
    return this.isRecordingActive && !this.isRecordingPaused;
  }

  public getIsPaused(): boolean {
    return this.isRecordingPaused;
  }

  public getDurationMillis(): number {
    return this.durationMillis;
  }

  public getAmplitudes(): number[] {
    return [...this.amplitudes];
  }

  private notifyStatusListeners(status: VoiceRecordingStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[VoiceRecordingService] Error in status listener:', err);
      }
    }
  }

  private cleanupState(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.recording = null;
    this.isRecordingActive = false;
    this.isRecordingPaused = false;
    this.durationMillis = 0;
    this.statusListeners.clear();
  }
}

export const voiceRecordingService = new VoiceRecordingService();
