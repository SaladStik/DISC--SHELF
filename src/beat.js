// Shared music-reactive signal. Spotify's audio is DRM'd (no WebAudio access) and its audio-analysis
// API is closed to new apps, so we either run a beat clock locked to playback position, or listen to
// the room through the mic and detect real bass kicks.

import { hash } from './demo.js';

export const Beat = {
  kick: 0, // 0..1, spikes on each kick and decays
  bass: 0, // 0..1, smoothed low-end energy
  hit: false, // true on the frame a kick lands
  source: 'auto', // 'auto' | 'mic'
  bpm: 120,
  _lastBeat: -1,
  _mic: null,

  update(dt, { playing, positionMs, trackId }) {
    this.hit = false;
    if (this.source === 'mic' && this._mic) this._fromMic(dt);
    else if (playing && trackId) {
      this.bpm = 92 + (hash(trackId) % 48); // stable per track
      const beats = (positionMs / 60000) * this.bpm;
      const n = Math.floor(beats);
      if (n !== this._lastBeat) {
        this._lastBeat = n;
        this.hit = true;
        this.kick = n % 4 === 0 ? 1 : 0.7;
      }
      const frac = beats - n;
      this.bass = 0.35 + 0.35 * Math.pow(1 - frac, 3) + (n % 2 === 0 ? 0.15 : 0);
    } else this.bass *= Math.exp(-dt * 3);
    this.kick *= Math.exp(-dt * 9);
  },

  _fromMic(dt) {
    const m = this._mic;
    m.analyser.getByteFrequencyData(m.data);
    // ~0–150 Hz
    let e = 0;
    for (let i = 1; i < m.bins; i++) e += m.data[i];
    e /= m.bins * 255;
    m.avg = m.avg * 0.96 + e * 0.04;
    m.peak = Math.max(m.peak * 0.995, e, 0.05);
    this.bass = Math.min(1, e / m.peak);
    m.cool -= dt;
    if (e > m.avg * 1.35 && e > 0.12 && m.cool <= 0) {
      this.hit = true;
      this.kick = Math.min(1, 0.6 + (e - m.avg) * 4);
      m.cool = 0.18;
    }
  },

  async enableMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const bins = Math.max(2, Math.round((150 / (ctx.sampleRate / 2)) * analyser.frequencyBinCount));
    this._mic = { stream, ctx, analyser, bins, data: new Uint8Array(analyser.frequencyBinCount), avg: 0, peak: 0.1, cool: 0 };
    this.source = 'mic';
  },

  disableMic() {
    if (this._mic) {
      this._mic.stream.getTracks().forEach((t) => t.stop());
      this._mic.ctx.close();
      this._mic = null;
    }
    this.source = 'auto';
  },
};
