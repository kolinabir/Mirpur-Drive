# Pass 13-B — Rebase the platform onto the train floor

Last updated: 2026-09-08
Author: Antigravity executor
Brief: `docs/briefs/P13B-PLATFORM-HEIGHT.md`

## Summary

In `src/metro.js`, `DECK_Y` (14.5 m) was previously treated as both rail level and platform floor level. On MRT Line 6, the train car floor sits 0.98 m above the deck/rail (0.36 m track offset + 0.62 m saloon floor). This caused players to step down 0.98 m when alighting, and caused platform screen doors (PSDs) to only overlap the bottom 36 cm of the train doors.

This pass establishes `METRO.PLATFORM_Y` (15.48 m) as the single source of truth for platform height, level with the car floor, and rebases all platform fixtures, walkable surfaces, signage, and player states to it while keeping track and viaduct structure on `DECK_Y`.

---

## Constants & Heights

| Parameter | Formula | World Y | Purpose |
|---|---|---|---|
| `SOFFIT_Y` | constant | 12.50 m | Viaduct box girder underside |
| `DECK_Y` | `SOFFIT_Y + GIRDER_DEPTH` | 14.50 m | Structural deck top / rail top |
| `TRAIN_Y_OFFSET` | constant | 0.36 m | Train group position above deck |
| `TRAIN_FLOOR_LOCAL_Y` | constant | 0.62 m | Interior saloon floor level (train-local) |
| `PLATFORM_Y` | `DECK_Y + TRAIN_Y_OFFSET + TRAIN_FLOOR_LOCAL_Y` | **15.48 m** | **Platform floor top == car floor** |
| `CONCOURSE_Y` | constant | 8.00 m | Station concourse floor level |

`METRO` exports `SOFFIT_Y`, `DECK_Y`, `PLATFORM_Y`, `TRAIN_Y_OFFSET`, and `TRAIN_FLOOR_LOCAL_Y`. `src/traininterior.js` imports `METRO.TRAIN_FLOOR_LOCAL_Y` to prevent drift.

---

## Before vs. After

| Feature | Before (DECK_Y) | After (PLATFORM_Y) | Delta |
|---|---|---|---|
| **Platform Walkable Slab** | 14.50 m | 15.48 m | +0.98 m |
| **Step Into Berthed Train** | -0.98 m drop | 0.00 m (flush) | Continuous |
| **Train Doorway Opening** | [15.48, 17.56] m | [15.48, 17.56] m | Unchanged |
| **PSD Opening (0 to 1.55 m above floor)** | [14.50, 16.05] m | [15.48, 17.03] m | Overlaps doorway 100% |
| **Concourse -> Platform Rise** | 6.50 m | 7.48 m | +0.98 m |
| **Concourse -> Platform Run** | 11.0 m (`halfD=5.5`) | 13.0 m (`halfD=6.5`) | +2.0 m |
| **Concourse -> Platform Ramp Slope** | 30.6° (6.5/11) | 29.9° (7.48/13) | Maintained escalator pitch (~30°) |
| **Stair/Escalator Landing Z** | 18.5 m | 19.5 m | Clear of PSD and columns |
| **Pedestrians on Platform** | 14.50 m | 15.48 m | Standing flush on new floor |
| **Alight Player Feet Y** | 14.50 m | 15.48 m | Stepping out level onto slab |

---

## Clearances & Geometry Verification

1. **Headroom Under Canopy**:
   - `buildCanopy()` receives `PLATFORM_FLOOR_Y = PLATFORM_Y = 15.48 m`.
   - Spring line: `15.48 + 2.0 = 17.48 m` (2.0 m above platform floor).
   - Canopy apex: `15.48 + 6.5 = 21.98 m` (6.5 m headroom above platform floor).
   - Column base: sits on `15.48 m`. Full headroom preserved.

2. **Canopy vs. Catenary Portal Frame**:
   - Catenary portal frame top beam: `DECK_Y + 5.4 = 19.90 m` across `X ∈ [-3.35, +3.35] m`.
   - Canopy underside at `X = ±3.35 m`: `21.55 m`.
   - Canopy underside at center (`X = 0`): `21.91 m`.
   - Minimum vertical clearance from catenary beam to canopy: **1.59 m** clear (increased from 0.61 m).

3. **Concourse Box Ceiling Clearance**:
   - Concourse roof slab: `CONCOURSE_Y + CONCOURSE_WALL_H + 0.6 = 13.20 m` center, top face at `13.45 m`.
   - Platform floor: `15.48 m`.
   - Clearance: **2.03 m** between concourse roof and platform floor.

4. **PSD vs. Train Doorway Overlap**:
   - Train doorway vertical opening: `[15.48, 17.56] m` (height 2.08 m).
   - PSD opening (between fixed frames and open sliding glass): `[15.48, 17.03] m` (height 1.55 m).
   - The opening is 100% aligned with the train door opening from floor level up to 1.55 m.

---

## Changes by File

- **`src/metro.js`**:
  - Added `TRAIN_Y_OFFSET`, `TRAIN_FLOOR_LOCAL_Y`, `PLATFORM_Y`.
  - Exported them on `METRO`.
  - Rebased `PLATFORM_FLOOR_Y = PLATFORM_Y`.
  - Rebased canopy column roundels from `DECK_Y + 3.4` to `PLATFORM_FLOOR_Y + 3.4`.
  - Used `DECK_Y + TRAIN_Y_OFFSET` for train instances and animation update.
- **`src/traininterior.js`**:
  - Imported `METRO` from `./metro.js` and set `FLOOR_Y = METRO.TRAIN_FLOOR_LOCAL_Y`.
- **`src/interior.js`**:
  - Set `RUN_PLATFORM = 6.5` to maintain ~30° escalator slope.
  - Rebased `needsRail` and `openAxis` check to `METRO.PLATFORM_Y`.
  - Rebased platform walkable slab, PSD barriers, and outer crash walls to `METRO.PLATFORM_Y`.
  - Rebased lift stops `[0, CONCOURSE_Y, METRO.PLATFORM_Y]`, shaft posts `postH = METRO.PLATFORM_Y`, link bridge slab and rails, and lift ticket gate check.
  - Rebased platform maps, direction boards, platform number signs, and PIDs to `METRO.PLATFORM_Y`.
  - Rebased paid-side platform access core `hiY: METRO.PLATFORM_Y`.
- **`src/traffic.js`**:
  - Platform pedestrians loiter at `y: METRO.PLATFORM_Y`.
- **`src/stationlife.js`**:
  - `alight()` sets `player.feetY = METRO.PLATFORM_Y` and `player.position.y = METRO.PLATFORM_Y + RIDE_EYE_HEIGHT`.
  - `findGatewayCandidate()` checks `Math.abs(player.feetY - METRO.PLATFORM_Y) <= GATEWAY_FEET_TOL`.
  - Interactable prompt markers positioned at `METRO.PLATFORM_Y`.
- **`src/main.js`**:
  - Arrival teleport uses `METRO.PLATFORM_Y + 1.68`.
  - Digit3 platform preset uses `METRO.PLATFORM_Y + 2.6`.

---

## Remaining Gaps / Future Notes

- Street-to-concourse stairs (`RUN_ENTRANCE = 7`) remain unchanged since concourse height (`8.00 m`) did not change.
- Any future platform accessories (e.g. platform end service stairs or track access ladders) must be measured from `METRO.PLATFORM_Y`.
