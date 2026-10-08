/**
 * The pitch page (/pitch/): the real app, driven step by step for a three-minute talk.
 *
 * Presenter controls: → / Space / PageDown / click = next, ← / PageUp / right-click = back,
 * Home = start, End = last, F = fullscreen, M = free mode (hands the app to you, for questions).
 * Dev only: /pitch/?capture snapshots the logged-in library into public/pitch/library.json.
 */
import '../style.css';
import './pitch.css';
import { createStory } from './story.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const logo = (t) => esc(t).replace('//', '<span class="slash">//</span>');

// ---------- the app's own markup (index.html stays the single source of truth) ----------
const page = new DOMParser().parseFromString(await (await fetch('/index.html')).text(), 'text/html');
page.querySelectorAll('script, link').forEach((n) => n.remove());
document.body.prepend(...page.body.childNodes);

document.body.insertAdjacentHTML(
  'beforeend',
  `<div id="pitch">
    <div class="p-scrim"></div><div class="p-shade"></div>
    <div id="p-captions"></div>
    <div id="p-dots" class="p-dots"></div>
    <div id="p-click" class="p-click"></div>
    <div id="p-free" class="p-free" hidden>Free mode · press M to return</div>
    <div id="p-loader" class="p-loader">
      <div class="p-logo">${logo('DISC//SHELF')}</div>
      <div class="p-bar"><i id="p-bar"></i></div>
      <div id="p-note" class="p-note">Loading…</div>
    </div>
  </div>`,
);

const setProgress = (f, note) => {
  $('p-bar').style.transform = `scaleX(${f})`;
  if (note) $('p-note').textContent = note;
};

// ---------- boot the app in pitch mode ----------
window.DS_PITCH = true;
const { app } = await import('../main.js');
const params = new URLSearchParams(location.search);

if (params.has('capture')) {
  const { capture } = await import('./capture.js');
  await capture(setProgress);
} else {
  let lib = null;
  try {
    const r = await fetch('/pitch/library.json', { cache: 'no-cache' });
    if (r.ok) lib = await r.json();
  } catch {}
  if (!lib) {
    setProgress(0.1, 'No saved library yet. Running on demo data (log in, then open /pitch/?capture).');
    await new Promise((r) => setTimeout(r, 1600));
    app.startDemo();
    const { demoTracks } = await import('../demo.js');
    lib = { user: { name: 'Demo' }, playlists: app.S.playlists, tracks: Object.fromEntries(app.S.playlists.map((p) => [p.id, demoTracks(p)])) };
    lib.featured = lib.playlists.find((p) => p.total > 200)?.id;
    lib.featuredTrack = 40;
    lib.searchQuery = 'neon';
    app.S.snapshot = lib;
  } else {
    await app.startSnapshot(lib);
  }
  run(lib);
}

function run(lib) {
  // ---------- captions: the new one rises in while the old one fades out ----------
  let tickerEl = null;
  const ui = {
    caption(c) {
      const host = $('p-captions');
      host.querySelectorAll('.p-cap:not(.leaving)').forEach((n) => {
        n.classList.add('leaving');
        setTimeout(() => n.remove(), 700);
      });
      document.body.dataset.layout = c?.layout || 'none';
      if (!c) return;
      const el = document.createElement('div');
      el.className = `p-cap p-${c.layout}`;
      if (c.layout === 'title') el.innerHTML = `<h1>${logo(c.title)}</h1>${c.body ? `<p>${esc(c.body)}</p>` : ''}`;
      else if (c.layout === 'statement') el.innerHTML = `<h2>${esc(c.title)}</h2>`;
      else el.innerHTML = `${c.kicker ? `<div class="kicker">${esc(c.kicker)}</div>` : ''}<h2>${esc(c.title)}</h2>${c.body ? `<p>${esc(c.body)}</p>` : ''}<div class="ticker" style="display:none"></div>`;
      host.appendChild(el);
      tickerEl = el.querySelector('.ticker');
    },
    ticker(t) {
      if (!tickerEl) return;
      tickerEl.textContent = t;
      tickerEl.style.display = t ? '' : 'none';
    },
    step(n, total) {
      $('p-dots').innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i === n ? 'on' : i < n ? 'done' : ''}"></i>`).join('');
    },
  };

  const story = createStory(app, lib, ui);

  // ---------- presenter controls ----------
  let free = false;
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    app.S.player?.unlock?.();
  };
  const next = () => (unlock(), story.go(story.step + 1));
  const back = () => (unlock(), story.go(story.step - 1));
  const setFree = (v) => {
    free = v;
    $('p-free').hidden = !free;
    $('p-click').hidden = free;
    document.body.classList.toggle('pitch-free', free);
    if (!free) app.S.keyboard = true;
  };
  addEventListener(
    'keydown',
    (e) => {
      const k = e.key;
      if (k === 'm' || k === 'M') {
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        return setFree(!free);
      }
      if (free) return; // the app handles everything in free mode
      if (e.target.tagName === 'INPUT') e.target.blur();
      let handled = true;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) next();
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) back();
      else if (k === 'Home') story.go(0);
      else if (k === 'End') story.go(story.STEPS.length - 1);
      else if (k === 'f' || k === 'F') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      } else handled = false;
      // the app's own shortcuts (space = play/pause, arrows = skim…) stay out of the way
      e.preventDefault();
      e.stopImmediatePropagation();
      return handled;
    },
    { capture: true },
  );
  $('p-click').addEventListener('click', next);
  $('p-click').addEventListener('contextmenu', (e) => (e.preventDefault(), back()));

  // hide the cursor while it's still
  let idleT = 0;
  addEventListener('pointermove', () => {
    document.body.classList.remove('pitch-idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('pitch-idle'), 2200);
  });

  // ---------- build everything behind the curtain, then lift it ----------
  (async () => {
    await story.prepare(setProgress);
    $('p-loader').classList.add('done');
    story.go(0);
  })();

  // for rehearsals: pitchGo(5) in the console
  window.pitchGo = (n) => story.go(n);
}
