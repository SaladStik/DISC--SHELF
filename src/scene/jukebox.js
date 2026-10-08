import * as THREE from 'three';
import { canvas, canvasTexture, grilleTexture, requestCover } from '../textures.js';
import { damp, ease, clamp01 } from '../anim.js';
import { Beat } from '../beat.js';

export const JUKE_Z = 9.6;
const RACK_SLOTS = 8;
const discGeo = new THREE.CylinderGeometry(1, 1, 0.012, 40);
const rimMat = new THREE.MeshPhongMaterial({ color: 0xc8ccd8, shininess: 120 });
const backMat = new THREE.MeshPhongMaterial({ color: 0x8a92a6, shininess: 90, specular: 0x555566 });

function makeDisc(r) {
  const mat = new THREE.MeshPhongMaterial({ color: 0x999999, shininess: 60, specular: 0x222230, emissive: 0xffffff, emissiveIntensity: 0.18 });
  const holder = new THREE.Group();
  const disc = new THREE.Mesh(discGeo, [rimMat, mat, backMat]);
  disc.scale.set(r, 1, r);
  disc.rotation.x = Math.PI / 2;
  holder.add(disc);
  holder.userData = { disc, mat };
  return holder;
}
function setDiscCover(holder, url) {
  requestCover(url, (e) => {
    holder.userData.mat.map = e.disc;
    holder.userData.mat.color.set(0xd8d8d8);
    holder.userData.mat.emissiveMap = e.disc;
    holder.userData.mat.needsUpdate = true;
  });
}

export class Jukebox {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.y = Math.PI; // faces the shelf (-z)
    this.group.position.set(0, 0, JUKE_Z);
    scene.add(this.group);
    const G = this.group;

    const body = new THREE.MeshPhongMaterial({ color: 0x6b1530, shininess: 60, specular: 0x442233 });
    const cream = new THREE.MeshPhongMaterial({ color: 0xf0e2c0, shininess: 40 });
    const chrome = new THREE.MeshPhongMaterial({ color: 0xdfe4ee, shininess: 160, specular: 0xffffff });
    const black = new THREE.MeshLambertMaterial({ color: 0x0a0812 });

    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      G.add(m);
      return m;
    };

    box(2.6, 0.2, 1.2, chrome, 0, 0.1, 0); // plinth
    box(2.4, 1.85, 1.0, body, 0, 1.12, 0);
    box(2.44, 0.08, 1.04, chrome, 0, 2.06, 0);
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.0, 36, 1, false, Math.PI / 2, Math.PI), cream);
    arch.rotation.x = Math.PI / 2;
    arch.position.set(0, 2.1, 0);
    G.add(arch);

    // speaker grille in the arch
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.98, 36, 0, Math.PI), new THREE.MeshPhongMaterial({ map: grilleTexture(), shininess: 80 }));
    grille.position.set(0, 2.1, 0.505);
    G.add(grille);

    // neon tubes
    this.neons = [];
    const neon = (geo, x, y, z, hue) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(x, y, z);
      m.userData.hue = hue;
      G.add(m);
      this.neons.push(m);
      return m;
    };
    neon(new THREE.TorusGeometry(1.1, 0.05, 8, 48, Math.PI), 0, 2.1, 0.53, 0.9);
    neon(new THREE.TorusGeometry(0.99, 0.03, 6, 48, Math.PI), 0, 2.1, 0.53, 0.5);
    for (const x of [-1.24, 1.24]) neon(new THREE.CylinderGeometry(0.05, 0.05, 1.85, 8), x, 1.12, 0.48, 0.12);

    // window + queue rack
    box(1.9, 1.05, 0.02, black, 0, 1.38, 0.505);
    for (const [w, h, x, y] of [
      [2.0, 0.06, 0, 1.92],
      [2.0, 0.06, 0, 0.84],
      [0.06, 1.1, -0.98, 1.38],
      [0.06, 1.1, 0.98, 1.38],
    ])
      box(w, h, 0.3, chrome, x, y, 0.62);
    const rail = box(1.8, 0.04, 0.12, chrome, 0, 0.98, 0.6);
    rail.material = chrome;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.05),
      new THREE.MeshPhongMaterial({ color: 0x88aaff, transparent: true, opacity: 0.08, shininess: 200, specular: 0xffffff, depthWrite: false }),
    );
    glass.position.set(0, 1.38, 0.77);
    G.add(glass);
    this.windowLight = new THREE.PointLight(0xff4fd8, 0.5, 3, 2);
    this.windowLight.position.set(0, 1.9, 1.6);
    G.add(this.windowLight);

    // now-playing disc, displayed in front of the grille
    this.nowDisc = makeDisc(0.52);
    this.nowDisc.position.set(0, 2.62, 0.68);
    this.nowDisc.scale.setScalar(0.001);
    G.add(this.nowDisc);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 6, 40), chrome);
    hubRing.position.copy(this.nowDisc.position);
    G.add(hubRing);

    // LCD display
    const [lc] = canvas(256, 40);
    this.lcdCanvas = lc;
    this.lcdTex = canvasTexture(lc, { nearest: true });
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), new THREE.MeshBasicMaterial({ map: this.lcdTex }));
    lcd.position.set(0, 0.55, 0.52);
    G.add(lcd);
    box(1.7, 0.33, 0.04, chrome, 0, 0.55, 0.49);

    // loading hopper on top
    box(1.25, 0.16, 0.34, chrome, 0, 3.32, 0);
    box(1.18, 0.02, 0.04, black, 0, 3.41, 0);
    this.slotLight = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x7ef9ff }));
    this.slotLight.position.set(0, 3.41, 0.16);
    G.add(this.slotLight);

    this.light = new THREE.PointLight(0xff4fd8, 3, 9, 1.6);
    this.light.position.set(0, 1.0, 2.6);
    G.add(this.light);

    this.rack = new Map(); // track id -> holder
    this.spin = 0;
    this.spinSpeed = 0;
    this.nowScale = 0;
    this.track = null;
    this.playing = false;
    this.lcdScroll = 0;
    this.drawLcd();
  }

  get slotWorld() {
    return this.group.localToWorld(new THREE.Vector3(0, 3.41, 0));
  }
  get viewTarget() {
    return this.group.localToWorld(new THREE.Vector3(0, 1.62, 0));
  }

  setX(x) {
    this.group.position.x = x;
  }

  load(track) {
    this.track = track;
    setDiscCover(this.nowDisc, track.coverUrl);
    requestCover(track.coverUrl, (e) => (this.coverTex = e.tex));
    this.nowScale = 0;
    this.drawLcd();
  }

  setQueue(tracks) {
    const list = tracks.slice(0, RACK_SLOTS);
    const keep = new Set();
    list.forEach((t, i) => {
      const key = `${t.id}#${i > 0 && list.slice(0, i).some((x) => x.id === t.id) ? i : 0}`;
      keep.add(key);
      let h = this.rack.get(key);
      if (!h) {
        h = makeDisc(0.24);
        setDiscCover(h, t.coverUrl);
        h.userData.drop = 0;
        h.userData.delay = i * 0.09;
        this.rack.set(key, h);
        this.group.add(h);
      }
      h.userData.slot = i;
    });
    for (const [key, h] of this.rack) {
      if (!keep.has(key)) {
        h.removeFromParent();
        this.rack.delete(key);
      }
    }
  }

  drawLcd() {
    const g = this.lcdCanvas.getContext('2d');
    g.fillStyle = '#05140f';
    g.fillRect(0, 0, 256, 40);
    g.fillStyle = '#4dffb5';
    g.font = '20px "VT323", monospace';
    g.textBaseline = 'middle';
    const text = this.track ? `${this.track.name}  —  ${this.track.artists}     ` : 'INSERT DISC     ';
    const w = g.measureText(text).width;
    const off = -(this.lcdScroll % w);
    g.fillText(text, off + 6, 21);
    g.fillText(text, off + 6 + w, 21);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 40; y += 2) g.fillRect(0, y, 256, 1);
    this.lcdTex.needsUpdate = true;
  }

  update(dt, time) {
    const beat = Beat.kick;
    this.neons.forEach((n, i) => {
      const h = (n.userData.hue + time * 0.05 + i * 0.07) % 1;
      n.material.color.setHSL(h, 1, this.playing ? 0.55 + beat * 0.2 : 0.35);
    });
    this.light.intensity = this.playing ? 2.5 + beat * 2.5 : 1.5;
    this.light.color.setHSL((time * 0.05) % 1, 0.9, 0.6);
    this.windowLight.intensity = 0.4 + beat * 0.6;
    this.slotLight.material.color.setHSL(0.5, 1, 0.4 + 0.3 * Math.sin(time * 6));

    // now playing disc: spins up when playing, coasts down when paused
    this.spinSpeed = damp(this.spinSpeed, this.playing ? 14 : 0, this.playing ? 2 : 0.8, dt);
    this.spin += this.spinSpeed * dt;
    this.nowScale = damp(this.nowScale, this.track ? 1 : 0, 10, dt);
    this.nowDisc.scale.setScalar(Math.max(0.001, this.nowScale));
    this.nowDisc.userData.disc.rotation.y = this.spin;
    this.nowDisc.position.y = 2.62 + beat * 0.015;

    // queue rack: discs drop into their slots, then idle-spin slowly
    for (const h of this.rack.values()) {
      const u = h.userData;
      if (u.delay > 0) u.delay -= dt;
      else u.drop = clamp01(u.drop + dt * 3);
      const x = -0.78 + u.slot * 0.222;
      const d = 1 - ease.outBack(u.drop);
      h.position.x = damp(h.position.x || x, x, 8, dt);
      h.position.y = 1.28 + d * 1.1;
      h.position.z = 0.64;
      h.rotation.set(-0.35, 0.5, 0);
      h.visible = u.delay <= 0;
      u.disc.rotation.y += dt * (this.playing ? 1.2 : 0.2) * (u.slot === 0 ? 2 : 1);
    }

    this.lcdScroll += dt * 40;
    if ((this._lcdT = (this._lcdT || 0) + dt) > 0.08) {
      this._lcdT = 0;
      this.drawLcd();
    }
  }
}
