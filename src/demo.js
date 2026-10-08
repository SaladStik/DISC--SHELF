// Offline demo: fake library with generated covers and a tiny chiptune "player".

const rand = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
export const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const W1 = ['Neon', 'Velvet', 'Static', 'Chrome', 'Midnight', 'Polar', 'Echo', 'Lunar', 'Silver', 'Cobalt', 'Paper', 'Glass', 'Hyper', 'Soft', 'Dusk', 'Analog', 'Crystal', 'Sonic', 'Tokyo', 'Cherry'];
const W2 = ['Drive', 'Garden', 'Signal', 'Machines', 'Hearts', 'Arcade', 'Waves', 'Motel', 'Satellite', 'Ritual', 'Memory', 'Highway', 'Bloom', 'Circuit', 'Fever', 'Horizon', 'Kids', 'Dream', 'Tapes', 'Lights'];
const PLAYLISTS = ['Late Night Drive', 'Memory Card 01', 'Y2K Loading Screen', 'Rainy Arcade', 'Sunday Jewel Cases', 'Bedroom Pop Archive', 'Boss Battle', 'Mall Soft', 'Everything (1300)'];

export function demoPlaylists() {
  return PLAYLISTS.map((name, i) => ({
    id: `demo${i}`,
    uri: null,
    name,
    owner: 'demo',
    coverUrl: `gen:pl${i}:${name}`,
    total: name.startsWith("Everything") ? 1300 : 40 + ((i * 37) % 90),
  }));
}

export function demoTracks(playlist) {
  const r = rand(hash(playlist.id));
  const albums = Array.from({ length: 10 + Math.floor(r() * 14) }, () => {
    const title = `${W1[Math.floor(r() * W1.length)]} ${W2[Math.floor(r() * W2.length)]}`;
    const artist = `${W2[Math.floor(r() * W2.length)]} ${['Club', 'Society', 'Unit', 'Boys', 'Girls', 'Theory', '', ''][Math.floor(r() * 8)]}`.trim();
    return { title, artist };
  });
  const n = playlist.total || 60;
  return Array.from({ length: n }, (_, i) => {
    const a = albums[Math.floor(r() * albums.length)];
    const name = `${W1[Math.floor(r() * W1.length)]} ${W2[Math.floor(r() * W2.length)]}`;
    return {
      id: `${playlist.id}-${i}`,
      uri: `demo:${playlist.id}:${i}`,
      name,
      artists: a.artist,
      album: a.title,
      coverUrl: `gen:${a.artist}|${a.title}:${a.title}`,
      durationMs: 60000 + Math.floor(r() * 120000),
    };
  });
}

export class DemoPlayer {
  constructor({ silent = false } = {}) {
    this.silent = silent;
    this.listeners = new Set();
    this.tracks = [];
    this.order = [];
    this.pos = 0;
    this.paused = true;
    this.shuffle = false;
    this.volume = 0.5;
    this.elapsed = 0;
    this.lastTick = performance.now();
    this.ready = Promise.resolve();
    setInterval(() => this.tick(), 250);
  }
  on(fn) {
    this.listeners.add(fn);
  }
  emit(t, d) {
    this.listeners.forEach((fn) => fn(t, d));
  }
  get track() {
    return this.tracks[this.order[this.pos]];
  }
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume * 0.12;
      this.gain.connect(this.ctx.destination);
    }
    this.ctx.resume();
  }
  async play({ tracks, index = 0, positionMs = 0 }) {
    this.tracks = tracks;
    this.order = tracks.map((_, i) => i);
    this.pos = index;
    this.start(positionMs);
  }
  start(positionMs = 0) {
    this.elapsed = positionMs;
    this.paused = false;
    this.startSynth();
    this.emitState();
    this.emit('track', this.track);
  }
  emitState() {
    this.emit('state', { track: this.track, paused: this.paused, position: this.elapsed, duration: this.track?.durationMs || 0, shuffle: this.shuffle });
  }
  tick() {
    const now = performance.now();
    if (!this.paused && this.track) {
      this.elapsed += now - this.lastTick;
      if (this.elapsed >= this.track.durationMs) this.next();
    }
    this.lastTick = now;
  }
  toggle() {
    if (!this.track) return;
    this.paused = !this.paused;
    this.paused ? this.stopSynth() : this.startSynth();
    this.emitState();
  }
  next() {
    if (!this.tracks.length) return;
    if (this.pos + 1 >= this.order.length) {
      this.paused = true;
      this.stopSynth();
      return this.emitState();
    }
    this.pos++;
    this.start();
  }
  prev() {
    if (!this.tracks.length) return;
    if (this.elapsed > 3000) this.elapsed = 0;
    else this.pos = Math.max(0, this.pos - 1);
    this.start();
  }
  setVolume(v) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v * 0.12;
  }
  progress() {
    return { position: this.elapsed, duration: this.track?.durationMs || 0 };
  }

  // A seeded little arpeggio so the demo jukebox actually makes noise.
  startSynth() {
    this.stopSynth();
    if (this.silent || !this.ctx || !this.track) return;
    const r = rand(hash(this.track.id));
    const root = 110 * Math.pow(2, Math.floor(r() * 12) / 12);
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const pattern = Array.from({ length: 16 }, () => scale[Math.floor(r() * scale.length)]);
    const bass = [0, 0, 5, 7].map((x) => x - 12);
    const step = 60 / (96 + Math.floor(r() * 50)) / 2;
    let i = 0;
    let t = this.ctx.currentTime + 0.05;
    const note = (freq, at, dur, type, vol) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.connect(g).connect(this.gain);
      o.start(at);
      o.stop(at + dur + 0.02);
    };
    const schedule = () => {
      while (t < this.ctx.currentTime + 0.2) {
        note(root * 2 * Math.pow(2, pattern[i % 16] / 12), t, step * 0.9, 'square', 0.25);
        if (i % 4 === 0) note(root * Math.pow(2, bass[(i / 4) % 4] / 12), t, step * 3.5, 'triangle', 0.6);
        t += step;
        i++;
      }
    };
    schedule();
    this.synthTimer = setInterval(schedule, 50);
  }
  stopSynth() {
    clearInterval(this.synthTimer);
  }
}
