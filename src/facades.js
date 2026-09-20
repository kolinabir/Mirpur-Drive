/**
 * facades.js
 *
 * Generates the building texture atlas procedurally on a canvas at startup.
 * Photographic CC0 surfaces supply the base; the offline baker adds facade details.
 *
 * The atlas is a 4x8 grid of 512x512 cells. Each cell is one facade "style":
 * a wall colour plus a window grid plus balconies, weathering and ground-floor
 * shutters. Every building picks one cell and bakes the UV offset into the
 * merged tile geometry, so the entire city renders with a single material.
 */

import * as THREE from 'three';

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 8;
export const ATLAS_CELLS = ATLAS_COLS * ATLAS_ROWS;
export const CELL = 512;
export const ATLAS_GUTTER = 8;

/**
 * Real photographic base materials (CC0, ambientCG — see
 * public/textures/MANIFEST.json and LICENSES.md) used to paint each atlas
 * cell before windows/balconies/streaks are drawn on top. One slug per
 * cell, in reading order.
 *
 * P8-MIRPUR12: reweighted toward brick + stained/raw concrete and away from
 * painted plaster. Mirpur 12 ground truth (docs/MIRPUR12-RESEARCH.md,
 * reference/mirpur12/OBSERVATIONS.md, reference/metro/OWNER-PHOTOS) shows
 * exposed brick and stained/unpainted concrete dominant, with clean painted
 * plaster the rarer finish.
 *
 * P9-PALLABI: rebalanced for the Pallabi / Begum Rokeya Ave arterial frontage.
 * Owner Street View (reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md) shows:
 *   - pale blue-grey painted render on mid-rise apartment blocks (South Point type)
 *   - small ceramic tile cladding on newer commercial buildings
 * Two new CC0 slugs added: plaster-painted-grey (PaintedPlaster009) and
 * tiles-ceramic-small (Tiles022). Both downloaded from ambientcg.com under CC0.
 * Cell breakdown: brick-old x4 (25%), concrete-stained-{1,2} x6 (37.5%),
 * plaster-weathered-{1,2} x2 (12.5%), plaster-painted-grey x2 (12.5%),
 * tiles-ceramic-small x1 (6%), concrete-stained-1 x1 extra (6%).
 */
const CELL_MATERIALS = [
  'brick-old',            'plaster-painted-grey', 'concrete-stained-2', 'brick-old',
  'concrete-stained-1',   'tiles-ceramic-small',  'brick-old',          'concrete-stained-1',
  'plaster-weathered-1',  'concrete-stained-2',   'plaster-painted-grey', 'concrete-stained-1',
  'plaster-weathered-2',  'brick-old',            'concrete-stained-2', 'concrete-stained-1',
];

/**
 * Per-cell BUILDING TYPE (advisor, 2026-09-07, from the owner's own Street
 * View of Begum Rokeya Ave / Mirpur Ceramic Rd —
 * reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md).
 *
 * Until now every building in the city was the same KIND of building: a
 * render/brick wall with a window grid. The owner's photographs show, on a
 * single stretch of one street: mirror-glass commercial blocks, weathered
 * render apartment blocks, and a BARE UNFINISHED CONCRETE FRAME (slabs and
 * columns, no infill walls) — which is everywhere in Dhaka and was entirely
 * absent here. Variety of type is what makes the street read as real.
 *
 * P9-PALLABI: glass count raised to 4/16 (was 3/16) to match the "long run
 * of mirror-glass curtain-wall facades" documented in §6 of the same file.
 * 16 cells: 10 residential, 4 glass curtain wall, 2 unfinished frame.
 */
const CELL_TYPES = [
  'residential', 'residential', 'glass',       'residential',
  'residential', 'frame',       'residential', 'glass',
  'residential', 'residential', 'glass',       'residential',
  'glass',       'residential', 'frame',       'residential',
];

/** Cell used to base the rooftop slab (see buildRoofTexture). */
const ROOF_MATERIAL = 'concrete-stained-1';

/**
 * Uttara South zone: scene z < UTTARA_Z_THRESHOLD.
 * Uttara is a planned residential city (1980s-90s grid layout), noticeably
 * cleaner and more uniform than Mirpur: cream/white painted render dominates,
 * less exposed brick, no unfinished concrete frames, more tree-lined streets
 * and setbacks. Buildings here use a separate cell-material + cell-type table
 * so city.js can steer Uttara buildings to cleaner atlas cells.
 * Exported so city.js can apply the same boundary test.
 */
export const UTTARA_Z_THRESHOLD = -2500; // z < this → Uttara zone

/**
 * Uttara atlas: 16 cells of cleaner, lighter materials.
 * Research (OWNER-RESEARCH-2026-09-09, ambientCG): Uttara walls are white/cream
 * painted render, NOT exposed brick. PP017 is the cleanest existing slug;
 * PP014/PP015 add slight edge-brick showing (older Uttara stock), PP009 gives
 * the pale blue-grey that some Uttara apartment blocks use.
 * - plaster-weathered-2   (PaintedPlaster017) x6: cleanest white plaster (already in project)
 * - plaster-white-clean   (PaintedPlaster014) x4: white with slight brick edge (older stock)
 * - plaster-white-aged    (PaintedPlaster015) x3: similar, slightly more worn
 * - plaster-painted-grey  (PaintedPlaster009) x2: pale blue-grey (some Uttara blocks)
 * - tiles-ceramic-small   (Tiles022)          x1: ceramic tile on newest blocks
 * NO brick-old, NO concrete-stained — Uttara's residential is plaster/tile only
 */
const UTTARA_CELL_MATERIALS = [
  'plaster-weathered-2',  'plaster-white-clean',  'plaster-weathered-2',  'plaster-painted-grey',
  'plaster-white-clean',  'tiles-ceramic-small',  'plaster-weathered-2',  'plaster-white-aged',
  'plaster-painted-grey', 'plaster-white-clean',  'plaster-weathered-2',  'plaster-white-aged',
  'plaster-white-aged',   'plaster-weathered-2',  'plaster-white-clean',  'plaster-weathered-2',
];

/**
 * Uttara building types: more glass (modern commercial on the arterial),
 * NO unfinished frames (Uttara's planned blocks are all finished).
 * 12 residential + 4 glass = cleaner, more modern Uttara character.
 */
const UTTARA_CELL_TYPES = [
  'residential', 'residential', 'glass',       'residential',
  'residential', 'glass',       'residential', 'residential',
  'residential', 'glass',       'residential', 'residential',
  'glass',       'residential', 'residential', 'residential',
];

/**
 * Uttara wall palette: much lighter and more uniform than Mirpur.
 * Research: dominant tones are off-white, warm white, cream, pale buff.
 * Weathering trends toward yellowing/light green algae (not black streaks).
 * Base albedo range: #F0EDE0 (warm off-white) to #E8E0C8 (light cream/buff).
 */
const UTTARA_WALL_PALETTE = [
  '#f0ede0', // warm off-white (dominant Uttara finish)
  '#eae0cc', // light cream/buff (very common in sectors 11-14)
  '#f2ede4', // near-white with warm cast
  '#e8e2d0', // soft cream
  '#e2e8e2', // pale mint-white (newer Uttara apartments)
  '#d8e2e8', // pale blue-white (glazing-adjacent panels)
  '#e8e4d4', // light sand
  '#f0ece8', // almost pure white with warmth
  '#dae0d0', // pale sage-white (light plant tinge near rooflines)
  '#e0dac8', // cream with slight yellow
  '#ccd4d8', // pale blue-grey (some modern Uttara blocks)
  '#e4e2d6', // parchment white
  '#d4dae0', // cool light grey (utility buildings)
  '#e0e4d8', // pale green-white
  '#ece8dc', // warm parchment
  '#f0ecea', // near-white pink-tint (fresh paint)
];

/** Cache of loaded <img> color maps, keyed by material slug. Populated by
 * preloadWallImages() before buildFacadeAtlas draws anything, so that the
 * synchronous buildRoofTexture() (called right after buildFacadeAtlas is
 * awaited) can also read from it without needing to be async itself. */
const wallImageCache = new Map();

function loadImage(slug, mapName = 'color') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `/textures/${slug}/${mapName}.jpg`;
  });
}

async function preloadWallImages(imageLoader = loadImage) {
  const slugs = new Set([...CELL_MATERIALS, ...UTTARA_CELL_MATERIALS, ROOF_MATERIAL]);
  await Promise.all(Array.from(slugs).flatMap((slug) =>
    ['color', 'normal', 'roughness'].map(async (mapName) => {
      const key = mapName === 'color' ? slug : `${slug}/${mapName}`;
      if (!wallImageCache.has(key)) wallImageCache.set(key, await imageLoader(slug, mapName));
    })
  ));
  return wallImageCache;
}

function paintSurface(surfaces, x, y, w, h, roughness = 65) {
  surfaces.normal.fillStyle = '#8080ff';
  surfaces.normal.fillRect(x, y, w, h);
  surfaces.roughness.fillStyle = `rgb(${roughness},${roughness},${roughness})`;
  surfaces.roughness.fillRect(x, y, w, h);
}

function paintSurfaceBase(surfaces, slug, x, y, size) {
  paintSurface(surfaces, x, y, size, size, 225);
  for (const mapName of ['normal', 'roughness']) {
    const img = wallImageCache.get(`${slug}/${mapName}`);
    if (!img) continue;
    const ctx = surfaces[mapName];
    const tile = size / 2.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    for (let ty = y - tile; ty < y + size + tile; ty += tile) {
      for (let tx = x - tile; tx < x + size + tile; tx += tile) ctx.drawImage(img, tx, ty, tile, tile);
    }
    ctx.restore();
  }
}

/**
 * Tile a photographic wall image across a cell (or sub-region) and multiply
 * it with the palette wall colour, so the photographic grain reads while
 * still keeping the corridor's colour variety. Falls back to a flat fill
 * plus grain if the image failed to load.
 */
function drawTexturedBase(ctx, x0, y0, w, h, img, wallColor, rnd) {
  ctx.fillStyle = wallColor;
  ctx.fillRect(x0, y0, w, h);

  if (img) {
    // ~6m of wall per tile; the cell spans ~14m x ~12m, so tile ~2.3x
    // across and proportionally down.
    const tile = w / 2.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    for (let ty = y0 - tile; ty < y0 + h + tile; ty += tile) {
      for (let tx = x0 - tile; tx < x0 + w + tile; tx += tile) {
        ctx.drawImage(img, tx, ty, tile, tile);
      }
    }
    ctx.restore();

    // Multiply-tint with the palette colour so the same photo still yields
    // varied wall colours across the corridor.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = wallColor;
    ctx.fillRect(x0, y0, w, h);
    ctx.restore();
  } else {
    drawGrain(ctx, x0, y0, w, h, rnd, 14);
  }
}

/**
 * Wall colours seen along the corridor: raw and painted cement in washed-out
 * pastels, plus the bare red brick and unrendered grey concrete that is just
 * as common on the interior lanes. P9-PALLABI adds two blue-grey tints matching
 * the "pale blue-grey render" seen on apartment blocks near Pallabi station
 * (OWNER-STREETVIEW-2026-09-07.md §L3: South Point School block and neighbours).
 */
const WALL_PALETTE = [
  '#ede6d6', // off-white cream, the default across the corridor
  '#e0c58f', // pale yellow ochre
  '#d9a79c', // dusty salmon
  '#b8cfc9', // pale mint
  '#cfc4ad', // weathered cream, sun bleached
  '#b9a98d', // dirty beige
  '#a89e8e', // grey-taupe cement, unpainted
  '#9aa3a0', // cool grey render
  '#c8b9a0', // sand
  '#8f9a8c', // pale sage on newer blocks
  '#96604a', // exposed red brick
  '#b0aaa2', // raw concrete, never painted
  '#c7b58e', // ochre wash
  '#a9bcc6', // pale sky blue
  '#8d8478', // dark weathered cement
  '#d3c9b4', // pale bone
  '#aab8c0', // P9-PALLABI: pale blue-grey render (South Point block, Pallabi apartments)
  '#c0cdd4', // P9-PALLABI: lighter blue-grey (upper floors, same block type)
];

/** Deterministic PRNG so the atlas is byte-identical between reloads. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

/** Speckled concrete grain, drawn once per cell. */
function drawGrain(ctx, x0, y0, w, h, rnd, strength = 14) {
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * strength;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, x0, y0);
}

/**
 * Monsoon staining: vertical dark streaks running down from window sills and
 * slab edges. This one detail does more for the Dhaka look than anything else.
 */
function drawStreaks(ctx, x0, y0, w, h, rnd, count) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * w;
    const top = y0 + rnd() * h * 0.7;
    const len = h * (0.1 + rnd() * 0.45);
    const wide = 2 + rnd() * 9;
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    const a = 0.1 + rnd() * 0.22;
    g.addColorStop(0, `rgba(70,64,54,${a})`);
    g.addColorStop(0.5, `rgba(84,78,66,${a * 0.6})`);
    g.addColorStop(1, 'rgba(90,84,72,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, wide, len);
  }
  ctx.restore();
}

/** Damp patches near the base where rising damp discolours the render. */
function drawDamp(ctx, x0, y0, w, h, rnd) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, y0 + h, 0, y0 + h * 0.6);
  g.addColorStop(0, 'rgba(88,84,70,0.45)');
  g.addColorStop(1, 'rgba(110,106,92,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0 + h * 0.55, w, h * 0.45);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(
      x0 + rnd() * w,
      y0 + h * (0.75 + rnd() * 0.25),
      12 + rnd() * 45,
      8 + rnd() * 22,
      0, 0, Math.PI * 2
    );
    ctx.fillStyle = `rgba(96,92,78,${0.1 + rnd() * 0.16})`;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Warm colours painted onto the night emissive atlas for lit windows, picked
 * per window between a pale amber and a deeper orange.
 */
const NIGHT_WINDOW_COLORS = ['#ffd89a', '#ffcb85', '#ffbf78', '#ffb070'];

/** One window, with frame, glass, and an optional grille or AC unit.
 * If `ectx` is given, ~35% of windows are also painted warm onto it at the
 * same rectangle, on an otherwise black canvas, to serve as an emissiveMap
 * for lit-window glow at night. */
function drawWindow(ctx, x, y, w, h, rnd, lit, ectx, surfaces) {
  paintSurface(surfaces, x - 1, y - 1, w + 2, h + 2);
  if (ectx && rnd() < 0.35) {
    ectx.fillStyle = NIGHT_WINDOW_COLORS[Math.floor(rnd() * NIGHT_WINDOW_COLORS.length)];
    ectx.fillRect(x, y, w, h);
  }

  // Reveal shadow so the opening reads as recessed.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

  // Glass. Dhaka windows are usually dark from outside, occasionally curtained.
  const curtain = rnd() < 0.30;
  if (lit) {
    ctx.fillStyle = `rgb(${210 + rnd() * 30 | 0},${180 + rnd() * 40 | 0},${120 + rnd() * 40 | 0})`;
  } else if (curtain) {
    const c = 120 + rnd() * 70;
    ctx.fillStyle = `rgb(${c | 0},${(c - 6) | 0},${(c - 18) | 0})`;
  } else {
    const c = 44 + rnd() * 34;
    ctx.fillStyle = `rgb(${c | 0},${(c + 6) | 0},${(c + 12) | 0})`;
  }
  ctx.fillRect(x, y, w, h);

  // Sliding sash division, near universal on aluminium windows here.
  ctx.strokeStyle = 'rgba(190,190,185,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();

  // Security grille: extremely common up to about the third floor.
  if (rnd() < 0.55) {
    ctx.strokeStyle = 'rgba(30,30,28,0.55)';
    ctx.lineWidth = 1.2;
    const bars = 3 + Math.floor(rnd() * 3);
    for (let i = 1; i < bars; i++) {
      const bx = x + (w * i) / bars;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx, y + h);
      ctx.stroke();
    }
  }

  // Frame.
  ctx.strokeStyle = 'rgba(226,226,220,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Sill, and the stain it sheds.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x - 2, y + h, w + 4, 3);
}

/** A split AC condenser hanging off the wall on a steel bracket. */
function drawAC(ctx, x, y, w, h) {
  ctx.fillStyle = '#0000001f';
  ctx.fillRect(x + 2, y + 3, w, h);
  ctx.fillStyle = '#d8d6cf';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#9c9a93';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#8a8880';
  for (let i = 2; i < w - 2; i += 3) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + 2);
    ctx.lineTo(x + i, y + h - 2);
    ctx.stroke();
  }
}

/** Balcony slab, railing and often a laundry line. */
function drawBalcony(ctx, x, y, w, h, rnd) {
  // Slab underside shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x - 3, y + h, w + 6, 5);

  const style = rnd();
  if (style < 0.45) {
    // Solid parapet, rendered to match the wall but lighter.
    ctx.fillStyle = 'rgba(235,230,215,0.5)';
    ctx.fillRect(x - 3, y + h * 0.45, w + 6, h * 0.55);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 3, y + h * 0.45, w + 6, h * 0.55);
  } else if (style < 0.8) {
    // Vertical steel balusters.
    ctx.strokeStyle = 'rgba(48,52,50,0.8)';
    ctx.lineWidth = 1.6;
    for (let bx = x - 2; bx < x + w + 3; bx += 5) {
      ctx.beginPath();
      ctx.moveTo(bx, y + h * 0.42);
      ctx.lineTo(bx, y + h);
      ctx.stroke();
    }
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + h * 0.44);
    ctx.lineTo(x + w + 3, y + h * 0.44);
    ctx.stroke();
  } else {
    // Decorative grille panel.
    ctx.strokeStyle = 'rgba(58,60,56,0.75)';
    ctx.lineWidth = 1.3;
    for (let bx = x - 2; bx < x + w + 3; bx += 9) {
      ctx.beginPath();
      ctx.moveTo(bx, y + h * 0.42);
      ctx.lineTo(bx + 9, y + h);
      ctx.moveTo(bx + 9, y + h * 0.42);
      ctx.lineTo(bx, y + h);
      ctx.stroke();
    }
    ctx.strokeRect(x - 3, y + h * 0.42, w + 6, h * 0.58);
  }

  // Laundry, hung out on most balconies most of the year.
  if (rnd() < 0.5) {
    const colours = ['#c94f4f', '#3f6fb5', '#e0d9b8', '#4d9c62', '#d99b3f', '#ffffff', '#8a5fa8'];
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const cw = 4 + rnd() * 7;
      const cx = x + rnd() * (w - cw);
      ctx.fillStyle = colours[Math.floor(rnd() * colours.length)];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx, y + h * 0.3, cw, h * 0.3 + rnd() * 8);
      ctx.globalAlpha = 1;
    }
  }
}

/** Ground floor: roller shutters, glazed shop fronts and signboards. */
function drawShopfront(ctx, x0, y0, w, h, rnd) {
  const bays = 3 + Math.floor(rnd() * 3);
  const bw = w / bays;

  for (let i = 0; i < bays; i++) {
    const x = x0 + i * bw + 3;
    const bwi = bw - 6;
    const roll = rnd() < 0.45;

    if (roll) {
      // Closed corrugated roller shutter.
      const base = 96 + rnd() * 60;
      ctx.fillStyle = `rgb(${base | 0},${(base - 4) | 0},${(base - 12) | 0})`;
      ctx.fillRect(x, y0 + h * 0.28, bwi, h * 0.72);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let yy = y0 + h * 0.28; yy < y0 + h; yy += 4) {
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + bwi, yy);
        ctx.stroke();
      }
    } else {
      // Open shop: dark interior with a warm strip light.
      ctx.fillStyle = '#241f1a';
      ctx.fillRect(x, y0 + h * 0.28, bwi, h * 0.72);
      ctx.fillStyle = 'rgba(255,214,150,0.75)';
      ctx.fillRect(x + 3, y0 + h * 0.33, bwi - 6, 4);
      // Goods stacked against the back wall.
      for (let g = 0; g < 5; g++) {
        ctx.fillStyle = `rgba(${140 + rnd() * 90 | 0},${110 + rnd() * 80 | 0},${70 + rnd() * 70 | 0},0.7)`;
        ctx.fillRect(x + 4 + rnd() * (bwi - 16), y0 + h * (0.6 + rnd() * 0.3), 6 + rnd() * 12, 5 + rnd() * 14);
      }
      ctx.strokeStyle = 'rgba(200,200,195,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y0 + h * 0.28, bwi, h * 0.72);
    }

    // Signboard over the bay. Saturated, backlit, slightly crooked.
    const sign = ['#1f6fb8', '#c8342c', '#e0a021', '#1d8a4e', '#7b3fa0', '#0f5f8a'];
    ctx.fillStyle = sign[Math.floor(rnd() * sign.length)];
    ctx.fillRect(x - 2, y0 + h * 0.08, bwi + 4, h * 0.19);
    // Illegible lettering, which reads correctly at gameplay distance.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    let tx = x + 3;
    const ty = y0 + h * 0.15;
    while (tx < x + bwi - 6) {
      const cw = 3 + rnd() * 7;
      ctx.fillRect(tx, ty, cw, h * 0.055);
      tx += cw + 2 + rnd() * 3;
    }
  }
}

/**
 * Draw one facade style into its atlas cell.
 * The cell is laid out as: top 86% is the repeating upper-floor band,
 * bottom 14% is the ground floor. Buildings scale V so the ground floor lands
 * at street level and the upper band tiles up the wall.
 */
/**
 * Mirror-glass curtain wall (owner Street View item 6). A continuous
 * aluminium mullion grid over reflective panels: the sky gradient at the
 * top, the street's own darkness at the bottom, a spandrel band at each
 * slab edge, and a few panels kicked lighter or darker so the wall does not
 * read as one flat sheet. Ground floor is a showroom: taller glazing, a
 * bright interior and a fascia band above it.
 */
function drawGlassCurtain(ctx, x0, y0, w, h, rnd, ectx, surfaces) {
  paintSurface(surfaces, x0, y0, w, h, 48);
  // Base: vertical gradient from a pale sky reflection to a dark street.
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, '#9fb6c4');
  g.addColorStop(0.45, '#6d8798');
  g.addColorStop(0.8, '#41525d');
  g.addColorStop(1, '#2b363e');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);

  const bays = 6;
  const bw = w / bays;
  const storeys = 5;
  const sh = (h * 0.86) / storeys;

  for (let f = 0; f < storeys; f++) {
    const fy = y0 + f * sh;
    for (let b = 0; b < bays; b++) {
      const bx = x0 + b * bw;
      // Vision panel, with a per-panel tint so the wall shimmers.
      const k = rnd();
      if (k < 0.16) ctx.fillStyle = 'rgba(190,214,226,0.40)';       // sky flash
      else if (k < 0.30) ctx.fillStyle = 'rgba(18,26,32,0.36)';     // dark panel
      else if (k < 0.40) ctx.fillStyle = 'rgba(120,150,164,0.22)';
      else ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx + 2, fy + 3, bw - 4, sh * 0.72);

      // A diagonal highlight across the top corner of some panels: the
      // single cue that reads as "glass" rather than "blue wall".
      if (rnd() < 0.5) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(bx + 3, fy + 4);
        ctx.lineTo(bx + bw * 0.62, fy + 4);
        ctx.lineTo(bx + 3, fy + sh * 0.48);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fill();
        ctx.restore();
      }

      // Lit office at night.
      if (ectx && rnd() < 0.30) {
        ectx.fillStyle = '#ffe0a8';
        ectx.fillRect(bx + 2, fy + 3, bw - 4, sh * 0.72);
      }

      // Vertical mullion.
      ctx.fillStyle = 'rgba(226,228,228,0.55)';
      ctx.fillRect(bx, fy, 3, sh);
    }
    // Spandrel band at the slab edge + horizontal transom.
    ctx.fillStyle = 'rgba(40,50,56,0.55)';
    ctx.fillRect(x0, fy + sh * 0.76, w, sh * 0.22);
    ctx.fillStyle = 'rgba(226,228,228,0.5)';
    ctx.fillRect(x0, fy + sh * 0.74, w, 3);
  }

  // Ground floor showroom: full-height glazing, bright interior, fascia.
  const gy = y0 + h * 0.86;
  const gh = h * 0.14;
  ctx.fillStyle = '#20282d';
  ctx.fillRect(x0, gy, w, gh);
  ctx.fillStyle = 'rgba(236,232,214,0.30)';
  ctx.fillRect(x0 + 4, gy + gh * 0.30, w - 8, gh * 0.56);
  if (ectx) {
    ectx.fillStyle = '#fff2cf';
    ectx.fillRect(x0 + 4, gy + gh * 0.30, w - 8, gh * 0.56);
  }
  for (let b = 1; b < bays * 2; b++) {
    ctx.fillStyle = 'rgba(226,228,228,0.5)';
    ctx.fillRect(x0 + (b * w) / (bays * 2), gy + gh * 0.22, 3, gh * 0.7);
  }
  // Fascia band over the shopfront, where the brand sign goes.
  ctx.fillStyle = 'rgba(196,60,48,0.85)';
  ctx.fillRect(x0, gy, w, gh * 0.24);
}

/**
 * Unfinished concrete frame (owner Street View item 6). Bare slabs and
 * columns with no infill walls, the floors reading as dark voids, a few
 * lower floors part-filled with brick, staining down the columns and rebar
 * stubs on the roof. Extremely common in Dhaka and previously absent.
 */
function drawUnfinishedFrame(ctx, x0, y0, w, h, rnd) {
  // Dark interior showing straight through the open frame.
  ctx.fillStyle = '#2a2723';
  ctx.fillRect(x0, y0, w, h);

  const bays = 4;
  const bw = w / bays;
  const storeys = 5;
  const sh = h / storeys;
  const conc = '#b9b3a5';

  for (let f = 0; f < storeys; f++) {
    const fy = y0 + f * sh;

    // Some lower floors get partial blockwork infill; upper ones stay open.
    const infill = f >= storeys - 2 ? rnd() < 0.75 : rnd() < 0.22;
    if (infill) {
      ctx.fillStyle = '#8d6a55';
      ctx.fillRect(x0, fy + sh * 0.18, w, sh * 0.62);
      // Coursing.
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 1;
      for (let y = fy + sh * 0.18; y < fy + sh * 0.8; y += 8) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + w, y);
        ctx.stroke();
      }
      // A gap left for a future window.
      if (rnd() < 0.6) {
        ctx.fillStyle = '#221f1c';
        const ww = bw * 0.5;
        ctx.fillRect(x0 + bw * (0.4 + rnd()), fy + sh * 0.28, ww, sh * 0.4);
      }
    }

    // Slab edge: a bright horizontal band, the strongest read of the type.
    ctx.fillStyle = conc;
    ctx.fillRect(x0, fy, w, sh * 0.15);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x0, fy + sh * 0.15, w, 3);

    // Columns.
    for (let b = 0; b <= bays; b++) {
      const cx = x0 + b * bw - 5;
      ctx.fillStyle = conc;
      ctx.fillRect(cx, fy, 11, sh);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(cx + 8, fy, 3, sh); // shaded side
      // Staining down from the slab.
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(70,64,54,0.28)';
        ctx.fillRect(cx + 1, fy + sh * 0.15, 9, sh * (0.3 + rnd() * 0.5));
      }
    }
  }

  // Rebar stubs poking above the top slab.
  ctx.strokeStyle = 'rgba(90,74,56,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const rx = x0 + rnd() * w;
    ctx.beginPath();
    ctx.moveTo(rx, y0 + 2);
    ctx.lineTo(rx + (rnd() - 0.5) * 5, y0 - 9);
    ctx.stroke();
  }
}

export const UTTARA_START_CELL = 24;
export const UTTARA_CELL_COUNT = 8;
export const MIRPUR_CELL_COUNT = 24;

function drawCell(ctx, col, row, index, ectx, surfaces) {
  const rnd = mulberry(0x5eed + index * 7919);
  const x0 = col * CELL;
  const y0 = row * CELL;
  const isUttara = index >= UTTARA_START_CELL;
  const uIdx = index - UTTARA_START_CELL;
  const wall = isUttara
    ? UTTARA_WALL_PALETTE[uIdx % UTTARA_WALL_PALETTE.length]
    : WALL_PALETTE[index % WALL_PALETTE.length];
  const materialSlug = isUttara
    ? UTTARA_CELL_MATERIALS[uIdx % UTTARA_CELL_MATERIALS.length]
    : CELL_MATERIALS[index % CELL_MATERIALS.length];
  const wallImg = wallImageCache.get(materialSlug) || null;

  // Building TYPE branch (see CELL_TYPES / UTTARA_CELL_TYPES). Glass and unfinished-frame cells
  // paint themselves completely and return; the rest fall through to the
  // render/brick apartment block below.
  const cellType = isUttara
    ? UTTARA_CELL_TYPES[uIdx % UTTARA_CELL_TYPES.length]
    : CELL_TYPES[index % CELL_TYPES.length];
  if (cellType === 'glass') {
    drawGlassCurtain(ctx, x0, y0, CELL, CELL, rnd, ectx, surfaces);
    return;
  }
  if (cellType === 'frame') {
    paintSurface(surfaces, x0, y0, CELL, CELL, 235);
    drawUnfinishedFrame(ctx, x0, y0, CELL, CELL, rnd);
    return;
  }

  // Base wall: real photographic material, tinted with the palette colour.
  drawTexturedBase(ctx, x0, y0, CELL, CELL, wallImg, wall, rnd);
  paintSurfaceBase(surfaces, materialSlug, x0, y0, CELL);

  // Faint horizontal slab bands between floors.
  const floors = 4;
  const fh = (CELL * 0.86) / floors;

  // Photo brick already carries its own coursing; only draw the procedural
  // coursing lines as a fallback when the image failed to load. Keyed off
  // the material slug (not a hardcoded index) since P8-MIRPUR12 gave brick
  // several cells instead of just one.
  const brick = materialSlug === 'brick-old' && !wallImg;
  if (brick) {
    // Exposed brick coursing.
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    for (let y = y0; y < y0 + CELL; y += 7) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + CELL, y);
      ctx.stroke();
    }
    for (let y = y0, r = 0; y < y0 + CELL; y += 7, r++) {
      for (let x = x0 + (r % 2 ? 0 : 8); x < x0 + CELL; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 7);
        ctx.stroke();
      }
    }
  }

  // Upper floors.
  const cols = 2 + (index % 4);
  const balconyColumn = index % cols;
  const balconyChance = [0.15, 0.75, 0.35, 0.9][index % 4];
  const cw = CELL / cols;

  for (let c = 0; c < cols; c++) {
    const x = x0 + c * cw;
    ctx.fillStyle = c === balconyColumn ? 'rgba(35,32,28,0.24)' : 'rgba(255,248,232,0.07)';
    ctx.fillRect(x + cw * 0.08, y0, cw * 0.84, CELL * 0.86);
    ctx.fillStyle = shade(wall, 12);
    ctx.fillRect(x, y0, 5 + index % 5, CELL * 0.86);
  }

  for (let f = 0; f < floors; f++) {
    const fy = y0 + f * fh;

    // Slab edge line.
    ctx.fillStyle = shade(wall, 16);
    ctx.fillRect(x0, fy, CELL, 4);
    ctx.fillStyle = isUttara ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0, fy + 4, CELL, 2);

    for (let c = 0; c < cols; c++) {
      const cx = x0 + c * cw;
      const hasBalcony = c === balconyColumn || rnd() < balconyChance;
      if (hasBalcony) paintSurface(surfaces, cx + cw * 0.12, fy + fh * 0.16, cw * 0.76, fh * 0.7, 210);

      if (hasBalcony) {
        drawWindow(ctx, cx + cw * 0.28, fy + fh * 0.18, cw * 0.44, fh * 0.62, rnd, false, ectx, surfaces);
        drawBalcony(ctx, cx + cw * 0.14, fy + fh * 0.30, cw * 0.72, fh * 0.55, rnd);
      } else {
        const ww = cw * (0.42 + rnd() * 0.16);
        const wh = fh * (0.42 + rnd() * 0.12);
        drawWindow(ctx, cx + (cw - ww) / 2, fy + fh * 0.24, ww, wh, rnd, false, ectx, surfaces);
        if (rnd() < (isUttara ? 0.32 : 0.24)) {
          drawAC(ctx, cx + cw * 0.62, fy + fh * 0.30, cw * 0.2, fh * 0.18);
        }
      }
    }
  }

  // Ground floor. P8-MIRPUR12: darker and more contrasty than the plain
  // shade-22 band before, plus a raised plinth/kerb line at the very
  // bottom, so the ground floor reads as a distinct commercial storey
  // rather than a repeat of the upper-floor window grid painted a bit
  // darker (brief: "not the same window grid repeated from pavement to
  // roof — a raised plinth"). Uttara ground floors are cleaner with lighter tint.
  const gy = y0 + CELL * 0.86;
  const gh = CELL * 0.14;
  ctx.fillStyle = isUttara ? shade(wall, -16) : shade(wall, -34);
  ctx.fillRect(x0, gy, CELL, gh);
  drawShopfront(ctx, x0, gy, CELL, gh, rnd);
  paintSurface(surfaces, x0, gy, CELL, gh, 175);

  // Raised concrete plinth along the very base: a darker skirting band plus
  // a lighter top edge catching the light, ~6% of the cell height.
  const plinthH = CELL * 0.028;
  if (isUttara) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0, y0 + CELL - plinthH, CELL, plinthH);
    ctx.fillStyle = 'rgba(230,225,215,0.45)';
    ctx.fillRect(x0, y0 + CELL - plinthH, CELL, 2);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x0, y0 + CELL - plinthH, CELL, plinthH);
    ctx.fillStyle = 'rgba(210,205,190,0.35)';
    ctx.fillRect(x0, y0 + CELL - plinthH, CELL, 2);
  }

  // Weathering last, over everything. Uttara has much lighter, cleaner weathering.
  if (isUttara) {
    drawStreaks(ctx, x0, y0, CELL, CELL, rnd, 7);
    drawGrain(ctx, x0, y0, CELL, CELL, rnd, 8);
  } else {
    drawStreaks(ctx, x0, y0, CELL, CELL, rnd, 14);
    drawDamp(ctx, x0, y0, CELL, CELL, rnd);
    drawGrain(ctx, x0, y0, CELL, CELL, rnd, 8);
  }
}

/**
 * Build the facade atlas.
 * @returns {{ texture: THREE.CanvasTexture, cols: number, rows: number }}
 */
export async function buildFacadeAtlas({ imageLoader = loadImage } = {}) {
  await preloadWallImages(imageLoader);

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Emissive atlas: black everywhere except the ~35% of windows picked as
  // "lit", painted warm at their exact window rectangle. Used as an
  // emissiveMap for the night lit-window look (see night.js / city.js).
  const ecanvas = document.createElement('canvas');
  ecanvas.width = ATLAS_COLS * CELL;
  ecanvas.height = ATLAS_ROWS * CELL;
  const ectx = ecanvas.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, ecanvas.width, ecanvas.height);

  const surfaceCanvases = ['normal', 'roughness'].map(() => {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    return c;
  });
  const surfaces = { normal: surfaceCanvases[0].getContext('2d'), roughness: surfaceCanvases[1].getContext('2d') };
  for (let i = 0; i < ATLAS_CELLS; i++) {
    drawCell(ctx, i % ATLAS_COLS, Math.floor(i / ATLAS_COLS), i, ectx, surfaces);
  }
  // Compress the painted cell into an inset and extrude its edges for filtered mip levels.
  for (const atlas of [canvas, ecanvas, ...surfaceCanvases]) padCells(atlas);
  const normalCanvas = downsample(surfaceCanvases[0], 2);
  const roughnessCanvas = downsample(surfaceCanvases[1], 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const emissiveTexture = new THREE.CanvasTexture(ecanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.anisotropy = 8;
  emissiveTexture.wrapS = THREE.ClampToEdgeWrapping;
  emissiveTexture.wrapT = THREE.ClampToEdgeWrapping;
  emissiveTexture.generateMipmaps = true;
  emissiveTexture.minFilter = THREE.LinearMipmapLinearFilter;
  emissiveTexture.magFilter = THREE.LinearFilter;
  emissiveTexture.needsUpdate = true;

  return { texture, cols: ATLAS_COLS, rows: ATLAS_ROWS, canvas, emissiveTexture, emissiveCanvas: ecanvas, normalCanvas, roughnessCanvas };
}

/**
 * Rooftop texture: raw concrete slab with tank stains and patched waterproofing.
 * Used for the top cap of every building.
 */
export function buildRoofTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry(0x9911);

  // Base slab: the same photographic concrete used for the concrete wall
  // cells, if it finished loading in time (buildFacadeAtlas preloads and
  // caches it before this runs); otherwise fall back to a flat fill.
  const roofImg = wallImageCache.get(ROOF_MATERIAL) || null;
  drawTexturedBase(ctx, 0, 0, S, S, roofImg, '#8f8a7e', rnd);

  // Patchy bitumen waterproofing.
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${52 + rnd() * 40 | 0},${48 + rnd() * 36 | 0},${44 + rnd() * 30 | 0},${0.15 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 45, 8 + rnd() * 35, rnd() * 3.14, 0, 6.283);
    ctx.fill();
  }
  // Algae in the damp corners.
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgba(${70 + rnd() * 30 | 0},${86 + rnd() * 30 | 0},${58 + rnd() * 24 | 0},${0.12 + rnd() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * S, rnd() * S, 6 + rnd() * 26, 5 + rnd() * 20, rnd() * 3.14, 0, 6.283);
    ctx.fill();
  }
  drawGrain(ctx, 0, 0, S, S, rnd, 22);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function downsample(canvas, divisor) {
  const out = document.createElement('canvas');
  out.width = canvas.width / divisor;
  out.height = canvas.height / divisor;
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function padCells(canvas) {
  const ctx = canvas.getContext('2d');
  const cell = document.createElement('canvas');
  cell.width = cell.height = CELL;
  const copy = cell.getContext('2d');
  const pad = ATLAS_GUTTER;
  const inner = CELL - pad * 2;
  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLS; col++) {
      const x = col * CELL, y = row * CELL;
      copy.clearRect(0, 0, CELL, CELL);
      copy.drawImage(canvas, x, y, CELL, CELL, 0, 0, CELL, CELL);
      ctx.drawImage(cell, 0, 0, CELL, CELL, x + pad, y + pad, inner, inner);
      ctx.drawImage(cell, 0, 0, CELL, 1, x + pad, y, inner, pad);
      ctx.drawImage(cell, 0, CELL - 1, CELL, 1, x + pad, y + CELL - pad, inner, pad);
      ctx.drawImage(canvas, x + pad, y, 1, CELL, x, y, pad, CELL);
      ctx.drawImage(canvas, x + CELL - pad - 1, y, 1, CELL, x + CELL - pad, y, pad, CELL);
    }
  }
}
