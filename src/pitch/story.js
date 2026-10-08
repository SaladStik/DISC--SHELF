/**
 * The pitch, step by step: a three-minute walk through DISC//SHELF on the presenter's own library.
 *
 * Every step sets the whole scene it needs (playlist, media, room, view, panels), so the presenter
 * can go forward, back or jump anywhere. Moving on mid-step cancels it: every wait checks it is
 * still the current step. The one thing that can't be cut short is a robot run; the next step
 * waits for it to land.
 */

class Cancelled extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Math.round(n).toLocaleString('en-CA');

export function createStory(app, lib, ui) {
  const { S, shelf } = app;
  const mess = lib.playlists.find((p) => p.id === lib.featured) || lib.playlists.find((p) => lib.tracks[p.id]?.length);
  const tracks = () => lib.tracks[mess.id] || [];
  const findTrack = (re) => Math.max(0, tracks().findIndex((t) => re.test(t.name)));
  const TARGET = lib.featuredTrack != null ? lib.featuredTrack : findTrack(/making the bed/i);
  const SEARCH = lib.searchQuery || 'olivia';
  const ownPlaylists = lib.playlists.filter((p) => !p.locked).length;

  let token = 0;
  let current = 0;
  let tickerTimer = 0;

  const ctxFor = (id) => {
    const check = () => {
      if (id !== token) throw new Cancelled();
    };
    return {
      check,
      wait: async (ms) => {
        await sleep(ms);
        check();
      },
      until: async (cond, max = 10000) => {
        const t0 = performance.now();
        while (!cond() && performance.now() - t0 < max) {
          await sleep(50);
          check();
        }
      },
    };
  };

  const idle = () => !S.busy;
  async function waitIdle(max = 9000) {
    const t0 = performance.now();
    while (S.busy && performance.now() - t0 < max) await sleep(60);
  }

  // ---------------------------------------------------------------- scene helpers
  /** Put the app into a known state. Only changes what differs, so re-entering a step is cheap. */
  async function scene({ mode = 'tracks', media = 'cd', theme = 'records', view = 'shelf', queue = false, search = false, hud = false } = {}) {
    await waitIdle();
    if (!search && app.searchOpen()) app.closeSearch();
    app.toggleQueue(queue);
    document.body.classList.toggle('pitch-hud', hud || queue);
    if (S.media !== media) app.setMedia(media);
    if (app.themeId !== theme) app.setTheme(theme);
    if (mode === 'playlists' && S.mode !== 'playlists') await app.showPlaylists(mess.id);
    if (mode === 'tracks' && (S.mode !== 'tracks' || S.playlist?.id !== mess.id)) await app.openPlaylist(mess);
    if (S.view !== view) app.setView(view);
  }
  const focus = (i, frame = true) => {
    S.keyboard = true;
    S.kbIndex = i;
    if (frame) S.scrollTarget = app.clampScroll(shelf.xOfIndex(i));
  };
  const unfocus = () => {
    S.keyboard = true;
    S.kbIndex = -1;
  };
  /** Glide the shelf camera from a to b over ms. */
  async function glide(c, a, b, ms) {
    const t0 = performance.now();
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      S.scrollTarget = app.clampScroll(a + (b - a) * e);
      if (t >= 1) break;
      await c.wait(16);
    }
  }
  /** Something must be playing for the jukebox steps; start the featured track quietly if not. */
  async function ensurePlaying() {
    if (S.queue?.current) return;
    await S.queue.start(tracks(), TARGET).catch(() => {});
  }
  const ticker = (fn) => {
    clearInterval(tickerTimer);
    if (!fn) return ui.ticker('');
    const tick = () => ui.ticker(fn() || '');
    tick();
    tickerTimer = setInterval(tick, 250);
  };

  // ---------------------------------------------------------------- the story
  const STEPS = [
    {
      caption: { layout: 'title', title: 'DISC//SHELF', body: 'Your Spotify library, as a room you can walk into.' },
      async enter(c) {
        await scene({ mode: 'playlists', view: 'juke' });
        unfocus();
      },
    },
    {
      caption: { layout: 'statement', title: 'Streaming made music infinite. It also made it invisible.' },
      async enter(c) {
        await scene({ mode: 'playlists', view: 'shelf' });
        unfocus();
        S.scrollTarget = app.clampScroll(0);
      },
    },
    {
      caption: () => ({ layout: 'caption', kicker: `${lib.user?.name || 'My'}’s library`, title: 'Every playlist is a binder.', body: `${lib.playlists.length} playlists straight from Spotify, each with its own cover on the spine.` }),
      async enter(c) {
        await scene({ mode: 'playlists', view: 'shelf' });
        for (let loop = 0; loop < 2; loop++)
          for (let i = 0; i < lib.playlists.length; i++) {
            focus(i, false);
            await c.wait(380);
          }
        focus(lib.playlists.indexOf(mess), false);
      },
    },
    {
      caption: () => ({ layout: 'caption', kicker: mess.name, title: `${fmt(tracks().length)} songs. One shelf.`, body: 'Real album art on every jewel case. Only the discs near the camera exist, so even this one stays smooth.' }),
      async enter(c) {
        focus(lib.playlists.indexOf(mess), false);
        await scene({ mode: 'tracks', view: 'shelf' });
        unfocus();
        ticker(() => `${shelf.live.size} of ${fmt(tracks().length)} cases built right now`);
        const end = shelf.length;
        await c.wait(400);
        await glide(c, S.scroll, end, 5200);
        await c.wait(300);
        await glide(c, end, shelf.xOfIndex(TARGET), 2600);
      },
      exit: () => ticker(null),
    },
    {
      caption: { layout: 'caption', kicker: 'Browse', title: 'Skim it like a record store.', body: 'Each case pops out as you pass, disc spinning. Mouse, arrow keys or a thumb.' },
      async enter(c) {
        await scene({ mode: 'tracks', view: 'shelf' });
        const row = Math.floor(TARGET / shelf.perRow);
        const start = Math.max(row * shelf.perRow, TARGET - 16);
        S.scrollTarget = app.clampScroll(shelf.xOfIndex(start + 8));
        await c.wait(500);
        for (let i = start; i <= TARGET + 6; i++) {
          focus(i, false);
          S.scrollTarget = app.clampScroll(shelf.xOfIndex(i));
          await c.wait(170);
        }
        for (let i = TARGET + 6; i >= TARGET; i--) {
          focus(i, false);
          await c.wait(260);
        }
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Search', title: 'Find anything.', body: 'Type, and the wall answers: every other disc goes dark and the camera flies to each match.' },
      async enter(c) {
        await scene({ mode: 'tracks', view: 'shelf', search: true });
        if (!app.searchOpen()) app.openSearch();
        const input = document.getElementById('search-input');
        input.value = '';
        input.dispatchEvent(new Event('input'));
        await c.wait(500);
        for (const ch of SEARCH) {
          input.value += ch;
          input.dispatchEvent(new Event('input'));
          await c.wait(110);
        }
        await c.wait(1300);
        for (let k = 0; k < 3; k++) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          await c.wait(1100);
        }
      },
      exit: () => app.searchOpen() && app.closeSearch(),
    },
    {
      caption: { layout: 'caption', kicker: 'Play', title: 'Pick a disc. The robot does the rest.', body: 'It pulls the disc, flies it across the room and drops it in the jukebox. Playback starts on Spotify.' },
      async enter(c) {
        await scene({ mode: 'tracks', view: 'shelf' });
        unfocus();
        S.scrollTarget = app.clampScroll(shelf.xOfIndex(TARGET));
        await c.wait(700);
        await app.robotPlay(TARGET);
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Queue', title: 'The jukebox racks what’s next.', body: 'Spotify can’t reorder or remove queue items, so the app owns the queue and keeps Spotify in sync.' },
      async enter(c) {
        await ensurePlaying();
        await scene({ mode: 'tracks', view: 'juke', queue: true });
        await c.wait(2600);
        const q = S.queue;
        if (q.items.length > q.index + 5) {
          q.move(q.index + 5, q.index + 1);
          app.pill(`PLAY NEXT · ${q.upcoming[0].name}`);
        }
        await c.wait(2400);
        app.toggleQueue(false);
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Bass', title: 'The whole room listens.', body: 'Speakers pump, shelves rattle and the lights hit on every kick. Mic sync reacts to the real bass in the room.' },
      async enter(c) {
        await ensurePlaying();
        await scene({ mode: 'tracks', view: 'juke', hud: true });
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Rooms', title: 'Pick your room.', body: 'Record store, 90s bedroom, arcade, vapor lounge, each dressed with your own album covers.' },
      async enter(c) {
        await ensurePlaying();
        await scene({ mode: 'tracks', view: 'juke', theme: 'records', hud: true });
        for (const id of ['bedroom', 'arcade', 'vapor', 'records']) {
          await c.wait(2600);
          app.setTheme(id);
        }
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Formats', title: 'CD. Vinyl. Tape.', body: 'Switch formats and everything follows: sleeves and a turntable for records, cassettes and a boombox for tapes.' },
      async enter(c) {
        await ensurePlaying();
        await scene({ mode: 'tracks', view: 'juke', media: 'cd', hud: true });
        await c.wait(1800);
        app.setMedia('vinyl');
        await c.wait(3400);
        app.setMedia('tape');
        await c.wait(3400);
        app.setMedia('vinyl');
        app.setView('shelf');
        S.scrollTarget = app.clampScroll(shelf.xOfIndex(TARGET));
        focus(TARGET, false);
      },
    },
    {
      caption: { layout: 'caption', kicker: 'Under the hood', title: 'No backend. Just the browser.', body: 'Three.js, the Spotify Web API and the Web Playback SDK, with PKCE login. Built for desktop and phones.' },
      async enter(c) {
        await scene({ mode: 'tracks', view: 'shelf', media: 'vinyl' });
        focus(TARGET);
        await c.wait(2500);
        for (let i = TARGET; i < TARGET + 10; i++) {
          focus(i);
          await c.wait(500);
        }
      },
    },
    {
      caption: { layout: 'title', title: 'DISC//SHELF', body: lib.url || 'diskshelf.saladsync.ca' },
      async enter(c) {
        await ensurePlaying();
        await scene({ mode: 'tracks', view: 'juke', media: 'cd' });
      },
    },
  ];

  async function go(n) {
    n = Math.max(0, Math.min(STEPS.length - 1, n));
    STEPS[current]?.exit?.();
    const id = ++token;
    current = n;
    const step = STEPS[n];
    ui.step(n, STEPS.length);
    ui.caption(typeof step.caption === 'function' ? step.caption() : step.caption);
    try {
      await step.enter(ctxFor(id));
    } catch (e) {
      if (!(e instanceof Cancelled)) console.error(e);
    }
  }

  /** Build everything ahead (covers, every room, every player) behind the loading screen. */
  async function prepare(progress) {
    const loaded = () => [...shelf.live.values()].filter((c) => c.cover).length / Math.max(1, shelf.live.size);
    progress(0.05, 'Pulling binders off the shelf…');
    await sleep(600);
    const t0 = performance.now();
    while (loaded() < 0.95 && performance.now() - t0 < 6000) await sleep(100);
    progress(0.25, `Opening ${mess.name}…`);
    await app.openPlaylist(mess);
    S.scrollTarget = S.scroll = app.clampScroll(shelf.xOfIndex(TARGET));
    await sleep(800);
    const t1 = performance.now();
    while (loaded() < 0.9 && performance.now() - t1 < 8000) await sleep(100);
    // every room and every player, rendered once, so switching on stage never stutters
    const themes = ['bedroom', 'arcade', 'vapor', 'records'];
    for (let i = 0; i < themes.length; i++) {
      progress(0.45 + i * 0.08, `Dressing the ${app.THEMES.find((t) => t.id === themes[i]).name.toLowerCase()}…`);
      app.setTheme(themes[i]);
      app.setView('juke');
      await sleep(700);
    }
    for (const m of ['vinyl', 'tape', 'cd']) {
      progress(0.8, `Warming up the ${{ vinyl: 'turntable', tape: 'boombox', cd: 'jukebox' }[m]}…`);
      app.setMedia(m);
      await sleep(600);
    }
    app.setView('shelf');
    await app.showPlaylists(mess.id);
    progress(1, 'Ready');
    await sleep(400);
  }

  return { STEPS, go, prepare, get step() { return current; } };
}
