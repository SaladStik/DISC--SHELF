import * as THREE from 'three';
import { canvas, canvasTexture } from '../textures.js';
import { tween, ease } from '../anim.js';

export const CEILING_Y = 6.3;
const RAIL_Z = [1.1, 9.4];
const L1 = 1.35;
const L2 = 1.2;
const GRIP = 0.32; // wrist -> fingertip pinch point

function hazardTexture() {
  const [c, g] = canvas(32, 32);
  g.fillStyle = '#f2b705';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#16141c';
  for (let i = -32; i < 64; i += 12) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 6, 0);
    g.lineTo(i - 26, 32);
    g.lineTo(i - 32, 32);
    g.fill();
  }
  const t = canvasTexture(c, { nearest: true });
  return t;
}

export class RoboArm {
  constructor(scene) {
    const yellow = new THREE.MeshPhongMaterial({ color: 0xf2b705, shininess: 50, flatShading: true });
    const dark = new THREE.MeshPhongMaterial({ color: 0x23212b, shininess: 30, flatShading: true });
    const chrome = new THREE.MeshPhongMaterial({ color: 0xc9cfdc, shininess: 140, specular: 0xffffff });
    const hazard = new THREE.MeshLambertMaterial({ map: hazardTexture() });
    this.led = new THREE.MeshBasicMaterial({ color: 0x7ef9ff });

    // ceiling rails (long, so they cover any shelf length)
    for (const z of RAIL_Z) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2000, 0.12, 0.18), dark);
      rail.position.set(0, CEILING_Y + 0.05, z);
      scene.add(rail);
    }

    this.bridge = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, RAIL_Z[1] - RAIL_Z[0] + 0.4), hazard);
    beam.position.set(0, CEILING_Y - 0.1, (RAIL_Z[0] + RAIL_Z[1]) / 2);
    this.bridge.add(beam);
    for (const z of RAIL_Z) {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), dark);
      truck.position.set(0, CEILING_Y - 0.02, z);
      this.bridge.add(truck);
    }
    scene.add(this.bridge);

    this.carriage = new THREE.Group();
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.42), yellow);
    this.carriage.add(car);
    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), this.led);
    ledStrip.position.y = -0.1;
    this.carriage.add(ledStrip);
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), chrome);
    this.carriage.add(this.column);
    scene.add(this.carriage);

    // articulated arm hangs from the bottom of the telescoping column
    this.yaw = new THREE.Group();
    const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dark);
    this.yaw.add(shoulderBall);
    this.upper = new THREE.Group();
    this.yaw.add(this.upper);
    const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, L1, 0.16), yellow);
    upperMesh.position.y = -L1 / 2;
    this.upper.add(upperMesh);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, L1 * 0.8, 6), chrome);
    piston.position.set(0.11, -L1 / 2, 0);
    this.upper.add(piston);
    this.lower = new THREE.Group();
    this.lower.position.y = -L1;
    this.upper.add(this.lower);
    const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 12), dark);
    elbow.rotation.z = Math.PI / 2;
    this.lower.add(elbow);
    const lowerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, L2, 0.13), yellow);
    lowerMesh.position.y = -L2 / 2;
    this.lower.add(lowerMesh);
    this.wrist = new THREE.Group();
    this.wrist.position.y = -L2;
    this.lower.add(this.wrist);
    const wristBall = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10), dark);
    this.wrist.add(wristBall);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.14), dark);
    palm.position.y = -0.1;
    this.wrist.add(palm);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), this.led);
    eye.position.set(0, -0.1, 0.075);
    this.wrist.add(eye);
    this.fingers = [-1, 1].map((s) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.1), chrome);
      f.position.set(s * 0.12, -0.24, 0);
      this.wrist.add(f);
      return f;
    });
    this.grip = new THREE.Group();
    this.grip.position.y = -GRIP;
    this.wrist.add(this.grip);
    this.carriage.add(this.yaw);

    this.base = new THREE.Vector3(0, CEILING_Y - 1, 3);
    this.target = new THREE.Vector3(0, CEILING_Y - 3, 2);
    this.facing = new THREE.Vector3(0, 0, -1);
    this.open = 1;
    this.busy = false;
    this.held = null;
  }

  park(x) {
    this.base.set(x, CEILING_Y - 0.7, 3.4);
    this.target.set(x, CEILING_Y - 2.4, 2.6);
  }

  update() {
    const { base, target } = this;
    this.bridge.position.x = base.x;
    this.carriage.position.set(base.x, CEILING_Y - 0.2, base.z);
    const colLen = Math.max(0.1, CEILING_Y - 0.2 - base.y);
    this.column.scale.y = colLen;
    this.column.position.y = -colLen / 2;
    this.yaw.position.y = -colLen;

    // 2-bone IK in the vertical plane that contains the target
    const d = new THREE.Vector3().subVectors(target, base);
    d.y += GRIP; // solve for the wrist, the gripper hangs straight down from it
    const horiz = Math.hypot(d.x, d.z);
    this.yaw.rotation.y = horiz > 0.02 ? Math.atan2(d.x, d.z) : Math.atan2(this.facing.x, this.facing.z);
    const tz = horiz,
      ty = d.y;
    const dist = Math.min(Math.hypot(tz, ty), L1 + L2 - 0.001);
    const phi = Math.atan2(tz, -ty); // angle from straight down toward the target
    const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    const a1 = phi - a; // elbow bends back, away from the target
    const ez = L1 * Math.sin(a1),
      ey = -L1 * Math.cos(a1);
    const a2 = Math.atan2(tz - ez, -(ty - ey));
    this.upper.rotation.x = -a1;
    this.lower.rotation.x = -(a2 - a1);
    this.wrist.rotation.x = a2;

    const o = 0.05 + this.open * 0.08;
    this.fingers[0].position.x = -o;
    this.fingers[1].position.x = o;
  }

  async move(base, target, dur, { arc = 0, curve = ease.inOut, onStep } = {}) {
    const b0 = this.base.clone(),
      t0 = this.target.clone();
    await tween(
      dur,
      (t) => {
        this.base.lerpVectors(b0, base, t);
        this.target.lerpVectors(t0, target, t);
        const lift = Math.sin(t * Math.PI) * arc;
        this.base.y += lift;
        this.target.y += lift;
        onStep?.(t);
      },
      curve,
    );
  }

  setGrip(open, dur = 0.15) {
    const o0 = this.open;
    return tween(dur, (t) => (this.open = o0 + (open - o0) * t));
  }

  /** Attach a mesh so it travels with the gripper, preserving its world transform first. */
  hold(obj, { flat = false, hang = 0.5 } = {}) {
    this.held = obj;
    this.grip.attach(obj);
    const p0 = obj.position.clone();
    const q0 = obj.quaternion.clone();
    const q1 = new THREE.Quaternion();
    // disc stands upright in the fingers, facing the arm's travel direction
    // label faces back toward the camera (discs are cylinders lying on their side, tapes are boxes)
    q1.setFromEuler(flat ? new THREE.Euler(0, Math.PI, 0) : new THREE.Euler(-Math.PI / 2, 0, 0));
    const p1 = new THREE.Vector3(0, -hang, 0);
    return tween(0.12, (t) => {
      obj.position.lerpVectors(p0, p1, t);
      obj.quaternion.slerpQuaternions(q0, q1, t);
    });
  }
}
