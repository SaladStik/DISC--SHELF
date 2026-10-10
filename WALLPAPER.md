# DISC//SHELF as a Wallpaper Engine wallpaper

```
npm run wallpaper
```

builds `dist-wallpaper/`. Copy that folder into
`<Steam>/steamapps/common/wallpaper_engine/projects/myprojects/` (name it anything) and pick
DISC//SHELF in Wallpaper Engine.

## What it does

Wallpaper Engine can't log in to Spotify or play it, so the wallpaper follows your PC instead:

- **Bass** comes from the real system audio (Wallpaper Engine's audio capture), not the beat clock.
- **Now playing** comes from Windows media controls (Spotify desktop, browsers, …). A song that is in
  your library gets the full robot run; anything else goes straight into the jukebox with its cover.
  Both need *Settings → General → Media integration* / audio recording left on in Wallpaper Engine.
- Between songs it skims the shelves by itself. Move the mouse over the desktop to skim them
  yourself; click a binder to open it.
- Room, format, bass strength, the now-playing card, mouse reaction and taskbar height are in the
  wallpaper's settings. The FPS limit in Wallpaper Engine is respected.

## Your own library

Without one, the shelves hold the demo library. To use yours: `npm run dev`, log in, open
`http://127.0.0.1:5173/pitch/?capture` (it saves `public/pitch/library.json`), then
`npm run wallpaper` again. Covers load from Spotify's CDN, so they need a connection.

## Testing in a browser

`npx vite preview -c vite.wallpaper.config.js --outDir ../dist-wallpaper`, then open `/?sim` for a fake
120 bpm kick and a fake track. `simTrack('Title', 'Artist')` in the console plays another.
