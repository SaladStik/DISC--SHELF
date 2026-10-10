# DISC//SHELF as a Wallpaper Engine wallpaper

```
npm run wallpaper
```

builds `dist-wallpaper/`. Copy that folder into
`<Steam>/steamapps/common/wallpaper_engine/projects/myprojects/` (name it anything) and pick
DISC//SHELF in Wallpaper Engine.

## Signing in to Spotify

Wallpaper Engine has no address Spotify could redirect a login back to, so you sign in once from the
terminal and the build carries the login into the wallpaper:

1. Put your Client ID in `.env.local`: `VITE_SPOTIFY_CLIENT_ID=...` (the Spotify app needs
   `http://127.0.0.1:5173/` as a Redirect URI, the same one the website uses).
2. `npm run wallpaper:login`, open the link it prints, approve. Stop `npm run dev` first: it uses
   the same port.
3. `npm run wallpaper` and copy `dist-wallpaper/` over again.

Signed in, the shelves hold your own playlists and a clicked disc really plays: inside the wallpaper
if Wallpaper Engine's browser can run Spotify's player, otherwise on whichever Spotify app is open
(Premium either way). Everything read from Spotify is cached, so an unchanged library costs a
couple of requests per start.

`dist-wallpaper/library.js` then contains your login. Don't share that folder or publish it to the
Workshop.

## What it does

- **Bass** comes from the real system audio (Wallpaper Engine's audio capture), not the beat clock.
- **Now playing** comes from Windows media controls (Spotify desktop, browsers, …). A song that is in
  your library gets the full robot run; anything else goes straight into the jukebox with its cover.
  Both need audio recording and media integration left on in Wallpaper Engine's settings.
- Between songs it skims the shelves by itself. Move the mouse over the desktop to take over: the
  PLAYLISTS link (top left) and the shelf scrubber appear while it moves.
- Room, format, bass strength, volume, the now-playing card, mouse reaction and taskbar height are in
  the wallpaper's settings. The FPS limit in Wallpaper Engine is respected.

Signed out, the shelves hold the demo library, or your own if you saved one with `/pitch/?capture`
(see PITCH.md) before building.

## Testing in a browser

`npx vite preview -c vite.wallpaper.config.js --outDir ../dist-wallpaper`, then open `/?sim` for a fake
120 bpm kick and a fake track. `simTrack('Title', 'Artist')` in the console plays another.
