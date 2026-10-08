# DISC//SHELF pitch (`/pitch/`)

A guided three-minute demo of the real app, driven step by step. It runs on a saved snapshot of
your Spotify library (`public/pitch/library.json`), so the talk never waits on the network or
Spotify's rate limits. If the presenting browser is also logged in to the app, it plays your real
music; otherwise it runs silently.

## Before the talk

1. **Refresh the snapshot** (only when your playlists change): log in on `http://127.0.0.1:5173/`,
   then open `http://127.0.0.1:5173/pitch/?capture`. It reads every playlist you own, saves them to
   `public/pitch/library.json` and opens the pitch. Commit that file so the deployed `/pitch/` has it.
2. Open `/pitch/` (locally or `https://diskshelf.saladsync.ca/pitch/`) and wait for the loading bar:
   it builds every room and player ahead so nothing loads on stage (~10 s).
3. For real audio: be logged in to the app in the same browser (Premium), then press any key once
   to unlock audio.
4. Press **F** for fullscreen.

## Controls

| Key | Action |
|---|---|
| → · Space · PageDown · click | next step |
| ← · PageUp · right-click | back |
| Home / End | first / last step |
| F | fullscreen |
| M | free mode: hand the app to you (for questions); M again to return |

Rehearse a single step from the console with `pitchGo(n)`.

## Talk track (~3:00)

| # | On screen | Say (roughly) | ~s |
|---|---|---|---|
| 0 | Title over the record store | "This is DISC//SHELF: your Spotify library as a room you can walk into." | 10 |
| 1 | "Streaming made music infinite…" | "Streaming gave us every song ever made, and turned our collections into a list nobody looks at." | 12 |
| 2 | Binders skimming | "So every playlist becomes a binder on a shelf, with its real cover on the spine. These are mine, straight from Spotify." | 14 |
| 3 | Flying down 1,300 songs | "Open one and it's a wall of jewel cases with real album art. This one has 1,300 songs. Only the discs near the camera exist, so it stays smooth." | 16 |
| 4 | Skimming CDs | "You browse like a record store: each case pops out as you pass, disc spinning. Mouse, keyboard or a thumb on your phone." | 14 |
| 5 | Search | "Search lights up the wall: everything else goes dark and the camera flies to each match." | 14 |
| 6 | Robot run | "Pick a disc and the robot does the rest: pulls it, flies it across the room, drops it in the jukebox, and Spotify starts playing." | 16 |
| 7 | Queue drawer | "Spotify's API can't reorder or remove from your queue, so the app owns the queue and keeps Spotify in sync. Drag, remove, play next." | 16 |
| 8 | Jukebox, bass | "The room listens: speakers pump, shelves rattle, lights hit on the kick. Mic sync reacts to the real bass." | 12 |
| 9 | Rooms cycling | "Pick your room: record store, 90s bedroom, arcade, vapor lounge, all dressed with your own covers." | 14 |
| 10 | Turntable, boombox | "And your format: CDs, vinyl with a turntable, or tapes with a boombox. The shelf, the robot and the player all change." | 14 |
| 11 | Vinyl wall | "No backend: Three.js, the Spotify Web API and the Web Playback SDK, all in the browser, on desktop and phones." | 12 |
| 12 | Closing title | "DISC//SHELF. Try it at diskshelf.saladsync.ca." | 6 |
