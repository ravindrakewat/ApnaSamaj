import { io, Socket } from 'socket.io-client';
import { APP_CONFIG } from '../constants/config';
import { getAuthTokens, getStoredCommunitySlug } from './storage.service';

let socketInstance: Socket | null = null;

/**
 * Returns the base server URL for Socket.IO by stripping `/api/v1` from API base.
 */
export function getSocketServerUrl(): string {
  return APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
}

/**
 * Returns the singleton Socket.IO client instance.
 * Configured with dynamic authentication and active tenant community context.
 */
export function getChatSocket(): Socket {
  if (!socketInstance) {
    const serverUrl = getSocketServerUrl();
    socketInstance = io(serverUrl, {
      path: '/socket.io',
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: async (cb: (data: { token: string; community?: string }) => void) => {
        try {
          const [tokens, slug] = await Promise.all([
            getAuthTokens(),
            getStoredCommunitySlug(),
          ]);
          cb({
            token: tokens.accessToken || '',
            community: slug || APP_CONFIG.defaultCommunitySlug,
          });
        } catch (err) {
          console.warn('[SocketService] Error resolving auth credentials for handshake:', err);
          cb({ token: '', community: APP_CONFIG.defaultCommunitySlug });
        }
      },
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socketInstance;
}

/**
 * Connects the socket if currently disconnected.
 */
export function connectChatSocket(): Socket {
  const socket = getChatSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

/**
 * Disconnects the socket and removes all event listeners (e.g. on logout or screen unmount).
 */
export function disconnectChatSocket(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}

