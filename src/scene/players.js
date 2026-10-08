import * as THREE from 'three';
import { canvas, canvasTexture, requestCover, mediaTex } from '../textures.js';
import { damp, ease, clamp01 } from '../anim.js';
import { Jukebox, JUKE_Z } from './jukebox.js';
import { Beat } from '../beat.js';

// Alternate players for vinyl + cassette modes, sharing the Jukebox interface:
// group, slotWorld, viewTarget, insertY, setX, load, setQueue, update, playing, track, coverTex.

const RACK = 8;
const beatOf = () => Beat.kick;

function base(scene) {
  const group = new THREE.Group();
  group.rotation.y = Math.PI;
  group.position.set(0, 0, JUKE_Z);
  scene.add(group);
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 24, parent = group) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  return { group, box, cyl };
}

function lcd(w, h) {
  const [c] = canvas(256, 48);
  const tex = canvasTexture(c, { nearest: true });
  return { c, tex, mat: new THREE.MeshBasicMaterial({ map: tex }) };
}

function drawLcd(l, text, scroll, fg = '#ffb347', bg = '#1a0d02') {
  const g = l.c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 48);
  g.fillStyle = fg;
  g.font = '24px "VT323", monospace';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + 40;
  const off = -(scroll % w);
  g.fillText(text, off + 8, 25);
  g.fillText(text, off + 8 + w, 25);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < 48; y += 2) g.fillRect(0, y, 256, 1);
  l.tex.needsUpdate = true;
}

// ---------------- turntable console ----------------
export class Turntable {
  constructor(scene) {
    const { group, box, cyl } = base(scene);
    this.group = group;
    const walnut = new THREE.MeshPhongMaterial({ color: 0x6b3a1c, shininess: 50 });
    const dark = new THREE.MeshPhongMaterial({ color: 0x17141a, shininess: 40 });
    const alu = new THREE.MeshPhongMaterial({ color: 0xc9ced8, shininess: 140, specular: 0xffffff });
    const brass = new THREE.MeshPhongMaterial({ color: 0xd6a24a, shininess: 100 });
    const fabric = new THREE.MeshLambertMaterial({ color: 0x3a2a22 });

    // console cabinet on splayed legs
    box(2.7, 0.8, 1.1, walnut, 0, 0.78, 0);
    for (const x of [-1.2, 1.2]) for (const z of [-0.4, 0.4]) {
      const leg = cyl(0.035, 0.025, 0.42, brass, x, 0.2, z, 8);
      leg.rotation.set(z * 0.3, 0, -x * 0.12);
    }
    box(1.2, 0.5, 0.02, fabric, -0.62, 0.78, 0.56);
    // receiver with amber display + VU needles
    box(1.1, 0.5, 0.04, dark, 0.66, 0.78, 0.55);
    this.lcd = lcd();
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), this.lcd.mat);
    disp.position.set(0.66, 0.9, 0.575);
    group.add(disp);
    this.needles = [0.45, 0.87].map((x) => {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
      face.position.set(x, 0.66, 0.575);
      group.add(face);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.13, 0.004), new THREE.MeshBasicMaterial({ color: 0x220000 }));
      n.geometry.translate(0, 0.065, 0);
      n.position.set(x, 0.59, 0.58);
      group.add(n);
      return n;
    });
    // turntable deck
    box(1.5, 0.12, 1.0, walnut, -0.1, 1.24, 0);
    box(1.42, 0.02, 0.92, alu, -0.1, 1.31, 0);
    cyl(0.52, 0.52, 0.05, alu, -0.22, 1.345, 0, 48);
    this.platter = new THREE.Group();
    this.platter.position.set(-0.22, 1.375, 0);
    group.add(this.platter);
    this.recordMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 90, specular: 0x444444 });
    this.record = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.008, 48), [new THREE.MeshPhongMaterial({ color: 0x0b0b0d }), this.recordMat, this.recordMat]);
    this.platter.add(this.record);
    cyl(0.012, 0.012, 0.05, alu, 0, 0.02, 0, 8, this.platter);
    // tonearm: swings from rest onto the record when playing
    cyl(0.07, 0.08, 0.08, alu, 0.48, 1.36, -0.32, 16);
    this.arm = new THREE.Group();
    this.arm.position.set(0.48, 1.42, -0.32);
    group.add(this.arm);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 8), alu);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, 0, 0.33);
    this.arm.add(rod);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.1), dark);
    head.position.set(-0.02, -0.02, 0.68);
    this.arm.add(head);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12), alu);
    cw.rotation.x = Math.PI / 2;
    cw.position.z = -0.08;
    this.arm.add(cw);
    this.armAngle = 0.5;
    // smoked dust cover, open
    const lid = box(1.46, 0.02, 0.96, new THREE.MeshPhongMaterial({ color: 0x223344, transparent: true, opacity: 0.25, shininess: 150, specular: 0xffffff, depthWrite: false }), -0.1, 1.72, -0.72, -1.15);
    lid.renderOrder = 2;

    // speakers with pumping woofers
    this.woofers = [];
    for (const x of [-1.72, 1.72]) {
      box(0.72, 1.55, 0.6, walnut, x, 0.8, -0.05);
      box(0.62, 1.45, 0.02, fabric, x, 0.8, 0.26);
      const w = cyl(0.24, 0.24, 0.06, dark, x, 0.62, 0.3, 28);
      w.rotation.x = Math.PI / 2;
      const cone = cyl(0.04, 0.2, 0.08, new THREE.MeshPhongMaterial({ color: 0x2a2a30, shininess: 20 }), x, 0.62, 0.34, 24);
      cone.rotation.x = -Math.PI / 2;
      this.woofers.push(cone);
      const tw = cyl(0.07, 0.07, 0.04, alu, x, 1.22, 0.29, 16);
      tw.rotation.x = Math.PI / 2;
    }
    this.light = new THREE.PointLight(0xffb347, 2.5, 6, 1.6);
    this.light.position.set(0, 1.8, 1.4);
    group.add(this.light);

    // crate of upcoming records (the queue)
    const crate = new THREE.MeshPhongMaterial({ color: 0x9a6a3a, shininess: 15 });
    const cx = 1.2,
      cz = 1.25;
    box(0.82, 0.04, 0.78, crate, cx, 0.02, cz);
    box(0.82, 0.42, 0.04, crate, cx, 0.21, cz - 0.38);
    box(0.82, 0.42, 0.04, crate, cx, 0.21, cz + 0.38);
    box(0.04, 0.42, 0.78, crate, cx - 0.4, 0.21, cz);
    box(0.04, 0.42, 0.78, crate, cx + 0.4, 0.21, cz);
    this.crate = { x: cx, z: cz };
    this.rack = new Map();
    this.spin = 0;
    this.spinSpeed = 0;
    this.recordIn = 0;
    this.scroll = 0;
    this.insertY = 0.62;
  }
  get slotWorld() {
    return this.group.localToWorld(new THREE.Vector3(-0.22, 1.4, 0));
  }
  get viewTarget() {
    return this.group.localToWorld(new THREE.Vector3(0, 1.35, 0));
  }
  setX(x) {
    this.group.position.x = x;
  }
  load(track) {
    this.track = track;
    this.recordIn = 0;
    requestCover(track.coverUrl, (e) => {
      this.coverTex = e.tex;
      this.recordMat.map = mediaTex(e, 'vinyl');
      this.recordMat.color.set(0xffffff);
      this.recordMat.needsUpdate = true;
    });
  }
  setQueue(tracks) {
    const list = tracks.slice(0, RACK);
    const keep = new Set();
    list.forEach((t, i) => {
      const key = t.qid ?? `${t.id}#${i}`;
      keep.add(key);
      let m = this.rack.get(key);
      if (!m) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        m = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.02), [mat, mat, mat, mat, mat, mat]);
        requestCover(t.coverUrl, (e) => {
          mat.map = e.tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        });
        m.userData = { drop: 0, delay: i * 0.08 };
        this.rack.set(key, m);
        this.group.add(m);
      }
      m.userData.slot = i;
    });
    for (const [k, m] of this.rack) if (!keep.has(k)) (m.removeFromParent(), this.rack.delete(k));
  }
  update(dt, time) {
    const beat = beatOf(this.playing, time);
    this.spinSpeed = damp(this.spinSpeed, this.playing ? 3.5 : 0, this.playing ? 3 : 1.2, dt);
    this.spin += this.spinSpeed * dt;
    this.platter.rotation.y = -this.spin;
    this.recordIn = clamp01(this.recordIn + dt * 3);
    const show = this.track ? ease.outBack(this.recordIn) : 0;
    this.record.visible = !!this.track;
    this.record.position.y = (1 - show) * 0.25;
    this.armAngle = damp(this.armAngle, this.playing ? 0.12 + 0.05 * (this.spin % 60) / 60 : 0.55, 2.5, dt);
    this.arm.rotation.y = -Math.PI * 0.08 - this.armAngle;
    this.woofers.forEach((w) => (w.position.z = 0.34 + beat * 0.035));
    this.needles.forEach((n, i) => (n.rotation.z = -0.7 + (this.playing ? 0.5 + beat * 0.6 + Math.sin(time * (7 + i)) * 0.12 : 0)));
    this.light.intensity = 2 + beat * 2;
    for (const m of this.rack.values()) {
      const u = m.userData;
      if (u.delay > 0) (u.delay -= dt), (m.visible = false);
      else (u.drop = clamp01(u.drop + dt * 3)), (m.visible = true);
      const d = 1 - ease.outBack(u.drop);
      m.position.set(this.crate.x, 0.42 + d * 1.2, damp(m.position.z || this.crate.z, this.crate.z + 0.26 - u.slot * 0.075, 8, dt));
      m.rotation.set(-0.28, 0, 0);
    }
    this.scroll += dt * 40;
    if ((this._t = (this._t || 0) + dt) > 0.08) {
      this._t = 0;
      drawLcd(this.lcd, this.track ? `${this.track.name}  —  ${this.track.artists}   33⅓ RPM` : 'DROP THE NEEDLE…', this.scroll);
    }
  }
}

// ---------------- boombox ----------------
export class Boombox {
  constructor(scene) {
    const { group, box, cyl } = base(scene);
    this.group = group;
    const black = new THREE.MeshPhongMaterial({ color: 0x18181d, shininess: 50 });
    const silver = new THREE.MeshPhongMaterial({ color: 0xb8bdc8, shininess: 120, specular: 0xffffff });
    const grille = new THREE.MeshPhongMaterial({ color: 0x2a2a30, shininess: 10 });
    const accent = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
    this.accent = accent;

    // stand
    box(3.4, 0.62, 1.0, new THREE.MeshPhongMaterial({ color: 0x3a2a4a, shininess: 20 }), 0, 0.31, 0);
    // body
    box(3.1, 1.55, 0.72, black, 0, 1.42, 0);
    box(3.12, 0.06, 0.74, silver, 0, 2.2, 0);
    box(3.12, 0.06, 0.74, silver, 0, 0.64, 0);
    box(3.0, 0.02, 0.02, accent, 0, 2.12, 0.37);
    // handle
    for (const x of [-1.1, 1.1]) box(0.08, 0.38, 0.12, silver, x, 2.4, 0);
    box(2.3, 0.08, 0.14, silver, 0, 2.58, 0);
    // antenna
    const ant = cyl(0.012, 0.012, 1.6, silver, 1.3, 3.0, -0.15, 6);
    ant.rotation.z = -0.5;
    // speakers
    this.cones = [];
    for (const x of [-0.98, 0.98]) {
      const ring = cyl(0.5, 0.5, 0.05, silver, x, 1.38, 0.36, 36);
      ring.rotation.x = Math.PI / 2;
      const g = cyl(0.46, 0.46, 0.04, grille, x, 1.38, 0.38, 36);
      g.rotation.x = Math.PI / 2;
      const cone = cyl(0.08, 0.36, 0.12, new THREE.MeshPhongMaterial({ color: 0x0e0e12, shininess: 30 }), x, 1.38, 0.42, 32);
      cone.rotation.x = -Math.PI / 2;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), silver);
      dome.rotation.x = Math.PI / 2;
      dome.position.set(x, 1.38, 0.47);
      group.add(dome);
      this.cones.push(cone, dome);
    }
    // cassette deck window with the tape + spinning reels
    box(0.84, 0.6, 0.04, silver, 0, 1.3, 0.36);
    this.tapeMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.tape = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.45), this.tapeMat);
    this.tape.position.set(0, 1.3, 0.385);
    group.add(this.tape);
    this.reels = [-0.084, 0.084].map((x) => {
      const r = new THREE.Group();
      r.position.set(x, 1.3 - 0.138, 0.39);
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.004), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        s.rotation.z = (k * Math.PI) / 3;
        r.add(s);
      }
      group.add(r);
      return r;
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.5), new THREE.MeshPhongMaterial({ color: 0x99bbff, transparent: true, opacity: 0.12, shininess: 200, specular: 0xffffff, depthWrite: false }));
    glass.position.set(0, 1.3, 0.4);
    group.add(glass);
    // EQ bars + LCD
    const [ec] = canvas(64, 24);
    this.eq = { c: ec, tex: canvasTexture(ec, { nearest: true }) };
    const eqm = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.24), new THREE.MeshBasicMaterial({ map: this.eq.tex }));
    eqm.position.set(0, 1.83, 0.365);
    group.add(eqm);
    this.lcd = lcd();
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.13), this.lcd.mat);
    disp.position.set(0, 1.98, 0.365);
    group.add(disp);
    // piano keys + top tape slot
    for (let i = 0; i < 6; i++) box(0.14, 0.05, 0.16, i === 1 ? accent : silver, -0.42 + i * 0.17, 2.25, 0.2);
    box(1.0, 0.03, 0.12, new THREE.MeshLambertMaterial({ color: 0x050505 }), 0, 2.235, -0.12);
    this.light = new THREE.PointLight(0xff4fd8, 2.5, 6, 1.6);
    this.light.position.set(0, 1.5, 1.6);
    group.add(this.light);

    this.stack = new Map();
    this.spin = 0;
    this.speed = 0;
    this.scroll = 0;
    this.insertY = -0.2;
  }
  get slotWorld() {
    return this.group.localToWorld(new THREE.Vector3(0, 2.24, -0.12));
  }
  get viewTarget() {
    return this.group.localToWorld(new THREE.Vector3(0, 1.4, 0));
  }
  setX(x) {
    this.group.position.x = x;
  }
  load(track) {
    this.track = track;
    requestCover(track.coverUrl, (e) => {
      this.coverTex = e.tex;
      this.tapeMat.map = mediaTex(e, 'tape');
      this.tapeMat.color.set(0xffffff);
      this.tapeMat.needsUpdate = true;
      this.accent.color.copy(e.color).offsetHSL(0, 0.3, 0.15);
    });
  }
  setQueue(tracks) {
    const list = tracks.slice(0, RACK);
    const keep = new Set();
    list.forEach((t, i) => {
      const key = t.qid ?? `${t.id}#${i}`;
      keep.add(key);
      let m = this.stack.get(key);
      if (!m) {
        const top = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const edge = new THREE.MeshPhongMaterial({ color: 0xa8b0c4, shininess: 90 });
        m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.11, 0.42), [edge, edge, top, edge, top, edge]);
        requestCover(t.coverUrl, (e) => {
          top.map = e.tex;
          top.color.set(0xffffff);
          top.needsUpdate = true;
        });
        m.userData = { drop: 0, delay: i * 0.08, rot: (Math.random() - 0.5) * 0.3 };
        this.stack.set(key, m);
        this.group.add(m);
      }
      m.userData.slot = i;
    });
    for (const [k, m] of this.stack) if (!keep.has(k)) (m.removeFromParent(), this.stack.delete(k));
  }
  update(dt, time) {
    const beat = beatOf(this.playing, time);
    this.speed = damp(this.speed, this.playing ? 4 : 0, 3, dt);
    this.spin += this.speed * dt;
    this.reels.forEach((r) => (r.rotation.z = -this.spin));
    this.tape.visible = !!this.track;
    this.cones.forEach((c) => (c.scale.z = c.scale.y = 1 + beat * 0.12));
    this.light.intensity = 2 + beat * 2.5;
    // tape stack: front of the stand, next one on top
    const n = this.stack.size;
    for (const m of this.stack.values()) {
      const u = m.userData;
      if (u.delay > 0) (u.delay -= dt), (m.visible = false);
      else (u.drop = clamp01(u.drop + dt * 3)), (m.visible = true);
      const d = 1 - ease.outBack(u.drop);
      const level = n - 1 - u.slot;
      m.position.set(-1.2, 0.68 + level * 0.115 + d * 1.2, 0.85);
      m.rotation.set(0, u.rot, 0);
    }
    this.scroll += dt * 40;
    if ((this._t = (this._t || 0) + dt) > 0.07) {
      this._t = 0;
      const g = this.eq.c.getContext('2d');
      g.fillStyle = '#05030a';
      g.fillRect(0, 0, 64, 24);
      for (let i = 0; i < 16; i++) {
        const h = this.playing ? Math.max(1, Math.round((Math.sin(time * (3 + i * 0.7)) * 0.5 + 0.5) * 10 * (0.4 + beat) + Math.random() * 4)) : 1;
        for (let y = 0; y < h; y++) {
          g.fillStyle = y > 9 ? '#ff3b5c' : y > 6 ? '#ffe14d' : '#4dffb5';
          g.fillRect(2 + i * 4, 22 - y * 2, 3, 1);
        }
      }
      this.eq.tex.needsUpdate = true;
      drawLcd(this.lcd, this.track ? `▶ ${this.track.name} — ${this.track.artists}` : 'INSERT TAPE', this.scroll, '#7ef9ff', '#03121a');
    }
  }
}

/** Holds all three players and forwards to the one for the current media mode. */
export class Station {
  constructor(scene) {
    this.players = { cd: new Jukebox(scene), vinyl: new Turntable(scene), tape: new Boombox(scene) };
    this.mode = 'cd';
    this._playing = false;
    this.setMode('cd');
  }
  get active() {
    return this.players[this.mode];
  }
  setMode(mode) {
    const prev = this.active;
    this.mode = mode;
    for (const [k, p] of Object.entries(this.players)) p.group.visible = k === mode;
    const p = this.active;
    p.setX(prev.group.position.x);
    p.playing = this._playing;
    if (this.track && p.track?.id !== this.track.id) p.load(this.track);
    if (this.queue) p.setQueue(this.queue);
  }
  get group() {
    return this.active.group;
  }
  get slotWorld() {
    return this.active.slotWorld;
  }
  get viewTarget() {
    return this.active.viewTarget;
  }
  get insertY() {
    return this.active.insertY ?? -0.15;
  }
  get coverTex() {
    return this.active.coverTex;
  }
  get playing() {
    return this._playing;
  }
  set playing(v) {
    this._playing = v;
    this.active.playing = v;
  }
  get track() {
    return this._track;
  }
  set track(t) {
    this._track = t;
  }
  setX(x) {
    this.active.setX(x);
  }
  load(track) {
    this._track = track;
    this.active.load(track);
  }
  setQueue(list) {
    this.queue = list;
    this.active.setQueue(list);
  }
  update(dt, time) {
    this.active.update(dt, time);
  }
}
