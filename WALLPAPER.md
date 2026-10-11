# DISC//SHELF as a Wallpaper Engine wallpaper

The wallpaper is on the Steam Workshop:
<https://steamcommunity.com/sharedfiles/filedetails/?id=3818066442>. Subscribe and pick DISC//SHELF.

To build it yourself instead:

```
npm run wallpaper
```

builds `dist-wallpaper/`. Copy that folder into
`<Steam>/steamapps/common/wallpaper_engine/projects/myprojects/` (name it anything) and pick
DISC//SHELF in Wallpaper Engine.

## Signing in to Spotify

Everything is in the wallpaper's settings in Wallpaper Engine, except the approval itself: Spotify
only does that on a web page, and a wallpaper gets no keyboard. Nothing needs to be installed.

1. Paste your Client ID into **Spotify Client ID**. It is the same Spotify app the website has you
   create, with the website's address as its Redirect URI.
2. Click **CLICK TO SIGN IN TO SPOTIFY** on the wallpaper and approve in the browser tab it opens
   (if none opens, the link is on your clipboard).
3. The website then shows a code. Copy it into **Spotify sign-in code**.

Clear the Client ID to sign out. If you host the website yourself, put its address in
**Spotify Redirect URI**; that site needs this version deployed, or it will try to use the code itself.

Signed in, the shelves hold your own playlists and a clicked disc really plays, on one of your
Spotify devices (Premium needed; the wallpaper can't be a Spotify player itself). Everything read
from Spotify is cached, so an unchanged library costs a couple of requests per start.

If something doesn't work, turn on **Show diagnostics**: it lists what the wallpaper asked of Spotify
and what Spotify answered.

## What it does

- **Bass** comes from the real system audio (Wallpaper Engine's audio capture), not the beat clock.
- **Now playing** comes from Windows media controls (Spotify desktop, browsers, …). A song that is in
  your library gets the full robot run; anything else goes straight into the jukebox with its cover.
  Both need audio recording and media integration left on in Wallpaper Engine's settings.
- Left alone it walks the shelf you are on, case by case, and stays on it (also after a restart).
  Move the mouse over the desktop to take over: the PLAYLISTS link (top left) and the shelf
  scrubber appear while it moves.
- **♪ DEVICE** (in that same bar, once signed in) lists your Spotify devices: pick where discs play.
  Until you pick, it uses the active device, or failing that any open one.
- Room, format, bass strength, volume, the now-playing card, mouse reaction and taskbar height are in
  the wallpaper's settings. The FPS limit in Wallpaper Engine is respected.

Signed out, the shelves hold the demo library, or your own if you saved one with `/pitch/?capture`
(see PITCH.md) before building.

## Testing in a browser

`npx vite preview -c vite.wallpaper.config.js --outDir ../dist-wallpaper`, then open `/?sim` for a fake
120 bpm kick and a fake track. `simTrack('Title', 'Artist')` in the console plays another.
