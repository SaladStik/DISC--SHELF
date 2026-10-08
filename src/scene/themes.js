import * as THREE from 'three';
import { canvas, canvasTexture, requestCover, generateCover } from '../textures.js';
import { hash } from '../demo.js';

// Each theme restyles the room surfaces/lighting and builds a 3D "set" around the jukebox.
// Set coordinates are jukebox-local: +x = screen right, +z = toward the camera, back wall at z = -0.72.

const rand = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- small builders ----------
function kit(group, textures) {
  const box = (w, h, d, mat, x, y, z, ry = 0, rz = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };
  const plane = (w, h, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const tex = (c, opts) => {
    const t = canvasTexture(c, opts);
    textures.push(t);
    return t;
  };
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const phong = (color, shininess = 60, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess, ...extra });
  const glow = (color) => new THREE.MeshBasicMaterial({ color });
  /** Material showing one of the user's album covers (falls back to a generated cover). */
  const cover = (url) => {
    const m = new THREE.MeshLambertMaterial({ color: 0x333333 });
    if (url)
      requestCover(url, (e) => {
        m.map = e.tex;
        m.color.set(0xffffff);
        m.needsUpdate = true;
      });
    return m;
  };
  const light = (color, intensity, dist, x, y, z) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    group.add(l);
    return l;
  };
  return { box, plane, cyl, tex, lambert, phong, glow, cover, light };
}

const POSTER_TITLES = ['STAR RACER 2000', 'NEON KNIGHTS', 'VOID FIGHTER', 'CYBER PUP', 'TURBO KART', 'GHOST SIGNAL', 'MOON PATROL X', 'DRAGON CIRCUIT', 'PIXEL SAMURAI', 'MALL RATS', 'HYPER CITY', 'SPACE JAMBOREE', 'DINO STRIKE', 'CHROME HEARTS', 'NIGHT SHIFT', 'ALIEN BEACH', 'MEGA BLASTER', 'LOST TAPES'];

function posterCanvas(seed) {
  const r = rand(seed);
  const [c, g] = canvas(128, 176);
  const hue = Math.floor(r() * 360);
  const grad = g.createLinearGradient(0, 0, 0, 176);
  grad.addColorStop(0, `hsl(${hue},70%,${18 + r() * 20}%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360},80%,${30 + r() * 25}%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 176);
  const kind = Math.floor(r() * 4);
  g.fillStyle = `hsl(${(hue + 180) % 360},90%,60%)`;
  if (kind === 0) {
    g.beginPath();
    g.arc(64, 82, 34 + r() * 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(30, 96, 68, 60);
  } else if (kind === 1) {
    g.beginPath();
    g.moveTo(64, 30);
    g.lineTo(108, 140);
    g.lineTo(20, 140);
    g.fill();
  } else if (kind === 2) {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsla(${(hue + i * 40) % 360},90%,60%,0.8)`;
      g.fillRect(10 + r() * 90, 30 + r() * 100, 10 + r() * 30, 4 + r() * 20);
    }
  } else {
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(64, 110, 26, 46, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(64, 58, 18, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff';
  g.font = 'bold 15px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  const title = POSTER_TITLES[Math.floor(r() * POSTER_TITLES.length)];
  title.split(' ').forEach((w, i) => g.fillText(w, 64, 20 + i * 15));
  g.font = '7px Arial';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('COMING THIS SUMMER', 64, 166);
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.strokeRect(2, 2, 124, 172);
  return c;
}

function patternCanvas(seed, base, colors, n = 60, size = 128) {
  const r = rand(seed);
  const [c, g] = canvas(size, size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    g.fillStyle = g.strokeStyle = colors[Math.floor(r() * colors.length)];
    g.lineWidth = 2 + r() * 2;
    const x = r() * size,
      y = r() * size,
      k = Math.floor(r() * 4);
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI);
    if (k === 0) {
      g.beginPath();
      g.moveTo(-8, 0);
      g.quadraticCurveTo(0, -10, 8, 0);
      g.quadraticCurveTo(16, 10, 24, 0);
      g.stroke();
    } else if (k === 1) {
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(6, 6);
      g.lineTo(-6, 6);
      g.closePath();
      g.fill();
    } else if (k === 2) {
      g.beginPath();
      g.arc(0, 0, 3 + r() * 4, 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(-5, -2, 10, 4);
    g.restore();
  }
  return c;
}

function checker(a, b, n = 8, size = 64) {
  const [c, g] = canvas(size, size);
  const s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? a : b;
    g.fillRect(i * s, j * s, s, s);
  }
  return c;
}

function screenAnimator(tex, c, draw) {
  const g = c.getContext('2d');
  let t = 0;
  return (dt) => {
    t += dt;
    if ((tex._acc = (tex._acc || 0) + dt) < 1 / 15) return;
    tex._acc = 0;
    draw(g, t, c.width, c.height);
    tex.needsUpdate = true;
  };
}

const covers = (ctx, n, seed) => {
  const list = ctx.covers();
  const r = rand(seed);
  return Array.from({ length: n }, (_, i) => (list.length ? list[Math.floor(r() * list.length)] : `gen:set${seed}${i}:`));
};

// ---------- themes ----------

const bedroom = {
  id: 'bedroom',
  name: '90s Bedroom',
  swatch: ['#3b1d6e', '#ff4fd8', '#7ef9ff'],
  wall: () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#3a1c66';
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 4) {
      g.fillStyle = `rgba(0,0,0,${0.05 + (x % 8) * 0.01})`;
      g.fillRect(x, 0, 2, 64);
    }
    return canvasTexture(c, { nearest: true, repeat: [80, 6] });
  },
  floor: () => canvasTexture(patternCanvas(11, '#1e1430', ['#7a3cff', '#2fd3c6', '#ffcc33', '#ff4fd8'], 70), { nearest: true, repeat: [120, 9] }),
  ceiling: 0x24123d,
  trim: 0x2a1446,
  fog: [0x150b26, 10, 30],
  hemi: [0xa58cff, 0x301830, 0.8],
  ambient: [0x5a3a80, 0.55],
  key: [0xffc29a, 13],
  fill: [0x7ef9ff, 5],
  sign: ['DISC//SHELF', '#ff4fd8', '#ffd1f4'],
  build(ctx, group, K) {
    const r = rand(42);
    // poster wall, half of them your own album covers blown up
    const albumPosters = covers(ctx, 14, 7);
    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let x = -5.6; x < 5.8; x += 0.95 + r() * 0.25) {
        const w = 0.8 + r() * 0.35;
        const isAlbum = n % 2 === 0 && albumPosters.length;
        const h = isAlbum ? w : w * 1.38;
        const y = [4.85, 3.55, 2.25][row] + (r() - 0.5) * 0.25;
        const mat = isAlbum ? K.cover(albumPosters[n % albumPosters.length]) : K.lambert(0xffffff, { map: K.tex(posterCanvas(hash(`p${n}`))) });
        K.box(w, h, 0.012, mat, x, y, -0.7 + n * 0.0015, 0, (r() - 0.5) * 0.12);
        n++;
      }
    }
    // window with blinds onto a night city
    const [wc, wg] = canvas(128, 128);
    const sky = wg.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#071033');
    sky.addColorStop(1, '#22306e');
    wg.fillStyle = sky;
    wg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      wg.fillStyle = `rgba(255,255,255,${r()})`;
      wg.fillRect(r() * 128, r() * 70, 1, 1);
    }
    wg.fillStyle = '#e8eefc';
    wg.beginPath();
    wg.arc(96, 26, 10, 0, Math.PI * 2);
    wg.fill();
    for (let x = 0; x < 128; x += 10 + r() * 8) {
      const h = 30 + r() * 50;
      wg.fillStyle = '#0a0f24';
      wg.fillRect(x, 128 - h, 14, h);
      for (let k = 0; k < 10; k++) {
        wg.fillStyle = r() > 0.5 ? '#ffd27a' : '#2b3460';
        wg.fillRect(x + 2 + (k % 3) * 4, 128 - h + 4 + Math.floor(k / 3) * 7, 2, 3);
      }
    }
    K.plane(1.9, 2.1, new THREE.MeshBasicMaterial({ map: K.tex(wc) }), -4.15, 2.95, -0.64);
    const frame = K.lambert(0xe9e2d0);
    K.box(2.05, 0.08, 0.12, frame, -4.15, 4.02, -0.6);
    K.box(2.05, 0.08, 0.12, frame, -4.15, 1.88, -0.6);
    K.box(0.08, 2.2, 0.12, frame, -5.16, 2.95, -0.6);
    K.box(0.08, 2.2, 0.12, frame, -3.14, 2.95, -0.6);
    K.box(2.1, 0.06, 0.3, frame, -4.15, 1.84, -0.48);
    const slat = K.phong(0xdcd6c8, 20);
    for (let i = 0; i < 15; i++) K.box(1.95, 0.05, 0.1, slat, -4.15, 3.92 - i * 0.085, -0.56, 0, 0, 0.7);
    K.light(0x6f8cff, 3, 5, -4.1, 2.9, 0.4);

    // desk + CRT + PC + lava lamp
    const deskMat = K.phong(0x7a1d22, 30);
    K.box(2.5, 0.08, 1.05, deskMat, -3.2, 1.05, -0.12);
    for (const [x, z] of [
      [-4.38, 0.35],
      [-2.02, 0.35],
      [-4.38, -0.55],
      [-2.02, -0.55],
    ])
      K.box(0.07, 1.02, 0.07, deskMat, x, 0.52, z);
    const beige = K.phong(0xd8cfb4, 25);
    K.box(0.78, 0.64, 0.6, beige, -3.1, 1.43, -0.22);
    K.box(0.56, 0.5, 0.38, beige, -3.1, 1.43, -0.6);
    K.box(0.34, 0.06, 0.34, beige, -3.1, 1.12, -0.22);
    const monitor = K.plane(0.6, 0.46, new THREE.MeshBasicMaterial({ color: 0x55ffcc }), -3.1, 1.45, 0.085);
    K.box(0.8, 0.04, 0.24, beige, -3.05, 1.11, 0.25);
    K.box(0.09, 0.03, 0.14, beige, -2.45, 1.105, 0.25);
    K.light(0x66ffe0, 1.6, 3, -3.1, 1.5, 0.6);
    const tower = K.box(0.3, 0.78, 0.72, beige, -1.72, 0.39, -0.2);
    K.box(0.2, 0.02, 0.01, K.lambert(0x222222), -1.72, 0.62, 0.165);
    K.box(0.2, 0.02, 0.01, K.lambert(0x222222), -1.72, 0.55, 0.165);
    K.box(0.03, 0.03, 0.01, K.glow(0x33ff66), -1.64, 0.72, 0.165);
    tower.rotation.y = 0.1;
    // lava lamp
    K.cyl(0.06, 0.13, 0.22, K.phong(0x8a8fa0, 90), -4.25, 1.2, -0.3);
    const lavaGlass = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.85 });
    K.cyl(0.075, 0.11, 0.5, lavaGlass, -4.25, 1.56, -0.3);
    K.cyl(0.05, 0.075, 0.1, K.phong(0x8a8fa0, 90), -4.25, 1.86, -0.3);
    const blobMat = K.glow(0xffd23a);
    const blobs = Array.from({ length: 4 }, (_, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.035 + i * 0.008, 8, 6), blobMat);
      group.add(b);
      return b;
    });
    const lavaLight = K.light(0xff6a2a, 2.5, 3.5, -4.25, 1.6, 0.1);

    // red media shelf + CRT TV + console + games
    const red = K.phong(0xb0161f, 40);
    K.box(1.7, 0.08, 0.62, red, 3.75, 0.05, -0.38);
    K.box(1.7, 0.08, 0.62, red, 3.75, 0.85, -0.38);
    K.box(1.7, 0.08, 0.62, red, 3.75, 2.5, -0.38);
    K.box(0.08, 2.5, 0.62, red, 2.94, 1.25, -0.38);
    K.box(0.08, 2.5, 0.62, red, 4.56, 1.25, -0.38);
    K.box(1.08, 0.85, 0.78, K.phong(0x1a1a1e, 40), 3.75, 1.32, -0.32);
    const [tc] = canvas(64, 48);
    const tvTex = K.tex(tc);
    K.plane(0.84, 0.62, new THREE.MeshBasicMaterial({ map: tvTex }), 3.75, 1.32, 0.075);
    const tvAnim = screenAnimator(tvTex, tc, (g, t, w, h) => {
      const bars = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f'];
      if (Math.floor(t / 4) % 2 === 0) bars.forEach((col, i) => ((g.fillStyle = col), g.fillRect((i * w) / 7, 0, w / 7 + 1, h)));
      else {
        const d = g.createImageData(w, h);
        for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255, (d.data[i + 3] = 255);
        g.putImageData(d, 0, 0);
      }
    });
    const tvLight = K.light(0x99bbff, 1.5, 3, 3.75, 1.3, 0.8);
    K.box(0.62, 0.12, 0.42, K.phong(0x9a9ca6, 50), 3.75, 0.96, -0.3);
    K.box(0.18, 0.05, 0.12, K.phong(0x3b3b44), 3.3, 0.92, 0.0, 0.4);
    const gameCovers = covers(ctx, 10, 3);
    gameCovers.forEach((u, i) => K.box(0.03, 0.22, 0.16, K.cover(u), 3.1 + i * 0.045, 0.2, -0.3 + (i % 2) * 0.02));
    // floating shelf of VHS / game boxes
    K.box(2.5, 0.06, 0.4, K.phong(0x2b1a10, 20), 3.25, 4.2, -0.5);
    for (let i = 0; i < 16; i++) {
      const h = 0.28 + r() * 0.14;
      K.box(0.11, h, 0.26, K.lambert(new THREE.Color().setHSL(r(), 0.7, 0.45)), 2.15 + i * 0.13, 4.23 + h / 2, -0.5);
    }

    // string lights
    const bulbs = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = -5.6 + t * 11.2;
      const y = 5.75 - Math.sin(t * Math.PI * 3) ** 2 * 0.3;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(x, y, -0.6);
      m.userData.h = (i * 0.17) % 1;
      group.add(m);
      bulbs.push(m);
    }

    // floor clutter, rug, bed corner
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), K.lambert(0xffffff, { map: K.tex(patternCanvas(5, '#2a0f4a', ['#ff4fd8', '#7ef9ff', '#ffe14d'], 80)) }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, 1.5);
    group.add(rug);
    const clutter = covers(ctx, 12, 9);
    clutter.forEach((u, i) => {
      const side = i % 2 ? 1 : -1;
      const m = K.box(0.34, 0.025, 0.3, K.cover(u), side * (1.7 + r() * 2.2), 0.015 + i * 0.002, 0.7 + r() * 2.2, r() * Math.PI);
      m.material.side = THREE.FrontSide;
    });
    for (let i = 0; i < 3; i++) K.box(0.42, 0.015, 0.56, K.lambert(0xffffff, { map: K.tex(posterCanvas(900 + i)) }), -2.2 + i * 0.25, 0.02 + i * 0.016, 2.6 - i * 0.1, r());
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), K.phong(0xe8661c, 20));
    ball.position.set(2.4, 0.16, 2.3);
    group.add(ball);
    K.box(2.4, 0.55, 1.8, K.lambert(0xffffff, { map: K.tex(patternCanvas(21, '#5b3cc4', ['#2fd3c6', '#ff4fd8', '#ffffff'], 50)) }), -5.0, 0.3, 3.0);
    K.box(0.8, 0.18, 0.5, K.lambert(0xf2e6ff), -4.6, 0.66, 2.5, 0.2);

    return (dt, time, now) => {
      blobs.forEach((b, i) => {
        const p = (time * (0.08 + i * 0.03) + i * 0.27) % 1;
        b.position.set(-4.25 + Math.sin(time + i) * 0.02, 1.33 + Math.sin(p * Math.PI * 2) * 0.2 + 0.2, -0.3);
      });
      lavaLight.intensity = 2.2 + Math.sin(time * 0.7) * 0.4;
      tvAnim(dt);
      tvLight.intensity = 1.2 + Math.random() * 0.4;
      bulbs.forEach((m) => m.material.color.setHSL((m.userData.h + time * 0.03) % 1, 0.9, 0.55 + 0.25 * Math.sin(time * 3 + m.userData.h * 20)));
      if (now.tex && monitor.material.map !== now.tex) {
        monitor.material.map = now.tex;
        monitor.material.color.set(0xd8ffe8);
        monitor.material.needsUpdate = true;
      }
    };
  },
};

const recordStore = {
  id: 'records',
  name: 'Record Store',
  swatch: ['#5a3418', '#ffb347', '#f2ead3'],
  wall: () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#5b3418';
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, 0, 2, 64);
      g.fillStyle = 'rgba(255,200,140,0.08)';
      g.fillRect(x + 4, 0, 6, 64);
    }
    return canvasTexture(c, { nearest: true, repeat: [100, 3] });
  },
  floor: () => canvasTexture(checker('#e9e2d0', '#151515'), { nearest: true, repeat: [100, 8] }),
  ceiling: 0x2a1a10,
  trim: 0x1e120a,
  fog: [0x1a0f08, 10, 30],
  hemi: [0xffd9a8, 0x2a1408, 0.75],
  ambient: [0x6b4a2a, 0.6],
  key: [0xffc070, 15],
  fill: [0xffe0b0, 3],
  sign: ['NOW SPINNING', '#ffb347', '#fff1cf'],
  build(ctx, group, K) {
    const r = rand(77);
    // framed covers on the wall
    const wallCovers = covers(ctx, 18, 12);
    const frameMat = K.phong(0x111111, 60);
    let i = 0;
    for (const [x0, x1] of [
      [-5.4, -1.7],
      [1.7, 5.4],
    ])
      for (let row = 0; row < 3; row++)
        for (let x = x0 + 0.45; x < x1; x += 1.05) {
          const y = 2.45 + row * 1.05;
          K.box(0.86, 0.86, 0.04, frameMat, x, y, -0.69);
          K.plane(0.74, 0.74, K.cover(wallCovers[i++ % wallCovers.length]), x, y, -0.665);
        }
    // neon sign
    const [nc, ng] = canvas(256, 64);
    ng.font = 'bold 44px "Silkscreen", monospace';
    ng.textAlign = 'center';
    ng.textBaseline = 'middle';
    ng.shadowColor = '#ff3b6b';
    ng.shadowBlur = 14;
    ng.fillStyle = '#ffd0dc';
    ng.fillText('RECORDS', 128, 34);
    const sign = K.plane(3, 0.75, new THREE.MeshBasicMaterial({ map: K.tex(nc), transparent: true }), 0, 4.6, -0.6);
    K.light(0xff3b6b, 3, 5, 0, 4.5, 0.2);

    // crates of records on low tables, using your own covers
    const crateCovers = covers(ctx, 40, 31);
    const wood = K.phong(0x8a5a2b, 25);
    let k = 0;
    for (const side of [-1, 1]) {
      const cx = side * 3.5;
      K.box(2.6, 0.06, 1.15, wood, cx, 0.82, 0.25);
      for (const lx of [-1.2, 1.2]) for (const lz of [-0.25, 0.75]) K.box(0.07, 0.82, 0.07, wood, cx + lx, 0.41, 0.25 + lz);
      for (const dx of [-0.62, 0.62]) {
        K.box(1.1, 0.35, 0.05, wood, cx + dx, 1.02, 0.78);
        K.box(1.1, 0.35, 0.05, wood, cx + dx, 1.02, -0.26);
        K.box(0.05, 0.35, 1.05, wood, cx + dx - 0.53, 1.02, 0.26);
        K.box(0.05, 0.35, 1.05, wood, cx + dx + 0.53, 1.02, 0.26);
        for (let j = 0; j < 12; j++) {
          const rec = K.box(0.95, 0.95, 0.012, K.cover(crateCovers[k++ % crateCovers.length]), cx + dx, 1.3, -0.18 + j * 0.08, 0, 0, -0.32 - j * 0.015);
          rec.rotation.order = 'YXZ';
        }
      }
    }
    // listening station: turntable whose platter spins while music plays
    K.box(1.0, 0.75, 0.7, K.phong(0x2a1a10, 30), -1.9, 0.38, 1.6);
    K.box(0.82, 0.1, 0.6, K.phong(0x1b1b1f, 60), -1.9, 0.8, 1.6);
    const platter = new THREE.Group();
    platter.position.set(-1.98, 0.87, 1.6);
    group.add(platter);
    const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 32), K.phong(0x0a0a0a, 120, { specular: 0x555555 }));
    platter.add(vinyl);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 24), K.cover(crateCovers[0]));
    platter.add(label);
    K.box(0.02, 0.02, 0.3, K.phong(0xcfd3dc, 120), -1.7, 0.9, 1.55, 0.3);
    // pendant lamps
    const lamps = [-3.5, 0, 3.5].map((x) => {
      K.cyl(0.01, 0.01, 1.3, K.lambert(0x111111), x, 5.9, 0.6, 4);
      K.cyl(0.08, 0.35, 0.3, K.phong(0x1f3b2a, 40, { side: THREE.DoubleSide }), x, 5.1, 0.6);
      K.cyl(0.07, 0.07, 0.06, K.glow(0xfff0c8), x, 4.95, 0.6, 8);
      return K.light(0xffd08a, 6, 6, x, 4.8, 0.6);
    });
    // a few posters / sale signs
    const [sc, sg] = canvas(128, 64);
    sg.fillStyle = '#ffe14d';
    sg.fillRect(0, 0, 128, 64);
    sg.fillStyle = '#c4161c';
    sg.font = 'bold 30px Impact, sans-serif';
    sg.textAlign = 'center';
    sg.fillText('SALE $9.99', 64, 44);
    K.plane(0.9, 0.45, K.lambert(0xffffff, { map: K.tex(sc) }), 3.5, 1.35, 0.82);
    return (dt, time, now) => {
      if (now.playing) platter.rotation.y -= dt * 3.5;
      lamps.forEach((l, j) => (l.intensity = 5.5 + Math.sin(time * 2 + j) * 0.2));
      sign.material.opacity = 0.9 + Math.sin(time * 9) * 0.05 * (Math.sin(time * 0.7) > 0.95 ? 6 : 1);
    };
  },
};

const arcade = {
  id: 'arcade',
  name: 'Arcade',
  swatch: ['#0a0614', '#ff2bd6', '#2bf5ff'],
  wall: () => {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#0b0716';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,43,214,0.18)';
    g.lineWidth = 2;
    for (let i = -64; i < 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 64, 0);
      g.stroke();
    }
    return canvasTexture(c, { nearest: true, repeat: [100, 5] });
  },
  floor: () => canvasTexture(patternCanvas(99, '#07040e', ['#ff2bd6', '#2bf5ff', '#fff34d', '#7cff4d'], 90), { nearest: true, repeat: [140, 10] }),
  ceiling: 0x06040c,
  trim: 0xff2bd6,
  fog: [0x07040e, 9, 26],
  hemi: [0x6a4cff, 0x200a2a, 0.6],
  ambient: [0x30205a, 0.5],
  key: [0xff8ae8, 9],
  fill: [0x2bf5ff, 7],
  sign: ['INSERT COIN', '#2bf5ff', '#d8fdff'],
  build(ctx, group, K) {
    const games = ['VOID FIGHTER', 'TURBO KART', 'DINO STRIKE', 'PIXEL SAMURAI'];
    const anims = [];
    [-4.6, -2.95, 2.95, 4.6].forEach((x, i) => {
      const hue = [0.85, 0.55, 0.12, 0.3][i];
      const side = new THREE.Color().setHSL(hue, 0.8, 0.35);
      const body = K.phong(0x141018, 40);
      const art = K.phong(side, 30);
      K.box(1.05, 2.0, 0.85, body, x, 1.0, -0.25);
      K.box(0.04, 2.0, 0.86, art, x - 0.54, 1.0, -0.25);
      K.box(0.04, 2.0, 0.86, art, x + 0.54, 1.0, -0.25);
      // screen
      const [c] = canvas(64, 64);
      const t = K.tex(c, { nearest: true });
      const scr = K.plane(0.8, 0.66, new THREE.MeshBasicMaterial({ map: t }), x, 1.48, 0.2);
      scr.rotation.x = -0.22;
      const seed = rand(i + 5);
      const stars = Array.from({ length: 20 }, () => [seed() * 64, seed() * 64]);
      anims.push(
        screenAnimator(t, c, (g, tt, w, h) => {
          g.fillStyle = '#05030a';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#fff';
          stars.forEach((s) => g.fillRect(s[0], (s[1] + tt * 30) % h, 1, 1));
          g.fillStyle = `hsl(${hue * 360},100%,60%)`;
          const px = 32 + Math.sin(tt * 2 + i) * 20;
          g.fillRect(px - 4, 52, 8, 5);
          for (let e = 0; e < 5; e++) g.fillRect(((e * 13 + tt * 18 * (e % 2 ? 1 : -1)) % 64 + 64) % 64, 10 + e * 6, 6, 4);
          g.fillStyle = '#fff';
          g.font = '7px monospace';
          g.fillText(`${String(Math.floor(tt * 130) % 99999).padStart(5, '0')}`, 2, 8);
        }),
      );
      // marquee
      const [mc, mg] = canvas(128, 32);
      mg.fillStyle = '#000';
      mg.fillRect(0, 0, 128, 32);
      mg.font = 'bold 14px "Silkscreen", monospace';
      mg.textAlign = 'center';
      mg.textBaseline = 'middle';
      mg.shadowColor = `hsl(${hue * 360},100%,60%)`;
      mg.shadowBlur = 8;
      mg.fillStyle = `hsl(${hue * 360},100%,75%)`;
      mg.fillText(games[i], 64, 17);
      K.box(1.05, 0.3, 0.3, body, x, 2.12, 0.05);
      K.plane(1.0, 0.26, new THREE.MeshBasicMaterial({ map: K.tex(mc) }), x, 2.12, 0.205);
      // control panel
      const panel = K.box(1.0, 0.08, 0.42, K.phong(0x222028, 30), x, 0.98, 0.32);
      panel.rotation.x = 0.25;
      K.cyl(0.015, 0.015, 0.12, K.phong(0x111111), x - 0.22, 1.08, 0.32, 6);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), K.phong(0xe02020, 60));
      knob.position.set(x - 0.22, 1.15, 0.32);
      group.add(knob);
      for (let b = 0; b < 3; b++) K.cyl(0.035, 0.035, 0.03, K.glow(new THREE.Color().setHSL((hue + b * 0.15) % 1, 1, 0.55)), x + 0.05 + b * 0.12, 1.04, 0.33, 10);
      K.light(side.clone().offsetHSL(0, 0, 0.3), 2.2, 3, x, 1.5, 0.9);
    });
    // neon zigzags + tubes
    const tubes = [];
    const tube = (x1, y1, x2, y2, color) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), new THREE.MeshBasicMaterial({ color }));
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, -0.62);
      m.rotation.z = Math.atan2(x1 - x2, y2 - y1);
      group.add(m);
      tubes.push(m);
    };
    const zig = [-5.4, -4.3, -3.2, -2.1, -1.4];
    for (let j = 0; j < zig.length - 1; j++) tube(zig[j], j % 2 ? 4.2 : 4.9, zig[j + 1], j % 2 ? 4.9 : 4.2, 0xff2bd6);
    for (let j = 0; j < zig.length - 1; j++) tube(-zig[j], j % 2 ? 4.2 : 4.9, -zig[j + 1], j % 2 ? 4.9 : 4.2, 0x2bf5ff);
    tube(-5.6, 3.05, 5.6, 3.05, 0x7b4dff);
    K.light(0xff2bd6, 3, 6, -3.5, 4.5, 0.4);
    K.light(0x2bf5ff, 3, 6, 3.5, 4.5, 0.4);
    return (dt, time) => {
      anims.forEach((a) => a(dt));
      tubes.forEach((m, j) => (m.visible = !(Math.sin(time * 17 + j * 3) > 0.995)));
    };
  },
};

const vapor = {
  id: 'vapor',
  name: 'Vapor Lounge',
  swatch: ['#ff9ad5', '#7df9ff', '#b48cff'],
  wall: () => {
    const [c, g] = canvas(64, 64);
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#b48cff');
    grad.addColorStop(1, '#ff9ad5');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = 0; x < 64; x += 16) {
      g.fillRect(x, 54, 12, 2);
      g.fillRect(x + 10, 54, 2, 8);
      g.fillRect(x + 4, 60, 8, 2);
    }
    return canvasTexture(c, { nearest: true, repeat: [100, 2] });
  },
  floor: () => canvasTexture(checker('#ffb3d9', '#7ee7e0'), { nearest: true, repeat: [100, 8] }),
  ceiling: 0xd9a8ff,
  trim: 0xffffff,
  fog: [0x6b3f8f, 11, 32],
  hemi: [0xffd1f4, 0x6a4cff, 1.0],
  ambient: [0xb48cff, 0.6],
  key: [0xffd1f4, 12],
  fill: [0x7df9ff, 6],
  sign: ['ＶＡＰＯＲ', '#7df9ff', '#ffffff'],
  build(ctx, group, K) {
    // sunset window
    const [c, g] = canvas(256, 128);
    const sky = g.createLinearGradient(0, 0, 0, 80);
    sky.addColorStop(0, '#2b0a5c');
    sky.addColorStop(0.6, '#ff4fa3');
    sky.addColorStop(1, '#ffb347');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 80);
    const sun = g.createLinearGradient(0, 22, 0, 78);
    sun.addColorStop(0, '#ffe14d');
    sun.addColorStop(1, '#ff3b8a');
    g.fillStyle = sun;
    g.beginPath();
    g.arc(128, 78, 46, Math.PI, 0);
    g.fill();
    g.fillStyle = '#ff4fa3';
    for (let i = 0; i < 6; i++) g.fillRect(70, 50 + i * 5 + i * i * 0.5, 116, 1 + i * 0.6);
    g.fillStyle = '#1a0636';
    g.fillRect(0, 80, 256, 48);
    g.strokeStyle = '#ff3be0';
    g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      g.beginPath();
      g.moveTo(128, 80);
      g.lineTo(-256 + i * 48, 128);
      g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const y = 80 + Math.pow(i / 8, 2) * 48;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    // palm silhouettes
    g.fillStyle = '#12052a';
    for (const px of [30, 226]) {
      g.fillRect(px - 2, 30, 4, 50);
      for (let a = 0; a < 7; a++) {
        g.save();
        g.translate(px, 30);
        g.rotate(-Math.PI / 2 + (a - 3) * 0.45);
        g.beginPath();
        g.ellipse(18, 0, 20, 4, 0.3, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    K.plane(11.4, 4.4, new THREE.MeshBasicMaterial({ map: K.tex(c) }), 0, 3.05, -0.66);
    const white = K.phong(0xfdf6ff, 60);
    for (const x of [-5.7, -2.85, 2.85, 5.7]) K.box(0.12, 4.5, 0.14, white, x, 3.05, -0.6);
    K.box(11.6, 0.14, 0.18, white, 0, 5.3, -0.6);
    K.box(11.6, 0.14, 0.18, white, 0, 0.82, -0.6);
    // marble columns
    const marble = K.phong(0xf3eef7, 80, { specular: 0x666666 });
    for (const x of [-2.15, 2.15, -5.0, 5.0]) {
      K.cyl(0.22, 0.25, 4.6, marble, x, 2.3, 0.15, 16);
      K.box(0.62, 0.18, 0.62, marble, x, 4.68, 0.15);
      K.box(0.62, 0.18, 0.62, marble, x, 0.09, 0.15);
    }
    // bust on a pedestal
    K.box(0.62, 1.05, 0.62, marble, -3.55, 0.52, 1.1);
    const bust = new THREE.Group();
    bust.position.set(-3.55, 1.05, 1.1);
    group.add(bust);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), marble);
    shoulders.scale.set(1, 0.6, 0.6);
    bust.add(shoulders);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.25, 12), marble);
    neck.position.y = 0.3;
    bust.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), marble);
    head.scale.set(0.9, 1.15, 1);
    head.position.y = 0.56;
    bust.add(head);
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.04), K.phong(0x111111, 100));
    shades.position.set(0, 0.6, 0.19);
    bust.add(shades);
    // plants
    for (const x of [3.6, -1.6]) {
      K.cyl(0.22, 0.17, 0.42, K.phong(0xffffff, 40), x, 0.21, 1.4, 14);
      for (let a = 0; a < 7; a++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9, 4), K.lambert(0x1f8f6a));
        leaf.position.set(x, 0.78, 1.4);
        leaf.rotation.set(Math.cos(a) * 0.7, a, Math.sin(a) * 0.7);
        group.add(leaf);
      }
    }
    // floating chrome orbs
    const orbs = Array.from({ length: 5 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 3) * 0.06, 20, 14), K.phong(0xe6f6ff, 160, { specular: 0xffffff, emissive: 0x2a1840 }));
      m.userData.p = i * 1.3;
      group.add(m);
      return m;
    });
    K.light(0xff7ad5, 4, 8, 0, 3.0, 1.2);
    return (dt, time) => {
      orbs.forEach((m, i) => m.position.set(Math.cos(time * 0.3 + m.userData.p) * (2.4 + i * 0.4), 3.6 + Math.sin(time * 0.8 + i) * 0.4, 1.2 + Math.sin(time * 0.3 + m.userData.p) * 0.8));
      bust.rotation.y = Math.sin(time * 0.4) * 0.25;
    };
  },
};

export const THEMES = [bedroom, recordStore, arcade, vapor];

/** Owns the jukebox-side set for the active theme. */
export class ThemeSet {
  constructor(scene, room, ctx) {
    this.scene = scene;
    this.room = room;
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.rotation.y = Math.PI;
    scene.add(this.group);
    this.textures = [];
    this.tick = null;
  }

  apply(theme) {
    this.theme = theme;
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.group.clear();
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
    this.room.applyTheme(theme);
    this.tick = theme.build(this.ctx, this.group, kit(this.group, this.textures));
  }

  update(dt, time, x, z, now) {
    this.group.position.set(x, 0, z);
    this.tick?.(dt, time, now);
  }
}
