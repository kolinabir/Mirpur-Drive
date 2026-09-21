# Shot list and script

60 s · 60 fps · 120 BPM (1 bar = 2 s). Source of truth: `src/timeline.ts`,
`src/script.json`, `capture/shots.js`.

## Structure

| Time | Music | Picture | Voice-over |
|---|---|---|---|
| 0–4 s | pad, heartbeat | **dawn-crane**: crane up beside the viaduct at first light. Lower third: Pallabi Metro Station, Mirpur 12 | "This is Mirpur." |
| 4–8 s | | **intro-cinematic** (the game's own opening): aerial follow of an MRT Line 6 train | "Rebuilt street by street, from the real map of Dhaka." |
| 8–10 s | riser starts | **footbridge-glide**: Mirpur 10 foot over bridge from the carriageway | |
| 10–12 s | riser | **benarasi-gate**: push through the Benarasi Palli gate | |
| 12–16 s | **drop** | **drive-chase**: the game's chase camera, Pallabi shopfronts. Word: DRIVE | "Take the wheel, under the pillars of Metro Line Six." |
| 16–18 s | | **drive-front**: low three-quarter camera ahead of the car, at half speed | |
| 18–22 s | | **train-chase**: flying beside a northbound train at golden hour. Word: RIDE | "Or leave the car behind. Climb to the platform, and ride the metro." |
| 22–26 s | | **platform-arrival**: train runs in and berths at the screen doors, Pallabi | |
| 26–28 s | | **intro-cinematic**: passenger window view | |
| 28–30 s | | **walk-pallabi**: the real on-foot walk with head bob. Word: WALK | "Walk the footpaths. Find the stadium, the bazaars, the places you know." |
| 30–34 s | | **stadium-orbit**: Sher-e-Bangla National Cricket Stadium | |
| 34–38 s | breakdown | **rain-street**: monsoon on the corridor | "Through monsoon rain," |
| 38–42 s | riser, roll | **night-street**: lit windows, streetlights, stars | "and into the night." |
| 42–52 s | climax | ten one-second cuts from all of the above. Stacked type: NO DOWNLOAD / NO INSTALL / JUST A LINK | "No download. No install. It runs right in your browser." |
| 52–60 s | final hit, tail | **End card** over slowed train footage: MIRPUR DRIVE · মিরপুর ড্রাইভ · Play free in your browser · mirpurdrive.recalfy.com · GitHub | "Mirpur Drive. Play it free, right now." |

## Captured shots

| Shot | Length | Time of day | How |
|---|---|---|---|
| dawn-crane | 6 s | morning | fly camera over the carriageway north of Pallabi, 2 m → 23 m |
| train-chase | 6 s | late afternoon | waits for a northbound train past Mirpur 11, then tracks it from beside the deck |
| drive-chase | 8 s | midday | real car physics, scripted lane keeping at ~60 km/h, game chase camera (hand-framed in 9:16) |
| drive-front | 5 s | midday | same drive, camera ahead of the car looking back |
| platform-arrival | 9 s | midday | waits for a train ~150 m out, slow push along the Pallabi platform |
| stadium-orbit | 6 s | late afternoon | orbit at 54–62 m |
| footbridge-glide | 5 s | midday | east carriageway toward the Mirpur 10 bridge |
| benarasi-gate | 5 s | midday | dolly from 30 m outside the gate to 8 m inside |
| walk-pallabi | 5 s | midday | the player actually walking (W held) |
| rain-street | 6 s | late afternoon + monsoon | street-level push |
| night-street | 6 s | night | footpath dolly past a streetlight |
| intro-cinematic | 19.4 s | game's own | `introCinematic.start()`; cut frames are logged and stored in `INTRO_SHOTS` |

Not shot yet, worth adding: Jatiya Sangsad Bhaban (needs a `--scene bijoy`
session), a rickshaw/CNG ride, station concourse and gates, a streetlight knock-down.
