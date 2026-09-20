/**
 * landmarks.js
 *
 * Two REAL, hand-modelled buildings on the Mirpur 12 / Pallabi arterial,
 * built to the owner's own Google Street View screenshots, transcribed in
 * reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md (third batch, 2026-09-07
 * ~18:40). The owner's words: "make sure to add this exact building same
 * thing same look! same texts in same place!"
 *
 * Approach: rather than editing city.js's shared tile/atlas system (which
 * would need per-building overrides threaded through a file another
 * executor may be mid-edit on), each landmark is a self-contained "skin": a
 * thin box added just in front of the REAL OSM footprint's road-facing
 * edge, running from the ground to the building's real height plus a
 * parapet, textured with one hand-painted canvas unique to that building.
 * The generic tile geometry for that same footprint still exists behind it
 * (unchanged, still collidable) — the skin only needs to win the paint job
 * from the angles that matter, which is any view from the road, and it
 * does, being flush with (very slightly in front of) the real wall.
 *
 * Real business names are reproduced as plain text labels — the sign
 * layout and colours are recreated, not the proprietary logo artwork (no
 * Colonel portrait, no brand-specific lettering) — the same rule already
 * applied to the generic arterial signage in signs.js. This is a
 * non-commercial personal simulation of a real, physically-existing
 * streetscape, the same practice flight/driving simulators use for
 * landmark buildings.
 */

import * as THREE from 'three';
import { getClippedFootprint } from './city.js';

// ---------------------------------------------------------------------------
// Real footprints, from public/scene-north.json (OSM ids, so they survive a
// data rebuild as long as OSM doesn't retag the buildings). Coordinates are
// this project's usual metres, +X east, +Z south.
// ---------------------------------------------------------------------------

/** BFC/KFC tower, Begum Rokeya Ave. OSM way 428135535, h=22.45 (~7 storeys). */
const LM1_FOOTPRINT = [
  -232.59, -1488.69, -225.03, -1489.9, -221.99, -1470.64, -229.28, -1469.49,
  -230.42, -1476.68, -237.42, -1475.58, -237.91, -1478.72, -240.05, -1478.39,
  -240.63, -1482.04, -237.82, -1482.48, -238.45, -1486.47, -232.38, -1487.42,
];
const LM1_HEIGHT = 22.45;

/** South Point School building, Mirpur Ceramic Rd. OSM way 352027195, h=28.55. */
const LM2A_FOOTPRINT = [-246.11, -1622.58, -235.22, -1623.99, -230.53, -1602.17, -244.84, -1599.74];
const LM2A_HEIGHT = 28.55;

/** Best Buy / Regal building, Mirpur Ceramic Rd. OSM way 352027475, h=28.55. */
const LM2B_FOOTPRINT = [-245.15, -1598.93, -229.55, -1601.45, -226.66, -1578.62, -245.06, -1575.62];
const LM2B_HEIGHT = 28.55;

/**
 * Find the footprint's westmost edge (the one facing the arterial, which
 * runs north-south a little west of these plots) and return its two
 * endpoints plus outward (west-facing) normal.
 */
/**
 * The full road-facing frontage of a plot, as one straight plane.
 *
 * roadFacingEdge() below picks a SINGLE polygon edge, which is only right for
 * a plot whose frontage is one clean line. The BFC/KFC tower's OSM footprint
 * (way 428135535) is an L with a notched western wing, and edge-picking gave
 * it a 3.7 m sliver of facade on a 20 m frontage — the building was there but
 * far too narrow to read as the real one (owner, 2026-09-20: "it doesnt look
 * alike"). This instead projects the whole footprint onto the road's own
 * frame and returns the full span at the outermost point, which is what the
 * building actually presents to the street.
 *
 * @param footprint flat [x,z,...] ring
 * @param nx outward normal x (unit, pointing at the road)
 * @param nz outward normal z
 */
function frontagePlane(footprint, nx, nz) {
  const n = footprint.length / 2;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) { cx += footprint[i * 2]; cz += footprint[i * 2 + 1]; }
  cx /= n;
  cz /= n;
  // Along-frontage axis, perpendicular to the outward normal.
  const tx = -nz;
  const tz = nx;
  let tMin = Infinity;
  let tMax = -Infinity;
  let nMin = Infinity;
  let nMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const X = footprint[i * 2] - cx;
    const Z = footprint[i * 2 + 1] - cz;
    const t = X * tx + Z * tz;
    const d = X * nx + Z * nz;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    if (d < nMin) nMin = d;
    if (d > nMax) nMax = d;
  }
  return {
    ax: cx + tx * tMin + nx * nMax,
    az: cz + tz * tMin + nz * nMax,
    bx: cx + tx * tMax + nx * nMax,
    bz: cz + tz * tMax + nz * nMax,
    len: tMax - tMin,
    // How far back the plot runs, so the skin can close off as a solid block
    // instead of a floating panel with a gap behind it.
    depth: nMax - nMin,
  };
}

function roadFacingEdge(footprint, side = 'east') {
  const n = footprint.length / 2;
  let best = null;
  // For a plot east of the road we want its WEST edge (smallest midpoint x);
  // for a plot west of the road, its EAST edge (largest).
  const wantWest = side !== 'west';
  let bestX = wantWest ? Infinity : -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = footprint[i * 2];
    const az = footprint[i * 2 + 1];
    const bx = footprint[j * 2];
    const bz = footprint[j * 2 + 1];
    const midX = (ax + bx) / 2;
    // Prefer the edge whose midpoint is furthest west AND whose length is
    // not tiny (skip chamfer nubs on the irregular LM1 footprint).
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 3) continue;
    if (wantWest ? midX < bestX : midX > bestX) {
      bestX = midX;
      best = { ax, az, bx, bz, len };
    }
  }
  return best;
}

/** Skin with front facade, side return walls and top cap from the ground to `height`, textured. */
function buildSkin(footprint, height, material, parapet = 1.3, side = 'east', depthOverride = null) {
  const edge = Array.isArray(footprint) ? roadFacingEdge(footprint, side) : footprint;
  if (!edge) return new THREE.Group();
  const dx = edge.bx - edge.ax;
  const dz = edge.bz - edge.az;
  const len = edge.len || Math.hypot(dx, dz);
  if (len < 0.1) return new THREE.Group();
  const ux = dx / len;
  const uz = dz / len;

  let nx = uz;
  let nz = -ux;
  const wantNegX = side !== 'west';
  if ((wantNegX && nx > 0) || (!wantNegX && nx < 0)) { nx = -nx; nz = -nz; }

  // Ensure ax, az to bx, bz is oriented so that (dx, dz) x (0, 1, 0) points towards (nx, nz)
  const dotOut = uz * nx - ux * nz;
  let ax = edge.ax, az = edge.az, bx = edge.bx, bz = edge.bz;
  if (dotOut < 0) {
    ax = edge.bx; az = edge.bz;
    bx = edge.ax; bz = edge.az;
  }
  const uux = (bx - ax) / len;
  const uuz = (bz - az) / len;

  const off = 0.02; // flush with the real 3D wall to eliminate floating gap
  // How far the skin wraps back into the real 3D building. A precomputed
  // frontage plane carries the plot's own depth so the block closes off.
  const depth = depthOverride ?? edge.depth ?? 0.35;
  const x0 = ax + nx * off;
  const z0 = az + nz * off;
  const x1 = bx + nx * off;
  const z1 = bz + nz * off;
  const h = height + parapet;

  // Back points tucking into the building
  const bx0 = x0 - nx * depth;
  const bz0 = z0 - nz * depth;
  const bx1 = x1 - nx * depth;
  const bz1 = z1 - nz * depth;

  const pos = [
    // Front face (textured) - outward facing (nx, 0, nz)
    x0, 0, z0,  x1, h, z1,  x1, 0, z1,
    x0, 0, z0,  x0, h, z0,  x1, h, z1,
    // Left return wall - outward facing (-uux, 0, -uuz)
    bx0, 0, bz0,  x0, h, z0,  x0, 0, z0,
    bx0, 0, bz0,  bx0, h, bz0,  x0, h, z0,
    // Right return wall - outward facing (uux, 0, uuz)
    x1, 0, z1,  bx1, h, bz1,  bx1, 0, bz1,
    x1, 0, z1,  x1, h, z1,  bx1, h, bz1,
    // Top cap - outward facing (0, 1, 0)
    x0, h, z0,  bx1, h, bz1,  x1, h, z1,
    x0, h, z0,  bx0, h, bz0,  bx1, h, bz1,
  ];

  // U runs 1 -> 0 from x0 to x1. Seen from outside (looking along -n) the x0
  // end is on the VIEWER'S RIGHT, so mapping u=0 to x0 mirrored every facade:
  // "BFC"/"KFC" and the Bangla boards all read backwards (owner, 2026-09-20).
  const uv = [
    // Front face
    1, 0,  0, 1,  0, 0,
    1, 0,  1, 1,  0, 1,
    // Left return wall: sample edge of texture
    0.98, 0,  0.98, 1,  0.98, 0,
    0.98, 0,  0.98, 1,  0.98, 1,
    // Right return wall: sample edge of texture
    0.02, 0,  0.02, 1,  0.02, 0,
    0.02, 0,  0.02, 1,  0.02, 1,
    // Top cap: sample parapet coping at top
    0.5, 0.98,  0.5, 0.98,  0.5, 0.98,
    0.5, 0.98,  0.5, 0.98,  0.5, 0.98,
  ];

  const nor = [
    // Front face
    nx, 0, nz,  nx, 0, nz,  nx, 0, nz,
    nx, 0, nz,  nx, 0, nz,  nx, 0, nz,
    // Left return wall (-uux, 0, -uuz)
    -uux, 0, -uuz,  -uux, 0, -uuz,  -uux, 0, -uuz,
    -uux, 0, -uuz,  -uux, 0, -uuz,  -uux, 0, -uuz,
    // Right return wall (uux, 0, uuz)
    uux, 0, uuz,  uux, 0, uuz,  uux, 0, uuz,
    uux, 0, uuz,  uux, 0, uuz,  uux, 0, uuz,
    // Top cap (upward)
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makeMaterial(canvas, ecanvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  if (ecanvas) {
    const etex = new THREE.CanvasTexture(ecanvas);
    mat.emissiveMap = etex;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0; // day: off; night.js-style callers can ramp this
    mat.setNightIntensity = (v) => { mat.emissiveIntensity = v; };
  }
  return mat;
}

// ---------------------------------------------------------------------------
// Landmark 1: the BFC / KFC tower
// ---------------------------------------------------------------------------

function paintLandmark1(ctx, ectx, W, H, floors, parapetFrac) {
  const glassFrac = 0.58;
  const glassW = W * glassFrac;
  const redX = glassW;
  const redW = W - glassW;
  const parapetH = Math.round(H * parapetFrac);
  const groundH = Math.round((H - parapetH) * 0.16);
  const upperH = H - parapetH - groundH;
  const upperY = parapetH;
  const gy = upperY + upperH;

  // --- Parapet cap: drawn at top of canvas (y = 0 to parapetH) ---
  ctx.fillStyle = '#a81f19';
  ctx.fillRect(redX - redW * 0.04, 0, redW * 1.08, parapetH);
  ctx.fillStyle = '#3a4750';
  ctx.fillRect(0, 0, glassW, parapetH);

  // --- Glass zone: blue-grey mirror curtain wall (upperY to gy) ---
  const g = ctx.createLinearGradient(0, upperY, 0, gy);
  g.addColorStop(0, '#9db3c2');
  g.addColorStop(0.5, '#6f8b9b');
  g.addColorStop(1, '#445965');
  ctx.fillStyle = g;
  ctx.fillRect(0, upperY, glassW, upperH);
  const bays = 6;
  const bw = glassW / bays;
  const rows = floors - 1;
  const rh = upperH / rows;
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < bays; b++) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(glassW * 0 + b * bw, upperY + r * rh, 2, rh);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(0, upperY + r * rh, glassW, 2);
  }

  // Randomly stacked illuminated sign boxes on the glass
  const signs = [
    { t: 'RICE N SLICE', sub: "BE7 YOU WON'T FORGET THE TASTE", bg: '#c8241f', fg: '#ffffff', x: 0.06, y: 0.10, w: 0.42, h: 0.13 },
    { t: 'IZ PATISSERIE & CAFE', sub: '', bg: '#1c1c1c', fg: '#f2f2ee', x: 0.06, y: 0.26, w: 0.5, h: 0.11 },
    { t: 'CAFE ZERO ONE', sub: '', bg: '#151515', fg: '#d94a3a', x: 0.05, y: 0.40, w: 0.4, h: 0.10 },
    { t: 'FOOD ENGINEERING', sub: '', bg: '#e0b31a', fg: '#1a1a1a', x: 0.52, y: 0.14, w: 0.42, h: 0.10 },
    { t: 'La Nui Bengali', sub: '', bg: '#141414', fg: '#e0c34a', x: 0.5, y: 0.02, w: 0.44, h: 0.10 },
  ];
  for (const s of signs) {
    const sx = s.x * glassW, sy = upperY + s.y * upperH, sw = s.w * glassW, sh = s.h * upperH;
    ctx.fillStyle = s.bg;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(sh * 0.42)}px system-ui, Arial, sans-serif`;
    ctx.fillText(s.t, sx + sw / 2, sy + sh * (s.sub ? 0.36 : 0.5));
    if (s.sub) {
      ctx.font = `600 ${Math.round(sh * 0.18)}px system-ui, Arial, sans-serif`;
      ctx.fillText(s.sub, sx + sw / 2, sy + sh * 0.78);
    }
    if (ectx) {
      ectx.fillStyle = '#fff2c8';
      ectx.fillRect(sx, sy, sw, sh);
    }
  }

  // --- Red pier ---
  ctx.fillStyle = '#c0261f';
  ctx.fillRect(redX, upperY, redW, upperH);

  // BFC roundel above the giant letters.
  const roundelY = upperY + upperH * 0.28;
  ctx.strokeStyle = '#ffd23a';
  ctx.lineWidth = redW * 0.02;
  ctx.beginPath();
  ctx.ellipse(redX + redW / 2, roundelY, redW * 0.30, upperH * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd23a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(upperH * 0.04)}px system-ui, Arial, sans-serif`;
  ctx.fillText('BFC', redX + redW / 2, roundelY - upperH * 0.015);
  ctx.font = `700 ${Math.round(upperH * 0.024)}px system-ui, Arial, sans-serif`;
  ctx.fillText('BEST FRIED CHICKEN', redX + redW / 2, roundelY + upperH * 0.028);

  // Giant "BFC" letters painted directly on the panel.
  ctx.fillStyle = '#ffd23a';
  ctx.font = `900 ${Math.round(upperH * 0.16)}px "Arial Black", Arial, sans-serif`;
  ctx.fillText('BFC', redX + redW / 2, upperY + upperH * 0.52);

  // KFC band under the BFC letters, at ground level, brand-red/white.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(redX, gy, redW, groundH);
  ctx.fillStyle = '#c0261f';
  ctx.font = `900 ${Math.round(groundH * 0.55)}px "Arial Black", Arial, sans-serif`;
  ctx.fillText('KFC', redX + redW / 2, gy + groundH * 0.5);

  // --- Ground floor across the glass zone: Khana's / Burger King / Domino's / বি এফ সি bays.
  const gBays = [
    { w: 0.30, top: { bg: '#f2f2ee', fg: '#c0261f', t: "Khana's" }, band: { bg: '#c0261f', fg: '#ffd23a', t: 'BURGER KING' } },
    { w: 0.34, top: null, band: { bg: '#0d2a5c', fg: '#ffffff', t: "Domino's Pizza" }, sub: 'ডোমিনোজ' },
    { w: 0.36, top: null, band: { bg: '#e0b31a', fg: '#0d0d0d', t: 'বি এফ সি' } },
  ];
  let gx = 0;
  for (const b of gBays) {
    const w = b.w * glassW;
    ctx.fillStyle = '#20242a';
    ctx.fillRect(gx, gy, w, groundH);
    ctx.fillStyle = b.band.bg;
    ctx.fillRect(gx, gy + groundH * 0.5, w, groundH * 0.5);
    ctx.fillStyle = b.band.fg;
    ctx.font = `700 ${Math.round(groundH * 0.28)}px system-ui, Arial, sans-serif`;
    ctx.fillText(b.band.t, gx + w / 2, gy + groundH * 0.75);
    if (b.top) {
      ctx.fillStyle = b.top.bg;
      ctx.beginPath();
      ctx.ellipse(gx + w * 0.22, gy + groundH * 0.22, w * 0.18, groundH * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.top.fg;
      ctx.font = `700 ${Math.round(groundH * 0.16)}px system-ui, Arial, sans-serif`;
      ctx.fillText(b.top.t, gx + w * 0.22, gy + groundH * 0.22);
    }
    if (b.sub) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.round(groundH * 0.16)}px "Noto Sans Bengali", system-ui, sans-serif`;
      ctx.fillText(b.sub, gx + w / 2, gy + groundH * 0.32);
    }
    gx += w;
  }

  // Ground-floor lit interior on the emissive map.
  if (ectx) {
    ectx.fillStyle = '#ffe6b0';
    ectx.fillRect(0, gy, glassW + redW, groundH * 0.5);
  }
}

// ---------------------------------------------------------------------------
// Landmark 2: South Point School (left) + Best Buy / Regal (right)
// ---------------------------------------------------------------------------

function paintLandmarkColumn(ctx, ectx, x0, w, H, floors, parapetFrac, variant) {
  const parapetH = Math.round(H * parapetFrac);
  const groundH = Math.round((H - parapetH) * 0.14);
  const upperH = H - parapetH - groundH;
  const upperY = parapetH;
  const gy = upperY + upperH;
  const rows = Math.max(1, floors - 1);
  const rh = upperH / rows;

  // Roof parapet at the top (y = 0 to parapetH)
  ctx.fillStyle = variant.wall;
  ctx.fillRect(x0, 0, w, parapetH);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x0, parapetH * 0.65, w, 3);

  // Upper floors
  ctx.fillStyle = variant.wall;
  ctx.fillRect(x0, upperY, w, upperH);

  // Window band + AC units per floor.
  const bays = Math.max(3, Math.round(w / 55));
  const bw = w / bays;
  for (let r = 0; r < rows; r++) {
    const fy = upperY + r * rh;
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(x0, fy + rh * 0.9, w, rh * 0.06);
    for (let b = 0; b < bays; b++) {
      const bx = x0 + b * bw;
      ctx.fillStyle = 'rgba(60,70,80,0.55)';
      ctx.fillRect(bx + bw * 0.18, fy + rh * 0.18, bw * 0.5, rh * 0.5);
      // AC condenser unit.
      ctx.fillStyle = '#cfcfcc';
      ctx.fillRect(bx + bw * 0.72, fy + rh * 0.55, bw * 0.22, rh * 0.16);
    }
  }

  // Feature band (school fascia, or the red Best Buy block).
  if (variant.fasciaText) {
    const fy = upperY + rh * (rows - 1) + rh * 0.15;
    const fh = rh * 0.5;
    ctx.fillStyle = variant.fasciaBg;
    ctx.fillRect(x0, fy, w, fh);
    ctx.fillStyle = variant.fasciaFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(fh * 0.36)}px "Noto Sans Bengali", system-ui, sans-serif`;
    ctx.fillText(variant.fasciaText, x0 + w / 2, fy + fh * 0.42);
    if (variant.fasciaSub) {
      ctx.font = `500 ${Math.round(fh * 0.18)}px system-ui, Arial, sans-serif`;
      ctx.fillText(variant.fasciaSub, x0 + w / 2, fy + fh * 0.78);
    }
  }

  if (variant.redBlock) {
    // Best Buy: a narrower red shopfront block spanning ground + 1st floor.
    const blockW = w * 0.86;
    const bx = x0 + (w - blockW) / 2;
    const blockH = groundH + rh * 1.05;
    const by = H - blockH;
    ctx.fillStyle = '#c0221f';
    ctx.fillRect(bx, by, blockW, blockH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(blockH * 0.14)}px system-ui, Arial, sans-serif`;
    ctx.fillText('Regal', bx + blockW / 2, by + blockH * 0.16);
    ctx.font = `800 ${Math.round(blockH * 0.24)}px system-ui, Arial, sans-serif`;
    ctx.fillText('Best Buy', bx + blockW / 2, by + blockH * 0.42);
    // Bright, densely lit interior glimpsed through the glass below.
    ctx.fillStyle = 'rgba(255,240,200,0.7)';
    ctx.fillRect(bx + blockW * 0.06, by + blockH * 0.58, blockW * 0.88, blockH * 0.34);
    if (ectx) {
      ectx.fillStyle = '#fff0c0';
      ectx.fillRect(bx + blockW * 0.06, by + blockH * 0.58, blockW * 0.88, blockH * 0.34);
      ectx.fillStyle = '#ffe6a0';
      ectx.fillRect(bx, by, blockW, blockH * 0.16);
    }
  }

  // Ground floor: generic shopfronts (Well Food / alpha shop.store, or a
  // plain shuttered row) for whichever column doesn't have the red block.
  if (!variant.redBlock) {
    ctx.fillStyle = '#17181a';
    ctx.fillRect(x0, gy, w, groundH);
    const shops = variant.groundShops || [];
    const sw = w / Math.max(1, shops.length);
    shops.forEach((sh2, i) => {
      ctx.fillStyle = sh2.bg;
      ctx.fillRect(x0 + i * sw + 2, gy + groundH * 0.15, sw - 4, groundH * 0.7);
      ctx.fillStyle = sh2.fg;
      ctx.font = `600 ${Math.round(groundH * 0.22)}px system-ui, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sh2.t, x0 + i * sw + sw / 2, gy + groundH * 0.5);
    });
  }

  // Plinth at bottom
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0, H - 4, w, 4);
}

// ---------------------------------------------------------------------------

/**
 * Build both landmarks. Returns a group plus the two materials (for a
 * night.js-style caller to ramp emissiveIntensity, matching the pattern
 * already used by city.js's wallMat.setNightIntensity).
 */
export function buildLandmarks() {
  const group = new THREE.Group();
  group.name = 'landmarks';

  // --- Landmark 1 ----------------------------------------------------------
  const c1 = document.createElement('canvas');
  c1.width = 1024; c1.height = 1536;
  const ctx1 = c1.getContext('2d');
  const e1 = document.createElement('canvas');
  e1.width = 1024; e1.height = 1536;
  const ectx1 = e1.getContext('2d');
  ectx1.fillStyle = '#000000';
  ectx1.fillRect(0, 0, e1.width, e1.height);
  paintLandmark1(ctx1, ectx1, c1.width, c1.height, 7, 0.08);
  const mat1 = makeMaterial(c1, e1);
  // Frontage plane taken parallel to the MRT-6 corridor (Begum Rokeya Ave),
  // which this building fronts: outward normal measured at (-0.999, 0.034)
  // from the footprint centroid to the corridor centreline, 33 m west.
  const skin1 = buildSkin(frontagePlane(LM1_FOOTPRINT, -0.999, 0.034), LM1_HEIGHT, mat1, 1.6, 'east');
  skin1.name = 'landmark:bfc-kfc-tower';
  group.add(skin1);

  // --- Landmark 2a (South Point School) ------------------------------------
  const c2 = document.createElement('canvas');
  c2.width = 900; c2.height = 1800;
  const ctx2 = c2.getContext('2d');
  const e2 = document.createElement('canvas');
  e2.width = 900; e2.height = 1800;
  const ectx2 = e2.getContext('2d');
  ectx2.fillStyle = '#000000';
  ectx2.fillRect(0, 0, e2.width, e2.height);
  paintLandmarkColumn(ctx2, ectx2, 0, c2.width, c2.height, 9, 0.06, {
    wall: '#aab7bd',
    fasciaText: 'সাউথ পয়েন্ট স্কুল এন্ড কলেজ',
    fasciaSub: '+8802-44806660  EIIN 108040',
    fasciaBg: '#123f8a',
    fasciaFg: '#ffffff',
    groundShops: [
      { bg: '#0d0d0d', fg: '#ffffff', t: 'Well Food' },
      { bg: '#242424', fg: '#f2f2ee', t: 'alpha shop.store' },
    ],
  });
  const mat2a = makeMaterial(c2, e2);
  const skin2a = buildSkin(LM2A_FOOTPRINT, LM2A_HEIGHT, mat2a, 1.4, 'east');
  skin2a.name = 'landmark:south-point-school';
  group.add(skin2a);

  // --- Landmark 2b (Best Buy / Regal) --------------------------------------
  const c3 = document.createElement('canvas');
  c3.width = 900; c3.height = 1800;
  const ctx3 = c3.getContext('2d');
  const e3 = document.createElement('canvas');
  e3.width = 900; e3.height = 1800;
  const ectx3 = e3.getContext('2d');
  ectx3.fillStyle = '#000000';
  ectx3.fillRect(0, 0, e3.width, e3.height);
  paintLandmarkColumn(ctx3, ectx3, 0, c3.width, c3.height, 9, 0.06, {
    wall: '#d8cfae',
    redBlock: true,
  });
  const mat2b = makeMaterial(c3, e3);
  const skin2b = buildSkin(LM2B_FOOTPRINT, LM2B_HEIGHT, mat2b, 1.4, 'east');
  skin2b.name = 'landmark:best-buy-regal';
  group.add(skin2b);

  const materials = [mat1, mat2a, mat2b];
  return {
    group,
    materials,
    /** Ramp all landmark emissive maps together, matching night.js's other callers. */
    setNightIntensity(v) {
      for (const m of materials) if (m.setNightIntensity) m.setNightIntensity(v);
    },
  };
}

// ---------------------------------------------------------------------------
// The rest of the street (owner, 2026-09-07: "make rest on that street same
// alike!").
//
// public/street-pallabi.json holds the 28 building footprints that actually
// front the arterial between the Mirpur 12 bus stand and Pallabi station,
// each tagged with the side of the road it sits on and with the REAL
// businesses OSM records at that address — Agrani Bank Pallabi Branch, Desh
// Pharma, Avano Asian Fusion, Regent Hospital, Taher Pharmacy, Azad
// Electronics, The Cafe Rio, Intraco CNG & LPG, South Point School, Ongona
// Enterprise, Ekota Business Point. Each POI is assigned to its single
// NEAREST frontage building, so a name appears on one building, not five.
//
// So these are not invented shopfronts: they are the real businesses, on the
// real buildings, at the real heights, on the correct side of the road.
// ---------------------------------------------------------------------------

/** Category colours, matching the signs.js convention. */
const BIZ_STYLE = {
  pharmacy: { bg: '#177a3f', fg: '#ffffff' },
  bank: { bg: '#0f5f9e', fg: '#ffffff' },
  hospital: { bg: '#ffffff', fg: '#0f5f9e' },
  clinic: { bg: '#ffffff', fg: '#0f5f9e' },
  doctors: { bg: '#ffffff', fg: '#0f5f9e' },
  school: { bg: '#123f8a', fg: '#ffffff' },
  college: { bg: '#123f8a', fg: '#ffffff' },
  restaurant: { bg: '#b8352f', fg: '#ffffff' },
  fast_food: { bg: '#c8342c', fg: '#ffffff' },
  cafe: { bg: '#7b4a24', fg: '#ffe9c0' },
  money_transfer: { bg: '#c81f6e', fg: '#ffffff' },
  mobile_phone: { bg: '#e07a1a', fg: '#1a1108' },
  electronics: { bg: '#1a1a1a', fg: '#ffd23a' },
  appliance: { bg: '#1a4f8a', fg: '#ffffff' },
  fuel: { bg: '#e05a1a', fg: '#ffffff' },
  bus_station: { bg: '#1d6b3f', fg: '#ffffff' },
  supermarket: { bg: '#c0221f', fg: '#ffffff' },
  _default: { bg: '#1f6fb8', fg: '#ffffff' },
};

function hash32(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * One frontage facade. Style is picked deterministically from the OSM id so
 * a rebuild is stable, weighted the way the street actually looks: mostly
 * render, some brick, a few glass commercial blocks, the occasional
 * unfinished concrete frame.
 */
function paintFrontage(ctx, ectx, W, H, b) {
  const r = hash32(b.id);
  const rnd = (() => { let x = r || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; })();
  const styleRoll = r % 100;
  const style = styleRoll < 52 ? 'render' : styleRoll < 74 ? 'brick' : styleRoll < 92 ? 'glass' : 'frame';

  const floors = Math.max(2, Math.round(b.h / 3.2));
  const parapetH = Math.round(H * 0.045);
  const groundH = Math.round((H - parapetH) * 0.20);
  const upperH = H - parapetH - groundH;
  const upperY = parapetH;
  const gy = upperY + upperH;
  const rows = Math.max(1, floors - 1);
  const rh = upperH / rows;

  const renderWalls = ['#c9c2ae', '#d6cdb6', '#b9b8ae', '#cfc4a8', '#c2b7a2', '#aab7bd'];
  const wall = style === 'brick' ? '#8d6a55' : renderWalls[r % renderWalls.length];

  // 1. Roof Parapet at the top of canvas (y = 0 to parapetH)
  ctx.fillStyle = style === 'glass' ? '#4a5560' : wall;
  ctx.fillRect(0, 0, W, parapetH);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, parapetH * 0.65, W, 3);

  // 2. Upper floors (y = upperY to gy)
  if (style === 'glass') {
    const g = ctx.createLinearGradient(0, upperY, 0, gy);
    g.addColorStop(0, '#9db3c2'); g.addColorStop(0.55, '#6d8798'); g.addColorStop(1, '#42545f');
    ctx.fillStyle = g;
    ctx.fillRect(0, upperY, W, upperH);
    const bays = 5;
    for (let i = 0; i <= bays; i++) { ctx.fillStyle = 'rgba(232,234,234,0.55)'; ctx.fillRect((i * W) / bays, upperY, 3, upperH); }
    for (let rr = 0; rr <= rows; rr++) { ctx.fillStyle = 'rgba(232,234,234,0.45)'; ctx.fillRect(0, upperY + rr * rh, W, 3); }
  } else if (style === 'frame') {
    ctx.fillStyle = '#2a2723';
    ctx.fillRect(0, upperY, W, upperH);
    const bays = 4;
    for (let rr = 0; rr < rows; rr++) {
      const fy = upperY + rr * rh;
      if (rr >= rows - 2 && rnd() < 0.7) { ctx.fillStyle = '#8d6a55'; ctx.fillRect(0, fy + rh * 0.2, W, rh * 0.6); }
      ctx.fillStyle = '#b9b3a5'; ctx.fillRect(0, fy, W, rh * 0.16);
      for (let bb = 0; bb <= bays; bb++) { ctx.fillStyle = '#b9b3a5'; ctx.fillRect((bb * W) / bays - 5, fy, 11, rh); }
    }
  } else {
    ctx.fillStyle = wall;
    ctx.fillRect(0, upperY, W, upperH);
    if (style === 'brick') {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      for (let y = upperY; y < gy; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    const bays = Math.max(3, Math.round(W / 120));
    const bw = W / bays;
    for (let rr = 0; rr < rows; rr++) {
      const fy = upperY + rr * rh;
      ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(0, fy + rh * 0.9, W, rh * 0.05);
      for (let bb = 0; bb < bays; bb++) {
        const bx = bb * bw;
        const balcony = rnd() < 0.35;
        ctx.fillStyle = 'rgba(52,62,70,0.62)';
        ctx.fillRect(bx + bw * 0.17, fy + rh * 0.2, bw * (balcony ? 0.58 : 0.46), rh * 0.5);
        if (balcony) {
          ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 2;
          for (let g2 = 0; g2 < 6; g2++) {
            const gx = bx + bw * 0.15 + (g2 * bw * 0.62) / 6;
            ctx.beginPath(); ctx.moveTo(gx, fy + rh * 0.45); ctx.lineTo(gx, fy + rh * 0.78); ctx.stroke();
          }
        }
        if (rnd() < 0.5) { ctx.fillStyle = '#cfcfcc'; ctx.fillRect(bx + bw * 0.74, fy + rh * 0.5, bw * 0.2, rh * 0.16); }
      }
      // Damp staining under the slab.
      if (rnd() < 0.5) { ctx.fillStyle = 'rgba(70,64,54,0.16)'; ctx.fillRect(rnd() * W * 0.7, fy + rh * 0.9, W * 0.2, rh * 0.5); }
    }
  }

  // 3. Ground floor: real businesses (y = gy to H)
  ctx.fillStyle = '#1b1d20';
  ctx.fillRect(0, gy, W, groundH);
  const biz = (b.biz || []).filter((x) => (x.en && x.en.trim()) || (x.bn && x.bn.trim())).slice(0, 3);
  const cells = Math.max(biz.length, 1);
  const cw = W / cells;
  for (let i = 0; i < cells; i++) {
    const q = biz[i];
    const st = q ? (BIZ_STYLE[q.kind] || BIZ_STYLE._default) : BIZ_STYLE._default;
    const x0 = i * cw;

    // Fascia board with the real name
    ctx.fillStyle = st.bg;
    ctx.fillRect(x0 + 2, gy + groundH * 0.06, cw - 4, groundH * 0.36);
    ctx.fillStyle = st.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bn = q ? (q.bn || '') : '';
    const en = q ? (q.en || '') : '';
    if (bn && en) {
      ctx.font = `700 ${Math.max(11, Math.round(groundH * 0.14))}px "Noto Sans Bengali", "Nirmala UI", system-ui, sans-serif`;
      ctx.fillText(bn.slice(0, 28), x0 + cw / 2, gy + groundH * 0.16);
      ctx.font = `700 ${Math.max(10, Math.round(groundH * 0.11))}px system-ui, Arial, sans-serif`;
      ctx.fillText(en.slice(0, 32), x0 + cw / 2, gy + groundH * 0.30);
    } else if (bn || en) {
      const text = bn || en;
      const font = bn ? '"Noto Sans Bengali", "Nirmala UI", system-ui, sans-serif' : 'system-ui, Arial, sans-serif';
      ctx.font = `700 ${Math.max(12, Math.round(groundH * 0.18))}px ${font}`;
      ctx.fillText(text.slice(0, 30), x0 + cw / 2, gy + groundH * 0.23);
    }

    // Warm illuminated shop interior / glazing below the fascia
    ctx.fillStyle = '#22272c';
    ctx.fillRect(x0 + 3, gy + groundH * 0.44, cw - 6, groundH * 0.52);
    ctx.fillStyle = 'rgba(255,238,200,0.30)';
    ctx.fillRect(x0 + 6, gy + groundH * 0.48, cw - 12, groundH * 0.44);
    ctx.strokeStyle = 'rgba(200,205,210,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 4, gy + groundH * 0.46, cw - 8, groundH * 0.48);

    if (ectx) {
      ectx.fillStyle = '#ffe6b0';
      ectx.fillRect(x0 + 2, gy + groundH * 0.06, cw - 4, groundH * 0.36);
      ectx.fillStyle = '#ffdf9a';
      ectx.fillRect(x0 + 6, gy + groundH * 0.48, cw - 12, groundH * 0.44);
    }
  }

  // Plinth at bottom
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, H - 4, W, 4);
}

/**
 * Build frontage buildings on the Pallabi stretch from public/street-pallabi.json
 * that carry real named businesses. `skipIds` are the hand-painted landmarks.
 * Buildings without businesses are left to city.js as solid 3D extruded buildings.
 */
export function buildStreetFrontage(data, scene = null, skipIds = []) {
  const group = new THREE.Group();
  group.name = 'street-frontage';
  const skip = new Set(skipIds);
  const materials = [];

  for (const b of data) {
    if (skip.has(b.id)) continue;

    // Only skin frontage buildings that actually carry named businesses.
    // The rest are rendered as full 3D buildings by city.js, avoiding floating 2D cards.
    const validBiz = (b.biz || []).filter((x) => (x.en && x.en.trim()) || (x.bn && x.bn.trim()));
    if (validBiz.length === 0) continue;

    // Use the corridor-clipped footprint so the skin aligns with the 3D building's front wall.
    const clipped = scene ? getClippedFootprint(scene, b) : null;
    if (clipped && clipped.dropped) continue;
    const footprint = (clipped && clipped.ring) ? clipped.ring : b.p;

    const edge = roadFacingEdge(footprint, b.side);
    if (!edge || edge.len < 2) continue;

    const W = Math.max(256, Math.min(1024, Math.round(edge.len * 32)));
    const H = Math.max(256, Math.min(1024, Math.round(b.h * 28)));

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const e = document.createElement('canvas');
    e.width = W; e.height = H;
    const ectx = e.getContext('2d');
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, W, H);

    paintFrontage(ctx, ectx, W, H, { ...b, biz: validBiz });

    const mat = makeMaterial(c, e);
    materials.push(mat);
    const skin = buildSkin(edge, b.h, mat, 1.0, b.side);
    skin.name = `frontage:${b.id}`;
    group.add(skin);
  }

  return {
    group,
    materials,
    setNightIntensity(v) {
      for (const m of materials) if (m.setNightIntensity) m.setNightIntensity(v);
    },
  };
}
