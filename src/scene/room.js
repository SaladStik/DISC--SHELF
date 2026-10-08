import * as THREE from 'three';
import { canvas, canvasTexture } from '../textures.js';
import { CEILING_Y } from './arm.js';
import { JUKE_Z } from './jukebox.js';

/** The long room both walls live in. Surfaces + lighting are restyled per theme via applyTheme(). */
export function buildRoom(scene) {
  scene.background = new THREE.Color(0x0c0a18);
  scene.fog = new THREE.Fog(0x0c0a18, 9, 26);

  const floorMat = new THREE.MeshLambertMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 5);
  scene.add(floor);

  const wallMat = new THREE.MeshLambertMaterial();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(400, CEILING_Y + 0.5), wallMat);
  back.position.set(0, (CEILING_Y + 0.5) / 2, -0.95);
  scene.add(back);
  const jukeWallMat = new THREE.MeshLambertMaterial();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(400, CEILING_Y + 0.5), jukeWallMat);
  front.rotation.y = Math.PI;
  front.position.set(0, (CEILING_Y + 0.5) / 2, JUKE_Z + 0.75);
  scene.add(front);

  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x15122a });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, CEILING_Y + 0.4, 5);
  scene.add(ceil);

  const trimMat = new THREE.MeshLambertMaterial({ color: 0x3a2a4a });
  for (const z of [-0.9, JUKE_Z + 0.7]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(400, 0.18, 0.06), trimMat);
    b.position.set(0, 0.09, z);
    scene.add(b);
  }

  const hemi = new THREE.HemisphereLight(0x8a7cff, 0x2a1a20, 0.9);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x403850, 0.6);
  scene.add(amb);
  // warm key light that follows the camera along the shelf
  const key = new THREE.PointLight(0xffc98a, 14, 14, 1.4);
  key.position.set(0, 4.7, 4.5);
  scene.add(key);
  const fill = new THREE.PointLight(0x7ef9ff, 6, 10, 1.6);
  fill.position.set(0, 1.0, 5);
  scene.add(fill);

  // neon wall sign above the shelf (text + glow color come from the theme)
  const [sc, sg] = canvas(512, 96);
  const signTex = canvasTexture(sc);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, fog: false }));
  sign.position.set(4, 5.75, -0.88);
  scene.add(sign);
  const drawSign = (text, glow, fill) => {
    sg.clearRect(0, 0, 512, 96);
    sg.font = 'bold 60px "Silkscreen", monospace';
    sg.textAlign = 'center';
    sg.textBaseline = 'middle';
    sg.shadowColor = glow;
    sg.shadowBlur = 18;
    sg.fillStyle = fill;
    sg.fillText(text, 256, 50);
    signTex.needsUpdate = true;
  };

  const disposeMap = (m) => m.map && m.map.dispose();
  let keyBase = 14,
    fillBase = 6;
  return {
    sign,
    pulse(kick, bass) {
      key.intensity = keyBase * (0.9 + bass * 0.15 + kick * 0.25);
      fill.intensity = fillBase * (0.8 + kick * 0.9);
    },
    follow(x) {
      key.position.x = x + 1;
      fill.position.x = x - 2;
    },
    applyTheme(t) {
      [floorMat, wallMat, jukeWallMat].forEach(disposeMap);
      floorMat.map = t.floor();
      wallMat.map = t.wall();
      jukeWallMat.map = t.jukeWall ? t.jukeWall() : t.wall();
      [floorMat, wallMat, jukeWallMat].forEach((m) => (m.needsUpdate = true));
      ceilMat.color.set(t.ceiling);
      trimMat.color.set(t.trim);
      scene.background.set(t.fog[0]);
      scene.fog.color.set(t.fog[0]);
      scene.fog.near = t.fog[1];
      scene.fog.far = t.fog[2];
      hemi.color.set(t.hemi[0]);
      hemi.groundColor.set(t.hemi[1]);
      hemi.intensity = t.hemi[2];
      amb.color.set(t.ambient[0]);
      amb.intensity = t.ambient[1];
      key.color.set(t.key[0]);
      key.intensity = keyBase = t.key[1];
      fill.color.set(t.fill[0]);
      fill.intensity = fillBase = t.fill[1];
      drawSign(...t.sign);
    },
  };
}
