# Pitch Script

The spoken script for the three-minute pitch on `/pitch/` (see [PITCH.md](PITCH.md) to run it).
It follows the deck's own flow: each line is written for where the camera is and what's moving
on that step.

**Status: draft.** If a line changes meaning, update the matching caption in
[`src/pitch/story.js`](src/pitch/story.js) so the screen and the voice agree.

## Speakers

| Speaker | Part | Steps | ~Talk time |
|---|---|---|---|
| **Speaker 1** (lead, it's their library on screen) | Opening, the problem, how it's built, the close | 0–2, 11–12 | 55 s |
| **Speaker 2** | Browsing at scale and search; then rooms and formats | 3–5, 9–10 | 65 s |
| **Speaker 3** | Playing a song: the robot, the queue, the bass | 6–8 | 50 s |

The order of voices is 1 → 2 → 3 → 2 → 1. Speaker 2 comes back for the look of the app, and
Speaker 1 takes it home, so the opening and closing come from the same voice.

One person presses → every time (Speaker 1 is easiest: they're on stage at both ends). **Press on the last word of the line**, not after it: the camera
takes a second or two to arrive, and the next line starts as it settles. The deck never waits for
you: if a step's animation is still running when you press, it cuts cleanly to the next one.

## The flow

Holds are how long the step's own animation runs, measured from the deck's timings.

| Step | Where the camera is | What happens | Hold |
|---|---|---|---|
| 0 | The record store, jukebox in the middle | Title card | 10 s |
| 1 | Pulls back to the playlist shelf | The problem, as a statement | 8 s |
| 2 | Playlist shelf | Every binder pops out in turn, twice; a live readout names each one | 10 s |
| 3 | Into the biggest playlist | The camera flies the whole 1,300-song wall and back; ticker counts the cases built | 9 s |
| 4 | One row of CDs | A run of cases pops out one after another, slowing onto the featured track | 6 s |
| 5 | Same wall | Search types itself, the wall goes dark except the matches, the camera jumps between them | 6 s |
| 6 | Same wall, then across the room | The robot pulls the disc, flies it to the jukebox, drops it in; the song starts | 5 s |
| 7 | The jukebox | The queue drawer slides in; a song jumps to the top; the rack behind the glass refills | 5 s |
| 8 | The jukebox | Speakers pump, the room shakes on the kick, the player bar shows the song | open |
| 9 | The jukebox | Room changes every 2.6 s: 90s bedroom, arcade, vapor lounge, back to the record store | 10 s |
| 10 | The jukebox | CD jukebox → turntable → boombox → back to vinyl on the shelf | 9 s |
| 11 | Wall of vinyl sleeves | Records slide out one by one | 7 s |
| 12 | The jukebox | Closing title with the URL | open |

Total holds: about 1:45 of animation, which leaves roughly 75 s of talking room around it. That's
what makes 3:00 comfortable. Don't rush the holds; talk over them.

## Script

*[beat]* means a full one-second pause. Bold words get the stress. *Italics* are stage directions.

### 0 · The record store, the title (S1)

*The deck opens in the record store. Let the room sit for a second before speaking.*

> Think about the last time you were in a **record store**.
> *[beat]*
> You didn't search. You **wandered**. You pulled things off the shelf because the cover caught
> your eye.

### 1 · The problem (S1)

*Press. The statement comes up over the shelf.*

> Streaming gave us every song ever made. And somewhere along the way, our collections turned
> into a **list** we never look at.

### 2 · The binders (S1)

*The binders start popping out one by one.*

> So we built DISC//SHELF. Every playlist is a **binder** on a real shelf, with its real cover on
> the spine. These are **mine**, straight from Spotify.

### 3–5 · Browsing at scale (S2)

**3** *Speaker 1 presses on "Spotify". The camera dives into the biggest playlist and starts flying.*
> And when you open one, it's a wall of jewel cases. This one has **thirteen hundred** songs,
> every case with its real album art.
> *Point at the ticker as it counts.*
> Only the discs near the camera actually exist, so it stays smooth no matter how big your
> library gets.

**4** *The cases start popping out down the row.*
> You browse it the way you'd browse a store: run your mouse or your thumb along the shelf and
> each case **pops out**, disc spinning.

**5** *The search starts typing by itself. Stay quiet until the wall goes dark.*
> And if you know what you want, just **type**.
> *[beat]*
> Everything else goes dark, and the camera flies to each match.

### 6–8 · Playing a song (S3)

**6** *Speaker 2 hands over on "match". Press, and wait for the robot arm to start moving before speaking.*
> Pick one, and the **robot** does the rest.
> *Let the arm carry the disc across the room. Speak again as it drops into the jukebox.*
> Into the jukebox, and it's playing, through **real Spotify**.

**7** *The queue drawer slides in.*
> Now, here's something Spotify **can't** do. Its API won't let you reorder or remove songs from
> your queue. So we own the queue ourselves and keep Spotify in sync.
> *A song jumps to the top of the list.*
> Drag it, drop it, play it next. And the jukebox **racks** it behind the glass.

**8** *The room is pulsing. Let the bass land for a beat before speaking.*
> And the whole room **listens**. Speakers pump, shelves rattle, lights hit on every kick.
> Turn on mic sync and it reacts to the **actual** bass in the room.

### 9–10 · Rooms and formats (S2)

**9** *Speaker 3 hands back on "bass in the room". Press. The room starts changing; speak over the changes, don't wait for them.*
> And it's your room. A 90s bedroom… an arcade… a vapor lounge… or back to the record store.
> Every poster and every crate is dressed with **your own** covers.

**10** *The jukebox turns into a turntable.*
> Pick your format, too. **Vinyl**, and you get sleeves and a turntable.
> *It turns into a boombox.*
> **Tapes**, and you get cassettes and a boombox. The shelf, the robot and the player all change
> with it.

### 11–12 · How it's built, and the close (S1)

**11** *Speaker 2 hands back on "change with it". The vinyl wall; records slide out one by one.*
> And there's no backend. It's Three.js and the Spotify Web API, running entirely in your browser,
> on desktop and on your **phone**.

**12** *The closing title.*

> Your music deserves somewhere to **live**.
> *[beat]*
> This is DISC//SHELF. Try it at **discshelf.saladsync.ca**. Thank you.

## What changes from day to day

The deck fills these in from the saved library, so the script never depends on them. Read them off
the screen on the rehearsal run.

| Step | Live value | Notes |
|---|---|---|
| 2 | Number of playlists, names on the readout | From `public/pitch/library.json` |
| 3 | The biggest playlist you own and its size | "Thirteen hundred" assumes The Mess I Am (1,336); change the line if you recapture a different one |
| 5 | The search word (`olivia`) and its matches | Set `searchQuery` in the snapshot to change it |
| 6 | The featured song (`making the bed`) | Set `featuredTrack` in the snapshot to change it |

## Rehearsal notes

- **Audio:** for real music, be logged in to the app in the presenting browser (Premium) and press
  any key once before step 0 to unlock audio. Silent runs still show everything.
- **If something looks off mid-talk:** press ← then → to re-run the step; every step rebuilds its
  own scene.
- **Questions after:** press **M** for free mode and drive the real app; M again to return.
