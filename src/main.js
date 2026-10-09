import * as THREE from 'three';
import { buildRoom } from './scene/room.js';
import { Shelf } from './scene/shelf.js';
import { RoboArm, CEILING_Y } from './scene/arm.js';
import { JUKE_Z } from './scene/jukebox.js';
import { Station } from './scene/players.js';
import { KINDS } from './scene/shelf.js';
import { Beat } from './beat.js';
import { RetroPass } from './scene/retro.js';
import { THEMES, ThemeSet } from './scene/themes.js';
import { updateTweens, tween, wait, damp, ease } from './anim.js';
import { setCoverPriority, coverThumb } from './textures.js';
import * as sp from './spotify.js';
import { DemoPlayer, demoPlaylists, demoTracks } from './demo.js';
import { QueueManager } from './queue.js';
import { initQueueUI, renderQueue, toggleQueue } from './queueUI.js';
import { initSearch, openSearch, closeSearch, searchOpen } from './search.js';

const $ = (id) => document.getElementById(id);

// ---------- three setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 60);
const room = buildRoom(scene);
const shelf = new Shelf(scene);
const arm = new RoboArm(scene);
const juke = new Station(scene);
const retro = new RetroPass(renderer);
const themeSet = new ThemeSet(scene, room, {
  covers: () => {
    const src = S.tracks?.length ? S.tracks : S.playlists || [];
    return [...new Set(src.map((t) => t.coverUrl).filter((u) => u && !u.startsWith('gen:')))].slice(0, 80);
  },
});
const themeNow = { tex: null, playing: false };
// record store is the default room
let themeIdx = THEMES.findIndex((t) => t.id === 'records');
try {
  const saved = THEMES.findIndex((t) => t.id === localStorage.getItem('ds.theme'));
  if (saved >= 0) themeIdx = saved;
} catch {}
function setTheme(i) {
  themeIdx = (i + THEMES.length) % THEMES.length;
  const t = THEMES[themeIdx];
  themeSet.apply(t);
  try {
    localStorage.setItem('ds.theme', t.id);
  } catch {}
  const b = document.getElementById('btn-theme');
  if (b) b.innerHTML = `<i style="background:linear-gradient(135deg,${t.swatch.join(',')})"></i>${t.name.toUpperCase()}`;
  renderThemeMenu();
}
function renderThemeMenu() {
  const m = document.getElementById('theme-menu');
  if (!m) return;
  m.innerHTML = THEMES.map(
    (t, i) => `<button data-i="${i}" class="${i === themeIdx ? 'on' : ''}"><i style="background:linear-gradient(135deg,${t.swatch.join(',')})"></i>${t.name}</button>`,
  ).join('');
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 42 + (1 - camera.aspect) * 36 : 42;
  camera.updateProjectionMatrix();
  retro.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ---------- app state ----------
const S = {
  mode: 'playlists', // 'playlists' | 'tracks'
  view: 'shelf', // 'shelf' | 'follow' | 'juke'
  demo: false,
  player: null,
  playlists: [],
  playlist: null,
  tracks: [],
  scroll: 2,
  scrollTarget: 2,
  mouse: new THREE.Vector2(-9, -9),
  mouseInside: false,
  followT: 0,
  current: null,
  paused: true,
  shuffle: false,
  lastPlaylistX: 2,
  busy: false,
  media: 'cd',
};
try {
  S.media = ['cd', 'vinyl', 'tape'].includes(localStorage.getItem('ds.media')) ? localStorage.getItem('ds.media') : 'cd';
} catch {}

const camPos = new THREE.Vector3(2, 4.5, 9);
const camLook = new THREE.Vector3(2, 2.6, 0);
camera.position.copy(camPos);

// portrait phones get a wider lens (backing the camera up would put it inside the jukebox set)
const tanHalfFov = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const shelfDist = () => 7.5;
const jukeDist = () => Math.min(9.5, Math.max(juke.viewDist, juke.viewHalfW / (tanHalfFov() * camera.aspect)));
const halfWidth = () => shelfDist() * tanHalfFov() * camera.aspect;
const clampScroll = (x) => {
  const hw = Math.min(halfWidth() * 0.7, shelf.length / 2);
  return THREE.MathUtils.clamp(x, hw, Math.max(hw, shelf.length - hw));
};

setCoverPriority((entry) => {
  let best = 1e9;
  for (const o of entry.owners) best = Math.min(best, Math.abs(o.home.x - S.scroll));
  return best;
});

// ---------- UI helpers ----------
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 4200);
}
const fmt = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function flash(strength = 0.9) {
  return tween(0.35, (t) => (retro.material.uniforms.flash.value = Math.sin(t * Math.PI) * strength), ease.linear);
}
function loading(text, frac) {
  $('loading').hidden = text == null;
  if (text != null) {
    $('loading-text').textContent = text;
    $('loading-bar').style.width = `${Math.round((frac ?? 0) * 100)}%`;
  }
}

function setCrumbs() {
  const inPl = S.mode === 'tracks';
  $('crumb-sep').hidden = !inPl;
  $('crumb-pl').textContent = inPl ? S.playlist.name.toUpperCase() : '';
}

function hoverCard(item) {
  const coarse = S.lastPointer ? S.lastPointer !== 'mouse' : matchMedia('(pointer: coarse)').matches;
  const card = $('hover-card');
  if (!item || S.view !== 'shelf') {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  if (S.mode === 'playlists') {
    $('hc-kicker').textContent = (item.locked ? '🔒 NOT YOURS · PLAYS AS A WHOLE' : 'PLAYLIST BINDER') + (coarse ? ' · TAP AGAIN TO OPEN' : '');
    $('hc-title').textContent = item.name;
    $('hc-sub').textContent = `${item.total != null ? `${item.total} tracks · ` : ''}${item.owner || ''}`;
    $('hc-keys').innerHTML = '<span><kbd>CLICK</kbd>open</span><span><kbd>S</kbd>shuffle play</span><span><kbd>Q</kbd>queue all</span><span><kbd>RIGHT-CLICK</kbd>more</span>';
  } else {
    const i = shelf.hovered;
    const now = S.queue?.current?.id === item.id;
    $('hc-kicker').textContent = (now ? '▶ NOW PLAYING' : `TRACK ${String(i + 1).padStart(3, '0')} / ${S.tracks.length}`) + (coarse && !now ? ' · TAP AGAIN TO PLAY' : '');
    $('hc-title').textContent = item.name;
    $('hc-sub').textContent = `${item.artists} — ${item.album}`;
    $('hc-keys').innerHTML =
      '<span><kbd>CLICK</kbd>play</span><span><kbd>Q</kbd>add to queue</span><span><kbd>W</kbd>play next</span><span><kbd>RIGHT-CLICK</kbd>more</span><span><kbd>ESC</kbd>back</span>';
  }
}

function setView(v) {
  S.view = v;
  $('btn-view').textContent = v === 'shelf' ? '◉ JUKEBOX' : '▤ SHELF';
  if (v !== 'shelf') shelf.setHovered(-1);
  hoverCard(null);
}

// ---------- data ----------
async function showPlaylists(focusId) {
  if (searchOpen()) closeSearch();
  S.mode = 'playlists';
  shelf.build(S.playlists, 'binder');
  const idx = focusId ? S.playlists.findIndex((p) => p.id === focusId) : -1;
  S.scrollTarget = S.scroll = clampScroll(idx >= 0 ? shelf.xOfIndex(idx) : 0);
  setCrumbs();
  updateScrub();
}

async function openPlaylist(pl) {
  if (S.busy) return;
  if (pl.locked) return playLocked(pl);
  S.busy = true;
  S.playlist = pl;
  try {
    let tracks;
    if (S.demo) tracks = demoTracks(pl);
    else if (S.snapshot) tracks = S.snapshot.tracks[pl.id] || [];
    else {
      loading('READING BINDER…', 0);
      tracks = await sp.getPlaylistTracks(pl, (n, total) => loading(`READING BINDER… ${n}/${total}`, total ? n / total : 0));
    }
    loading(null);
    if (!tracks.length) {
      toast('This playlist is empty (or Spotify won’t share it with this app).');
      return;
    }
    S.tracks = tracks;
    S.mode = 'tracks';
    setTheme(themeIdx); // re-dress the room with this playlist's covers
    if (searchOpen()) closeSearch();
    flash(0.6);
    shelf.build(tracks, S.media);
    S.scrollTarget = S.scroll = clampScroll(0);
    setCrumbs();
    updateScrub();
    setView('shelf');
  } catch (e) {
    loading(null);
    if (e.status === 403 || e.status === 404) {
      pl.locked = true;
      return playLocked(pl);
    }
    toast(e.message);
  } finally {
    S.busy = false;
  }
}

async function playLocked(pl, shuffle = false) {
  S.player?.unlock();
  pill(`PLAYING · ${pl.name}`);
  toast('Spotify only shares track lists of playlists you own with dev apps, so this one plays as a whole (no shelf / queue editing).');
  try {
    await S.player.playContext(pl.uri, shuffle);
    setView('juke');
  } catch (e) {
    toast(e.message);
  }
}

function backToPlaylists() {
  if (S.mode !== 'tracks' || S.busy) return;
  flash(0.5);
  showPlaylists(S.playlist?.id);
  setView('shelf');
}

// ---------- the robot run: shelf -> jukebox ----------
async function scrollTo(x) {
  S.scrollTarget = clampScroll(x);
  while (Math.abs(S.scroll - S.scrollTarget) > 0.08) await wait(0.03);
}

async function robotPlay(index, { shuffle = false } = {}) {
  if (S.busy || !S.player) return;
  S.player.unlock();
  S.busy = true;
  const track = S.tracks[index];
  try {
    setView('shelf');
    await scrollTo(shelf.xOfIndex(index));
    shelf.window(S.scroll - halfWidth() - 1, S.scroll + halfWidth() + 1);
    shelf.setHovered(index);
    const c = shelf.live.get(index);
    c.locked = true;
    c.target = 1;
    shelf.active.add(c);
    await wait(0.35);

    const dp = c.discWorld();
    const grip = KINDS[S.media].grip;
    juke.setX(S.scroll);
    arm.facing.set(0, 0, -1);
    setView('follow');
    S.followT = 0;
    // reach in over the disc
    await arm.move(new THREE.Vector3(dp.x, dp.y + 1.85, dp.z + 1.05), dp.clone().add(new THREE.Vector3(0, grip + 0.35, 0)), 0.5);
    await arm.move(new THREE.Vector3(dp.x, dp.y + 1.55, dp.z + 1.05), dp.clone().add(new THREE.Vector3(0, grip, 0)), 0.14, { curve: ease.out });
    await arm.setGrip(0, 0.08);
    const carried = c.discHolder.clone();
    scene.add(carried);
    c.discHolder.updateWorldMatrix(true, false);
    c.discHolder.matrixWorld.decompose(carried.position, carried.quaternion, carried.scale);
    carried.visible = true;
    c.hideDisc = true;
    arm.hold(carried, { flat: S.media === 'tape', hang: grip });
    c.locked = false;
    c.target = 0;
    shelf.setHovered(-1);

    // lift and fly to the jukebox
    await arm.move(new THREE.Vector3(dp.x, Math.min(dp.y + 2.4, CEILING_Y - 0.4), dp.z + 1.4), dp.clone().add(new THREE.Vector3(0, 1.1, 0.5)), 0.22, { curve: ease.out });
    const slot = juke.slotWorld;
    const spin = (t) => S.media !== 'tape' && (carried.children[0].rotation.y += 0.4 + t);
    await arm.move(new THREE.Vector3(slot.x, CEILING_Y - 0.35, slot.z - 1.05), slot.clone().add(new THREE.Vector3(0, 1.2, 0)), 1.05, {
      onStep: (t) => {
        S.followT = t;
        spin(t);
      },
    });
    // drop it into the hopper
    S.followT = 1;
    setView('juke');
    await arm.move(new THREE.Vector3(slot.x, CEILING_Y - 1.4, slot.z - 1.05), slot.clone().add(new THREE.Vector3(0, juke.insertY, 0)), 0.32, { curve: ease.inOut });
    await arm.setGrip(1, 0.08);
    carried.removeFromParent();
    juke.load(track);
    flash(0.25);
    S.queue.start(S.tracks, index, { shuffle }).catch((e) => toast(e.message));
    arm.move(new THREE.Vector3(slot.x + 1.6, CEILING_Y - 0.6, slot.z - 1.6), new THREE.Vector3(slot.x + 1.6, CEILING_Y - 2.2, slot.z - 2.3), 0.5);
  } catch (e) {
    console.error(e);
    toast(e.message);
    setView('shelf');
  } finally {
    S.busy = false;
  }
}

async function shuffleAction() {
  if (S.busy || !S.player) return;
  if (S.mode === 'playlists') {
    const pl = S.playlists[shelf.hovered >= 0 ? shelf.hovered : Math.floor(Math.random() * S.playlists.length)];
    if (pl.locked) return playLocked(pl, true);
    await openPlaylist(pl);
    if (S.mode !== 'tracks') return;
    await wait(0.4);
  }
  const b = $('btn-shuffle');
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 1200);
  robotPlay(Math.floor(Math.random() * S.tracks.length), { shuffle: true });
}

function activate(i) {
  if (i < 0 || S.busy) return;
  if (S.mode === 'playlists') openPlaylist(S.playlists[i]);
  else robotPlay(i);
}

// ---------- player events ----------
function bindPlayer(player) {
  S.player = player;
  player.on((type, data) => {
    if (type === 'error') toast(data);
    if (type === 'state') {
      S.paused = data.paused;
      juke.playing = !data.paused;
      $('btn-play').textContent = data.paused ? '▶' : '❚❚';
    }
    if (type === 'track' && data) {
      if (!S.queue.onTrack(data)) return;
      S.current = data;
      shelf.setPlaying(data.id);
      if (juke.track?.id !== data.id && !S.busy) juke.load(data);
      $('np-title').textContent = data.name;
      $('np-artist').textContent = data.artists;
      $('np-art').src = coverThumb(data.coverUrl);
      S.lastHover = undefined; // refresh the hover card's now-playing label
    }
  });
  S.queue = new QueueManager({ player, onChange: onQueueChange });
}

function onQueueChange(q) {
  juke.setQueue(q.upcoming);
  renderQueue(q);
  $('q-count').textContent = q.upcoming.length;
}

// ---------- queue actions ----------
function pill(text) {
  const p = document.createElement('div');
  p.className = 'pill';
  p.textContent = text;
  $('pills').appendChild(p);
  setTimeout(() => p.classList.add('out'), 1400);
  setTimeout(() => p.remove(), 1800);
  const chip = $('btn-queue');
  chip.classList.remove('bump');
  void chip.offsetWidth;
  chip.classList.add('bump');
}

function nudgeCase(i) {
  const c = shelf.live.get(i);
  if (!c) return;
  c.flash = 1;
  shelf.active.add(c);
}

function queueTrack(i, next = false) {
  const t = S.tracks[i];
  if (!t || !S.queue) return;
  next ? S.queue.addNext(t) : S.queue.addEnd(t);
  nudgeCase(i);
  pill(`${next ? 'PLAY NEXT' : 'QUEUED'} · ${t.name}`);
}

async function loadTracksFor(pl) {
  if (S.demo) return demoTracks(pl);
  if (S.snapshot) return S.snapshot.tracks[pl.id] || [];
  loading('READING BINDER…', 0);
  try {
    return await sp.getPlaylistTracks(pl, (n, total) => loading(`READING BINDER… ${n}/${total}`, total ? n / total : 0));
  } finally {
    loading(null);
  }
}

async function queuePlaylist(pl, next = false) {
  if (pl.locked) return toast('Spotify won’t share the track list of a playlist you don’t own, so it can’t be queued.');
  try {
    const tracks = await loadTracksFor(pl);
    if (next) [...tracks].reverse().forEach((t) => S.queue.addNext(t));
    else tracks.forEach((t) => S.queue.addEnd(t));
    pill(`${tracks.length} TRACKS ${next ? 'UP NEXT' : 'QUEUED'} · ${pl.name}`);
  } catch (e) {
    toast(e.message);
  }
}

function contextMenu(x, y, i) {
  const menu = $('ctx');
  const item = shelf.items[i];
  if (!item) return;
  const opts =
    S.mode === 'tracks'
      ? [
          ['▶ Play now', () => robotPlay(i)],
          ['⤴ Play next', () => queueTrack(i, true)],
          ['＋ Add to queue', () => queueTrack(i)],
        ]
      : [
          ['▤ Open binder', () => openPlaylist(item)],
          ['⤴ Play all next', () => queuePlaylist(item, true)],
          ['＋ Queue whole playlist', () => queuePlaylist(item)],
        ];
  menu.innerHTML = `<div class="ctx-title">${escapeHtml(item.name)}</div>`;
  for (const [label, fn] of opts) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      hideMenu();
      S.player?.unlock();
      fn();
    };
    menu.appendChild(b);
  }
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  S.menuOpen = true;
}
function hideMenu() {
  $('ctx').hidden = true;
  S.menuOpen = false;
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- input ----------
const ray = new THREE.Raycaster();
const slotPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hitPt = new THREE.Vector3();
function pick() {
  if (S.view !== 'shelf' || S.busy || !S.mouseInside) return -1;
  ray.setFromCamera(S.mouse, camera);
  // hit-test against the fixed slot plane at the spines, so a popped-out case never blocks skimming
  slotPlane.constant = -(shelf.k?.W ?? 1.4) / 2;
  if (!ray.ray.intersectPlane(slotPlane, hitPt)) return -1;
  return shelf.indexAt(hitPt.x, hitPt.y);
}

let drag = null;
const canvasEl = renderer.domElement;
canvasEl.addEventListener('pointermove', (e) => {
  S.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  S.mouseInside = true;
  S.keyboard = false;
  if (drag) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > (drag.touch ? 10 : 6)) drag.moved = true;
    S.scrollTarget = clampScroll(drag.scroll - dx * 0.012);
  }
});
canvasEl.addEventListener('pointerleave', () => (S.mouseInside = false));
canvasEl.addEventListener('pointerdown', (e) => {
  if (S.menuOpen) {
    hideMenu();
    return;
  }
  if (e.button !== 0) return;
  S.lastPointer = e.pointerType;
  if (e.pointerType !== 'mouse') {
    S.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    S.mouseInside = true;
  }
  drag = { x: e.clientX, scroll: S.scrollTarget, moved: false, touch: e.pointerType !== 'mouse' };
});
canvasEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const i = pick();
  if (i >= 0) contextMenu(e.clientX, e.clientY, i);
});
addEventListener('pointerup', () => {
  if (drag?.touch && !drag.moved && S.view === 'shelf') {
    const i = pick();
    S.mouseInside = false; // fingers don't hover
    if (i >= 0 && i !== S.touchSel) {
      S.touchSel = i;
      S.keyboard = true;
      S.kbIndex = i;
    } else if (i >= 0) {
      S.touchSel = -1;
      activate(i);
    }
  } else if (drag && !drag.moved && S.view === 'shelf') activate(pick());
  else if (drag && !drag.moved && S.view === 'juke' && !S.busy) setView('shelf');
  drag = null;
});
canvasEl.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (S.view !== 'shelf') return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    S.scrollTarget = clampScroll(S.scrollTarget + d * 0.006);
  },
  { passive: false },
);

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  const k = e.key;
  if (k === '/' || e.code === 'Slash' || ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K'))) {
    e.preventDefault();
    return openSearch();
  }
  if (S.menuOpen && k === 'Escape') return hideMenu();
  if ((k === 'q' || k === 'Q' || k === 'w' || k === 'W') && shelf.hovered >= 0 && S.view === 'shelf') {
    const next = k === 'w' || k === 'W';
    if (S.mode === 'tracks') queueTrack(shelf.hovered, next);
    else queuePlaylist(shelf.items[shelf.hovered], next);
    return;
  }
  if (k === 'l' || k === 'L') return toggleQueue();
  if (k === 't' || k === 'T') return setTheme(themeIdx + 1);
  if (k === 'm' || k === 'M') return setMedia({ cd: 'vinyl', vinyl: 'tape', tape: 'cd' }[S.media]);
  if (k === 'b' || k === 'B') return toggleMic();
  if (k === ' ') {
    e.preventDefault();
    S.player?.unlock();
    if (S.queue?.current) S.player?.toggle();
    else if (S.queue?.items.length) S.queue.playAt(0);
  } else if (k === 's' || k === 'S') shuffleAction();
  else if (k === 'n' || k === 'N') S.player?.next();
  else if (k === 'p' || k === 'P') S.player?.prev();
  else if (k === 'j' || k === 'J') !S.busy && setView(S.view === 'shelf' ? 'juke' : 'shelf');
  else if (k === 'Escape' || k === 'Backspace') {
    if (S.view !== 'shelf') !S.busy && setView('shelf');
    else backToPlaylists();
  } else if (k === 'Enter') activate(shelf.hovered);
  else if (k.startsWith('Arrow') && S.view === 'shelf' && shelf.items.length) {
    e.preventDefault();
    S.keyboard = true;
    let i = shelf.hovered >= 0 ? shelf.hovered : shelf.indexNear(S.scroll, 0);
    const row = Math.floor(i / shelf.perRow);
    if (k === 'ArrowRight') i = Math.min(shelf.items.length - 1, i + 1);
    if (k === 'ArrowLeft') i = Math.max(0, i - 1);
    if (k === 'ArrowUp' && row > 0) i = shelf.indexNear(shelf.xOfIndex(i), row - 1);
    if (k === 'ArrowDown') {
      const j = shelf.indexNear(shelf.xOfIndex(i), row + 1);
      if (j >= 0) i = j;
    }
    S.kbIndex = i;
    const x = shelf.xOfIndex(i);
    const hw = halfWidth() * 0.6;
    if (x > S.scrollTarget + hw || x < S.scrollTarget - hw) S.scrollTarget = clampScroll(x);
  }
});

// ---------- media mode: CD / vinyl / cassette ----------
function setMedia(m) {
  if (S.busy) return;
  S.media = m;
  try {
    localStorage.setItem('ds.media', m);
  } catch {}
  document.querySelectorAll('#media-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  juke.setMode(m);
  if (S.mode === 'tracks') {
    const keep = S.scrollTarget / (shelf.length || 1);
    flash(0.5);
    shelf.build(S.tracks, m);
    shelf.setPlaying(S.current?.id);
    S.scrollTarget = S.scroll = clampScroll(keep * shelf.length);
  }
}
$('media-seg').onclick = (e) => {
  const b = e.target.closest('button[data-m]');
  if (b) setMedia(b.dataset.m);
};

// ---------- bass source ----------
async function toggleMic() {
  const b = $('btn-bass');
  if (Beat.source === 'mic') {
    Beat.disableMic();
  } else {
    try {
      await Beat.enableMic();
      pill('MIC SYNC ON · reacting to your speakers');
    } catch {
      toast('Mic access was blocked, staying on the auto beat.');
    }
  }
  b.classList.toggle('on', Beat.source === 'mic');
  b.textContent = Beat.source === 'mic' ? '♪ MIC SYNC' : '♪ AUTO BEAT';
}
$('btn-bass').onclick = toggleMic;

// ---------- HUD buttons ----------
$('btn-play').onclick = () => {
  S.player?.unlock();
  if (S.queue?.index < 0 && S.queue.items.length) S.queue.playAt(0);
  else if (!S.current && S.mode === 'tracks') robotPlay(shelf.hovered >= 0 ? shelf.hovered : 0);
  else S.player?.toggle();
};
$('btn-next').onclick = () => S.player?.next();
$('btn-prev').onclick = () => S.player?.prev();
$('btn-shuffle').onclick = () => {
  S.player?.unlock();
  shuffleAction();
};
$('btn-queue').onclick = () => toggleQueue();
$('btn-theme').onclick = (e) => {
  e.stopPropagation();
  $('theme-menu').hidden = !$('theme-menu').hidden;
};
$('theme-menu').onclick = (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  setTheme(+b.dataset.i);
  $('theme-menu').hidden = true;
};
addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#theme-menu,#btn-theme')) $('theme-menu').hidden = true;
});
setTheme(themeIdx);
setMedia(S.media);
$('btn-view').onclick = () => !S.busy && setView(S.view === 'shelf' ? 'juke' : 'shelf');
$('crumb-root').onclick = backToPlaylists;
$('vol').oninput = (e) => S.player?.setVolume(e.target.value / 100);
$('scrub').oninput = (e) => {
  if (S.view !== 'shelf') setView('shelf');
  S.scrollTarget = clampScroll((e.target.value / 1000) * shelf.length);
};
function updateScrub() {
  const s = $('scrub');
  if (document.activeElement !== s) s.value = shelf.length ? (S.scrollTarget / shelf.length) * 1000 : 0;
}

let quotaWarned = false;
addEventListener('ds-quota', () => {
  if (quotaWarned) return;
  quotaWarned = true;
  toast('This Spotify app is over its quota. Log out (top right) and connect a different Client ID, or wait it out.');
});
$('btn-logout').onclick = () => {
  sp.logout();
  location.href = location.pathname; // back to the setup screen; the saved Client ID stays editable
};

addEventListener('ds-ratelimit', (e) => {
  const secs = e.detail;
  if (!$('loading').hidden) $('loading-text').textContent = `SPOTIFY SAYS SLOW DOWN… RETRYING IN ${secs}s`;
  else toast(`Spotify is rate-limiting this app. Retrying in ${secs}s…`);
});

// ---------- boot ----------
async function startDemo() {
  S.demo = true;
  const p = new DemoPlayer();
  bindPlayer(p);
  S.playlists = demoPlaylists();
  $('user').textContent = 'DEMO MODE';
  enter();
}

/** Pitch: run on a saved library. With a live login in this browser, it plays for real. */
async function startSnapshot(lib) {
  S.snapshot = lib;
  S.liveAudio = !!localStorage.getItem('ds.token') && !!sp.getClientId();
  bindPlayer(S.liveAudio ? new sp.SpotifyPlayer() : new DemoPlayer({ silent: true }));
  if (S.liveAudio) S.player.ready.catch(() => {});
  S.playlists = lib.playlists;
  $('user').textContent = lib.user?.name || '';
  enter();
}

async function startSpotify() {
  loading('CONNECTING…', 0.2);
  try {
    const me = await sp.getMe();
    $('user').textContent = me.display_name || me.id;
    $('btn-logout').hidden = false;
    if (me.product && me.product !== 'premium') toast('Heads up: browser playback needs Spotify Premium. Browsing still works.');
    S.playlists = await sp.getPlaylists(me.id);
    bindPlayer(new sp.SpotifyPlayer());
    S.player.ready.catch((e) => toast(e.message));
    loading(null);
    enter();
  } catch (e) {
    loading(null);
    // only a dead login signs you out; rate limits and network blips just ask you to retry
    const dead = e.authInvalid || e.status === 401;
    if (dead) sp.logout();
    $('start').hidden = false;
    $('hud').hidden = true;
    $('start-err').textContent = dead ? 'Your Spotify login expired. Connect again.' : `Spotify didn’t answer (${e.message}). Try again in a minute.`;
  }
}

function enter() {
  $('start').hidden = true;
  $('hud').hidden = false;
  showPlaylists();
  // intro dolly from up high
  camPos.set(S.scroll, 5.5, 11);
}

$('redir').textContent = sp.redirectUri();
initSearch({
  mode: () => S.mode,
  items: () => shelf.items,
  onFilter: (set) => shelf.setFilter(set),
  onFocus: (i) => {
    if (S.view !== 'shelf' && !S.busy) setView('shelf');
    S.keyboard = true;
    S.kbIndex = i;
    // frame the match right of center so the docked search panel doesn't cover it
    S.scrollTarget = clampScroll(shelf.xOfIndex(i) - (innerWidth > 900 ? halfWidth() * 0.32 : 0));
  },
  searchRemote: (q) => (S.demo || (S.snapshot && !S.liveAudio) ? Promise.resolve([]) : sp.searchTracks(q)),
  onChoose: (r, act) => {
    S.player?.unlock();
    const t = r.item;
    if (r.kind === 'local' && S.mode === 'playlists') return act === 'play' ? openPlaylist(t) : queuePlaylist(t, act === 'next');
    if (r.kind === 'local') {
      if (act === 'play') return robotPlay(r.index);
      return queueTrack(r.index, act === 'next');
    }
    if (act === 'play') {
      juke.load(t);
      setView('juke');
      return S.queue.playNow(t);
    }
    act === 'next' ? S.queue.addNext(t) : S.queue.addEnd(t);
    pill(`${act === 'next' ? 'PLAY NEXT' : 'QUEUED'} · ${t.name}`);
  },
});
initQueueUI({
  getQueue: () => S.queue,
  onPlay: (i) => {
    S.player?.unlock();
    S.queue.playAt(i);
  },
});
// ---------- start screen: guided setup ----------
const CID_RE = /^[0-9a-f]{32}$/i;
function setupState(forceSteps = false) {
  const v = $('cid').value.trim();
  const ok = CID_RE.test(v);
  const saved = !!sp.getClientId() && v === sp.getClientId();
  $('btn-connect').classList.toggle('disabled', !ok);
  $('cid-hint').textContent = !v ? '' : ok ? '✓ looks right' : v.length < 32 ? `${32 - v.length} more characters…` : 'that doesn’t look like a Client ID';
  $('cid-hint').className = `cid-hint ${!v ? '' : ok ? 'good' : 'bad'}`;
  const collapse = saved && ok && !forceSteps;
  $('steps').hidden = collapse;
  $('saved').hidden = !collapse;
  $('setup-toggle').hidden = !collapse;
}
$('cid').value = sp.getClientId();
$('cid').addEventListener('input', () => setupState(true));
$('setup-toggle').onclick = () => {
  setupState(true);
  $('cid').focus();
  $('cid').select();
};
$('btn-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(sp.redirectUri());
    $('btn-copy').textContent = 'COPIED ✓';
  } catch {
    const r = document.createRange();
    r.selectNodeContents($('redir'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    $('btn-copy').textContent = 'SELECTED';
  }
  setTimeout(() => ($('btn-copy').textContent = 'COPY'), 1600);
};
setupState();
$('btn-demo').onclick = () => {
  startDemo();
  S.player.unlock();
};
$('btn-connect').onclick = async () => {
  const id = $('cid').value.trim();
  if (!CID_RE.test(id)) {
    setupState(true);
    $('start-err').textContent = id ? 'That Client ID doesn’t look right. It’s 32 letters/numbers from your app’s Settings.' : 'Follow the 4 steps above first. You need your own Spotify app’s Client ID.';
    $('setup').classList.remove('nudge');
    void $('setup').offsetWidth;
    $('setup').classList.add('nudge');
    $('cid').focus();
    return;
  }
  sp.setClientId(id);
  try {
    await sp.login();
  } catch (e) {
    $('start-err').textContent = e.message;
  }
};

(async () => {
  if (window.DS_PITCH) return; // the pitch page boots the app itself
  if (new URLSearchParams(location.search).has('demo')) return startDemo();
  try {
    if (await sp.handleRedirect()) {
      $('start').hidden = true;
      $('hud').hidden = false;
      await startSpotify();
    }
  } catch (e) {
    $('start-err').textContent = e.message;
  }
})();

// ---------- frame loop ----------
const clock = new THREE.Clock();
const shelfPos = new THREE.Vector3(),
  shelfLook = new THREE.Vector3(),
  jukePos = new THREE.Vector3(),
  jukeLook = new THREE.Vector3(),
  tmp = new THREE.Vector3(),
  desiredPos = new THREE.Vector3(),
  desiredLook = new THREE.Vector3();
let hoverFrame = 0;
arm.park(2);

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const time = clock.elapsedTime;
  updateTweens(dt);
  const prog = S.player ? S.player.progress() : { position: 0 };
  Beat.update(dt, { playing: juke.playing, positionMs: prog.position, trackId: S.current?.id });
  // everything on the shelf rattles a little with the bass
  shelf.group.position.y = Beat.kick * 0.018;
  shelf.group.rotation.z = (Math.random() - 0.5) * Beat.kick * 0.0025;
  retro.material.uniforms.kick.value = Beat.kick;
  room.pulse(Beat.kick, Beat.bass);

  S.scroll = damp(S.scroll, S.scrollTarget, 9, dt);
  const mx = S.mouseInside ? S.mouse.x : 0,
    my = S.mouseInside ? S.mouse.y : 0;
  shelfPos.set(S.scroll + mx * 0.25, 2.7 + my * 0.15, shelfDist());
  shelfLook.set(S.scroll + mx * 0.1, 2.5, 0);
  jukePos.set(juke.group.position.x, juke.viewTarget.y + 0.75, JUKE_Z - jukeDist());
  jukeLook.copy(juke.viewTarget);

  if (S.view === 'shelf') {
    desiredPos.copy(shelfPos);
    desiredLook.copy(shelfLook);
    // keyboard/search focus: tilt toward the focused row so top/bottom rows aren't cut off
    if (S.keyboard && shelf.hovered >= 0 && shelf.perRow) {
      const fy = shelf.homeOf(shelf.hovered).pos.y;
      desiredLook.y += (fy - desiredLook.y) * 0.45;
      desiredPos.y += (fy - desiredLook.y) * 0.3;
      // phone + search open: aim above the match so it lands below the search panel
      if (searchOpen() && innerWidth < 760) desiredLook.y = fy + 1.25;
    }
  } else if (S.view === 'juke') {
    desiredPos.copy(jukePos);
    desiredLook.copy(jukeLook);
  } else {
    // follow cam: swing from the shelf to the jukebox while watching the gripper
    const t = ease.inOut(S.followT);
    desiredPos.lerpVectors(shelfPos, jukePos, t);
    desiredPos.x = arm.base.x + (shelfPos.x - arm.base.x) * (1 - t);
    desiredPos.y += Math.sin(t * Math.PI) * 0.8;
    desiredPos.z = THREE.MathUtils.lerp(shelfDist(), JUKE_Z - jukeDist(), t);
    if (t > 0.35 && t < 0.65) desiredPos.z += Math.sin(((t - 0.35) / 0.3) * Math.PI) * 0; // pass under the arm
    arm.grip.getWorldPosition(tmp);
    desiredLook.lerpVectors(shelfLook, jukeLook, t).lerp(tmp, Math.sin(t * Math.PI) * 0.85 + 0.15);
  }
  const rate = S.view === 'follow' ? 5 : 6;
  camPos.x = damp(camPos.x, desiredPos.x, rate, dt);
  camPos.y = damp(camPos.y, desiredPos.y, rate, dt);
  camPos.z = damp(camPos.z, desiredPos.z, rate, dt);
  camLook.x = damp(camLook.x, desiredLook.x, rate * 1.4, dt);
  camLook.y = damp(camLook.y, desiredLook.y, rate * 1.4, dt);
  camLook.z = damp(camLook.z, desiredLook.z, rate * 1.4, dt);
  camera.position.copy(camPos);
  // bass bump: tiny camera shake on each kick
  const shake = Beat.kick * Beat.kick * 0.035;
  camera.position.x += (Math.random() - 0.5) * shake;
  camera.position.y += (Math.random() - 0.5) * shake + Beat.kick * 0.012;
  camera.lookAt(camLook);
  room.follow(camPos.x);

  // only build the cases near the camera (handles 1000+ track playlists)
  const hw = halfWidth();
  shelf.window(S.scroll - hw - 1.5, S.scroll + hw + 1.5);
  shelf.retryHover();

  if (S.view === 'shelf' && !S.busy) {
    if (S.keyboard) shelf.setHovered(S.kbIndex ?? -1);
    else if ((hoverFrame = (hoverFrame + 1) % 2) === 0) shelf.setHovered(pick());
  }
  const hovered = shelf.hovered >= 0 ? shelf.items[shelf.hovered] : null;
  if (hovered !== S.lastHover) {
    S.lastHover = hovered;
    hoverCard(hovered);
  }

  shelf.update(dt, camera);
  if (!arm.busyAnimating && !S.busy && S.view === 'shelf') {
    const parkX = S.scroll - Math.max(3.2, halfWidth() + 1.8);
    arm.base.x = damp(arm.base.x, parkX, 2, dt);
    arm.target.x = damp(arm.target.x, parkX, 2, dt);
    arm.base.y = damp(arm.base.y, CEILING_Y - 0.6, 3, dt);
    arm.base.z = damp(arm.base.z, 3.0, 3, dt);
    arm.target.y = damp(arm.target.y, CEILING_Y - 2.0 + Math.sin(time * 1.3) * 0.05, 3, dt);
    arm.target.z = damp(arm.target.z, 2.2, 3, dt);
  }
  arm.update();
  juke.update(dt, time);
  themeNow.tex = juke.coverTex;
  themeNow.playing = juke.playing;
  themeNow.speakerY = juke.viewTarget.y + 1.3;
  themeSet.update(dt, time, juke.group.position.x, JUKE_Z, themeNow);

  if (S.player) {
    const { position, duration } = S.player.progress();
    $('t-cur').textContent = fmt(position);
    $('t-dur').textContent = fmt(duration);
    $('t-bar').style.width = duration ? `${(position / duration) * 100}%` : '0';
  }
  updateScrub();
  retro.render(scene, camera, time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


/** Handles for the pitch director (and rehearsals in the console). */
export const app = {
  S, shelf, juke, arm, camera, retro, Beat, THEMES,
  openPlaylist, showPlaylists, robotPlay, setView, setMedia, queueTrack, pill, flash, clampScroll, halfWidth,
  setTheme: (id) => setTheme(Math.max(0, THEMES.findIndex((t) => t.id === id))),
  get themeId() {
    return THEMES[themeIdx].id;
  },
  toggleQueue, openSearch, closeSearch, searchOpen, startSnapshot, startDemo,
};
if (import.meta.env.DEV) window.__ds = app;
