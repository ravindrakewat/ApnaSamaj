import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api.config';
import { getInMemoryToken, getActiveCommunitySlug } from './api.client';

let socketInstance: Socket | null = null;
let lastCommunity: string | null = null;

/**
 * Returns the singleton Socket.IO client connection for the Admin application.
 * Reconnects cleanly if the active community changes (e.g. SUPER_ADMIN community switch).
 */
export function getAdminSocket(): Socket {
  const currentCommunity = getActiveCommunitySlug() || 'kewat';

  if (socketInstance && lastCommunity !== currentCommunity) {
    disconnectAdminSocket();
  }

  if (!socketInstance) {
    lastCommunity = currentCommunity;
    socketInstance = io(API_BASE_URL, {
      path: '/socket.io',
      autoConnect: false,
      withCredentials: true,
      auth: (cb) => {
        const token = getInMemoryToken();
        const community = getActiveCommunitySlug() || 'kewat';
        cb({ token: token || '', community });
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socketInstance;
}

/**
 * Connects the admin socket if it is currently disconnected.
 */
export function connectAdminSocket(): Socket {
  const socket = getAdminSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

/**
 * Disconnects the admin socket and cleans up listeners (e.g. on logout or tenant switch).
 */
export function disconnectAdminSocket(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
    lastCommunity = null;
  }
}

