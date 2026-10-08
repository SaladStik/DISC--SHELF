import { defineConfig } from 'vite';

// Spotify only accepts loopback redirect URIs as 127.0.0.1 (not "localhost").
export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
