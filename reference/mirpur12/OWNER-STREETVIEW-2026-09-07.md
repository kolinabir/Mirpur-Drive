# Owner-supplied Street View of Pallabi / Mirpur 12, 2026-09-07

Two Google Street View screenshots pasted by the owner, with links, of the
EXACT area the player will start in. Advisor transcription — the images are
Google's and are NOT stored in the repo or shipped; only these written
observations are. Where this conflicts with any SPEC, **this file wins for
the Pallabi / Mirpur 12 area** (same standing as
reference/metro/OWNER-PHOTOS-2026-09-07.md, which covers Mirpur 10).

Sources (Sep 2023 imagery):
- S1: Begum Rokeya Ave, 23.8269641, 90.3642748, heading 43.33, tilt 99.93
  https://www.google.com/maps/@23.8269641,90.3642748,3a,75y,43.33h,99.93t/data=!3m7!1e1!3m5!1sdV-Ahmn5gWn_yrO3PlXZwg!2e0
- S2: Mirpur Ceramic Rd, 23.8281808, 90.364213, heading 287.97, tilt 109.83
  https://www.google.com/maps/@23.8281808,90.364213,3a,75y,287.97h,109.83t/data=!3m7!1e1!3m5!1szc8NxkWb9e-1prRepqhSQg!2e0
- A third link the owner sent, not yet transcribed:
  23.8277667, 90.3642374, heading 166.94, tilt 95.24 (panoid VaTjqQ7kkQ_XXRKnmw0suA)

In scene coordinates (origin 23.8137, 90.3668) these sit at roughly
**x = -262, z = -1466** (S1) and **x = -263, z = -1600** (S2) — i.e. the
stretch between Pallabi station (-266, -1377) and the Mirpur 12 bus stand
(-275, -1616). This is the proposed spawn area.

## CORRECTIONS TO WHAT WE BUILD TODAY (most important first)

### 1. The pier shape is wrong in our model
S2 shows the pier clearly: a **tapered/flared column** — noticeably
narrower at the base, widening as it rises, then flaring out at the top
into the girder seat. Strong **vertical form-lines** down the shaft and a
visible cold-joint band near the bottom. Ours are plain rectangular boxes
with a plinth. Model the flare; it is the most recognisable thing about
this viaduct from street level.

### 2. The girder is precast SEGMENTAL — model the joints
S2 shows the box girder soffit and side crossed by **vertical joint lines
every few metres** where the precast segments meet, plus casting-panel
texture. Ours is a smooth continuous box. Add the segment joints (a shallow
recessed line, or a dark UV stripe) — they read at any distance and are
free.

### 3. Under-deck services
S1 (looking up under the deck) shows **conduit/service pipes running the
length of the soffit** and **light fittings mounted under the deck**, plus
staining. Our soffit is bare.

### 4. A covered footbridge with a GREEN corrugated roof
S1 shows a steel pedestrian footbridge running beside the viaduct: light
grey/galvanised **truss with diagonal bracing**, a **green corrugated
roof**, open sides with a mesh/rail infill, and a long straight stair down
to the footpath with stainless handrails. This matches the green barrel
canopies in the Mirpur 10 owner photos — green roofing is the corridor's
signature. We do not build these at Pallabi.

### 5. Median: black-and-white striped kerb + planted saplings
S2: the median kerb is painted in **alternating black and white bands**,
and the median carries **young palm/banana-type saplings and low shrubs**.
S1 shows steel **pedestrian guard railings** along the median and the
footpath edge. We have neither the striped kerb nor the railings.

### 6. The buildings here are NOT the brick-and-render stock we assume
This is a commercial arterial frontage, quite different from the Mirpur 12
back-blocks:
- **Full-height glazed / mirror-glass curtain-wall facades**, 5-7 storeys,
  on a large fraction of the frontage (S2 shows a long run of them).
- One striking building in S1: **red panel cladding with a full glass
  front**, housing several brands stacked vertically.
- **Unfinished concrete frames**: S2 left shows a building that is bare
  slabs and columns with no infill walls — extremely characteristic of
  Dhaka and completely absent from our city. Worth generating a few.
- Older weathered 5-7 storey residential blocks behind, with AC units,
  balconies and staining — that part we do model.

### 7. Signage at this junction includes BRANDS, stacked vertically
S1: "KFC", "Domino's Pizza", "BFC" (red/yellow roundel), "CRIMSON CUP",
"La Nui Bengali" — mounted as a **vertical stack of illuminated boxes up
the corner of the building**, not a single ground-floor band.
S2: "GRAND PRINCE CHINESE & CONVENTION HALL" (large red channel letters
across the top of a facade), "SINGER" showroom, "PIZZA EXPRESS", plus
Bangla boards.
So the arterial has big first-floor-and-above signage and brand fascias,
while the side streets keep the pharmacy/bKash/coaching mix from
docs/MIRPUR12-RESEARCH.md. Two different signage grammars, and we
currently apply one everywhere. Suggest the palette and layout; do NOT
clone real trade dress.

### 8. Street life
Rickshaws in numbers (parked and moving, colourful hoods), green CNG autos,
motorbikes, a white dusty minibus, a dark SUV; a **pink-shirted food
delivery rider with a large pink insulated backpack** (very common, good
cheap detail); pedestrians crossing mid-block; people sitting under the
viaduct beside the shops; hawker goods on the footpath.

### 9. Surfaces
Road is dark, worn asphalt with faint lane markings. Footpath is grey
concrete paver slabs. Overhead: bundles of power/telecom cable strung
between poles on the shop side. Trees and vines grow up against the older
buildings.

## What this changes in the plan
- metro.js: pier flare, girder segment joints, under-deck conduits and
  lights, and a covered green-roof footbridge type. (Owner of metro.js is
  the P1-C-METRO brief — append these there.)
- streets.js: striped median kerb, guard railings, median saplings.
- city.js / facades.js: a glass-curtain-wall facade type and an
  unfinished-concrete-frame building type, weighted onto arterial frontage.
- signs.js: two signage grammars — arterial brand stacks vs side-street
  pharmacy/bKash/coaching boards.

## Third batch (18:40): two specific buildings, exact replication requested

The owner: "make sure to add this exact building same thing same look! same
texts in same place! 1st, 2nd image" (two views of the same building) and
"3rd image" (a second building). Owner asked for LANDMARK-LEVEL fidelity,
not generic dressing, at these two buildings specifically.

Sources (Sep 2023 imagery), scene coordinates (origin 23.8137, 90.3668):
- L1/L2: Begum Rokeya Ave, 23.8271471, 90.3642664 (two headings, same
  building) -> scene **(-258, -1486)**. The nearest real OSM footprint
  centroid is (-240, -1470), 24 m away (same building, footprint offset by
  the usual OSM/photo geocoding slop), height 16.35 m (~6 storeys).
  https://www.google.com/maps/@23.8271471,90.3642664,3a,82.7y,74.04h,114.09t/...
- L3: Mirpur Ceramic Rd, 23.8280863, 90.3642172 -> scene **(-263, -1590)**.
  Nearest footprint centroid (-237, -1589), 26 m away, height 28.55 m
  (~9 storeys).
  https://www.google.com/maps/@23.8280863,90.3642172,3a,90y,129.28h,98.76t/...

Both sit directly on the proposed spawn stretch, within ~150 m of each
other and ~100 m of the spawn point (-262, -1466).

### L1/L2: the "BFC/KFC" tower
- Massing: a ~6-storey tower, TWO colour zones side by side — the left ~60%
  is a full-height MIRROR-GLASS curtain wall (grey-blue reflective glass,
  vertical mullions), the right ~40% is a RED PAINTED PANEL pier running
  the full height with a projecting red parapet cap.
- Upper floors (glass zone): individual small illuminated sign boxes
  mounted flush to the glass at various floors, stacked essentially
  RANDOMLY rather than in a neat grid — "RICE N SLICE" (red/white, with
  tagline "BE7YOU WON'T FORGET THE TASTE" underneath), "IZ PATISSERIE &
  CAFE" (dark board, white text), "CAFE ZERO ONE" (red text on dark),
  "FOOD ENGINEERING" (yellow/black), "La Nui Bengali" (yellow script on
  dark) higher up on the red pier, one small Bangla sign near the top.
- Ground + first floor, left to right: "Khana's" (white oval logo, "BET
  YOU CAN'T EAT LESS" tagline) and "BURGER KING" (red/yellow band) share
  the leftmost bay; "Domino's Pizza" (dark blue band, white/red text,
  Bangla "ডোমিনোজ" underneath) next; then a bay with "বি এফ সি" (Bangla for
  BFC) on a yellow band; then "BFC" spans TWO fascia levels on the red
  pier — a smaller red oval "BFC / BEST FRIED CHICKEN" roundel above, and
  giant yellow BFC LETTERS (no fascia box, painted directly on the red
  panel, each letter roughly 1.5 storeys tall) below that, then "KFC" in
  the Colonel/red-white livery with the brand's own name band UNDER the
  BFC letters, at ground level.
- Ground floor: full glass shopfronts, a steel crowd-control railing along
  the whole frontage, rickshaws parked/queued along the full width.
- Building shape: NOT a simple box — the red pier steps forward slightly
  from the glass volume, and the parapet caps (red, and a smaller dark one
  over the glass zone) are visibly raised above the roofline, not flush.

### L3: the "South Point School / Best Buy" block
- A ROW of at least 3 adjoining buildings of different heights and
  finishes, not one uniform block — the real texture of Dhaka's plot-by-
  plot construction:
  - Left building: ~6 storeys, pale blue-grey render, band of AC units on
    every floor (roughly 5-6 units per floor), a large blue fascia band
    across the 1st floor: "সাউথ পয়েন্ট স্কুল এন্ড কলেজ" (South Point School and
    College) with a phone number and "EIIN 108040" printed on it; ground
    floor shops include "Well Food" (black board) and "alpha shop.store".
  - Centre building: taller, ~9 storeys, cream/beige render, the SAME
    AC-unit banding, a shorter frontage. Ground+1st floor is a single RED
    PAINTED SHOPFRONT block, narrower than the tower above it: "Regal"
    (small, top) over "Best Buy" (large white text on red) — a variety/
    general store with a densely stocked, brightly lit interior visible
    through the glass.
  - Right building: similar pale render, ground floor a green-fascia'd
    bank branch ("...ব্যাংক লিমিটেড", partially visible) plus more shops.
  - EVERY building in this row has a roof-level PARAPET WALL with a
    recessed band (a thin shadow line just under the coping), and rooftop
    features behind it: satellite dishes/antennas, small rooftop garden
    planters on the centre building.
- Street: a wide loose crowd of parked/queued cycle-rickshaws (mixed
  colours, several with striped or floral canopies) fills most of the
  foreground; motorbike crossing; pedestrians including two with faces
  blurred by Street View's own privacy blur (do not reproduce identifiable
  people — not applicable to a building/signage recreation anyway).

### Decision on brand names
The owner asked for the SAME TEXT in the SAME PLACE. This is a
non-commercial personal simulation recreating a real, physically-existing
streetscape (the same practice flight/driving simulators and city-builders
use for real-world landmark buildings), not merchandise or anything
implying endorsement. Real business NAMES are reproduced as plain text
labels (KFC, BFC, Burger King, Domino's Pizza, etc, exactly as seen). Their
proprietary LOGO ARTWORK (the KFC Colonel portrait, brand-specific
lettering/mascots) is NOT redrawn — fascia colour and layout only, per the
same "suggest the palette, don't clone trade dress" rule already applied
to the generic side-street/arterial signage. This mirrors how OWNER-
PHOTOS-2026-09-07.md already treats the DMTCL wordmark for the metro.
