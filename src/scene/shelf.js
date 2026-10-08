import * as THREE from 'three';
import { requestCover, releaseCover, mediaTex, drawCdSpine, drawBinderSpine, canvas, canvasTexture, woodTexture } from '../textures.js';
import { smooth, damp, clamp01, ease } from '../anim.js';

export const ROWS = 3;
export const ROW_H = 1.62;
export const BASE_Y = 0.35;

// media: what slides out (disc / vinyl record / cassette). grip: center -> top edge the robot pinches.
export const KINDS = {
  cd: { W: 1.42, H: 1.25, D: 0.13, gap: 0.012, spine: [48, 384], draw: drawCdSpine, media: 'cd', grip: 0.5, slide: 'x' },
  vinyl: { W: 1.42, H: 1.42, D: 0.07, gap: 0.008, spine: [32, 384], draw: drawCdSpine, media: 'vinyl', grip: 0.56, slide: 'x' },
  tape: { W: 1.2, H: 0.78, D: 0.2, gap: 0.016, spine: [64, 256], draw: drawCdSpine, media: 'tape', grip: 0.26, slide: 'y' },
  binder: { W: 1.3, H: 1.42, D: 0.36, gap: 0.03, spine: [96, 384], draw: drawBinderSpine, media: 'cd', grip: 0.5, slide: 'x' },
};

const shared = {
  geo: {},
  discGeo: new THREE.CylinderGeometry(0.56, 0.56, 0.012, 40),
  vinylGeo: new THREE.CylinderGeometry(0.62, 0.62, 0.008, 48),
  tapeGeo: new THREE.BoxGeometry(0.95, 0.6, 0.09),
  sleeveEdge: new THREE.MeshLambertMaterial({ color: 0xd9d0b8 }),
  vinylEdge: new THREE.MeshPhongMaterial({ color: 0x0b0b0d, shininess: 90 }),
  tapeShell: new THREE.MeshPhongMaterial({ color: 0x1c1c22, shininess: 40 }),
  edge: new THREE.MeshPhongMaterial({ color: 0xa8b0c4, shininess: 90, specular: 0x666677 }),
  back: new THREE.MeshLambertMaterial({ color: 0x15141c }),
  binderEdge: new THREE.MeshLambertMaterial({ color: 0xe8e1cc }),
  discRim: new THREE.MeshPhongMaterial({ color: 0xc8ccd8, shininess: 120 }),
  discBack: new THREE.MeshPhongMaterial({ color: 0x8a92a6, shininess: 90, specular: 0x555566 }),
  glare: new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, shininess: 160, specular: 0xffffff, depthWrite: false }),
};
const geoFor = (kind) => (shared.geo[kind] ||= new THREE.BoxGeometry(KINDS[kind].W, KINDS[kind].H, KINDS[kind].D));

class Case {
  constructor(item, index, kind) {
    const k = KINDS[kind];
    this.item = item;
    this.index = index;
    this.kind = kind;
    this.k = k;
    this.pop = 0;
    this.target = 0;
    this.appear = 0;
    this.appearDelay = 0;
    this.discOut = 0;
    this.spin = Math.random() * 6;
    this.playing = false;
    this.hideDisc = false;

    const [sc] = canvas(...k.spine);
    this.spineCanvas = sc;
    k.draw(sc, item, null, null);
    this.spineTex = canvasTexture(sc);
    this.spineMat = new THREE.MeshLambertMaterial({ map: this.spineTex, emissive: 0x000000 });
    this.coverMat = new THREE.MeshPhongMaterial({ color: 0x2a2833, shininess: 70, specular: 0x333344 });
    const edge = kind === 'cd' || kind === 'tape' ? shared.edge : kind === 'vinyl' ? shared.sleeveEdge : shared.binderEdge;
    // Box material order: +x, -x, +y, -y, +z, -z. Spine is -x, cover is +z.
    this.body = new THREE.Mesh(geoFor(kind), [edge, this.spineMat, edge, edge, this.coverMat, shared.back]);
    this.body.userData.case = this;

    this.group = new THREE.Group();
    this.group.add(this.body);

    this.discMat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 60, specular: 0x2a2a33 });
    this.discHolder = new THREE.Group();
    this.media = k.media;
    if (k.media === 'tape') {
      this.disc = new THREE.Mesh(shared.tapeGeo, [shared.tapeShell, shared.tapeShell, shared.tapeShell, shared.tapeShell, this.discMat, shared.tapeShell]);
    } else {
      this.discHolder.rotation.x = Math.PI / 2;
      this.disc =
        k.media === 'vinyl'
          ? new THREE.Mesh(shared.vinylGeo, [shared.vinylEdge, this.discMat, shared.vinylEdge])
          : new THREE.Mesh(shared.discGeo, [shared.discRim, this.discMat, shared.discBack]);
    }
    this.discHolder.add(this.disc);
    this.discHolder.visible = false;
    this.group.add(this.discHolder);

    requestCover(
      item.coverUrl,
      (e) => {
        this.cover = e;
        this.coverMat.map = e.tex;
        this.coverMat.color.set(0xffffff);
        this.coverMat.needsUpdate = true;
        this.discMat.map = mediaTex(e, k.media);
        this.discMat.color.set(0xffffff);
        this.discMat.needsUpdate = true;
        k.draw(this.spineCanvas, item, e.color, kind === 'binder' ? e.image : null);
        this.spineTex.needsUpdate = true;
      },
      this,
    );
  }

  get worldX() {
    return this.home.x;
  }

  /** Returns true while still animating. */
  update(dt, camX, camZ) {
    const k = this.k;
    const target = this.playing ? Math.max(this.target, 0.16) : this.target;
    this.pop = Math.abs(target - this.pop) < 0.001 ? target : damp(this.pop, target, 17, dt);
    this.appear = clamp01(this.appear + (this.appearDelay > 0 ? 0 : dt * 2.6));
    this.appearDelay -= dt;

    const p = this.pop;
    const out = smooth(0, 0.45, p) * (k.W / 2 + 0.38);
    const turn = smooth(0.22, 1, p);
    const g = this.group;
    const drop = 1 - ease.outBack(this.appear);
    g.position.set(this.home.x, this.home.y + p * 0.1 + drop * 1.4, this.home.z + out);
    const face = Math.atan2(camX - this.home.x, camZ - g.position.z) * 0.6;
    g.rotation.set(-drop * 0.6, Math.PI / 2 + (face - Math.PI / 2) * turn, 0);

    // the disc slides out of the open side and spins while it is visible
    const slide = smooth(0.62, 1, p);
    this.discOut = this.hideDisc ? damp(this.discOut, 0, 20, dt) : slide;
    this.discHolder.visible = this.discOut > 0.01 && !this.hideDisc;
    if (k.slide === 'y') this.discHolder.position.set(0, this.discOut * k.H * 0.75, 0);
    else this.discHolder.position.set(this.discOut * (k.W * (k.media === 'vinyl' ? 0.55 : 0.62)), 0, 0);
    if (k.media !== 'tape') {
      this.spin += dt * (k.media === 'vinyl' ? 1.5 + this.discOut * 3.5 : 2 + this.discOut * 9);
      this.disc.rotation.y = this.spin;
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      this.spineMat.emissive.setRGB(this.flash, this.flash * 0.3, this.flash * 0.85);
      this.group.position.z += Math.sin(this.flash * Math.PI) * 0.25;
    } else if (this.playing) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
      this.spineMat.emissive.setRGB(0.15 + pulse * 0.2, 0.35 * pulse, 0.45 + 0.35 * pulse);
    } else if (this.spineMat.emissive.r > 0) this.spineMat.emissive.setRGB(0, 0, 0);

    return this.flash > 0 || this.playing || Math.abs(target - this.pop) > 0.001 || this.appear < 1 || this.discOut > 0.01;
  }

  /** World position of the disc center (after it slides out). */
  discWorld(v = new THREE.Vector3()) {
    return this.discHolder.getWorldPosition(v);
  }

  dispose() {
    releaseCover(this.item.coverUrl);
    this.spineTex.dispose();
    this.spineMat.dispose();
    this.coverMat.dispose();
    this.discMat.dispose();
  }
}

export class Shelf {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.live = new Map(); // index -> Case, only cases near the camera exist
    this.active = new Set();
    this.hovered = -1;
    this.playingId = null;
    this.glare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shared.glare);
    this.wood = woodTexture(1);
    this.furniture = new THREE.Group();
    this.group.add(this.furniture);
    this.built = 0;
  }

  get cases() {
    return [...this.live.values()];
  }

  clear() {
    for (const c of this.live.values()) this.drop(c);
    this.live.clear();
    this.active.clear();
    this.hovered = -1;
    this.glare.removeFromParent();
    this.furniture.traverse((o) => o.geometry?.dispose());
    this.furniture.clear();
  }

  drop(c) {
    c.group.removeFromParent();
    c.dispose();
    this.active.delete(c);
  }

  build(items, kind) {
    this.clear();
    this.filter = null;
    this.items = items;
    this.kind = kind;
    this.built = performance.now();
    const k = (this.k = KINDS[kind]);
    const slot = k.D + k.gap;
    const perRow = (this.perRow = Math.max(4, Math.ceil(items.length / ROWS)));
    const bay = 30; // slots per bookcase bay, with a divider between bays
    this.xOf = (col) => col * slot + Math.floor(col / bay) * 0.12;
    this.length = this.xOf(perRow - 1) + slot + 0.6;
    this.minX = 0;
    this.maxX = this.length;

    // furniture
    const F = this.furniture;
    const woodMat = new THREE.MeshLambertMaterial({ map: this.wood });
    this.wood.repeat.set(this.length / 2, 1);
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x2a160c });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const W = this.length + 0.3;
    for (let r = 0; r <= ROWS; r++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 1.75), woodMat);
      plank.position.set(this.length / 2, BASE_Y + r * ROW_H, -0.05);
      F.add(plank);
      if (r > 0) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(W, 0.015, 0.02), ledMat);
        led.position.set(this.length / 2, BASE_Y + r * ROW_H - 0.05, 0.78);
        F.add(led);
      }
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, ROWS * ROW_H + 0.08, 0.06), darkWood);
    back.position.set(this.length / 2, BASE_Y + (ROWS * ROW_H) / 2, -0.9);
    F.add(back);
    const sideGeo = new THREE.BoxGeometry(0.1, ROWS * ROW_H + 0.08, 1.8);
    const addSide = (x) => {
      const s = new THREE.Mesh(sideGeo, woodMat);
      s.position.set(x, BASE_Y + (ROWS * ROW_H) / 2, -0.05);
      F.add(s);
    };
    addSide(0.15);
    addSide(this.length + 0.15);
    for (let col = bay; col < perRow; col += bay) addSide(0.3 + this.xOf(col) - 0.08);
    F.add(this.label(kind === 'cd' ? `${items.length} DISCS` : 'PLAYLISTS', 0.6, BASE_Y + ROWS * ROW_H + 0.12));
  }

  homeOf(i) {
    const row = Math.floor(i / this.perRow);
    const col = i % this.perRow;
    return { row, col, pos: new THREE.Vector3(0.3 + this.xOf(col) + this.k.D / 2, BASE_Y + (ROWS - 1 - row) * ROW_H + this.k.H / 2 + 0.04, 0) };
  }

  xOfIndex(i) {
    return this.homeOf(i).pos.x;
  }

  /** Create cases inside [x0, x1], destroy ones far outside it. */
  window(x0, x1) {
    if (!this.items.length) return;
    const fresh = performance.now() - this.built < 1500;
    for (const [i, c] of this.live) {
      if ((c.home.x < x0 - 3 || c.home.x > x1 + 3) && i !== this.hovered && !c.locked) {
        this.drop(c);
        this.live.delete(i);
      }
    }
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < this.perRow; col++) {
        const x = 0.3 + this.xOf(col);
        if (x < x0 || x > x1) continue;
        const i = row * this.perRow + col;
        if (i >= this.items.length || this.live.has(i)) continue;
        const c = new Case(this.items[i], i, this.kind);
        const h = this.homeOf(i);
        c.row = h.row;
        c.col = h.col;
        c.home = h.pos;
        if (fresh) c.appearDelay = Math.max(0, (x - x0) * 0.09) + row * 0.08;
        else c.appear = 1;
        c.playing = c.hideDisc = this.items[i].id === this.playingId;
        this.live.set(i, c);
        this.applyFilter(c);
        this.group.add(c.group);
        this.active.add(c);
      }
    }
  }

  /** Hovered item's case may only exist once the camera gets there; apply the hover then. */
  retryHover() {
    if (this.hoverApplied || !this.live.has(this.hovered)) return;
    const h = this.hovered;
    this.hovered = -1;
    this.setHovered(h);
  }

  label(text, x, y) {
    const [c, g] = canvas(256, 48);
    g.fillStyle = '#e9e1c8';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#2a2040';
    g.font = 'bold 26px "Silkscreen", monospace';
    g.textBaseline = 'middle';
    g.fillText(text, 12, 26);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.22), new THREE.MeshLambertMaterial({ map: canvasTexture(c) }));
    m.position.set(x + 0.6, y, 0.84);
    return m;
  }

  setHovered(i) {
    if (i === this.hovered) return;
    const prev = this.hovered;
    this.hovered = i;
    const touch = (idx, val) => {
      const c = this.live.get(idx);
      if (!c) return;
      c.target = val;
      this.active.add(c);
    };
    if (prev >= 0) [prev - 1, prev, prev + 1].forEach((j) => touch(j, 0));
    const c = this.live.get(i);
    this.hoverApplied = !!c || i < 0;
    if (c) {
      [i - 1, i + 1].forEach((j) => this.live.get(j)?.row === c.row && touch(j, 0.12));
      touch(i, 1);
      c.group.add(this.glare);
      this.glare.scale.set(c.k.W * 0.98, c.k.H * 0.98, 1);
      this.glare.position.set(0, 0, c.k.D / 2 + 0.004);
    } else this.glare.removeFromParent();
  }

  /** Dim every case that isn't in the set (null clears the filter). */
  setFilter(set) {
    this.filter = set;
    for (const c of this.live.values()) this.applyFilter(c);
  }

  applyFilter(c) {
    const dim = this.filter && !this.filter.has(c.index);
    c.spineMat.color.setScalar(dim ? 0.16 : 1);
  }

  setPlaying(id) {
    this.playingId = id;
    for (const c of this.live.values()) {
      const p = c.item.id === id;
      if (p !== c.playing) {
        c.playing = p;
        c.hideDisc = p;
        this.active.add(c);
      }
    }
  }

  update(dt, camera) {
    for (const c of this.active) if (!c.update(dt, camera.position.x, camera.position.z)) this.active.delete(c);
  }

  /** Item whose shelf slot contains world point (x, y). Ignores where popped cases currently are. */
  indexAt(x, y) {
    if (!this.items.length) return -1;
    const rowFromBottom = Math.floor((y - BASE_Y) / ROW_H);
    const row = ROWS - 1 - rowFromBottom;
    if (row < 0 || row >= ROWS) return -1;
    const slot = this.k.D + this.k.gap;
    let lo = 0,
      hi = this.perRow - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (0.3 + this.xOf(mid) <= x) lo = mid;
      else hi = mid - 1;
    }
    const left = 0.3 + this.xOf(lo);
    if (x < left - 0.02 || x > left + slot + 0.02) return -1;
    const i = row * this.perRow + lo;
    return i < this.items.length ? i : -1;
  }

  /** Index of the item closest to x on a given row, used for keyboard skimming. */
  indexNear(x, row) {
    let best = -1,
      bd = Infinity;
    for (let col = 0; col < this.perRow; col++) {
      const i = row * this.perRow + col;
      if (i >= this.items.length) break;
      const d = Math.abs(0.3 + this.xOf(col) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
}
