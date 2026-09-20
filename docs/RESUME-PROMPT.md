Paste this into a fresh Claude Code session opened in
the repository root
(or with that folder as an additional working directory):

---
I'm continuing the Mirpur 3D game (Three.js + Vite, walkable/drivable
reconstruction of Mirpur, Dhaka, along MRT Line 6). Use Fable 5.1 as
ADVISOR and Sonnet 5 subagents as EXECUTORS with one owner per file.

Read first, in order:
1. docs/PAUSE-STATE.md  (where every executor stopped, what is verified)
2. docs/REVIEW-2026-09-07.md  (advisor verification log, evidence per task)
3. docs/HANDOFF.md
4. docs/DECISION-PLAYABLE-AREA.md  (400 m band; map = Mirpur 10 -> Uttara
   South + west arm to Mirpur 1 + east arm to Kachukhet; no Kazipara)
5. reference/metro/OWNER-PHOTOS-2026-09-07.md  (my photos; overrides specs)
6. docs/briefs/P0-COMMON.md  (rules every executor follows)

Then: verify on disk whether the three executors that were running at
pause finished (table in PAUSE-STATE.md: metro E2b, main wiring P1-MAIN,
interior E3c) by checking file mtimes, docs and screenshot md5s. Do not
believe any report you cannot see evidence for. Relaunch unfinished
briefs from docs/briefs/. Then continue with the "Next, in order" list
in PAUSE-STATE.md. Write every finding into docs/ as you go.

Run: npx vite --port 5183 --strictPort (check first with lsof -i :5183;
one may already be running). Open http://localhost:5183/?debug, wait
~25 s, click "Enter the street" at [399,318] in an 800x450 frame.
Executors screenshot via window.__mirpur.player (yaw/pitch/position),
player.update(0), then window.__mirpur.capture(). ?scene=north loads the
expanded map once P1-MAIN has landed.

Tell me first what state you found, then what you will launch.
---
