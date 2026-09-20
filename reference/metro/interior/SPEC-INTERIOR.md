# Dhaka MRT Line 6 — Station INTERIOR Build Spec (Mirpur 10 / Mirpur 11)

Companion to `reference/metro/SPEC.md` (exterior/structure). This document
covers everything inside the station envelope: concourse (Level 1) and
platform (Level 2). Units: metres. Confidence tags as in the parent SPEC:
**[CONFIRMED]** (sourced), **[ESTIMATE]** (inferred/photo-derived — flagged,
treat as adjustable). Read `photos/CREDITS.md` in this folder first — every
finish/dimension claim below is cross-checked against the images listed
there, plus the existing `reference/metro/photos/` set (esp. photos 06, 11,
13, 24, 32) and the ADDENDUM in `SPEC.md`.

---

## 0. Governing facts for the interior [CONFIRMED unless flagged]

| # | Fact | Value | Source |
|---|---|---|---|
| I1 | Station levels | Ground (G, street) → Concourse (L1) → Platform (L2) | SPEC.md #8, Wikipedia station articles |
| I2 | Concourse function | Ticketing, AFC gate line, customer service, crossover between the two platform-access legs | metrodhaka.com Mirpur 10 / Mirpur 11 |
| I3 | Ticket types | Single-journey QR paper ticket (token-equivalent) + MRT Pass (NFC smart card, permanent, rechargeable) | Wikipedia "MRT Pass"; metrodhaka.com |
| I4 | Fare range | Tk 20 (minimum) – Tk 100 (maximum), +Tk 10 per 2 stations after the minimum | eduportalbd.com fare guide; metrodhaka.com Mirpur 11 sample fares (Mirpur 10 = ৳20, Agargaon = ৳30, Farmgate = ৳40 from Mirpur 11) |
| I5 | MRT Pass economics | Card cost Tk 500 (Tk 200 refundable deposit + Tk 300 preloaded); reload Tk 100–1,000 per TVM transaction; balance cap Tk 10,000; 10% fare discount vs single-journey ticket | Wikipedia "MRT Pass" |
| I6 | Where to get MRT Pass | Customer Service Centre / "Excess Fare Office" at concourse level, every station | Wikipedia "MRT Pass"; metrodhaka.com |
| I7 | Ticket purchase & top-up | Self-service Ticket Vending Machines (TVM) issue single-journey QR tickets and top up MRT Pass balance automatically; a staffed counter handles MRT Pass issuance, refunds and problem resolution | eduportalbd.com; metrodhaka.com Mirpur 10/11 |
| I8 | AFC gate reading | Tap MRT Pass or insert/scan QR ticket to enter (tap in); tap/insert again to exit (tap out) — single-journey tickets are retained/captured by the exit gate, MRT Pass is only tapped, never surrendered | general AFC operating principle, confirmed by E&M scope (SPEC.md #13) — **[ESTIMATE]** exact tap-out capture mechanism not independently confirmed by a DMTCL source, but is standard for every comparable JICA-funded AFC system and matches gate hardware visible in `photos/i01–i02` |
| I9 | Security screening | Passengers and bags are screened before/at the gate line: walk-through metal detector plus baggage scan/manual check, security personnel posted at the gate line | general search result on Dhaka metro security check (see Sources); confirmed presence of uniformed security in `photos/i01` at the gate line — **[ESTIMATE]** exact equipment model/placement, no DMTCL diagram found |
| I10 | Prohibited items signage | Flammable/corrosive/explosive materials, large luggage, pets/animals, food/drink, smoking — all banned; posted at station entrances | dhakametrorail.org "Prohibited Items & Luggage Rules"; "Laws & Rules" |
| I11 | Platform type | Side platforms (2, one per direction), track between | SPEC.md #10 |
| I12 | PSD type | **Half-height** platform screen doors, ~1.5 m tall, stainless-steel frame + glass, aligned to train doors | SPEC.md ADDENDUM A6, confirmed again in `photos/i25` (DU station) and `photos/i10-i13,i23` |
| I13 | Women's coach | The **front-most coach of the train (Car 1, in the direction of travel)** is reserved for women; men are redirected by station security if they enter it; women may still ride in any other coach; other coaches have priority seating for elderly/pregnant passengers | Dhaka Tribune "Metro rail eases travel for women with reserved coaches"; The Daily Star "reserved bogie for women" — **[ESTIMATE]** whether "Car 1" is fixed to a specific physical end of the 6-car set (Uttara-facing vs Motijheel-facing) across the whole line is not confirmed by a diagram; treat as the leading car in whichever direction is signed "Uttara Uttara ⇄ Motijheel" and mark the corresponding platform zone |
| I14 | Operating hours | Sat–Thu: first train 06:30, last train 21:50. Friday: first train 15:00, last train 21:50 | metrodhaka.com Mirpur 10/11 |
| I15 | Headway | Every 5–6 minutes at peak; every ~20 minutes at the start/end of service window | metrodhaka.com Mirpur 10/11 |
| I16 | Photography | No official public "photography allowed/banned" statement found; commuters are seen taking phone photos freely in multiple source photos (e.g. `photos/i01`) and in the base photo set — treat as generally tolerated for personal use, tripods/commercial filming likely restricted | **[ESTIMATE]** — no DMTCL source found either way |
| I17 | On-escalator etiquette | Stand left, walk right (keep right lane clear) | dhakametrorail.org "Do's & Don'ts" |
| I18 | Wi-Fi | Free public Wi-Fi at concourse level, described as "limited coverage" | metrodhaka.com Mirpur 10/11 |
| I19 | Toilets | Wheelchair-accessible toilets provided at concourse level | metrodhaka.com Mirpur 10/11 |
| I20 | Accessibility | Full step-free route: lift at every entrance leg + at least one lift concourse→platform; tactile paving throughout; wide accessible AFC gate lane | metrodhaka.com Mirpur 10/11; SPEC.md checklist #15 |
| I21 | CCTV / control | CCTV monitoring and on-site security at every station; station control room presence implied by E&M scope (signalling/CBTC) but no public floor-plan found | metrodhaka.com; SPEC.md #13 — **[ESTIMATE]** control-room location within the station (concourse-level back-of-house room, not publicly documented) |

### Not directly published — interior ESTIMATES

| # | Fact | Estimate | Basis |
|---|---|---|---|
| I22 | Escalators per station | **[ESTIMATE]** 1 pair (up+down) at each of the 2 main entrance legs to concourse, plus 1–2 pairs concourse→platform (one pair per platform side) → roughly 4–6 escalator units at Mirpur 11 (2 entrances), 6–8 at Mirpur 10 (4 entrances) | No DMTCL per-station equipment count published; pattern inferred from photo evidence (`photos/i07`, `i25`) showing single-flight escalators at both street-to-concourse and platform-to-concourse transitions on comparable stations, and from general "elevators, escalators, stairs on both sides" reporting (Dhaka Tribune) |
| I23 | Lifts per station | **[ESTIMATE]** 1 lift per entrance leg (street→concourse) + 1 lift concourse→platform (serving both platforms via the crossover, or one per platform) → 3 at Mirpur 11, 5 at Mirpur 10 | Same source gap as I22; `photos/i24` confirms individual free-standing lift pavilions exist at street level, one per entrance |
| I24 | Staircases per station | **[ESTIMATE]** 1–2 open stair flights per entrance leg (redundant to escalator) plus at least 1 stair concourse→platform per side | Standard practice for redundant emergency egress at every elevated-metro station worldwide; not station-specific sourced |
| I25 | AFC gate lanes per station | **[ESTIMATE] 6–10 gate lanes** total (mix of entry and exit, reversible), including 1 wide gate for wheelchairs/luggage | Gate bank visible in `photos/i01` (≥4 lanes in frame) and `photos/i25` (≥5 lanes in frame); no official count published — DMTCL patronage at Mirpur 10 (one of the busiest stations) suggests the higher end of this range |
| I26 | Excess Fare Office / Customer Service Centre location | **[ESTIMATE]** single glazed counter room at one end of the paid/unpaid concourse boundary, beside the TVM bank | `photos/i06` shows a glazed teller counter; exact concourse position not published |
| I27 | TVM count per station | **[ESTIMATE] 3–6 units**, arranged in a bank near the gate line, unpaid side | Visible in multiple press photos as small clusters of 2–3 machines; no official count |

---

## 1. Vertical datums (floor levels, metres — matches SPEC.md Part 2a)

| Level | Elevation (from street = 0.0) | Notes |
|---|---|---|
| Street / ground (G) | **0.0 m** | Footpath / entrance pavilion floor |
| Concourse (L1) | **~8.0 m** [ESTIMATE — interpolated from 13 m viaduct soffit and photo proportion; no DMTCL section drawing found] | Ticketing, AFC gate line, crossover |
| Platform (L2) | **~14.5 m** [ESTIMATE, consistent with SPEC.md Part 2a: 13 m soffit + ~1.5 m platform structure] | Track/train level is ~1.1 m below platform-slab-top (typical platform-to-rail height), call platform surface itself the 14.5 m reference |

Vertical rise breakdown for a walkable level generator:
- Ground → Concourse: **8.0 m** rise
- Concourse → Platform: **6.5 m** rise
- Total ground → platform: **14.5 m**

---

## 2. Stairs, escalators, lifts — dimensioned

### 2.1 Stairs
- Rise per step: **0.15 m** [ESTIMATE, standard code-compliant public-stair rise for South Asian transit buildings]
- Going (tread depth) per step: **0.30 m** [ESTIMATE, standard]
- Flight width (clear): **2.2–2.6 m** for a main public stair (two-way traffic), **1.5 m** for a secondary/emergency stair [ESTIMATE from photo proportion, e.g. `photos/01` in the parent set]
- Handrail height: **0.9 m**, both sides plus a centre rail on wide flights [ESTIMATE, code-typical]
- Steps for 8.0 m rise (ground→concourse): **53 risers** → split into 3–4 flights with landings every ~12–16 risers (landing depth ≥ 1.5 m) to stay code-compliant
- Steps for 6.5 m rise (concourse→platform): **43 risers** → split into 3 flights similarly

### 2.2 Escalators
- Incline angle: **30°** [ESTIMATE, universal standard escalator angle — not station-specific, but effectively fixed by equipment standards]
- Step width: **1.0 m** (standard public-transit single-file-plus-luggage width) [ESTIMATE]
- Balustrade height: **0.9–1.0 m**, stainless steel with black rubber handrail [CONFIRMED finish from `photos/i07`]
- Headroom clearance above steps: **2.3 m minimum** [ESTIMATE, code-standard]
- Horizontal run for 8.0 m rise at 30°: rise/tan(30°) = **~13.9 m** horizontal + ~1.5 m flat entry/exit landing each end → **~17 m total footprint**
- Horizontal run for 6.5 m rise at 30°: **~11.3 m** horizontal + landings → **~14.3 m total footprint**
- Configuration: **paired units side by side** (one continuously up, one continuously down, direction can reverse at peak) at every escalator location — confirmed pattern in `photos/i25`, `07_mirpur10_metro_station_building.jpg` (parent set)
- Placement per I22: pair at each entrance leg (G→L1) and at least one pair per platform side (L1→L2)

### 2.3 Lifts
- Shaft plan size: **~2.0 m × 2.2 m** cab, glazed or stainless-clad shaft [ESTIMATE from `photos/i24` proportion]
- Cab height: **~2.3 m** clear [ESTIMATE, standard]
- Door type: single-speed side-sliding stainless door, **~1.1 m** wide opening [ESTIMATE from photo]
- Capacity: **[ESTIMATE] 13–17 person / ~1000–1275 kg**, standard accessible-transit-lift size — not station-specific sourced
- Entrance-leg lift: stands as a **free-standing pavilion at street level**, green barrel-vault steel canopy roof (~3.5 m span, ~3 m eave height) matching the entrance canopy family — see `photos/i24` and SPEC.md ADDENDUM A5
- Wayfinding: green pictogram "Lift / লিফট" sign with wheelchair/elderly/pregnant icons mounted directly above/beside the lift door — see `photos/i24`, `i10`

---

## 3. AFC gate line

- Gate lane width (clear passage): **~0.55–0.6 m** between adjacent gate pedestals [ESTIMATE from photo proportion, `photos/i01`, `i25`]
- Gate pedestal body height: **~0.9–1.0 m** (waist height) [ESTIMATE]
- Gate pedestal length (direction of travel): **~1.2–1.4 m** [ESTIMATE]
- Gate type: appears to be **swing-flap / tripod-flap style**, stainless-steel finish (`#B0B4B8`–`#C8CACC` metallic), NOT full-height turnstile — matches typical JICA/DMRC-style AFC hardware and visible gate silhouette in `photos/i01`, `i25`
- Card/ticket reader: black glass tap-target pad on top of each pedestal, roughly **0.15 × 0.15 m**, small green(pass)/red(reject) indicator light
- Anti-tailgating side panels: clear glass or acrylic, rising to **~1.0–1.2 m**, between lanes
- Wide accessible gate: **one per station minimum**, wider clear passage (~0.9 m) for wheelchairs/luggage/prams, positioned at one end of the gate bank [ESTIMATE — required by I20 accessibility commitment, exact width unpublished]
- Gate count: **[ESTIMATE] 6–10 lanes total** (I25), arranged as one continuous bank spanning the paid/unpaid boundary, mixed entry/exit (reversible), with the wide gate at one end
- Colour: pedestal body brushed stainless (`#C8CACC`), black glass reader top, DMTCL green accent decal strip on some units (visible faint green branding in `photos/i25` "RAPID PASS" panel)

---

## 4. TVM (ticket vending machine) & counters

- TVM footprint: **~0.6 × 0.6 m** base, **~1.7–1.8 m** tall [ESTIMATE, standard self-service kiosk proportions]
- TVM screen: touchscreen at **~1.2–1.4 m** height, coin/note slot and card dispenser below, card tap-pad above
- Arrangement: **bank of 3–6 units** [I27] on the unpaid side of the concourse, facing the gate line, with clear queuing space (~1.5 m) in front
- Counter/Customer Service Centre ("Excess Fare Office"): a **glazed teller window**, desk height **~1.0 m**, staff seated behind, positioned beside or near the TVM bank — see `photos/i06`
- Signage above TVM bank and counter: bilingual (Bangla + English), green-on-white DMTCL house style

---

## 5. Concourse level (L1) contents & layout

Per the ADDENDUM in SPEC.md (A1), the concourse envelope is a **red-brown
brick + pale concrete frame** enclosure, NOT glass curtain wall — glazing is
limited to a horizontal window band. Ceiling height at concourse: **~4.0–4.5
m** [ESTIMATE, SPEC.md #28].

Contents, unpaid side (before the gate line):
1. Entrance stair/escalator/lift heads (from street)
2. Security screening point — metal detector arch + baggage scan/manual check + 1–2 security staff (I9)
3. TVM bank (3–6 units)
4. Customer Service Centre / Excess Fare Office counter (glazed window)
5. Information/wayfinding desk (may be combined with above)
6. Wheelchair-accessible toilets
7. Notice boards: fare chart, prohibited items, do's & don'ts, route map
8. Waiting/seating (limited, unpaid side)

Contents, paid side (after the gate line, inside the fare boundary):
9. Circulation to platform stairs/escalators/lift
10. Crossover walkway (to reach the opposite platform without leaving paid area, where the station plan allows)
11. CCTV domes, PA speakers, fire extinguisher cabinets, electrical/comms riser cupboards (built into wall panelling — visible as flush service doors in `photos/i10`)
12. Station control/back-of-house room [ESTIMATE placement — not publicly documented, model as an unmarked door off the paid concourse]

### 5a. ASCII plan — concourse level (schematic, not to scale, ~180 m long × ~20–24 m wide per SPEC.md 2b)

```
                                   N (parallel to arterial road below)
                                   ▲
 WEST LEG                                                              EAST LEG
 (stair+esc+lift                                                 (stair+esc+lift
  from street)                                                     from street)
      │                                                                  │
      ▼                                                                  ▼
┌─────────┐                                                        ┌─────────┐
│ SECURITY│  UNPAID CONCOURSE                                      │ SECURITY│
│  CHECK  │  ┌────────┐   ┌────────┐        info desk /            │  CHECK  │
│ (metal  │  │  TVM   │   │  TVM   │        notice boards          │ (metal  │
│ detector│  │ bank   │   │ bank   │                                │ detector│
│ + bag   │  └────────┘   └────────┘   ┌───────────────┐           │ + bag   │
│ check)  │                            │ CUSTOMER SVC / │           │ check)  │
│         │        toilets ──►[WC]     │ EXCESS FARE    │           │ check)  │
└─────────┘                            │ OFFICE counter │           └─────────┘
      │                                └───────────────┘                 │
══════╪═════════ AFC GATE LINE (6-10 lanes, 1 wide/accessible) ══════════╪══════
      │                          PAID CONCOURSE                          │
      ▼                                                                  ▼
 ┌────────────┐   crossover walkway (paid-side, both platforms  ┌────────────┐
 │ stair/esc/ │   reachable without re-entering unpaid area)    │ stair/esc/ │
 │ lift DOWN  │◄─────────────────────────────────────────────► │ lift DOWN  │
 │ to platform│                                                  │ to platform│
 └─────┬──────┘                                                  └─────┬──────┘
       │                                                                │
       ▼                                                                ▼
   PLATFORM A (L2)                                              PLATFORM B (L2)
```

Notes:
- Security check sits at the very top of each entrance leg, before the
  unpaid concourse proper — passengers are screened on arrival, not just at
  the gate line (I9).
- The wide accessible AFC gate should sit at one end of the gate bank,
  closest to the lift route, so a wheelchair user's path from lift → gate →
  lift never crosses a stair-only route.
- Collision-wall / no-walk-off notes: place invisible collision volumes
  along the full outer edge of the concourse floor slab except at the
  modelled stair/escalator/lift openings — the concourse is an elevated slab
  with a ~8 m drop to street on every side that isn't a wall or glazed
  window band.

---

## 6. Platform level (L2) contents & layout

Ceiling/canopy apex above platform: **~6.5 m** above platform slab (SPEC.md
ADDENDUM A4). Platform width: **~10–12 m** per side [ESTIMATE, SPEC.md #7].
Platform length: **~180 m** [CONFIRMED range, SPEC.md #9].

Contents:
1. Half-height PSDs (~1.5 m, stainless frame + glass) aligned to the 4
   doors/side/car of the 6-car train — I12
2. Yellow tactile warning strip, **~0.6 m** from the PSD line, running the
   full platform length (SPEC.md A7, confirmed `photos/i10-i13`)
3. Dark grey polished-stone platform floor (`#5A5C5A`, SPEC.md A7)
4. Round steel canopy columns, **~0.45 m** dia, painted light grey, spaced
   **~9 m**, standing at the outer platform edge (SPEC.md A4)
5. Hanging bilingual LED next-train/destination display boards at intervals
   along the canopy soffit (confirmed `photos/i10`, `i25`)
6. Hanging analogue double-sided clock at least once per platform (confirmed
   `photos/i10`)
7. Free-standing station name "roundel" board(s): dark green ring + white
   pill panel, Bangla above/English below, mounted on a black square post,
   positioned near the stair/escalator/lift head (SPEC.md A3, confirmed
   `photos/i21-i22`)
8. Green underline/roundel platform-column repeater name plaques at regular
   intervals (SPEC.md A3)
9. Bench-style stainless seating units, back-to-wall or back-to-back,
   spaced along the platform [ESTIMATE from photo silhouettes, exact count
   unpublished]
10. CCTV dome cameras on columns/canopy trusses, with a yellow
    triangular "CCTV in operation"-style warning decal on nearby columns
    (confirmed `photos/i25`)
11. PA speakers on canopy trusses
12. Fire hose cabinets / emergency call points at intervals along the
    platform wall (where a back wall exists) [ESTIMATE, not clearly visible
    in sourced photos, standard safety requirement]
13. Women's coach platform marking: a marked zone (decal/signage) at the
    end of the platform where the front-most (Car 1) doors stop — mark
    this consistently with whichever end is signed as the Uttara-bound
    origin direction (I13) — **[ESTIMATE placement, exact marking style
    (paint colour/pictogram) not found in sourced photos or text — flag as
    a gap to fill if a clearer photo turns up]**
14. Exit/toilet directional signage boards hanging from canopy (bilingual,
    black background, orange/yellow text — confirmed `photos/i10`)

### 6a. ASCII plan — platform level (one side platform, schematic)

```
                    canopy apex ~6.5 m above platform, columns Ø0.45 m @ ~9 m centres
        ╭───●───────────●───────────●───────────●───────────●───────────●───╮
        │   hanging LED next-train sign      hanging clock       exit sign  │
        │                                                                    │
 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ dark stone platform floor ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
        │  yellow tactile strip, 0.6 m from PSD line                        │
        ├──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┤ ← half-height
        │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │   PSD line
        └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘   (~1.5 m tall,
   [women's coach zone]                                          train runs behind
   marked end of platform                                        this line, ~180 m
                                                                   platform length
        ▲stair/esc/lift up to concourse (both ends of platform, per §2)
```

Collision-wall / no-walk-off notes:
- Place a collision plane along the **full PSD line** at platform-floor
  height up to canopy underside (even though visually it's a half-height
  door + open gap above) so the player cannot walk or fall onto the track —
  the physical PSD only needs to render to 1.5 m, but the walkable-geometry
  blocker should be full height for gameplay safety, matching how real
  platforms feel enclosed.
- Place collision along the platform's non-track long edge only where there
  is no stair/escalator/lift opening — the far edge (away from track) may
  back onto a solid wall (secondary stations) or open air (side platforms
  with a view down to street, per SPEC.md's open concourse/platform
  massing) — if open air, treat it exactly like the concourse edge: full
  collision wall to prevent walking off, at least a **1.1 m** parapet /
  guard rail visual with a full-height invisible blocker behind it.
- At the platform ends (beyond the ~180 m usable length), collision-block
  the crash-stop / tunnel-portal-style end wall; do not let the player walk
  past the last PSD bay.

---

## 7. Colour and material reference (interior-specific additions to SPEC.md's palette table)

| Element | Hex | Confidence |
|---|---|---|
| AFC gate pedestal body (stainless) | `#C8CACC` | ESTIMATE (photo-derived) |
| AFC gate reader pad (black glass) | `#1A1A1A` | ESTIMATE |
| AFC gate accept/reject indicator | green `#2FA84F` / red `#D6362B` | ESTIMATE |
| PSD frame (stainless) | `#B0B4B8` | CONFIRMED carried over from SPEC.md, height corrected to half (A6) |
| PSD glass | pale blue-tinted transparent `#CFE3E6` @ ~40% opacity | ESTIMATE |
| Platform floor (polished stone) | `#5A5C5A` | CONFIRMED (SPEC.md A7) |
| Platform tactile strip | `#E8B400` (yellow) | ESTIMATE (standard tactile-paving yellow) |
| Concourse floor (light stone) | `#D8D5CC` | ESTIMATE (photo-derived, `i01`, `i25`) |
| TVM body | off-white/light grey `#E4E4DE` with green accent decal `#0C7A4E` | ESTIMATE |
| Customer service counter glazing frame | dark grey/black `#2A2A2A` | ESTIMATE |
| Escalator balustrade | stainless `#C8CACC`, black rubber handrail `#1A1A1A` | CONFIRMED (photo `i07`) |
| Lift cladding | stainless `#C8CACC` | CONFIRMED (photo `i24`) |
| Entrance/lift canopy (barrel vault) | green `#2F8F5B` | CONFIRMED carried over (SPEC.md A5) |
| Name board pill background | `#F2F2EE` | CONFIRMED carried over (SPEC.md A3) |
| Name board ring/underline | `#0C7A4E`–`#006747` | CONFIRMED carried over (SPEC.md A2/A3) |
| Wayfinding sign background (escalator/lift/exit) | white `#FFFFFF` with green `#0C7A4E` pictogram + border | CONFIRMED (photos `i07`, `i24`, `i10`) |
| Warning/CCTV decal | yellow `#F2C500` triangle, black pictogram | CONFIRMED (photo `i25`) |
| Next-train LED display | black background `#0A0A0A`, orange/amber text `#FFA000` | CONFIRMED (photo `i10`) |

---

## 8. Per-object checklist (developer tick-list)

**Concourse level**
- [ ] Entrance stair head × 2 legs (Mirpur 11) / × 4 legs (Mirpur 10)
- [ ] Entrance escalator pair × 2 legs / × 4 legs
- [ ] Entrance lift pavilion (green barrel-vault canopy) × 2 legs / × 4 legs
- [ ] Security check point (metal-detector arch + bag scan/table + 1-2 guard NPCs) × 1 per leg
- [ ] TVM bank (3–6 units) × 1 per unpaid concourse zone
- [ ] Customer Service / Excess Fare Office counter (glazed window)
- [ ] Wheelchair-accessible toilet block
- [ ] Notice/wayfinding boards (fare chart, rules, route map)
- [ ] AFC gate line (6–10 lanes incl. 1 wide/accessible gate)
- [ ] Paid-side crossover walkway
- [ ] Concourse→platform stair × 2 (one per platform side)
- [ ] Concourse→platform escalator pair × 2
- [ ] Concourse→platform lift × 1–2
- [ ] CCTV domes, PA speakers, service riser doors (set dressing)
- [ ] Brick + concrete-frame wall system (SPEC.md A1), window band glazing

**Platform level (× 2, one per side)**
- [ ] Half-height PSD run (~1.5 m tall) aligned to 6-car / 4-doors-per-car train stop marks
- [ ] Yellow tactile strip, 0.6 m from PSD line, full platform length
- [ ] Dark stone platform floor
- [ ] Canopy columns (Ø0.45 m, light grey) at ~9 m centres
- [ ] Curved truss canopy + corrugated roof + green fascia trim + skylight strip
- [ ] Hanging LED next-train display(s)
- [ ] Hanging analogue clock (at least 1)
- [ ] Free-standing name roundel board (green ring + white pill)
- [ ] Column repeater name plaques
- [ ] Platform seating (stainless bench units)
- [ ] Women's coach platform marking at Car 1 end
- [ ] CCTV domes + warning decals
- [ ] Fire/emergency cabinets
- [ ] Full-height invisible collision plane along PSD line and platform edges (see §6a)

---

## Sources

- `reference/metro/SPEC.md` (parent spec + ADDENDUM) and `reference/metro/photos/CREDITS.md`
- `reference/metro/interior/photos/CREDITS.md` (this folder's 30 photos, spot-checked)
- metrodhaka.com — Mirpur 10: https://metrodhaka.com/mrt-line-6/mirpur-10/
- metrodhaka.com — Mirpur 11: https://metrodhaka.com/mrt-line-6/mirpur-11/
- Wikipedia — MRT Pass: https://en.wikipedia.org/wiki/MRT_Pass
- Wikipedia — Rapid Pass: https://en.wikipedia.org/wiki/Rapid_Pass
- eduportalbd.com — Metrorail stations, schedule, ticket price guide: https://eduportalbd.com/dhaka-metrorail-all-info-en/
- dhakametrorail.org — Do's & Don'ts: https://dhakametrorail.org/do-dont/
- dhakametrorail.org — Prohibited Items & Luggage Rules: https://dhakametrorail.org/prohibited/
- dhakametrorail.org — Laws & Rules: https://dhakametrorail.org/laws/
- Dhaka Tribune — "Metro rail eases travel for women with reserved coaches in Dhaka": https://www.dhakatribune.com/bangladesh/329062/metro-rail-eases-travel-for-women-with-reserved
- The Daily Star — "Metro rail trains will have a reserved bogie for women: PM": https://www.thedailystar.net/special-events/dhaka-metro-rail-opening/news/metro-rail-trains-will-have-reserved-bogie-women-pm-3207186
- Dhaka Tribune — "Elevators, escalators, stairs on both sides metro stations": https://www.dhakatribune.com/bangladesh/dhaka/287732/elevators-escalators-stairs-on-both-sides-metro
- General web search on Dhaka metro AFC/security-check procedure (see also L&T Metro general safety reference, ltmetro.com/safety-and-security/) — used only for general procedure pattern, flagged ESTIMATE where Dhaka-specific detail is unconfirmed

**Note on ESTIMATEs:** No public DMTCL floor-plan, technical drawing, or
per-station equipment schedule was found. Every figure flagged ESTIMATE in
this document (escalator/lift/stair counts, AFC gate lane count, TVM count,
exact level heights, women's-coach platform marking style) is derived from
photo proportion or general industry-standard practice, not an official
Dhaka-specific source. If a DMTCL detailed-design PDF or station floor plan
becomes available, prioritise replacing §2 (vertical circulation counts) and
§3 (AFC gate count) first — these are the weakest-sourced numbers and matter
most for whether the model is walkable and code-plausible.

---

## ADVISOR ADDENDUM: read directly from photos i08 and i29

These override anything above that conflicts.

B1. **There are TWO different sign designs, not one.**
   - *Entrance fascia board* (photo i29, Pallabi): DARK GREEN background
     (`#1F6E52`), white Bangla name large on the left-of-centre, white English
     name below it, the DMTCL logo (red-and-green arc with a white train nose)
     on a WHITE rounded tile at the left end, and a WHITE SQUARE at the right
     end carrying the ENTRANCE LETTER in green (A, B, C, D). Roughly 3.2 m x
     0.75 m, hung from the entrance canopy frame. Mirpur 10 has four of these
     (A-D), Mirpur 11 two.
   - *Platform roundel* (photos i21/i22 and 13): white pill inside a dark
     green ring on a black post. Keep as already specced.
   The earlier note that the street board is a "white pill" was wrong; the
   white pill is the platform sign only.

B2. **Entrance geometry** (photo i29): stair and escalator sit SIDE BY SIDE in
   one core, roughly 4.5 m wide overall: a ~2.2 m wide straight stair flight
   with a central stainless handrail, immediately beside a single ~1.0 m
   escalator. Treads are dark grey with a lighter nosing. Flanking the core
   are stainless perforated screen panels about 2.2 m tall with a vertical
   slot pattern. Yellow tactile paving strip runs across the full width at the
   foot. A stainless tube railing lines the adjacent walkway.
   The canopy over this core is DARK GREEN corrugated metal on a grey tubular
   frame, and it sits UNDER the viaduct soffit, so the entrance is in shadow.

B3. **Entrance placement**: at Pallabi the entrance core stands beneath the
   viaduct itself, not out on the far footpath. So the station's entrance legs
   should land in the median/under-viaduct zone as well as on the footpaths.
   Do not push every core to the outer footpath.

B4. **Posted signage at the entrance**: a small white "Station Opening &
   Closing Time" board, and a yellow CCTV warning triangle. Cheap detail, adds
   a lot of authenticity at eye level.

B5. **Train interior** (photo i08), needed if the player can board:
   cream-white wall and ceiling panels (`#EDEAE4`), stainless vertical poles
   and curved grab rails, GREEN bench upholstery (`#2FA34B`) on dark grey
   bases, white hanging strap handles in rows, continuous LED strip lights
   along both sides of the ceiling, grey-blue vinyl floor (`#8A8F92`), ceiling
   air-return grilles down the centre, and small route/ad panels above the
   windows. Longitudinal bench seating, no transverse seats.
