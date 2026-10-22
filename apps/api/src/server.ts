import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { initChatSocketServer } from './modules/chat/chat.socket';

const port = config.port;
const app = createApp();
const httpServer = http.createServer(app);

// Attach Socket.IO real-time server to HTTP server instance
initChatSocketServer(httpServer);

const server = httpServer.listen(port, () => {
  console.log(`[Apna Samaj API] Server listening on http://localhost:${port}`);
  console.log(`[Apna Samaj API] Health check available at http://localhost:${port}/health`);
  console.log(`[Apna Samaj API] Authentication routes active at http://localhost:${port}/api/v1/auth`);
  console.log(`[Apna Samaj API] Real-time Group Chat active via Socket.IO`);
});

export default server;
