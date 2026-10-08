/**
 * Dev only (/pitch/?capture): snapshot the logged-in Spotify library for the pitch, so the talk
 * never depends on the network or rate limits. Only library data is saved (names, covers, track
 * URIs); the login token never leaves the browser.
 */
import * as sp from '../spotify.js';

export async function capture(progress) {
  if (!import.meta.env.DEV) return progress(0, 'Capture only runs on the dev server.');
  if (!localStorage.getItem('ds.token')) return progress(0, 'Log in on the main page first, then reopen /pitch/?capture.');
  progress(0.05, 'Reading your profile…');
  const me = await sp.getMe();
  const playlists = await sp.getPlaylists(me.id);
  const tracks = {};
  const own = playlists.filter((p) => !p.locked && !p.liked);
  for (let i = 0; i < own.length; i++) {
    const p = own[i];
    progress(0.1 + (0.85 * i) / own.length, `Reading ${p.name}…`);
    try {
      tracks[p.id] = await sp.getPlaylistTracks(p, (n, t) => progress(0.1 + (0.85 * (i + (t ? n / t : 0))) / own.length, `Reading ${p.name}… ${n}/${t}`));
    } catch (e) {
      console.warn('skipped', p.name, e);
    }
  }
  // the biggest playlist you own carries the story
  const featured = own.reduce((a, b) => ((tracks[b.id]?.length || 0) > (tracks[a?.id]?.length || 0) ? b : a), null);
  const lib = {
    capturedAt: new Date().toISOString(),
    user: { name: me.display_name || me.id },
    url: 'diskshelf.saladsync.ca',
    playlists: playlists.filter((p) => !p.liked),
    tracks,
    featured: featured?.id,
  };
  progress(0.97, 'Saving the snapshot…');
  const r = await fetch('/__pitch-snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lib) });
  const ok = r.ok ? await r.json() : null;
  progress(1, ok ? `Saved ${Object.values(tracks).reduce((a, t) => a + t.length, 0)} tracks from ${Object.keys(tracks).length} playlists (${Math.round(ok.bytes / 1024)} KB). Opening the pitch…` : 'Saving failed. Is the dev server running?');
  if (ok) setTimeout(() => location.replace('/pitch/'), 1800);
}
