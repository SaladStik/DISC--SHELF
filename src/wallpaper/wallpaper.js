/**
 * DISC//SHELF as a Wallpaper Engine web wallpaper.
 *
 * Wallpaper Engine can't log in to Spotify or play it (no redirect, no DRM), so the wallpaper runs
 * on a saved library (window.DS_LIBRARY, see WALLPAPER.md) or the demo one, and follows whatever
 * the PC is playing: the bass comes from the real audio, and each new song is fetched by the robot.
 */
import '../style.css';
import './wallpaper.css';
import './sim.js';
import { app } from '../main.js';
import { Beat } from '../beat.js';
import { demoPlaylists, demoTracks } from '../demo.js';

const { S, shelf } = app;
const W = window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- library ----------
let lib = W.DS_LIBRARY;
if (!lib) {
  const playlists = demoPlaylists();
  lib = { playlists, tracks: Object.fromEntries(playlists.map((p) => [p.id, demoTracks(p)])) };
}
lib.playlists = lib.playlists.filter((p) => lib.tracks[p.id]?.length); // binders we can't open are no use here

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function find(title, artist) {
  const t = norm(title);
  const a = norm(artist.split(/[,;&]/)[0]);
  for (const pl of lib.playlists) {
    const index = lib.tracks[pl.id].findIndex((x) => norm(x.name) === t && norm(x.artists).includes(a));
    if (index >= 0) return { pl, index };
  }
}

// ---------- a player that only mirrors the PC's media session ----------
const player = {
  ready: Promise.resolve(),
  state: { paused: true, position: 0, duration: 0, at: 0 },
  listeners: [],
  on(fn) {
    this.listeners.push(fn);
  },
  set(patch) {
    Object.assign(this.state, this.progress(), patch, { at: performance.now() });
    this.listeners.forEach((fn) => fn('state', this.state));
  },
  show(track) {
    this.listeners.forEach((fn) => fn('track', track));
  },
  // the robot delivered the disc: nothing to start, the PC is already playing it
  async play({ tracks, index = 0 }) {
    this.show(tracks[index]);
  },
  progress() {
    const s = this.state;
    const position = s.paused ? s.position : s.position + performance.now() - s.at;
    return { position: s.duration ? Math.min(position, s.duration) : position, duration: s.duration };
  },
  unlock() {},
};

S.snapshot = lib;
S.playlists = lib.playlists;
app.bindPlayer(player);
app.enter();
app.onActivate = () => S.mode === 'playlists'; // a click opens a binder; what plays is up to the PC

// ---------- Wallpaper Engine: audio, now playing, settings ----------
W.wallpaperRegisterAudioListener?.((bins) => Beat.feedSpectrum(bins));

let next = null; // the song the PC just started, waiting for the robot
let last, thumb, settle;
W.wallpaperRegisterMediaThumbnailListener?.((e) => (thumb = e.thumbnail));
W.wallpaperRegisterMediaPropertiesListener?.((e) => {
  thumb = null;
  clearTimeout(settle);
  // shortcut: the cover arrives in its own event, so give it 700 ms; a later one is ignored
  settle = setTimeout(() => {
    if (!e.title || e.title + e.artist === last) return;
    last = e.title + e.artist;
    next = { id: `sys:${last}`, uri: `sys:${last}`, name: e.title, artists: e.artist, album: e.albumTitle, coverUrl: thumb || `gen:${last}:${e.albumTitle || e.title}` };
  }, 700);
});
W.wallpaperRegisterMediaPlaybackListener?.((e) => player.set({ paused: e.state !== W.wallpaperMediaIntegration.PLAYBACK_PLAYING }));
W.wallpaperRegisterMediaTimelineListener?.((e) => player.set({ position: e.position * 1000, duration: e.duration * 1000 }));

W.wallpaperPropertyListener = {
  applyUserProperties(p) {
    if (p.room) app.setTheme(p.room.value);
    if (p.format) app.setMedia(p.format.value);
    if (p.bass) Beat.gain = p.bass.value;
    if (p.nowplaying) document.body.classList.toggle('no-np', !p.nowplaying.value);
    if (p.mouse) document.body.classList.toggle('no-mouse', !p.mouse.value);
    if (p.taskbar) document.documentElement.style.setProperty('--taskbar', `${p.taskbar.value}px`);
  },
  applyGeneralProperties(p) {
    if (p.fps) app.setFpsLimit(p.fps);
  },
};

// ---------- autopilot ----------
/** A song from the library gets the full robot run; anything else goes straight in the jukebox. */
async function present(track) {
  const hit = find(track.name, track.artists);
  if (hit) {
    if (S.mode !== 'tracks' || S.playlist !== hit.pl) await app.openPlaylist(hit.pl);
    await app.robotPlay(hit.index);
    S.queue.clearUpcoming(); // we don't know what the PC plays next
  } else {
    Object.assign(S.queue, { items: [], index: -1, pendingUntil: 0 });
    player.show(track);
    app.flash(0.4);
    app.setView('juke');
  }
}

let i = 0;
let left = 8; // cases to skim before changing shelves
async function browse() {
  if (S.view !== 'shelf') app.setView('shelf');
  if (left-- <= 0) {
    left = 30 + Math.random() * 40;
    if (S.mode === 'tracks') await app.showPlaylists(S.playlist.id);
    else await app.openPlaylist(lib.playlists[Math.floor(Math.random() * lib.playlists.length)]);
    i = Math.floor(Math.random() * shelf.items.length);
  }
  i = (i + 1) % shelf.items.length;
  S.keyboard = true;
  S.kbIndex = i;
  S.scrollTarget = app.clampScroll(shelf.xOfIndex(i));
  await sleep(1500);
}

let lastMouse = -1e9;
addEventListener('pointermove', () => (lastMouse = performance.now()));
(async () => {
  for (;;) {
    if (S.busy || performance.now() - lastMouse < 5000) await sleep(500); // the mouse has the shelf
    else if (next) {
      const track = next;
      next = null;
      await present(track);
      for (let n = 0; n < 24 && !next; n++) await sleep(500); // watch it play for a bit
    } else await browse();
  }
})();
