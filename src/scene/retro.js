import * as THREE from 'three';

// Renders the scene at a low internal resolution, then upscales with nearest filtering,
// ordered dithering, a 15-bit-ish color crunch, soft bloom-ish glow, scanlines and vignette.
export class RetroPass {
  constructor(renderer, height = 576) {
    this.renderer = renderer;
    this.height = height;
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      samples: 0,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        res: { value: new THREE.Vector2() },
        time: { value: 0 },
        flash: { value: 0 },
        kick: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 res;
        uniform float time;
        uniform float flash;
        uniform float kick;
        varying vec2 vUv;
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
          return 0.0;
        }
        vec3 tap(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
        void main() {
          vec2 px = vUv * res;
          // bass hit: brief RGB split from the center
          vec2 dir = (vUv - 0.5) * kick * kick * 0.012;
          vec3 c = vec3(tap(vUv + dir).r, tap(vUv).g, tap(vUv - dir).b);
          // cheap glow from bright neighbours (PS2 "bloom" smear)
          vec3 glow = vec3(0.0);
          for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
            vec3 s = tap(vUv + vec2(float(i), float(j)) * 1.5 / res);
            glow += max(s - 0.9, 0.0);
          }
          c += glow / 25.0 * 0.8;
          // linear -> sRGB
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          // ordered dither + quantize to 5 bits/channel
          c += bayer(px) / 32.0;
          c = floor(c * 31.0 + 0.5) / 31.0;
          // scanlines + vignette + slight warm grade
          float scan = 0.93 + 0.07 * sin(gl_FragCoord.y * 3.14159);
          vec2 q = vUv - 0.5;
          float vig = 1.0 - dot(q, q) * 0.9;
          c *= scan * vig;
          c = mix(c, c * vec3(1.04, 0.99, 1.06), 0.6);
          c *= 1.0 + kick * kick * 0.12;
          c = mix(c, vec3(1.0), flash);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    const scale = Math.min(1, this.height / h);
    const rw = Math.round(w * scale),
      rh = Math.round(h * scale);
    this.target.setSize(rw, rh);
    this.material.uniforms.res.value.set(rw, rh);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    this.material.uniforms.time.value = time;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
