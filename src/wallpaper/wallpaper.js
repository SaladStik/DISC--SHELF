/**
 * DISC//SHELF as a Wallpaper Engine web wallpaper (see WALLPAPER.md).
 *
 * The bass comes from the PC's real audio. Signed in (npm run wallpaper:login), it shows your
 * library and a clicked disc plays: in the wallpaper itself if Wallpaper Engine's browser can run
 * Spotify's player, otherwise on your Spotify app. Signed out, it runs on a saved or demo library.
 * Whenever something else on the PC plays the music, the robot fetches each new song.
 */
import '../style.css';
import './wallpaper.css';
import './sim.js';
import { app } from '../main.js';
import { Beat } from '../beat.js';
import * as sp from '../spotify.js';
import { demoPlaylists, demoTracks } from '../demo.js';

const { S, shelf } = app;
const W = window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- login baked in by the build; the wallpaper keeps its own refreshed copy from then on ----------
const login = W.DS_LOGIN;
if (login && localStorage.getItem('ds.seed') !== login.refresh) {
  localStorage.setItem('ds.seed', login.refresh);
  localStorage.setItem('ds.clientId', login.cid);
  localStorage.setItem('ds.token', JSON.stringify(login));
}
let signedIn = !!localStorage.getItem('ds.token');

// ---------- library ----------
let lib;
async function spotifyLibrary() {
  const me = await sp.getMe();
  const playlists = (await sp.getPlaylists(me.id)).filter((p) => !p.locked);
  const tracks = {};
  for (const p of playlists) tracks[p.id] = await sp.getPlaylistTracks(p).catch(() => []);
  return { playlists, tracks };
}
function use(l) {
  l.playlists = l.playlists.filter((p) => l.tracks[p.id]?.length); // binders we can't open are no use here
  lib = S.snapshot = l;
  S.playlists = l.playlists;
}
function demoLibrary() {
  const playlists = demoPlaylists();
  return { playlists, tracks: Object.fromEntries(playlists.map((p) => [p.id, demoTracks(p)])) };
}

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function find(title, artist) {
  const t = norm(title);
  const a = norm(artist.split(/[,;&]/)[0]);
  for (const pl of lib.playlists) {
    const index = lib.tracks[pl.id].findIndex((x) => norm(x.name) === t && norm(x.artists).includes(a));
    if (index >= 0) return { pl, index };
  }
}

// ---------- a player that mirrors the PC's media session, and can ask the Spotify app to play ----------
let following = false; // the robot is fetching what the PC already plays: don't start it again
const remote = {
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
  async play({ tracks, index = 0, positionMs = 0 }) {
    this.show(tracks[index]);
    if (!signedIn || following) return;
    await sp.api('/me/player/play', { method: 'PUT', body: { uris: tracks.map((t) => t.uri), offset: { position: index }, position_ms: positionMs } });
    this.set({ paused: false, position: positionMs, duration: tracks[index].durationMs });
  },
  progress() {
    const s = this.state;
    const position = s.paused ? s.position : s.position + performance.now() - s.at;
    return { position: s.duration ? Math.min(position, s.duration) : position, duration: s.duration };
  },
  unlock() {},
};

// ---------- Wallpaper Engine: audio and settings ----------
W.wallpaperRegisterAudioListener?.((bins) => Beat.feedSpectrum(bins));

let volume = 0.6;
W.wallpaperPropertyListener = {
  applyUserProperties(p) {
    if (p.room) app.setTheme(p.room.value);
    if (p.format) app.setMedia(p.format.value);
    if (p.bass) Beat.gain = p.bass.value;
    if (p.volume) S.player?.setVolume?.((volume = p.volume.value / 100));
    if (p.nowplaying) document.body.classList.toggle('no-np', !p.nowplaying.value);
    if (p.mouse) document.body.classList.toggle('no-mouse', !p.mouse.value);
    if (p.taskbar) document.documentElement.style.setProperty('--taskbar', `${p.taskbar.value}px`);
  },
  applyGeneralProperties(p) {
    if (p.fps) app.setFpsLimit(p.fps);
  },
};

// ---------- now playing, from Windows media controls ----------
let next = null; // the song the PC just started, waiting for the robot
function followMedia() {
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
  W.wallpaperRegisterMediaPlaybackListener?.((e) => remote.set({ paused: e.state !== W.wallpaperMediaIntegration.PLAYBACK_PLAYING }));
  W.wallpaperRegisterMediaTimelineListener?.((e) => remote.set({ position: e.position * 1000, duration: e.duration * 1000 }));
}

/** A song from the library gets the full robot run; anything else goes straight in the jukebox. */
async function present(track) {
  const hit = find(track.name, track.artists);
  if (hit) {
    following = true;
    if (S.mode !== 'tracks' || S.playlist !== hit.pl) await app.openPlaylist(hit.pl);
    await app.robotPlay(hit.index);
    S.queue.clearUpcoming(); // we don't know what the PC plays next
    clearTimeout(S.queue.syncTimer);
    following = false;
  } else {
    Object.assign(S.queue, { items: [], index: -1, pendingUntil: 0 });
    remote.show(track);
    app.flash(0.4);
    app.setView('juke');
  }
}

// ---------- autopilot ----------
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

let hands; // while the mouse moves it has the shelf, and its controls show
addEventListener('pointermove', () => {
  document.body.classList.add('hands');
  clearTimeout(hands);
  hands = setTimeout(() => document.body.classList.remove('hands'), 5000);
});

(async () => {
  use((signedIn && (await spotifyLibrary().catch(() => (signedIn = false)))) || W.DS_LIBRARY || demoLibrary());

  // Spotify's in-page player needs DRM that Wallpaper Engine's browser may not have: first answer wins
  const sdk = signedIn && new sp.SpotifyPlayer();
  const local =
    sdk &&
    (await new Promise((done) => {
      sdk.ready.then(() => done(true), () => done(false));
      sdk.on((type) => type === 'error' && done(false));
      setTimeout(done, 8000, false);
    }));
  if (!local) followMedia();

  app.bindPlayer(local ? sdk : remote);
  S.player.setVolume?.(volume);
  app.enter();
  app.onActivate = () => signedIn || S.mode === 'playlists'; // signed out, a click can only open a binder

  let checked = performance.now();
  for (;;) {
    // new songs: the playlist list is one request, and only playlists that changed are read again
    if (signedIn && performance.now() - checked > 15 * 60000) {
      checked = performance.now();
      await spotifyLibrary().then(use, () => {});
    }
    if (S.busy || document.body.classList.contains('hands')) await sleep(500);
    else if (next) {
      const track = next;
      next = null;
      if (track.name !== S.queue.current?.name) await present(track); // else it's the disc we just started ourselves
      for (let n = 0; n < 24 && !next; n++) await sleep(500); // watch it play for a bit
    } else await browse();
  }
})();
