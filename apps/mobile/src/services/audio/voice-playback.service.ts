import { Audio, AVPlaybackStatus } from 'expo-av';
import { AppState, AppStateStatus } from 'react-native';
import { chatApi } from '../../api/chat.api';

export interface PlaybackState {
  audioId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  positionMillis: number;
  durationMillis: number;
  rate: number; // 1.0, 1.5, 2.0
}

export type PlaybackStatusListener = (state: PlaybackState) => void;

/**
 * Voice Playback Service
 *
 * Singleton audio playback manager for Apna Samaj Mobile.
 * Ensures strict single-audio-playback concurrency (only one voice message plays at a time).
 * Supports speed toggle (1x, 1.5x, 2x), seeking, signed URL expiration recovery, and resource cleanup.
 */
export class VoicePlaybackService {
  private sound: Audio.Sound | null = null;
  private currentAudioId: string | null = null;
  private currentUri: string | null = null;
  private currentAttachmentId: string | null = null;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private positionMillis: number = 0;
  private durationMillis: number = 0;
  private playbackRate: number = 1.0;
  private listeners: Set<PlaybackStatusListener> = new Set();

  constructor() {
    try {
      AppState?.addEventListener?.('change', async (nextState: AppStateStatus) => {
        if (nextState !== 'active' && this.isPlaying) {
          try {
            await this.pause();
          } catch (err) {
            console.warn('[VoicePlaybackService] Background pause error:', err);
          }
        }
      });
    } catch {}
  }

  /**
   * Sets up audio mode for playback.
   */
  private async configureAudioMode(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.warn('[VoicePlaybackService] configureAudioMode warning:', err);
    }
  }

  /**
   * Plays a voice note.
   * If another voice note is currently playing, it is stopped and unloaded first.
   */
  public async play(params: {
    audioId: string;
    uri: string;
    attachmentId?: string;
    initialPositionMillis?: number;
  }): Promise<void> {
    const { audioId, uri, attachmentId, initialPositionMillis } = params;

    // If resuming the currently loaded sound
    if (this.currentAudioId === audioId && this.sound && this.isPaused) {
      await this.resume();
      return;
    }

    // Stop and unload any previous sound
    await this.stop();

    await this.configureAudioMode();

    this.currentAudioId = audioId;
    this.currentUri = uri;
    this.currentAttachmentId = attachmentId || null;

    try {
      let soundUri = uri;

      const { sound } = await Audio.Sound.createAsync(
        { uri: soundUri },
        {
          shouldPlay: true,
          rate: this.playbackRate,
          shouldCorrectPitch: true,
          positionMillis: initialPositionMillis || 0,
        },
        this.onPlaybackStatusUpdate
      );

      this.sound = sound;
      this.isPlaying = true;
      this.isPaused = false;
      this.notifyListeners();
    } catch (err: any) {
      // If signed URL expired and we have an attachmentId, attempt refresh
      if (this.currentAttachmentId && (err?.message?.includes('403') || err?.message?.includes('expired') || err?.message?.includes('Network'))) {
        try {
          console.log('[VoicePlaybackService] Attempting to refresh expired signed URL...');
          const freshUrl = await chatApi.getAttachmentUrl(this.currentAttachmentId);
          this.currentUri = freshUrl;

          const { sound } = await Audio.Sound.createAsync(
            { uri: freshUrl },
            {
              shouldPlay: true,
              rate: this.playbackRate,
              shouldCorrectPitch: true,
              positionMillis: initialPositionMillis || 0,
            },
            this.onPlaybackStatusUpdate
          );

          this.sound = sound;
          this.isPlaying = true;
          this.isPaused = false;
          this.notifyListeners();
          return;
        } catch (refreshErr) {
          console.error('[VoicePlaybackService] Failed to load fresh audio URL:', refreshErr);
        }
      }

      await this.stop();
      throw new Error(`Failed to play audio: ${err?.message || 'Playback error'}`);
    }
  }

  /**
   * Pauses the currently playing audio.
   */
  public async pause(): Promise<void> {
    if (!this.sound || !this.isPlaying) return;

    try {
      await this.sound.pauseAsync();
      this.isPlaying = false;
      this.isPaused = true;
      this.notifyListeners();
    } catch (err) {
      console.warn('[VoicePlaybackService] pause error:', err);
    }
  }

  /**
   * Resumes playback of paused audio.
   */
  public async resume(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.playAsync();
      this.isPlaying = true;
      this.isPaused = false;
      this.notifyListeners();
    } catch (err) {
      console.warn('[VoicePlaybackService] resume error:', err);
    }
  }

  /**
   * Seeks to a specific position in the audio.
   */
  public async seek(positionMillis: number): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.setPositionAsync(positionMillis);
      this.positionMillis = positionMillis;
      this.notifyListeners();
    } catch (err) {
      console.warn('[VoicePlaybackService] seek error:', err);
    }
  }

  /**
   * Toggles playback speed between 1.0x, 1.5x, and 2.0x.
   */
  public async togglePlaybackRate(): Promise<number> {
    let nextRate = 1.0;
    if (this.playbackRate === 1.0) nextRate = 1.5;
    else if (this.playbackRate === 1.5) nextRate = 2.0;
    else nextRate = 1.0;

    this.playbackRate = nextRate;

    if (this.sound) {
      try {
        await this.sound.setRateAsync(nextRate, true);
      } catch (err) {
        console.warn('[VoicePlaybackService] setRate error:', err);
      }
    }

    this.notifyListeners();
    return nextRate;
  }

  /**
   * Stops audio and unloads it completely from memory.
   */
  public async stop(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch {
        // Ignore unloading errors
      }
      this.sound = null;
    }

    this.currentAudioId = null;
    this.currentUri = null;
    this.currentAttachmentId = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.positionMillis = 0;
    this.durationMillis = 0;
    this.notifyListeners();
  }

  /**
   * Internal status update handler invoked by expo-av sound player.
   */
  private onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.warn(`[VoicePlaybackService] Playback error: ${status.error}`);
        this.stop();
      }
      return;
    }

    this.positionMillis = status.positionMillis;
    this.durationMillis = status.durationMillis || this.durationMillis;
    this.isPlaying = status.isPlaying;
    this.isPaused = !status.isPlaying && status.positionMillis > 0 && !status.didJustFinish;

    if (status.didJustFinish) {
      this.isPlaying = false;
      this.isPaused = false;
      this.positionMillis = 0;
      this.notifyListeners();
    } else {
      this.notifyListeners();
    }
  };

  /**
   * Adds a status listener for components rendering audio player UI.
   */
  public addListener(listener: PlaybackStatusListener): () => void {
    this.listeners.add(listener);
    // Send immediate initial state
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): PlaybackState {
    return {
      audioId: this.currentAudioId,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      positionMillis: this.positionMillis,
      durationMillis: this.durationMillis,
      rate: this.playbackRate,
    };
  }

  public getCurrentAudioId(): string | null {
    return this.currentAudioId;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[VoicePlaybackService] Listener error:', err);
      }
    }
  }
}

export const voicePlaybackService = new VoicePlaybackService();
