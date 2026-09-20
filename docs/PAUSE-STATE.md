# Pause state, 2026-09-07 ~19:10 (second pause of the day)

> SUPERSEDED IN PART by session 3. See the "Session 3" section at the end
> of docs/REVIEW-2026-09-07.md for what was found on disk (E2b and P1-MAIN
> had finished; E3d had never run) and what changed since (fly ungated,
> full map on click/M, the NORTH SCENE IS NOW THE DEFAULT, quick travel 5/6).
> Current status block is at the bottom of this file.

Owner is about to run out of usage. This file is the authoritative
"where we are". Read it before anything else, then docs/REVIEW-2026-09-07.md
(advisor verification log of every executor today) and docs/HANDOFF.md.

## Working arrangement
Fable 5.1 = advisor (diagnose, brief, verify). Sonnet 5 = executor (edit,
screenshot). One owner per file, briefs in docs/briefs/, every report
checked against md5 + screenshots before being believed. Executors could
NOT be messaged mid-task this session (SendMessage disabled), so mid-task
corrections go into the brief file on disk and a follow-up brief.

## Owner decisions today
- Final product is PLAYABLE: walk + drive only, no fly mode in prod
  (fly stays behind ?debug for executors).
- Playable band: 400 m each side of the corridors (docs/DECISION-PLAYABLE-AREA.md).
- Map extent: Mirpur 10 -> Mirpur 11 -> Pallabi -> Uttara South along the
  metro, plus west arm to Mirpur 2/1 and east arm to Kachukhet. NO
  Kazipara/Shewrapara. Data built: public/scene-north.json (55k
  buildings, 4 stations). Not yet the default scene.
- Owner photos of Mirpur 10 are the spec: reference/metro/OWNER-PHOTOS-2026-09-07.md
  (three batches). Green canopy roof, grey lattice trusses, glass
  skylights, white pill signs, white entrance boards, brick box spanning
  the road on portal columns, chamfered piers, masts every 30 m.
- Drivable car exists (Drive button / V key).

## Executors that were RUNNING at pause (check their docs/screenshots)
| Executor | Files owned | Expected outputs | If missing |
|---|---|---|---|
| E2b metro to photos (running since 15:20, very long) | src/metro.js, src/signs.js | docs/METRO-REVIEW.md appended, screenshots/metro-*.jpg (new md5s), metro-concourse-ext.jpg | Compare mtimes; if metro.js mtime > 15:20 the work is partly in. Re-screenshot views yourself before relaunching with docs/briefs/P0-E2b-METRO-PHOTOS.md (has 16:20 and 16:35 corrections appended). |
| P1-MAIN wiring (launched 19:05) | src/main.js, index.html, src/player.js, src/drive.js | docs/MAIN-WIRING.md, screenshots/p1-main-*.jpg; ?scene=north works; ?debug gates fly; 400 m boundary | Relaunch with docs/briefs/P1-MAIN-WIRING.md |
| E3c interior finish: DONE 19:30 (code only, no browser: tab cap). Advisor verified the stair climbs (feetY 0->8) but found two landing bugs (docs/INTERIOR-PASS.md 19:40). | | | |
| E3d interior fix+verify (launched 19:45) | src/interior.js, src/walkable.js | docs/INTERIOR-PASS.md appended, screenshots/p1-int-01..08.jpg | Relaunch with docs/briefs/P1-E3d-INTERIOR-FIX-VERIFY.md |

## Verified DONE today (see REVIEW log for evidence)
Road texture fix; corridor clip (no buildings under the viaduct); poles
out of the road; car; data cull + far tags; LOD + merge (street 691
draws, 0.96 M tris); draw-call audit (metro = 472 of 747 calls, the next
perf target); textures loader fix (metro maps were silently never
loading); six new CC0 texture sets for piers/floors/stainless; night.js
per-frame error fixed; north map data; tile streaming in city.js.

## Next, in order, after the three running executors are verified
1. P1-C metro draw-call merge + world-space UVs + new pier concrete +
   green roof + white boards: docs/briefs/P1-C-DRAWS-METRO.md (append the
   OWNER-PHOTOS corrections; metro.js must be free).
2. Flip the default scene to scene-north.json once ?scene=north is
   verified (main.js one line), and retune start/quick-travel for four
   stations.
3. Traffic on the new roads and pedestrians; entrance stair detail
   (scissor gate, canopies); OCS masts on both parapets.
4. git init inside mirpur3d and commit (owner said yes to nothing yet;
   ask). The folder is untracked inside the parent repo.

## Gotchas learned today
- Hidden browser pane: rAF never fires; use player.update(0) then
  window.__mirpur.capture(). Browser pane caps at ~9 tabs; close yours.
- Do not run verification passes while 4+ executors edit src/: the page
  reloads under them and wipes the hook. Prefer one verification pass at
  a time, or a second vite instance on another port for verification.
- An executor's "small residual" or "already correct" must be checked
  against its own screenshot; E2 overstated twice.


## SESSION 3 STATUS (2026-09-07 evening) — read this, not the table above

Verified on disk at resume: E2b metro and P1-MAIN wiring had FINISHED (see
the session-3 section of docs/REVIEW-2026-09-07.md for the mtime/md5
evidence). E3d interior had NEVER RUN — interior.js was untouched since
E3c and there were no p1-int-*.jpg — so the two landing bugs were still
live. Relaunched.

### Landed by the advisor this session (all verified in the browser)
- Fly restored for everyone (owner asked). F, 3 and 4 work with no ?debug;
  the start card and help panel show them again. player.js + main.js.
- Click the minimap (or press M) for the whole map. Needed a real bug fix:
  #minimap inherited pointer-events:none from #hud, so clicks fell through
  to the WebGL canvas. index.html + minimap.js + main.js.
- **THE NORTH SCENE IS NOW THE DEFAULT.** Plain http://localhost:5183/
  loads scene-north.json: 55,091 buildings, 1,545 roads, 4 stations
  (Mirpur 10, Mirpur 11, Pallabi, Uttara South). `?scene=old` is the
  fallback to the old two-station scene.json.
- Quick travel: 5 = Pallabi, 6 = Uttara South (no-ops on the old scene).

### Running executors (Sonnet)
| Executor | Owns | Brief |
|---|---|---|
| E3d interior fix+verify | src/interior.js, src/walkable.js | docs/briefs/P1-E3d-INTERIOR-FIX-VERIFY.md |
| P2-STREAM-FIX | src/city.js | docs/briefs/P2-STREAM-FIX.md |
| P3-MAP-GTA | src/minimap.js, index.html | docs/briefs/P3-MAP-GTA.md |

P2-STREAM-FIX is now the highest-priority bug: with the north scene as the
default, the tile-streaming plateau is what would stop the northern half of
the map from appearing after a long drive.

### Next, in order, after those three
1. P1-C metro draw-call merge + world-space UVs + green roof + white boards:
   docs/briefs/P1-C-DRAWS-METRO.md. metro.js and signs.js are FREE now.
2. Traffic and pedestrians on the new northern roads; entrance stair detail
   (scissor gate, canopies); OCS masts on both parapets.
3. Retune the start position and the loading copy for the four-station map
   (the start card still says "Mirpur 10 to Mirpur 11").
4. git init inside mirpur3d and commit — still not done, still needs the
   owner's yes. The folder is untracked inside the parent repo.
