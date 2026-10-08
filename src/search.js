// Search overlay: instant local matches on the current shelf (tracks or playlists) plus Spotify catalog results.

import { coverThumb } from './textures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const LOCAL_MAX = 8;
let ctx;
let results = []; // [{ kind: 'local'|'remote', index?, item }]
let sel = 0;
let remoteTimer;
let remoteSeq = 0;
let indexCache = { items: null, rows: [] };

export const searchOpen = () => !$('search').hidden;

function buildIndex(items) {
  if (indexCache.items === items) return indexCache.rows;
  indexCache = {
    items,
    rows: items.map((it) => ({ name: norm(it.name), artist: norm(it.artists || it.owner), album: norm(it.album) })),
  };
  return indexCache.rows;
}

/** Score: every query word must appear somewhere; title hits beat artist beat album, prefixes beat infixes. */
function score(row, words) {
  let s = 0;
  for (const w of words) {
    const fields = [
      [row.name, 30],
      [row.artist, 18],
      [row.album, 8],
    ];
    let best = 0;
    for (const [f, weight] of fields) {
      if (!f) continue;
      const at = f.indexOf(w);
      if (at < 0) continue;
      const wordStart = at === 0 || f[at - 1] === ' ';
      best = Math.max(best, weight * (at === 0 ? 2 : wordStart ? 1.5 : 1));
    }
    if (!best) return 0;
    s += best;
  }
  const phrase = words.join(' ');
  if (words.length > 1 && (row.name.includes(phrase) || row.artist.includes(phrase))) s += 60;
  return s + (row.name === phrase ? 50 : 0);
}

export function initSearch(c) {
  ctx = c;
  const input = $('search-input');
  input.addEventListener('input', () => run(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
      focusSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(sel, e.shiftKey ? 'queue' : 'play');
    } else if ((e.key === 'q' || e.key === 'w') && (e.altKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      choose(sel, e.key === 'w' ? 'next' : 'queue');
    }
  });
  $('search-results').addEventListener('mousemove', (e) => {
    const li = e.target.closest('li[data-r]');
    if (li && +li.dataset.r !== sel) {
      sel = +li.dataset.r;
      paint();
      focusSelection();
    }
  });
  $('search-results').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-r]');
    if (!li) return;
    const act = e.target.closest('[data-act]')?.dataset.act || 'play';
    choose(+li.dataset.r, act);
  });
  $('search').addEventListener('pointerdown', (e) => {
    if (e.target.id === 'search') closeSearch();
  });
  $('btn-search').onclick = () => openSearch();
}

export function openSearch() {
  const el = $('search');
  el.hidden = false;
  document.body.classList.add('searching');
  const input = $('search-input');
  input.placeholder = ctx.mode() === 'tracks' ? `Search ${ctx.items().length} discs on this shelf + Spotify…` : 'Search your playlists + Spotify…';
  input.select();
  input.focus();
  run(input.value);
}

export function closeSearch() {
  $('search').hidden = true;
  document.body.classList.remove('searching');
  ctx.onFilter(null);
  $('search-input').blur();
}

function run(q) {
  const words = norm(q).trim().split(/\s+/).filter(Boolean);
  const items = ctx.items();
  results = [];
  sel = 0;
  if (!words.length) {
    ctx.onFilter(null);
    $('search-meta').textContent = ctx.mode() === 'tracks' ? 'type to find a disc' : 'type to find a playlist';
    paint();
    return;
  }
  const rows = buildIndex(items);
  const matches = [];
  for (let i = 0; i < rows.length; i++) {
    const s = score(rows[i], words);
    if (s) matches.push([s, i]);
  }
  matches.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  ctx.onFilter(new Set(matches.map((m) => m[1])));
  results = matches.slice(0, LOCAL_MAX).map(([, i]) => ({ kind: 'local', index: i, item: items[i] }));
  $('search-meta').textContent = `${matches.length} on this shelf`;
  paint();
  focusSelection();

  // Spotify catalog results, debounced
  clearTimeout(remoteTimer);
  const seq = ++remoteSeq;
  if (!ctx.searchRemote) return;
  remoteTimer = setTimeout(async () => {
    try {
      const remote = await ctx.searchRemote(q.trim());
      if (seq !== remoteSeq || !searchOpen()) return;
      const have = new Set(results.map((r) => r.item.uri));
      results = results.concat(remote.filter((t) => !have.has(t.uri)).map((t) => ({ kind: 'remote', item: t })));
      paint();
    } catch {}
  }, 260);
}

function paint() {
  const ul = $('search-results');
  if (!results.length) {
    ul.innerHTML = $('search-input').value.trim() ? '<li class="s-empty">No matches. Spotify results load in a moment…</li>' : '';
    return;
  }
  let html = '';
  let lastKind = null;
  results.forEach((r, k) => {
    if (r.kind !== lastKind) {
      html += `<li class="s-head">${r.kind === 'local' ? (ctx.mode() === 'tracks' ? 'ON THIS SHELF' : 'YOUR PLAYLISTS') : 'FROM SPOTIFY'}</li>`;
      lastKind = r.kind;
    }
    const it = r.item;
    const sub = it.artists ? `${it.artists}${it.album ? ' · ' + it.album : ''}` : `${it.total ?? ''} tracks · ${it.owner || ''}`;
    const tracky = ctx.mode() === 'tracks' || r.kind === 'remote';
    html += `<li data-r="${k}" class="${k === sel ? 'sel' : ''}">
      <img src="${esc(coverThumb(it.coverUrl))}" alt="" />
      <div class="s-meta"><div class="s-t">${esc(it.name)}</div><div class="s-a">${esc(sub)}</div></div>
      <div class="s-acts">
        ${tracky ? '<button data-act="next" title="Play next">⤴</button><button data-act="queue" title="Add to queue">＋</button>' : ''}
        <button data-act="play" class="s-play" title="${tracky ? 'Play' : 'Open'}">${tracky ? '▶' : '▤'}</button>
      </div>
    </li>`;
  });
  ul.innerHTML = html;
  ul.querySelector('li.sel')?.scrollIntoView({ block: 'nearest' });
}

function focusSelection() {
  const r = results[sel];
  if (r?.kind === 'local') ctx.onFocus(r.index);
}

function choose(k, act) {
  const r = results[k];
  if (!r) return;
  ctx.onChoose(r, act);
  if (act === 'play') closeSearch();
  else {
    const li = $('search-results').querySelector(`li[data-r="${k}"]`);
    li?.classList.add('flash');
    setTimeout(() => li?.classList.remove('flash'), 400);
  }
}
