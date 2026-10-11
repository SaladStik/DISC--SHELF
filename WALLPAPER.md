# DISC//SHELF as a Wallpaper Engine wallpaper

```
npm run wallpaper
```

builds `dist-wallpaper/`. Copy that folder into
`<Steam>/steamapps/common/wallpaper_engine/projects/myprojects/` (name it anything) and pick
DISC//SHELF in Wallpaper Engine.

## Signing in to Spotify

Wallpaper Engine has no address Spotify could redirect a login back to, so you sign in on the
website and hand the login over as a code:

1. Log in on the website as usual (`npm run dev`, or the deployed site), with your Client ID.
2. Open the same site with `/?wallpaper` on the end. It shows a code and logs that browser out
   (a Spotify login only keeps working in one place).
3. Paste the code into **Spotify login code** in the wallpaper's settings in Wallpaper Engine.

`VITE_SPOTIFY_CLIENT_ID` in `.env.local` prefills the Client ID on the website.

Signed in, the shelves hold your own playlists and a clicked disc really plays: inside the wallpaper
if Wallpaper Engine's browser can run Spotify's player, otherwise on whichever Spotify app is open
(Premium either way). Everything read from Spotify is cached, so an unchanged library costs a
couple of requests per start.

The code is a login: don't share it, or a preset that contains it.

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
