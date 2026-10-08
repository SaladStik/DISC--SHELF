import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

// Dev-only: lets the logged-in app save a snapshot of the presenter's library for the pitch
// (public/pitch/library.json). The browser posts plain library data; no tokens leave it.
const snapshotWriter = {
  name: 'pitch-snapshot',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__pitch-snapshot', (req, res) => {
      if (req.method !== 'POST') return (res.statusCode = 405), res.end();
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          mkdirSync(resolve(__dirname, 'public/pitch'), { recursive: true });
          writeFileSync(resolve(__dirname, 'public/pitch/library.json'), JSON.stringify(data));
          res.end(JSON.stringify({ ok: true, bytes: body.length }));
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    });
  },
};

// Spotify only accepts loopback redirect URIs as 127.0.0.1 (not "localhost").
export default defineConfig({
  plugins: [snapshotWriter],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      // /pitch/ is its own page (pitch/index.html), so it works on any static host
      input: { main: resolve(__dirname, 'index.html'), pitch: resolve(__dirname, 'pitch/index.html') },
    },
  },
});
