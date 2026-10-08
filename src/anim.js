// Minimal promise-based tweens driven by the render loop.

const tweens = new Set();

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

export function tween(duration, fn, easing = ease.inOut) {
  return new Promise((resolve) => {
    tweens.add({ t: 0, duration, fn, easing, resolve });
  });
}

export const wait = (s) => tween(s, () => {});

export function updateTweens(dt) {
  for (const tw of tweens) {
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    tw.fn(tw.easing(tw.t), tw.t);
    if (tw.t >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
