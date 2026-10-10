import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Builds the Wallpaper Engine web wallpaper into dist-wallpaper/ (see WALLPAPER.md).
// Wallpaper Engine opens the page from file://, where ES modules and CORS-checked assets don't load,
// so the build is one classic script.
const SNAPSHOT = 'public/pitch/library.json'; // saved by /pitch/?capture
const LOGIN = '.spotify-login.json'; // saved by npm run wallpaper:login
const json = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : 'null');

export default defineConfig({
  root: 'wallpaper',
  base: './',
  build: { outDir: '../dist-wallpaper', emptyOutDir: true, rollupOptions: { output: { format: 'iife' } } },
  plugins: [
    {
      name: 'app-markup', // index.html stays the single source of truth
      transformIndexHtml: { order: 'pre', handler: (html) => html.replace('<!--app-->', readFileSync('index.html', 'utf8').match(/<body>([\s\S]*)<script/)[1]) },
    },
    {
      name: 'file-protocol',
      transformIndexHtml: { order: 'post', handler: (html) => html.replace('<script type="module" crossorigin', '<script defer').replace('rel="stylesheet" crossorigin', 'rel="stylesheet"') },
      closeBundle: () => writeFileSync('dist-wallpaper/library.js', `window.DS_LIBRARY = ${json(SNAPSHOT)};
window.DS_LOGIN = ${json(LOGIN)};`),
    },
  ],
});
