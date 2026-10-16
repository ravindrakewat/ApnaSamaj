import { createApp } from './app';
import { config } from './config/env';

const port = config.port;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`[Apna Samaj API] Server listening on http://localhost:${port}`);
  console.log(`[Apna Samaj API] Health check available at http://localhost:${port}/health`);
  console.log(`[Apna Samaj API] Authentication routes active at http://localhost:${port}/api/v1/auth`);
});

export default server;
