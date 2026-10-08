// Spotify Web API + Web Playback SDK, using Authorization Code with PKCE (no client secret).

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

const LS = {
  clientId: 'ds.clientId',
  verifier: 'ds.verifier',
  token: 'ds.token',
};

export const redirectUri = () => window.location.origin + '/';

function store(key, val) {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
  } catch {}
}
function load(key, json = false) {
  try {
    const v = localStorage.getItem(key);
    return json ? (v ? JSON.parse(v) : null) : v;
  } catch {
    return null;
  }
}

export function getClientId() {
  return load(LS.clientId) || '';
}
export function setClientId(id) {
  store(LS.clientId, id.trim());
}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function login() {
  const clientId = getClientId();
  if (!clientId) throw new Error('Missing Spotify Client ID');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  store(LS.verifier, verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export function logout() {
  store(LS.token, null);
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getClientId(), ...body }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const data = await res.json();
  const prev = load(LS.token, true) || {};
  const token = {
    access: data.access_token,
    refresh: data.refresh_token || prev.refresh,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  store(LS.token, token);
  return token;
}

/** Completes the redirect if we just came back from Spotify. Returns true when a usable token exists. */
export async function handleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (code || err) {
    window.history.replaceState({}, '', url.pathname);
    if (err) throw new Error(`Spotify login cancelled: ${err}`);
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: load(LS.verifier) || '',
    });
  }
  return !!load(LS.token, true);
}

export async function getToken() {
  let t = load(LS.token, true);
  if (!t) throw new Error('Not logged in');
  if (Date.now() > t.expires) t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  return t.access;
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      // Spotify says slow down: wait as long as it asks (capped), and let the UI show a countdown
      const secs = Math.min(30, Math.max(1, +res.headers.get('Retry-After') || 2 ** attempt));
      window.dispatchEvent(new CustomEvent('ds-ratelimit', { detail: secs }));
      await new Promise((r) => setTimeout(r, secs * 1000));
      continue;
    }
    if (res.status === 204 || res.status === 202) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = new Error(data?.error?.message || `Spotify ${res.status}`);
      e.status = res.status;
      e.reason = data?.error?.reason;
      throw e;
    }
    return data;
  }
  throw new Error('Rate limited by Spotify');
}

const pickImage = (images, min = 280) => {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((i) => (i.width || 999) >= min) || sorted[sorted.length - 1]).url;
};

export async function getMe() {
  return api('/me');
}

export async function getPlaylists(meId) {
  const out = [
    { id: 'liked', uri: null, name: 'Liked Songs', owner: 'you', coverUrl: 'gen:liked:Liked Songs', liked: true },
  ];
  let next = '/me/playlists?limit=50';
  while (next && out.length < 300) {
    const page = await api(next);
    for (const p of page.items || []) {
      if (!p) continue;
      out.push({
        id: p.id,
        uri: p.uri,
        name: p.name,
        owner: p.owner?.display_name || '',
        // dev-mode apps can only read tracks of playlists you own or collaborate on
        locked: !!meId && p.owner?.id !== meId && !p.collaborative,
        coverUrl: pickImage(p.images) || `gen:${p.id}:${p.name}`,
        total: p.items?.total ?? p.tracks?.total,
        snapshot: p.snapshot_id,
      });
    }
    next = page.next;
  }
  return out;
}

function mapTrack(t) {
  if (!t || t.type === 'episode' || t.is_local || !t.uri) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', '),
    album: t.album?.name || '',
    coverUrl: pickImage(t.album?.images) || `gen:${t.id}:${t.album?.name || t.name}`,
    durationMs: t.duration_ms,
    linkedUri: t.linked_from?.uri || null,
  };
}

const MAX_TRACKS = 5000;

/** Fetch the first page, then the rest in parallel (4 at a time). onProgress(loaded, total). */
async function pagedTracks(first, onProgress) {
  const firstPage = await api(first);
  const total = Math.min(firstPage.total || 0, MAX_TRACKS);
  const limit = firstPage.limit || 50;
  const pages = [firstPage];
  const offsets = [];
  for (let o = limit; o < total; o += limit) offsets.push(o);
  let loaded = firstPage.items?.length || 0;
  onProgress?.(loaded, total);
  const base = new URL(first, 'https://api.spotify.com/v1/');
  let cursor = 0;
  const worker = async () => {
    while (cursor < offsets.length) {
      const o = offsets[cursor++];
      const u = new URL(base);
      u.searchParams.set('offset', o);
      u.searchParams.set('limit', limit);
      const page = await api(u.pathname.replace('/v1', '') + u.search);
      pages[o / limit] = page;
      loaded += page.items?.length || 0;
      onProgress?.(loaded, total);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const tracks = [];
  for (const page of pages) for (const it of page?.items || []) {
    const t = mapTrack(it.item || it.track);
    if (t) tracks.push(t);
  }
  return tracks;
}

// Track lists are cached per playlist snapshot, so reopening an unchanged playlist costs no API calls.
const CACHE_KEY = 'ds.plcache';
const memCache = new Map();
function readCache(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    if (all[key]) memCache.set(key, all[key].tracks);
    return all[key]?.tracks || null;
  } catch {
    return null;
  }
}
function writeCache(key, tracks) {
  memCache.set(key, tracks);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { at: Date.now(), tracks };
    // keep the 6 most recent playlists, and drop more if storage is full
    let keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const k of keys.slice(6)) delete all[k];
    keys = Object.keys(all).sort((a, b) => all[a].at - all[b].at);
    for (;;) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(all));
        break;
      } catch {
        if (keys.length <= 1) break;
        delete all[keys.shift()];
      }
    }
  } catch {}
}

export async function getPlaylistTracks(playlist, onProgress) {
  const key = playlist.liked ? null : playlist.snapshot && `${playlist.id}:${playlist.snapshot}`;
  const cached = key && readCache(key);
  if (cached) return cached;
  const tracks = await fetchPlaylistTracks(playlist, onProgress);
  if (key) writeCache(key, tracks);
  return tracks;
}

async function fetchPlaylistTracks(playlist, onProgress) {
  if (playlist.liked) return pagedTracks('/me/tracks?limit=50', onProgress);
  // Newer apps use /items; older ones still have /tracks.
  try {
    return await pagedTracks(`/playlists/${playlist.id}/items?limit=50`, onProgress);
  } catch (e) {
    if (e.status !== 404 && e.status !== 403) throw e;
    return pagedTracks(`/playlists/${playlist.id}/tracks?limit=50`, onProgress);
  }
}

export async function searchTracks(q) {
  const res = await api('/search', { query: { q, type: 'track', limit: 8 } });
  return (res?.tracks?.items || []).map(mapTrack).filter(Boolean);
}

export async function getQueue() {
  const q = await api('/me/player/queue');
  return (q?.queue || []).map(mapTrack).filter(Boolean);
}

// ---------- Web Playback SDK ----------

let sdkPromise;
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      s.onerror = () => reject(new Error('Could not load Spotify player SDK'));
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}

/** Spotify-backed player that matches the DemoPlayer interface. */
export class SpotifyPlayer {
  constructor() {
    this.deviceId = null;
    this.listeners = new Set();
    this.state = null;
    this.ready = this.init();
  }

  on(fn) {
    this.listeners.add(fn);
  }
  emit(type, data) {
    this.listeners.forEach((fn) => fn(type, data));
  }

  async init() {
    const Spotify = await loadSdk();
    this.player = new Spotify.Player({
      name: 'DISC//SHELF Jukebox',
      getOAuthToken: (cb) => getToken().then(cb),
      volume: 0.7,
    });
    this.player.addListener('player_state_changed', (s) => {
      if (!s) return;
      const cur = mapTrack(s.track_window?.current_track);
      const prevId = this.state?.track?.id;
      this.state = { track: cur, paused: s.paused, position: s.position, duration: s.duration, shuffle: s.shuffle, at: performance.now() };
      this.emit('state', this.state);
      if (cur && cur.id !== prevId) this.emit('track', cur);
    });
    const fail = (kind) => ({ message }) => this.emit('error', `${kind}: ${message}`);
    this.player.addListener('initialization_error', fail('Player init failed'));
    this.player.addListener('authentication_error', fail('Auth error'));
    this.player.addListener('account_error', () => this.emit('error', 'Playback needs Spotify Premium.'));
    this.player.addListener('playback_error', fail('Playback error'));
    const ready = new Promise((resolve) => {
      this.player.addListener('ready', ({ device_id }) => {
        this.deviceId = device_id;
        resolve();
      });
    });
    await this.player.connect();
    await ready;
  }

  /** Must run synchronously inside a user gesture so the browser allows audio. */
  unlock() {
    this.player?.activateElement?.();
  }

  async play({ tracks, index = 0, positionMs = 0 }) {
    await this.ready;
    if (!this.shuffleOff) {
      // the app owns the queue order, so Spotify's own shuffle must stay off
      // the app owns the queue order, so Spotify's own shuffle must stay off
      this.shuffleOff = true;
      await api('/me/player/shuffle', { method: 'PUT', query: { state: false, device_id: this.deviceId } }).catch(() => {});
    }
    await api('/me/player/play', {
      method: 'PUT',
      query: { device_id: this.deviceId },
      body: { uris: tracks.map((t) => t.uri), offset: { position: index }, position_ms: positionMs },
    });
  }

  /** Hand a whole playlist to Spotify (used for playlists we can't read track lists for). */
  async playContext(uri, shuffle = false) {
    await this.ready;
    await api('/me/player/shuffle', { method: 'PUT', query: { state: shuffle, device_id: this.deviceId } }).catch(() => {});
    this.shuffleOff = !shuffle;
    await api('/me/player/play', { method: 'PUT', query: { device_id: this.deviceId }, body: { context_uri: uri } });
  }

  toggle() {
    return this.player?.togglePlay();
  }
  next() {
    return this.player?.nextTrack();
  }
  prev() {
    return this.player?.previousTrack();
  }
  setVolume(v) {
    return this.player?.setVolume(v);
  }
  progress() {
    const s = this.state;
    if (!s) return { position: 0, duration: 0 };
    const pos = s.paused ? s.position : s.position + (performance.now() - s.at);
    return { position: Math.min(pos, s.duration), duration: s.duration };
  }
}
