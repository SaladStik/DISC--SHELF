/**
 * DISC//SHELF as a Wallpaper Engine web wallpaper (see WALLPAPER.md).
 *
 * The bass comes from the PC's real audio. Signed in (through its settings, see below), it shows your
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
  // inside a playlist only that playlist counts: nothing but a click leaves it
  for (const pl of S.mode === 'tracks' ? [S.playlist] : lib.playlists) {
    const index = lib.tracks[pl.id].findIndex((x) => norm(x.name) === t && norm(x.artists).includes(a));
    if (index >= 0) return { pl, index };
  }
}

// ---------- a player that mirrors the PC's media session, and can ask the Spotify app to play ----------
let following = false; // the robot is fetching what the PC already plays: don't start it again
const remote = {
  ready: Promise.resolve(),
  device: localStorage.getItem('ds.device'), // picked with the DEVICE button
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
    const send = () =>
      sp.api('/me/player/play', { method: 'PUT', query: { device_id: this.device }, body: { uris: tracks.map((t) => t.uri), offset: { position: index }, position_ms: positionMs } });
    await send().catch(async (e) => {
      // no device picked (or it's gone) and none active: an open but idle Spotify app will do
      if (e.status !== 404) throw e;
      const { devices } = await sp.api('/me/player/devices');
      this.device = (devices.find((d) => d.is_active) || devices[0])?.id;
      if (!this.device) throw new Error('Open Spotify first: the wallpaper plays through it.');
      await send();
    });
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
    // a new Client ID is a new login (clearing it signs out); the check after saving is for a browser
    // that won't store anything, which would otherwise reload forever
    if (p.clientid && p.clientid.value.trim() !== sp.getClientId()) {
      sp.setClientId(p.clientid.value);
      sp.logout();
      if (sp.getClientId() === p.clientid.value.trim()) return location.reload();
    }
    if (p.redirect) W.DS_REDIRECT = p.redirect.value.trim();
    // the code the website showed after approving finishes the login (a whole pasted address works too)
    const pasted = p.code?.value.trim() || '';
    const code = pasted.match(/[?&]code=([^&]+)/)?.[1] || pasted;
    if (code && code !== localStorage.getItem('ds.code')) {
      localStorage.setItem('ds.code', code);
      sp.finishLogin(code).then(
        () => location.reload(),
        () => signIn && (signIn.textContent = 'Spotify didn’t take that code. Click here to try again.'),
      );
    }
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

// ---------- signing in ----------
// Spotify signs you in on a web page, and a wallpaper gets no keyboard. So a click here opens that
// page in the browser, it ends on the website showing a code, and the code comes back through the
// wallpaper's settings.
let signIn;
function askToSignIn() {
  signIn = document.body.appendChild(Object.assign(document.createElement('button'), { id: 'signin', className: 'btn primary', textContent: '▶ CLICK TO SIGN IN TO SPOTIFY' }));
  signIn.onclick = async () => {
    const url = await sp.loginUrl();
    window.open(url);
    navigator.clipboard?.writeText(url).catch(() => {}); // in case nothing opened
    signIn.textContent =
      'Approve in your browser (if none opened, the link is on your clipboard), then copy the code it shows into “Spotify sign-in code” in this wallpaper’s settings.';
  };
}

// ---------- choosing the Spotify device, from the bar that shows while the mouse moves ----------
function devicePicker() {
  const chip = document.querySelector('.top').appendChild(Object.assign(document.createElement('button'), { className: 'chip', textContent: '♪ DEVICE' }));
  chip.onclick = async () => {
    const { devices } = await sp.api('/me/player/devices').catch(() => ({ devices: [] }));
    const menu = document.getElementById('ctx'); // the app's right-click menu, which a click elsewhere closes
    menu.innerHTML = `<div class="ctx-title">${devices.length ? 'PLAY ON' : 'OPEN SPOTIFY FIRST'}</div>`;
    for (const d of devices) {
      const b = menu.appendChild(document.createElement('button'));
      b.textContent = `${d.id === remote.device ? '▶ ' : ''}${d.name}`;
      b.onclick = () => {
        localStorage.setItem('ds.device', (remote.device = d.id));
        sp.api('/me/player', { method: 'PUT', body: { device_ids: [d.id] } }).catch(() => {}); // move what's playing there
        menu.hidden = true;
        S.menuOpen = false;
      };
    }
    const r = chip.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.hidden = false;
    S.menuOpen = true;
  };
}

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
    try {
      if (S.mode !== 'tracks') await app.openPlaylist(hit.pl);
      await app.robotPlay(hit.index);
      S.queue.clearUpcoming(); // we don't know what the PC plays next
      clearTimeout(S.queue.syncTimer);
    } finally {
      following = false;
    }
  } else {
    Object.assign(S.queue, { items: [], index: -1, pendingUntil: 0 });
    remote.show(track);
    app.flash(0.4);
    app.setView('juke');
  }
}

// ---------- autopilot ----------
// Walks the shelf you are on, case by case, round and round. Changing shelves is yours to do.
let i, walked;
async function browse() {
  if (S.view !== 'shelf') app.setView('shelf');
  if (walked !== shelf.items) i = -1; // a new shelf starts at its first case
  walked = shelf.items;
  localStorage.setItem('ds.playlist', S.mode === 'tracks' ? S.playlist.id : ''); // to come back to after a restart
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
  if (signedIn && !local) devicePicker();

  app.bindPlayer(local ? sdk : remote);
  S.player.setVolume?.(volume);
  app.enter();
  app.onActivate = () => signedIn || S.mode === 'playlists'; // signed out, a click can only open a binder
  if (!signedIn && sp.getClientId()) askToSignIn();
  const open = (id) => lib.playlists.find((p) => p.id === id);
  if (open(localStorage.getItem('ds.playlist'))) await app.openPlaylist(open(localStorage.getItem('ds.playlist')));

  let checked = performance.now();
  for (;;) {
    // new songs: the playlist list is one request, and only playlists that changed are read again
    if (signedIn && performance.now() - checked > 15 * 60000) {
      checked = performance.now();
      await spotifyLibrary().then(use, () => {});
      // the playlist on the shelf grew or shrank: put the new one up
      const pl = S.mode === 'tracks' && open(S.playlist.id);
      if (pl && lib.tracks[pl.id].length !== S.tracks.length) await app.openPlaylist(pl);
    }
    if (S.busy || document.body.classList.contains('hands')) await sleep(500);
    else if (next) {
      const track = next;
      next = null;
      if (track.name !== S.queue.current?.name) await present(track).catch(console.error); // else it's the disc we just started ourselves
      for (let n = 0; n < 24 && !next; n++) await sleep(500); // watch it play for a bit
    } else await browse();
  }
})();
