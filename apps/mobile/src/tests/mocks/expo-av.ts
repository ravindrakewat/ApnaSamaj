let mockPermissionGranted = true;

export class MockRecording {
  private isRecording = false;
  private isPaused = false;
  private durationMillis = 12000;
  private uri = 'file:///mock/cache/audio/voice-note-test.m4a';
  private statusCallback: any = null;

  async prepareToRecordAsync(options: any) {
    return { canRecord: true, isRecording: false, durationMillis: 0 };
  }

  async startAsync() {
    this.isRecording = true;
    this.isPaused = false;
    if (this.statusCallback) {
      this.statusCallback({
        canRecord: true,
        isRecording: true,
        durationMillis: this.durationMillis,
        metering: -10,
      });
    }
  }

  async pauseAsync() {
    this.isRecording = false;
    this.isPaused = true;
    if (this.statusCallback) {
      this.statusCallback({
        canRecord: true,
        isRecording: false,
        durationMillis: this.durationMillis,
        metering: -40,
      });
    }
  }

  async stopAndUnloadAsync() {
    this.isRecording = false;
    this.isPaused = false;
  }

  getURI() {
    return this.uri;
  }

  async getStatusAsync() {
    return {
      canRecord: true,
      isRecording: this.isRecording,
      durationMillis: this.durationMillis,
      metering: -12,
    };
  }

  setOnRecordingStatusUpdate(callback: any) {
    this.statusCallback = callback;
  }

  async setProgressUpdateInterval(intervalMs: number) {}
}

export class MockSound {
  private isPlaying = false;
  private isPaused = false;
  private positionMillis = 0;
  private durationMillis = 12000;
  private rate = 1.0;
  private statusCallback: any = null;

  constructor(statusCallback?: any) {
    this.statusCallback = statusCallback;
  }

  static async createAsync(source: any, initialStatus: any, onPlaybackStatusUpdate?: any) {
    const sound = new MockSound(onPlaybackStatusUpdate);
    if (initialStatus?.shouldPlay) {
      sound.isPlaying = true;
    }
    sound.rate = initialStatus?.rate || 1.0;
    if (onPlaybackStatusUpdate) {
      onPlaybackStatusUpdate({
        isLoaded: true,
        isPlaying: sound.isPlaying,
        positionMillis: initialStatus?.positionMillis || 0,
        durationMillis: 12000,
        rate: sound.rate,
        didJustFinish: false,
      });
    }
    return { sound, status: { isLoaded: true } };
  }

  async playAsync() {
    this.isPlaying = true;
    this.isPaused = false;
    if (this.statusCallback) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: true,
        positionMillis: this.positionMillis,
        durationMillis: this.durationMillis,
        rate: this.rate,
        didJustFinish: false,
      });
    }
  }

  async pauseAsync() {
    this.isPlaying = false;
    this.isPaused = true;
    if (this.statusCallback) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: false,
        positionMillis: this.positionMillis,
        durationMillis: this.durationMillis,
        rate: this.rate,
        didJustFinish: false,
      });
    }
  }

  async stopAsync() {
    this.isPlaying = false;
    this.isPaused = false;
    this.positionMillis = 0;
    if (this.statusCallback) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: false,
        positionMillis: 0,
        durationMillis: this.durationMillis,
        rate: this.rate,
        didJustFinish: true,
      });
    }
  }

  async unloadAsync() {}

  async setPositionAsync(pos: number) {
    this.positionMillis = pos;
    if (this.statusCallback) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: this.isPlaying,
        positionMillis: pos,
        durationMillis: this.durationMillis,
        rate: this.rate,
        didJustFinish: false,
      });
    }
  }

  async setRateAsync(rate: number, shouldCorrectPitch: boolean) {
    this.rate = rate;
    if (this.statusCallback) {
      this.statusCallback({
        isLoaded: true,
        isPlaying: this.isPlaying,
        positionMillis: this.positionMillis,
        durationMillis: this.durationMillis,
        rate,
        didJustFinish: false,
      });
    }
  }

  async getStatusAsync() {
    return {
      isLoaded: true,
      isPlaying: this.isPlaying,
      positionMillis: this.positionMillis,
      durationMillis: this.durationMillis,
      rate: this.rate,
      didJustFinish: false,
    };
  }
}

export const Audio = {
  Recording: MockRecording,
  Sound: MockSound,
  requestPermissionsAsync: async () => ({
    granted: mockPermissionGranted,
    status: mockPermissionGranted ? 'granted' : 'denied',
    canAskAgain: true,
    expires: 'never',
  }),
  getPermissionsAsync: async () => ({
    granted: mockPermissionGranted,
    status: mockPermissionGranted ? 'granted' : 'denied',
    canAskAgain: true,
    expires: 'never',
  }),
  setAudioModeAsync: async (options: any) => {},
  RecordingOptionsPresets: {
    HIGH_QUALITY: {
      android: { extension: '.m4a' },
      ios: { extension: '.m4a' },
    },
  },
};

export const __setMockPermission = (granted: boolean) => {
  mockPermissionGranted = granted;
};
