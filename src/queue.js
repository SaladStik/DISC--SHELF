// App-owned play queue. Spotify's API can't reorder or remove queue items, so we keep the
// queue here and hand Spotify a window of upcoming URIs whenever it changes.

const WINDOW = 100;

export class QueueManager {
  constructor({ player, onChange }) {
    this.player = player;
    this.onChange = onChange;
    this.items = [];
    this.index = -1;
    this.sent = { start: 0, len: 0 };
    this.syncTimer = null;
    this.uid = 0;
  }

  get current() {
    return this.external || this.items[this.index] || null;
  }
  get upcoming() {
    return this.items.slice(this.index + 1);
  }

  wrap(t) {
    // Each entry gets its own key so the same song can be queued twice.
    return { ...t, qid: ++this.uid };
  }

  changed() {
    this.onChange?.(this);
  }

  /** Replace the queue with a playlist, starting at startIdx. */
  start(tracks, startIdx, { shuffle = false } = {}) {
    let rest = tracks.slice(startIdx + 1);
    if (shuffle) {
      rest = tracks.filter((_, i) => i !== startIdx);
      shuffleInPlace(rest);
    }
    this.items = [tracks[startIdx], ...rest].map((t) => this.wrap(t));
    this.index = 0;
    this.external = null;
    this.changed();
    return this.sync(0);
  }

  playAt(i) {
    if (i < 0 || i >= this.items.length) return;
    this.index = i;
    this.changed();
    return this.sync(0);
  }

  playNow(track) {
    this.items.splice(this.index + 1, 0, this.wrap(track));
    return this.playAt(this.index + 1);
  }

  addNext(track) {
    this.items.splice(this.index + 1, 0, this.wrap(track));
    this.edited();
  }

  addEnd(track) {
    this.items.push(this.wrap(track));
    this.edited();
  }

  remove(i) {
    if (i <= this.index) return;
    this.items.splice(i, 1);
    this.edited();
  }

  move(from, to) {
    if (from <= this.index || to <= this.index || from === to) return;
    const [it] = this.items.splice(from, 1);
    this.items.splice(to, 0, it);
    this.edited();
  }

  clearUpcoming() {
    this.items.length = this.index + 1;
    this.edited();
  }

  shuffleUpcoming() {
    const up = this.items.splice(this.index + 1);
    shuffleInPlace(up);
    this.items.push(...up);
    this.edited();
  }

  edited() {
    this.changed();
    if (this.index < 0) return;
    // debounce so a burst of edits only re-sends the queue once
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(this.player.progress().position), 900);
  }

  sync(positionMs = 0) {
    clearTimeout(this.syncTimer);
    if (this.index < 0) return Promise.resolve();
    const win = this.items.slice(this.index, this.index + WINDOW);
    this.sent = { start: this.index, len: win.length };
    this.pendingUntil = performance.now() + 4000;
    return this.player.play({ tracks: win, index: 0, positionMs: Math.max(0, Math.floor(positionMs)) });
  }

  /** Called when the player reports a new current track. Returns false if it should be ignored. */
  onTrack(track) {
    if (!track) return false;
    const end = this.sent.start + this.sent.len;
    const match = (t) => t.uri === track.uri || (track.linkedUri && t.uri === track.linkedUri) || t.id === track.id;
    let j = -1;
    for (let k = Math.max(0, this.sent.start - 1); k < Math.min(end, this.items.length); k++) {
      if (match(this.items[k])) {
        // prefer the entry right after the current one when a song is queued twice
        j = k;
        if (k >= this.index) break;
      }
    }
    if (j < 0) {
      // right after we start playback Spotify still reports the previous session's track
      if (performance.now() < (this.pendingUntil || 0)) return false;
      // playing something we don't manage (a locked playlist, or changed from another device)
      this.external = track;
      this.changed();
      return true;
    }
    this.external = null;
    this.pendingUntil = 0;
    this.index = j;
    this.changed();
    if (j >= end - 3 && this.items.length > end) this.sync(this.player.progress().position);
    return true;
  }
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
