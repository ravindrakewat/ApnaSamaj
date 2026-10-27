import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api.config';
import { getInMemoryToken, getActiveCommunitySlug } from './api.client';

let socketInstance: Socket | null = null;

/**
 * Returns the singleton Socket.IO client connection.
 * Connects with the in-memory access token and community context via dynamic auth callback.
 */
export function getChatSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(API_BASE_URL, {
      path: '/socket.io',
      autoConnect: false,
      withCredentials: true,
      auth: (cb) => {
        const token = getInMemoryToken();
        const community = getActiveCommunitySlug();
        cb({ token: token || '', community: community || undefined });
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
 * Connects the socket if it is currently disconnected.
 */
export function connectChatSocket(): Socket {
  const socket = getChatSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

/**
 * Disconnects the socket and cleans up listeners (e.g. on user logout).
 */
export function disconnectChatSocket(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}

// Generic aliases for application-wide real-time usage (chat & notifications)
export const getAppSocket = getChatSocket;
export const connectAppSocket = connectChatSocket;
export const disconnectAppSocket = disconnectChatSocket;

