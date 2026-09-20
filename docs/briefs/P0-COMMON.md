# Pass 0 common rules for every executor (read before your own brief)

Project: the repository root (mirpur3d)
Dev server: ALREADY RUNNING at http://localhost:5183 (vite, HMR). Do NOT start
another one and do not kill it. Every save triggers a reload; the scene
rebuild takes ~25 s in the browser.

## File fences (absolute)
You may edit ONLY the files listed in your brief. Two other executors are
working in parallel on other files. If you need something from a file you do
not own, reach it at runtime by walking the scene graph by object name, or
write the request into docs/ and continue. Never touch another owner's file.

## Browser verification (mandatory, no report without screenshots)
- Use the Claude Browser tools. FIRST call tabs_create to get your OWN tab
  and pass that tabId on every call. Never act on tab "seed" or another
  agent's tab.
- navigate to http://localhost:5183, wait ~28 s, then click the start button
  at coordinate [399,318] in the 800x450 frame (take a screenshot first and
  find the "Enter the street" button; a find/ref click does NOT dismiss it).
- Keys: 1 Mirpur 10 approach, 2 Mirpur 11, 3 platform (fly), 4 aerial,
  T time of day, F fly, WASD move. Mouse-look needs pointer lock, which an
  automated browser does not have. To look around use the debug hook that
  the controls executor is adding early in this pass:
    window.__mirpur = { player, scene, renderer, camera, metro, capture() }
  Set player.yaw / player.pitch (radians, pitch negative = look down),
  player.position.set(x,y,z), player.flying = true/false. If the hook is
  not there yet, reload the page and check again a few minutes later; do
  other work meanwhile.
- To SAVE a screenshot to disk, run with javascript_tool:
    await new Promise(r => requestAnimationFrame(() =>
      r(document.querySelector('canvas').toDataURL('image/jpeg', 0.7))))
  then write the base64 (after the comma) to screenshots/<name>.jpg with
  Bash (`echo '<b64>' | base64 -d > screenshots/x.jpg`). Verify with
  `ls -la` and `md5` that files are distinct and non-trivial. Identical
  checksums mean you captured the same frame; redo.
- Read your screenshots back with the Read tool and describe honestly what
  you see. The advisor will open them too.

## Reporting
- Write your findings/decisions into the docs file named in your brief as
  you go, not only at the end. The owner may lose the session at any time.
- Final report: what you changed (file:line), what you verified (screenshot
  filenames), what is NOT done. Never claim success you did not see.
- Do not spawn sub-agents. Do not run git commit.
- Coordinate frame: metres, +X east, +Z south. Mirpur 10 station ~(149,594),
  Mirpur 11 ~(-155,-601). Face winding convention in this repo: quads use
  index order (0,2,1),(0,3,2); keep it.

## Screenshot gotcha (learned by E4)
When the Browser pane is hidden, requestAnimationFrame never fires, so the
game loop is frozen. After moving the player call
`window.__mirpur.player.update(0)` then `window.__mirpur.capture()` to get
a freshly rendered frame. Without this you get identical screenshots.

## Tab hygiene
The Browser pane caps at ~9 tabs. Close YOUR tab with tabs_close when you
finish. If tabs_create fails, wait 60 s and retry up to 5 times; then
report the block honestly and finish non-browser work.
