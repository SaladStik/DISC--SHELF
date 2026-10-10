// Stand-in for Wallpaper Engine when testing in a browser: open with ?sim for a 120 bpm kick and
// one track, then call simTrack('Title', 'Artist') in the console for more.
if (location.search === '?sim') {
  const hooks = {};
  for (const n of ['Audio', 'MediaProperties', 'MediaThumbnail', 'MediaPlayback', 'MediaTimeline']) window[`wallpaperRegister${n}Listener`] = (fn) => (hooks[n] = fn);
  window.wallpaperMediaIntegration = { PLAYBACK_PLAYING: 1 };
  setInterval(() => {
    const kick = Math.exp(-((performance.now() / 500) % 1) * 6);
    hooks.Audio(Array.from({ length: 128 }, (_, i) => (i % 64 < 4 ? kick : Math.random() * 0.1)));
  }, 33);
  window.simTrack = (title, artist) => {
    hooks.MediaProperties({ title, artist, albumTitle: '' });
    hooks.MediaPlayback({ state: 1 });
    hooks.MediaTimeline({ position: 0, duration: 200 });
  };
  setTimeout(() => window.simTrack('Sim Song', 'Sim Artist'), 4000);
}
