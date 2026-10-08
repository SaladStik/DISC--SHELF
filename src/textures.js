import * as THREE from 'three';
import { hash } from './demo.js';

const rand = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function canvasTexture(c, { nearest = false, repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
  }
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// ---------- generated covers (demo + fallbacks) ----------

const PALETTES = [
  ['#ff3d8b', '#ffb347', '#2b1055', '#7ef9ff'],
  ['#0f0c29', '#00f5d4', '#f15bb5', '#fee440'],
  ['#e63946', '#f1faee', '#1d3557', '#a8dadc'],
  ['#ff6b35', '#004e89', '#f7c59f', '#1a1a2e'],
  ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9'],
  ['#222222', '#e0e0e0', '#ff2e63', '#08d9d6'],
  ['#2d00f7', '#f20089', '#ffd000', '#0b0221'],
  ['#3a86ff', '#ffbe0b', '#fb5607', '#ff006e'],
];

export function generateCover(key, title) {
  const [c, g] = canvas(256, 256);
  const r = rand(hash(key));
  const p = PALETTES[Math.floor(r() * PALETTES.length)];
  const style = Math.floor(r() * 5);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, p[2]);
  grad.addColorStop(1, p[0]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);

  if (style === 0) {
    // synth sun + grid
    g.fillStyle = p[1];
    g.beginPath();
    g.arc(128, 140, 70, Math.PI, 0);
    g.fill();
    g.fillStyle = p[2];
    for (let i = 0; i < 6; i++) g.fillRect(50, 90 + i * 9 + i * i, 160, 2 + i);
    g.strokeStyle = p[3];
    g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(128, 140);
      g.lineTo(-100 + i * 57, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, 140 + Math.pow(i, 1.8) * 2.4);
      g.lineTo(256, 140 + Math.pow(i, 1.8) * 2.4);
      g.stroke();
    }
  } else if (style === 1) {
    // concentric rings
    for (let i = 8; i > 0; i--) {
      g.fillStyle = p[i % 4];
      g.beginPath();
      g.arc(70 + r() * 120, 70 + r() * 120, i * 18, 0, Math.PI * 2);
      g.fill();
    }
  } else if (style === 2) {
    // swiss blocks
    for (let i = 0; i < 7; i++) {
      g.fillStyle = p[Math.floor(r() * 4)];
      g.fillRect(Math.floor(r() * 8) * 32, Math.floor(r() * 8) * 32, (1 + Math.floor(r() * 4)) * 32, (1 + Math.floor(r() * 3)) * 32);
    }
  } else if (style === 3) {
    // stripes
    g.save();
    g.translate(128, 128);
    g.rotate((Math.floor(r() * 4) * Math.PI) / 4);
    for (let i = -10; i < 10; i++) {
      g.fillStyle = p[(i + 20) % 4];
      g.fillRect(i * 24, -200, 12, 400);
    }
    g.restore();
  } else {
    // chrome orb
    const rg = g.createRadialGradient(110, 100, 10, 128, 128, 110);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.3, p[3]);
    rg.addColorStop(0.7, p[1]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
  }
  // noise
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = p[3];
  g.font = 'bold 22px "Arial Narrow", Arial, sans-serif';
  g.textBaseline = 'top';
  const words = (title || '').toUpperCase().split(' ');
  words.slice(0, 3).forEach((w, i) => g.fillText(w, 14, 14 + i * 22));
  if (key.startsWith('liked')) {
    g.fillStyle = '#fff';
    g.font = 'bold 120px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♥', 128, 140);
  }
  return c;
}

// ---------- cover cache with prioritized loading ----------

const covers = new Map();
const queue = [];
let active = 0;
const MAX_ACTIVE = 8;
export let coverPriority = () => 0;
export function setCoverPriority(fn) {
  coverPriority = fn;
}

function averageColor(src) {
  const [c, g] = canvas(8, 8);
  g.drawImage(src, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0,
    gg = 0,
    b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
  }
  return new THREE.Color().setRGB(r / 64 / 255, gg / 64 / 255, b / 64 / 255, THREE.SRGBColorSpace);
}

function discCanvas(src) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const R = S / 2;
  g.translate(R, R);
  // silver base
  const base = g.createRadialGradient(0, 0, 10, 0, 0, R);
  base.addColorStop(0, '#d9dde6');
  base.addColorStop(1, '#9aa1b0');
  g.fillStyle = base;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  // printed label = the cover art
  g.save();
  g.beginPath();
  g.arc(0, 0, R * 0.97, 0, Math.PI * 2);
  g.arc(0, 0, R * 0.36, 0, Math.PI * 2, true);
  g.clip();
  g.drawImage(src, -R, -R, S, S);
  g.restore();
  // rainbow sheen
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0.6, 0, 0);
    ['#ff004c', '#ffe600', '#00ff9d', '#00b7ff', '#b300ff', '#ff004c'].forEach((col, i, a) => cg.addColorStop(i / (a.length - 1), col));
    g.globalAlpha = 0.18;
    g.globalCompositeOperation = 'screen';
    g.fillStyle = cg;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  // clear hub + hole
  g.fillStyle = 'rgba(210,220,235,0.9)';
  g.beginPath();
  g.arc(0, 0, R * 0.34, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, R * 0.25, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#0b0a14';
  g.beginPath();
  g.arc(0, 0, R * 0.12, 0, Math.PI * 2);
  g.fill();
  return c;
}

function vinylCanvas(src) {
  const S = 256,
    R = S / 2;
  const [c, g] = canvas(S, S);
  g.translate(R, R);
  g.fillStyle = '#0b0b0d';
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  // grooves
  for (let r = R * 0.38; r < R * 0.97; r += 2.2) {
    g.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  // light streak
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, R, -0.5, -0.2);
  g.fill();
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, R, Math.PI - 0.5, Math.PI - 0.2);
  g.fill();
  // center label = cover art
  g.save();
  g.beginPath();
  g.arc(0, 0, R * 0.34, 0, Math.PI * 2);
  g.clip();
  g.drawImage(src, -R * 0.34, -R * 0.34, R * 0.68, R * 0.68);
  g.restore();
  g.fillStyle = '#0b0b0d';
  g.beginPath();
  g.arc(0, 0, 4, 0, Math.PI * 2);
  g.fill();
  return c;
}

function tapeCanvas(src, color) {
  const [c, g] = canvas(256, 160);
  g.fillStyle = '#1c1c22';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, 0, 256, 6);
  // sticker with the cover art + colored band
  g.fillStyle = '#efe8d6';
  g.fillRect(14, 12, 228, 100);
  g.drawImage(src, 20, 18, 88, 88);
  g.fillStyle = color ? `#${color.getHexString()}` : '#ff4fd8';
  g.fillRect(112, 18, 124, 16);
  g.fillStyle = '#2a2433';
  for (let y = 46; y < 104; y += 12) g.fillRect(116, y, 116, 1);
  // reel window
  g.fillStyle = '#0a0a0e';
  g.fillRect(78, 112, 100, 34);
  g.fillStyle = '#5a4030';
  g.fillRect(96, 120, 64, 18);
  for (const x of [98, 158]) {
    g.fillStyle = '#e9e5dc';
    g.beginPath();
    g.arc(x, 129, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0a0e';
    g.beginPath();
    g.arc(x, 129, 5, 0, Math.PI * 2);
    g.fill();
  }
  // screw holes
  g.fillStyle = '#3a3a44';
  for (const [x, y] of [
    [8, 8],
    [248, 8],
    [8, 152],
    [248, 152],
    [128, 152],
  ]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Lazily built per-cover texture for a media kind: 'disc' (CD), 'vinyl' or 'tape'. */
export function mediaTex(entry, kind) {
  if (kind === 'disc' || kind === 'cd' || kind === 'binder') return entry.disc;
  const key = `_${kind}`;
  if (!entry[key]) entry[key] = canvasTexture(kind === 'vinyl' ? vinylCanvas(entry.image) : tapeCanvas(entry.image, entry.color));
  return entry[key];
}

function finish(entry, src) {
  entry.image = src;
  entry.color = averageColor(src);
  entry.tex = canvasTexture(src instanceof HTMLCanvasElement ? src : toCanvas(src));
  entry.disc = canvasTexture(discCanvas(src));
  entry.state = 'ready';
  entry.cbs.forEach((cb) => cb(entry));
  entry.cbs = [];
}

function toCanvas(img) {
  const [c, g] = canvas(256, 256);
  g.drawImage(img, 0, 0, 256, 256);
  return c;
}

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (coverPriority(queue[i]) < coverPriority(queue[best])) best = i;
    const entry = queue.splice(best, 1)[0];
    active++;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      active--;
      try {
        finish(entry, img);
      } catch {
        finish(entry, generateCover(entry.url, ''));
      }
      pump();
    };
    img.onerror = () => {
      active--;
      finish(entry, generateCover(entry.url, ''));
      pump();
    };
    img.src = entry.url;
  }
}

const thumbs = new Map();
/** A URL usable in <img>: real covers as-is, generated ones rendered to a data URL. */
export function coverThumb(url) {
  if (!url) return '';
  if (!url.startsWith('gen:')) return url;
  if (!thumbs.has(url)) {
    const [, key, ...title] = url.split(':');
    const c = generateCover(key, title.join(':'));
    const [s, g] = canvas(96, 96);
    g.drawImage(c, 0, 0, 96, 96);
    thumbs.set(url, s.toDataURL('image/jpeg', 0.8));
  }
  return thumbs.get(url);
}

/** Calls cb(entry) once the cover is ready. entry: { tex, disc, color, image }. */
export function requestCover(url, cb, owner) {
  let entry = covers.get(url);
  if (!entry) {
    entry = { url, state: 'idle', cbs: [], owners: [], refs: 0 };
    covers.set(url, entry);
  }
  entry.refs++;
  entry.lastUsed = performance.now();
  if (entry.state === 'ready') return cb(entry);
  entry.cbs.push(cb);
  if (owner) entry.owners.push(owner);
  if (entry.state === 'idle') {
    entry.state = 'loading';
    if (url.startsWith('gen:')) {
      const [, key, ...title] = url.split(':');
      // defer generated covers to spread the work over frames
      setTimeout(() => finish(entry, generateCover(key, title.join(':'))), Math.random() * 120);
    } else {
      queue.push(entry);
      pump();
    }
  }
}

const MAX_UNUSED = 160;

/** Drop a reference; textures nobody uses are evicted (oldest first) once the cache gets big. */
export function releaseCover(url) {
  const e = covers.get(url);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  e.owners = [];
  if (e.refs > 0) return;
  e.lastUsed = performance.now();
  const unused = [...covers.values()].filter((x) => x.refs === 0 && x.state === 'ready');
  if (unused.length <= MAX_UNUSED) return;
  unused.sort((a, b) => a.lastUsed - b.lastUsed);
  for (const x of unused.slice(0, unused.length - MAX_UNUSED)) {
    x.tex?.dispose();
    x.disc?.dispose();
    x._vinyl?.dispose();
    x._tape?.dispose();
    covers.delete(x.url);
  }
  // cancel queued downloads nobody needs anymore
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].refs === 0) {
      covers.delete(queue[i].url);
      queue.splice(i, 1);
    }
  }
}

// ---------- spines ----------

function fitText(g, text, maxW, size, weight = 'bold', family = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif') {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${family}`;
    s -= 1;
  } while (g.measureText(text).width > maxW && s > 7);
}

export function drawCdSpine(c, item, color, image) {
  const g = c.getContext('2d');
  const W = c.width,
    H = c.height;
  const col = color ? color.clone() : new THREE.Color(0x1b1b24);
  const hsl = {};
  col.getHSL(hsl);
  const light = hsl.l > 0.55;
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, W, H);
  // plastic hinge highlights
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 0, 2, H);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(W - 2, 0, 2, H);
  if (image) {
    g.drawImage(image, 2, 4, W - 4, W - 4);
  }
  g.save();
  g.translate(W / 2, image ? W + 2 : 6);
  g.rotate(Math.PI / 2);
  g.fillStyle = light ? '#111' : '#f5f2e8';
  g.textBaseline = 'middle';
  const maxW = H - (image ? W + 10 : 14);
  fitText(g, (item.artists || item.owner || '').toUpperCase(), maxW * 0.45, Math.floor(W * 0.42));
  const a = g.measureText((item.artists || item.owner || '').toUpperCase()).width;
  g.fillText((item.artists || item.owner || '').toUpperCase(), 0, 0);
  g.globalAlpha = 0.8;
  fitText(g, item.name, maxW - a - 10, Math.floor(W * 0.4), 'normal');
  g.fillText(item.name, a + 8, 0);
  g.restore();
  // tiny disc logo at the bottom
  g.globalAlpha = 0.6;
  g.strokeStyle = light ? '#111' : '#fff';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(W / 2, H - W / 2, W * 0.25, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

export function drawBinderSpine(c, item, color, image) {
  const g = c.getContext('2d');
  const W = c.width,
    H = c.height;
  const col = color ? color.clone().multiplyScalar(0.75) : new THREE.Color(0x2a2340);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, W, H);
  // fabric weave
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  // label card
  g.fillStyle = '#f2ead3';
  g.fillRect(6, W + 8, W - 12, H - W - 40);
  if (image) g.drawImage(image, 6, 6, W - 12, W - 12);
  g.save();
  g.translate(W / 2, W + 14);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#1a1626';
  g.textBaseline = 'middle';
  fitText(g, item.name.toUpperCase(), H - W - 54, 22, 'bold', '"Silkscreen", "Arial Narrow", monospace');
  g.fillText(item.name.toUpperCase(), 0, 0);
  g.restore();
  if (item.locked) {
    g.fillStyle = '#ff4fd8';
    g.fillRect(W - 30, H - 64, 24, 30);
    g.fillStyle = '#fff';
    g.font = 'bold 18px Arial';
    g.textAlign = 'center';
    g.fillText('🔒', W - 18, H - 42);
    g.textAlign = 'start';
  }
  // ring hole bottom
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath();
  g.arc(W / 2, H - 16, 6, 0, Math.PI * 2);
  g.fill();
}

// ---------- room textures ----------

export function woodTexture(repeatX = 1) {
  const [c, g] = canvas(128, 32);
  const r = rand(7);
  g.fillStyle = '#6b3f22';
  g.fillRect(0, 0, 128, 32);
  for (let y = 0; y < 32; y++) {
    const v = Math.sin(y * 0.9 + r() * 2) * 14 + (r() - 0.5) * 10;
    g.fillStyle = `rgba(${v > 0 ? '255,200,140' : '20,8,0'},${Math.abs(v) / 90})`;
    g.fillRect(0, y, 128, 1);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(30,12,0,0.25)';
    g.fillRect(r() * 128, Math.floor(r() * 32), 6 + r() * 30, 1);
  }
  return canvasTexture(c, { nearest: true, repeat: [repeatX, 1] });
}

export function carpetTexture() {
  const [c, g] = canvas(64, 64);
  const r = rand(3);
  g.fillStyle = '#2a1f3d';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      g.fillStyle = (i + j) % 2 ? '#30244a' : '#261b38';
      g.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
    g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 1);
  }
  return canvasTexture(c, { nearest: true, repeat: [40, 12] });
}

export function wallpaperTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#1d1a33';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#25213f';
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = 'rgba(126,249,255,0.08)';
  g.fillRect(31, 0, 2, 64);
  g.fillStyle = 'rgba(255,79,216,0.07)';
  for (let y = 4; y < 64; y += 16) {
    g.beginPath();
    g.arc(16, y + 4, 3, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(c, { nearest: true, repeat: [60, 6] });
}

export function grilleTexture() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#120d1c';
  g.fillRect(0, 0, 128, 64);
  for (let x = 4; x < 128; x += 8) {
    const gr = g.createLinearGradient(x, 0, x + 4, 0);
    gr.addColorStop(0, '#5a4a6e');
    gr.addColorStop(0.5, '#e6dcf0');
    gr.addColorStop(1, '#5a4a6e');
    g.fillStyle = gr;
    g.fillRect(x, 0, 4, 64);
  }
  return canvasTexture(c);
}
