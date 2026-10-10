// Shared music-reactive signal. Spotify's audio is DRM'd (no WebAudio access) and its audio-analysis
// API is closed to new apps, so we either run a beat clock locked to playback position, or listen to
// the room through the mic and detect real bass kicks. A host that hears the machine's own output
// (Wallpaper Engine) feeds that in through feedSpectrum() instead.

import { hash } from './demo.js';

export const Beat = {
  kick: 0, // 0..1, spikes on each kick and decays
  bass: 0, // 0..1, smoothed low-end energy
  hit: false, // true on the frame a kick lands
  source: 'auto', // 'auto' | 'mic'
  gain: 1, // system audio: how hard the room reacts
  bpm: 120,
  _lastBeat: -1,
  _mic: null,
  _sys: null,

  update(dt, { playing, positionMs, trackId }) {
    this.hit = false;
    if (this.source === 'mic' && this._mic) this._fromMic(dt);
    else if (this._sys?.heard) this._fromSystem(dt);
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

  /**
   * System audio as Wallpaper Engine sends it, ~30 times a second: left channel then right, each
   * low to high frequency. Kicks are found here, at the audio's own rate, for the next frame to use.
   */
  feedSpectrum(bins) {
    const now = performance.now();
    const s = (this._sys ||= { e: 0, avg: 0, peak: 0.02, cool: 0, at: now, pending: 0, heard: false });
    const dt = Math.min(0.1, (now - s.at) / 1000);
    const half = bins.length >> 1;
    const n = half >> 4; // the lowest bands carry the kick drum and the bass line
    let e = 0;
    for (let i = 0; i < n; i++) e += bins[i] + bins[half + i];
    e /= 2 * n;
    if (e > 0.002) s.heard = true; // audio capture switched off in the host stays silent: keep the beat clock
    s.avg += (e - s.avg) * (1 - Math.exp(-dt * 2.2));
    s.peak = Math.max(s.peak * Math.exp(-dt * 0.25), e, 0.02);
    s.cool -= dt;
    if (e > 0.015 && e > s.avg * 1.3 && e - s.e > s.peak * 0.06 && s.cool <= 0) {
      s.pending = Math.min(1, 0.55 + (e - s.avg) / s.peak);
      s.cool = 0.17;
    }
    s.e = e;
    s.at = now;
  },

  _fromSystem(dt) {
    const s = this._sys;
    if (performance.now() - s.at > 400) s.e = 0; // the host stopped sending
    this.bass += (Math.min(1, (s.e / s.peak) * this.gain) - this.bass) * (1 - Math.exp(-dt * 18));
    if (s.pending) {
      this.hit = true;
      this.kick = Math.min(1, s.pending * this.gain);
      s.pending = 0;
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
