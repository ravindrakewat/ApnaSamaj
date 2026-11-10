import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { Typography } from '../Typography';
import { useLocalization } from '../../hooks/useLocalization';

let WebViewComponent: any = null;
if (Platform.OS !== 'web') {
  try {
    WebViewComponent = require('react-native-webview').WebView;
  } catch {
    WebViewComponent = null;
  }
}

export interface YouTubeVideoPlayerProps {
  embedUrl: string;
  youtubeId?: string | null;
  thumbnailUrl?: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onPlaybackError?: (err: string) => void;
}

export const YouTubeVideoPlayer: React.FC<YouTubeVideoPlayerProps> = ({
  embedUrl,
  youtubeId,
  thumbnailUrl,
  isFullscreen = false,
  onToggleFullscreen,
  onPlaybackError,
}) => {
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generate responsive HTML page with official YouTube IFrame Embed
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100%;
            height: 100%;
            background-color: #000000;
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .iframe-container {
            position: relative;
            width: 100%;
            height: 100%;
          }
          iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <div class="iframe-container">
          <iframe
            src="${embedUrl}"
            title="YouTube Video Player"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
      </body>
    </html>
  `;

  const handleOpenExternalFallback = () => {
    if (youtubeId) {
      const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      Linking.openURL(watchUrl).catch(() => {});
    }
  };

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreenContainer]}>
      {Platform.OS === 'web' ? (
        // Web Platform: Standard Responsive Iframe
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            backgroundColor: '#000000',
          }}
        >
          <iframe
            src={embedUrl}
            title="YouTube Video Player"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0,
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
              setErrorMessage('Failed to load YouTube player');
              if (onPlaybackError) onPlaybackError('Failed to load YouTube player');
            }}
          />
        </div>
      ) : WebViewComponent ? (
        // Native Platforms (Android / iOS): react-native-webview
        <WebViewComponent
          style={styles.webView}
          originWhitelist={['*']}
          source={{ html: htmlContent, baseUrl: 'https://apnasamaj.app' }}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onError={(syntheticEvent: any) => {
            const { nativeEvent } = syntheticEvent;
            setIsLoading(false);
            setHasError(true);
            const err = nativeEvent?.description || 'YouTube playback error';
            setErrorMessage(err);
            if (onPlaybackError) onPlaybackError(err);
          }}
          renderError={() => (
            <View style={styles.errorContainer}>
              <Typography variant="lg" color="#EF4444" weight="bold">
                ⚠️
              </Typography>
              <Typography variant="sm" weight="semibold" color="#FFFFFF" align="center" style={styles.errorTitle}>
                {isHindi ? 'यूट्यूब वीडियो लोड नहीं हुआ' : 'YouTube video failed to load'}
              </Typography>
              <Typography variant="xs" color="#94A3B8" align="center" style={styles.errorSubtext}>
                {isHindi
                  ? 'यह वीडियो निजी हो सकता है या इसका एम्बेडिंग बंद किया गया है।'
                  : 'This video may be private or embedding disabled by owner.'}
              </Typography>
              <Pressable
                style={styles.fallbackButton}
                onPress={handleOpenExternalFallback}
                accessibilityRole="button"
                accessibilityLabel="Open in YouTube"
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  {isHindi ? 'यूट्यूब पर खोलें' : 'Watch on YouTube'}
                </Typography>
              </Pressable>
            </View>
          )}
        />
      ) : (
        // Test / Node Mock Environment
        <View style={styles.mockContainer}>
          <Typography variant="md" color="#FFFFFF" weight="bold">
            ▶ YouTube Embedded Player (Simulated)
          </Typography>
          <Typography variant="xs" color="#94A3B8" style={{ marginTop: 4 }}>
            ID: {youtubeId || 'Unknown'}
          </Typography>
        </View>
      )}

      {/* Loading Overlay */}
      {isLoading && !hasError && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#EF4444" />
          <Typography variant="xs" color="#E2E8F0" style={styles.loadingText}>
            {isHindi ? 'यूट्यूब प्लेयर लोड हो रहा है...' : 'Loading YouTube player...'}
          </Typography>
        </View>
      )}

      {/* Error Overlay */}
      {hasError && (
        <View style={styles.errorOverlay}>
          <Typography variant="lg" color="#EF4444" weight="bold">
            ⚠️
          </Typography>
          <Typography variant="sm" weight="semibold" color="#FFFFFF" align="center" style={styles.errorTitle}>
            {isHindi ? 'यूट्यूब वीडियो लोड करने में असमर्थ' : 'Unable to load YouTube video'}
          </Typography>
          <Typography variant="xs" color="#94A3B8" align="center" style={styles.errorSubtext}>
            {errorMessage || (isHindi ? 'कृपया नेटवर्क की जांच करें।' : 'Check connection.')}
          </Typography>
          <Pressable
            style={styles.fallbackButton}
            onPress={handleOpenExternalFallback}
            accessibilityRole="button"
            accessibilityLabel="Open in YouTube"
          >
            <Typography variant="xs" weight="bold" color="#FFFFFF">
              {isHindi ? 'यूट्यूब पर देखें' : 'Watch on YouTube'}
            </Typography>
          </Pressable>
        </View>
      )}
    </View>
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
  },
  fullscreenContainer: {
    width: '100%',
    height: '100%',
    aspectRatio: undefined,
    borderRadius: 0,
  },
  webView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  loadingText: {
    marginTop: 8,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 3,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  errorTitle: {
    marginTop: 6,
    marginBottom: 4,
  },
  errorSubtext: {
    marginBottom: 12,
  },
  fallbackButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  mockContainer: {
    flex: 1,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

