import { coverThumb } from './textures.js';

// Queue drawer: shows now playing + up next, with drag-to-reorder, remove, play now, shuffle, clear.

const $ = (id) => document.getElementById(id);
const MAX_ROWS = 200;
let ctx;

const fmt = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const art = (t) => coverThumb(t?.coverUrl);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function queueOpen() {
  return !$('queue').hidden;
}

export function toggleQueue(force) {
  const el = $('queue');
  const open = force ?? el.hidden;
  el.hidden = !open;
  $('btn-queue').classList.toggle('on', open);
  document.body.classList.toggle('queue-open', open);
  if (open) renderQueue(ctx.getQueue());
}

export function initQueueUI(c) {
  ctx = c;
  $('q-close').onclick = () => toggleQueue(false);
  $('q-shuffle').onclick = () => ctx.getQueue()?.shuffleUpcoming();
  $('q-clear').onclick = () => ctx.getQueue()?.clearUpcoming();

  const list = $('q-list');
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const i = +li.dataset.i;
    const q = ctx.getQueue();
    if (e.target.closest('.q-x')) q.remove(i);
    else if (e.target.closest('.q-up')) q.move(i, Math.max(q.index + 1, i - 1));
    else if (e.target.closest('.q-down')) q.move(i, Math.min(q.items.length - 1, i + 1));
    else if (e.target.closest('.q-top')) q.move(i, q.index + 1);
    else ctx.onPlay(i);
  });

  // drag to reorder
  let from = -1;
  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    from = +li.dataset.i;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(from));
  });
  list.addEventListener('dragover', (e) => {
    if (from < 0) return;
    e.preventDefault();
    const li = e.target.closest('li[data-i]');
    list.querySelectorAll('.drop-above,.drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
    if (!li) return;
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const li = list.querySelector('.drop-above,.drop-below');
    if (li && from >= 0) {
      let to = +li.dataset.i + (li.classList.contains('drop-below') ? 1 : 0);
      if (to > from) to--;
      ctx.getQueue().move(from, to);
    }
  });
  list.addEventListener('dragend', () => {
    from = -1;
    list.querySelectorAll('.dragging,.drop-above,.drop-below').forEach((x) => x.classList.remove('dragging', 'drop-above', 'drop-below'));
  });
}

export function renderQueue(q) {
  if (!q || $('queue').hidden) return;
  const cur = q.current;
  $('q-now').innerHTML = cur
    ? `<img src="${esc(art(cur))}" alt="" /><div class="q-meta"><div class="q-kicker">▶ NOW PLAYING</div><div class="q-t">${esc(cur.name)}</div><div class="q-a">${esc(cur.artists)}</div></div>`
    : `<div class="q-empty">Nothing playing yet. Click a disc, or press <kbd>Q</kbd> on one to queue it.</div>`;
  const up = q.upcoming;
  $('q-upcount').textContent = up.length ? `${up.length} track${up.length === 1 ? '' : 's'} · ${fmt(up.reduce((a, t) => a + (t.durationMs || 0), 0))}` : 'empty';
  const rows = up.slice(0, MAX_ROWS).map((t, k) => {
    const i = q.index + 1 + k;
    return `<li data-i="${i}" draggable="true" title="Click to play now · drag to reorder">
      <span class="q-n">${k + 1}</span>
      <img src="${esc(art(t))}" alt="" loading="lazy" />
      <div class="q-meta"><div class="q-t">${esc(t.name)}</div><div class="q-a">${esc(t.artists)}</div></div>
      <span class="q-d">${fmt(t.durationMs)}</span>
      <span class="q-btns">
        <button class="q-up" title="Move up">↑</button>
        <button class="q-down" title="Move down">↓</button>
        <button class="q-top" title="Move to top">⤒</button>
        <button class="q-x" title="Remove">✕</button>
      </span>
    </li>`;
  });
  if (up.length > MAX_ROWS) rows.push(`<li class="q-more">…and ${up.length - MAX_ROWS} more</li>`);
  $('q-list').innerHTML = rows.join('') || '<li class="q-more">Queue is empty — press <kbd>Q</kbd> on a disc to add it.</li>';
}
