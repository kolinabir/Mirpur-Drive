/**
 * signs.js
 *
 * Text rendered to canvas textures: station name boards in Bangla and English,
 * and the dense band of shop signage that covers every ground floor along the
 * main roads.
 */

import * as THREE from 'three';
import { getClippedFootprint } from './city.js';

/**
 * A DMTCL station name board: white rounded pill, Bangla name on top with a
 * thin green underline, English name below, and a simplified DMTCL roundel
 * logo (green circle, stylised white train nose) at the left.
 * Brand green is #0C7A4E / #006747 — no teal anywhere (SPEC ADDENDUM A2/A3).
 * @param {string} en English name
 * @param {string} bn Bangla name
 * @param {number} w  world width in metres
 * @param {number} h  world height in metres
 */
// ADDED 20:20 item E: cache by (en,bn,w,h) so repeated calls for the same
// board (e.g. the ~20 roundel signs per station, all identical content)
// share the SAME geometry+material instead of each getting a fresh canvas
// texture — this lets the caller merge many of them into one InstancedMesh
// draw call instead of one Mesh (and one texture upload) per sign.
const stationLabelCache = new Map();

export function makeStationLabel(en, bn, w, h) {
  const cacheKey = `${en}|${bn}|${w}|${h}`;
  const cached = stationLabelCache.get(cacheKey);
  if (cached) {
    const m = new THREE.Mesh(cached.geometry, cached.material);
    m.name = `sign:${en}`;
    return m;
  }
  const PX = 512;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(64, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const r = H / 2;

  // White rounded pill background.
  ctx.fillStyle = '#f2f2ee';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(W - r, 0);
  ctx.arc(W - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, H);
  ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = H * 0.03;
  ctx.strokeStyle = '#c9c7be';
  ctx.stroke();

  // DMTCL roundel logo: green circle with a simplified white train nose.
  const logoCx = H * 0.62;
  const logoCy = H * 0.5;
  const logoR = H * 0.4;
  ctx.fillStyle = '#0c7a4e';
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(logoCx + logoR * 0.05, logoCy, logoR * 0.62, logoR * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8302a';
  ctx.beginPath();
  ctx.ellipse(logoCx - logoR * 0.42, logoCy, logoR * 0.2, logoR * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#141414';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textCx = W / 2 + H * 0.55;
  const bnSize = H * 0.34;
  const enSize = H * 0.22;

  ctx.font = `600 ${bnSize}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText(bn, textCx, H * 0.32);

  // Thin green underline beneath the Bangla name.
  ctx.strokeStyle = '#0c7a4e';
  ctx.lineWidth = H * 0.035;
  const bnWidth = ctx.measureText(bn).width;
  ctx.beginPath();
  ctx.moveTo(textCx - bnWidth / 2, H * 0.46);
  ctx.lineTo(textCx + bnWidth / 2, H * 0.46);
  ctx.stroke();

  ctx.fillStyle = '#232323';
  ctx.font = `600 ${enSize}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(en, textCx, H * 0.72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  stationLabelCache.set(cacheKey, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `sign:${en}`;
  return mesh;
}

/**
 * An entrance fascia board (SPEC-INTERIOR ADVISOR ADDENDUM B1): dark green
 * background, white Bangla name left-of-centre with white English name below
 * it, a white rounded DMTCL-logo tile at the left end, and a white square at
 * the right end carrying the entrance letter (A/B/C/D) in green. Roughly
 * 3.2 x 0.75 m in the real world, hung from the entrance canopy frame — not
 * to be confused with makeStationLabel's white pill, which is the platform
 * roundel sign only.
 * @param {string} en English station name
 * @param {string} bn Bangla station name
 * @param {string} letter Entrance letter, e.g. "A"
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 */
export function makeEntranceLabel(en, bn, letter, w, h) {
  const PX = 640;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(64, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // WHITE board background (ADDED 20:20 item C, owner third photo batch
  // R2/R3: "Sign above the stair foot: WHITE board ... a green-outlined
  // square with the entrance letter" — corrects the earlier dark-green
  // board from SPEC-INTERIOR B1 / the 17:30 pass).
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9c7be';
  ctx.lineWidth = H * 0.03;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

  // White rounded DMTCL-logo tile at the left end.
  const tileR = H * 0.12;
  const tileCx = H * 0.55;
  const tileCy = H * 0.5;
  const tileW = H * 0.9;
  const tileH = H * 0.78;
  ctx.fillStyle = '#f2f2ee';
  ctx.beginPath();
  ctx.roundRect(tileCx - tileW / 2, tileCy - tileH / 2, tileW, tileH, tileR);
  ctx.fill();
  const logoCx = tileCx;
  const logoCy = tileCy;
  const logoR = tileH * 0.36;
  ctx.fillStyle = '#0c7a4e';
  ctx.beginPath();
  ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(logoCx + logoR * 0.05, logoCy, logoR * 0.62, logoR * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8302a';
  ctx.beginPath();
  ctx.ellipse(logoCx - logoR * 0.42, logoCy, logoR * 0.2, logoR * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // White square at the right end, GREEN OUTLINE, with the entrance letter
  // in green (item C: "green-outlined square with the entrance letter").
  const sq = H * 0.8;
  const sqCx = W - H * 0.55;
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(sqCx - sq / 2, H / 2 - sq / 2, sq, sq);
  ctx.strokeStyle = '#0c7a4e';
  ctx.lineWidth = H * 0.035;
  ctx.strokeRect(sqCx - sq / 2 + ctx.lineWidth / 2, H / 2 - sq / 2 + ctx.lineWidth / 2, sq - ctx.lineWidth, sq - ctx.lineWidth);
  ctx.fillStyle = '#0c7a4e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${sq * 0.7}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(letter, sqCx, H * 0.53);

  // Bangla name and English name, centred between the two end tiles, BLACK
  // text on the now-white board (was white text on dark green).
  const textCx = (tileCx + tileW / 2 + (sqCx - sq / 2)) / 2;
  ctx.fillStyle = '#141414';
  ctx.font = `600 ${H * 0.32}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText(bn, textCx, H * 0.34);
  ctx.fillStyle = '#232323';
  ctx.font = `600 ${H * 0.2}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(en, textCx, H * 0.68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  mesh.name = `entrance-sign:${en}:${letter}`;
  return mesh;
}

// ---------------------------------------------------------------------------
// Wayfinding signs (P11-D): route strip map, direction boards, platform
// numerals, exit signs, and the dot-matrix next-train display. Factories
// only — a later placement pass (src/interior.js) hangs these inside the
// stations. All bilingual Bangla/English, brand green #0C7A4E, matching the
// grammar of makeStationLabel/makeEntranceLabel above.
// ---------------------------------------------------------------------------

/**
 * MRT Line 6, south -> north, all 16 stops (docs/briefs/P11-D). Only
 * Mirpur 10, Mirpur 11, Pallabi and Uttara South are modelled as full
 * stations in this game, but the strip map shows the whole line, as the
 * real DMTCL concourse map does.
 */
export const LINE_STOPS = [
  { en: 'Motijheel', bn: 'মতিঝিল' },
  { en: 'Bangladesh Secretariat', bn: 'বাংলাদেশ সচিবালয়' },
  { en: 'Dhaka University', bn: 'ঢাকা বিশ্ববিদ্যালয়' },
  { en: 'Shahbagh', bn: 'শাহবাগ' },
  { en: 'Karwan Bazar', bn: 'কারওয়ান বাজার' },
  { en: 'Farmgate', bn: 'ফার্মগেট' },
  { en: 'Bijoy Sarani', bn: 'বিজয় সরণি' },
  { en: 'Agargaon', bn: 'আগারগাঁও' },
  { en: 'Shewrapara', bn: 'শেওড়াপাড়া' },
  { en: 'Kazipara', bn: 'কাজীপাড়া' },
  { en: 'Mirpur 10', bn: 'মিরপুর ১০' },
  { en: 'Mirpur 11', bn: 'মিরপুর ১১' },
  { en: 'Pallabi', bn: 'পল্লবী' },
  { en: 'Uttara South', bn: 'উত্তরা দক্ষিণ' },
  { en: 'Uttara Center', bn: 'উত্তরা সেন্টার' },
  { en: 'Uttara North', bn: 'উত্তরা উত্তর' },
];

/**
 * The horizontal strip route map DMTCL hangs in the concourse: all 16
 * stops as dots on a green line, names alternating above/below the line so
 * 16 labels fit without collision, and the current station marked with a
 * larger ring + "You are here" / "আপনি এখানে আছেন" caption. Rendered at a
 * high canvas resolution (2048 px wide) so it mipmaps down cleanly and
 * stays legible at ~4 m wide viewed from ~3 m away.
 *
 * Cached by (currentStationEn, w, h): one map per station, reused on both
 * platforms and the concourse per the brief.
 *
 * @param {string} currentStationEn English name of the station this map is
 *   hung in, must match one of LINE_STOPS' `en` values (e.g. "Mirpur 10").
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 * @returns {THREE.Mesh}
 */
const lineStripMapCache = new Map();

export function makeLineStripMap(currentStationEn, w, h) {
  const cacheKey = `${currentStationEn}|${w}|${h}`;
  const cached = lineStripMapCache.get(cacheKey);
  if (cached) {
    const m = new THREE.Mesh(cached.geometry, cached.material);
    m.name = `strip-map:${currentStationEn}`;
    return m;
  }

  const PX = 2048;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(128, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Dark board background so the green line and white dots pop, matching
  // the DMTCL concourse strip-map convention (dark field, bright line).
  ctx.fillStyle = '#12211a';
  ctx.fillRect(0, 0, W, H);

  const n = LINE_STOPS.length;
  const marginX = W * 0.035;
  const lineY = H * 0.5;
  const x0 = marginX;
  const x1 = W - marginX;
  const step = (x1 - x0) / (n - 1);

  // Title bar.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${H * 0.055}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('MRT LINE 6', W / 2, H * 0.095);
  ctx.font = `600 ${H * 0.045}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText('এমআরটি লাইন ৬', W / 2, H * 0.16);

  // The green line itself.
  ctx.strokeStyle = '#0c7a4e';
  ctx.lineWidth = H * 0.02;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, lineY);
  ctx.lineTo(x1, lineY);
  ctx.stroke();

  const currentIdx = LINE_STOPS.findIndex((s) => s.en === currentStationEn);

  for (let i = 0; i < n; i++) {
    const stop = LINE_STOPS[i];
    const cx = x0 + step * i;
    const isCurrent = i === currentIdx;
    const above = i % 2 === 0;

    // Dot (larger ring for the current station).
    ctx.beginPath();
    if (isCurrent) {
      ctx.fillStyle = '#ffffff';
      ctx.arc(cx, lineY, H * 0.028, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0c7a4e';
      ctx.lineWidth = H * 0.012;
      ctx.beginPath();
      ctx.arc(cx, lineY, H * 0.044, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.arc(cx, lineY, H * 0.016, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name, alternating above/below the line, at a slight angle so the
    // 16 names fit in the available per-stop width without overlapping.
    ctx.save();
    const textY = above ? lineY - H * 0.09 : lineY + H * 0.09;
    ctx.translate(cx, textY);
    ctx.rotate(above ? -0.34 : 0.34);
    ctx.textAlign = above ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isCurrent ? '#ffe9a8' : '#ffffff';
    ctx.font = `${isCurrent ? 700 : 600} ${H * 0.03}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(stop.en, 0, above ? -H * 0.012 : H * 0.012);
    ctx.font = `600 ${H * 0.026}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
    ctx.fillText(stop.bn, 0, above ? -H * 0.05 : H * 0.05);
    ctx.restore();
  }

  // "You are here" caption under the current station's dot/ring.
  if (currentIdx >= 0) {
    const cx = x0 + step * currentIdx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0c7a4e';
    ctx.font = `700 ${H * 0.028}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText('YOU ARE HERE', cx, H * 0.86);
    ctx.font = `600 ${H * 0.026}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
    ctx.fillText('আপনি এখানে আছেন', cx, H * 0.905);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  lineStripMapCache.set(cacheKey, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `strip-map:${currentStationEn}`;
  return mesh;
}

/**
 * The over-stair / over-gate direction board: green field, a large arrow,
 * "Trains toward <X>" in English and Bangla, and the next two-to-three
 * stops in smaller type underneath.
 *
 * Cached by (towardEn, towardBn, viaListEn.join, arrow, w, h) so repeated
 * placements (both ends of a platform, multiple gates) share one texture.
 *
 * @param {string} towardEn English destination, e.g. "Uttara North" or "Motijheel"
 * @param {string} towardBn Bangla destination, e.g. "উত্তরা উত্তর"
 * @param {string[]} viaListEn next 2-3 stop names in English, in travel order
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 * @param {object} [opts]
 * @param {'left'|'right'|'up'} [opts.arrow='right'] arrow direction, set by the placement pass
 * @returns {THREE.Mesh}
 */
const directionBoardCache = new Map();

export function makeDirectionBoard(towardEn, towardBn, viaListEn, w, h, opts = {}) {
  const arrow = opts.arrow || 'right';
  const via = (viaListEn || []).slice(0, 3);
  const cacheKey = `${towardEn}|${towardBn}|${via.join(',')}|${arrow}|${w}|${h}`;
  const cached = directionBoardCache.get(cacheKey);
  if (cached) {
    const m = new THREE.Mesh(cached.geometry, cached.material);
    m.name = `direction-board:${towardEn}`;
    return m;
  }

  const PX = 1024;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(96, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Green field.
  ctx.fillStyle = '#0c7a4e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#006747';
  ctx.lineWidth = H * 0.02;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

  // Arrow, drawn in a reserved band on the left (left/right) or centred
  // above the text (up).
  ctx.fillStyle = '#ffffff';
  const arrowSize = H * 0.34;
  ctx.save();
  if (arrow === 'up') {
    ctx.translate(W * 0.14, H * 0.4);
    ctx.rotate(-Math.PI / 2);
  } else if (arrow === 'left') {
    ctx.translate(W * 0.14, H * 0.5);
    ctx.rotate(Math.PI);
  } else {
    ctx.translate(W * 0.14, H * 0.5);
  }
  ctx.beginPath();
  ctx.moveTo(-arrowSize * 0.5, -arrowSize * 0.5);
  ctx.lineTo(arrowSize * 0.5, 0);
  ctx.lineTo(-arrowSize * 0.5, arrowSize * 0.5);
  ctx.lineTo(-arrowSize * 0.18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const textCx = W * 0.6;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${H * 0.16}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(`Trains toward ${towardEn}`, textCx, H * 0.28);

  ctx.font = `600 ${H * 0.15}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText(`${towardBn} অভিমুখী ট্রেন`, textCx, H * 0.5);

  if (via.length) {
    ctx.font = `500 ${H * 0.09}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(`via ${via.join(' – ')}`, textCx, H * 0.72);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  directionBoardCache.set(cacheKey, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `direction-board:${towardEn}`;
  return mesh;
}

/**
 * The platform-head sign: big numeral, direction underneath. Cached by
 * (number, towardEn, towardBn, w, h).
 *
 * @param {number|string} number platform number, e.g. 1 or "1"
 * @param {string} towardEn English destination
 * @param {string} towardBn Bangla destination
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 * @returns {THREE.Mesh}
 */
const platformNumberSignCache = new Map();

export function makePlatformNumberSign(number, towardEn, towardBn, w, h) {
  const cacheKey = `${number}|${towardEn}|${towardBn}|${w}|${h}`;
  const cached = platformNumberSignCache.get(cacheKey);
  if (cached) {
    const m = new THREE.Mesh(cached.geometry, cached.material);
    m.name = `platform-sign:${number}`;
    return m;
  }

  const PX = 640;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(96, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#0c7a4e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = H * 0.025;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${H * 0.5}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(String(number), W / 2, H * 0.36);

  ctx.font = `700 ${H * 0.11}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(towardEn, W / 2, H * 0.76);
  ctx.font = `600 ${H * 0.1}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText(towardBn, W / 2, H * 0.9);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  platformNumberSignCache.set(cacheKey, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `platform-sign:${number}`;
  return mesh;
}

/**
 * "EXIT / প্রস্থান" sign with the entrance letters this exit serves, in the
 * same white-board language as makeEntranceLabel so exits and entrances
 * read as one family. Cached by (letters, w, h).
 *
 * @param {string} letters space-separated entrance letters, e.g. "A B"
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 * @returns {THREE.Mesh}
 */
const exitSignCache = new Map();

export function makeExitSign(letters, w, h) {
  const cacheKey = `${letters}|${w}|${h}`;
  const cached = exitSignCache.get(cacheKey);
  if (cached) {
    const m = new THREE.Mesh(cached.geometry, cached.material);
    m.name = `exit-sign:${letters}`;
    return m;
  }

  const PX = 640;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(64, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // WHITE board, same palette as makeEntranceLabel's corrected white board.
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9c7be';
  ctx.lineWidth = H * 0.03;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

  // Green running-man style pictogram, simplified: an arrow through a door
  // frame, at the left end.
  const iconCx = H * 0.55;
  const iconCy = H * 0.5;
  ctx.strokeStyle = '#0c7a4e';
  ctx.lineWidth = H * 0.06;
  ctx.strokeRect(iconCx - H * 0.28, iconCy - H * 0.32, H * 0.56, H * 0.64);
  ctx.fillStyle = '#0c7a4e';
  ctx.beginPath();
  ctx.moveTo(iconCx - H * 0.05, iconCy - H * 0.18);
  ctx.lineTo(iconCx + H * 0.32, iconCy);
  ctx.lineTo(iconCx - H * 0.05, iconCy + H * 0.18);
  ctx.lineTo(iconCx - H * 0.05, iconCy + H * 0.06);
  ctx.lineTo(iconCx - H * 0.28, iconCy + H * 0.06);
  ctx.lineTo(iconCx - H * 0.28, iconCy - H * 0.06);
  ctx.lineTo(iconCx - H * 0.05, iconCy - H * 0.06);
  ctx.closePath();
  ctx.fill();

  const textCx = W * 0.62;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0c7a4e';
  ctx.font = `800 ${H * 0.34}px system-ui, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText('EXIT', textCx, H * 0.32);
  ctx.fillStyle = '#141414';
  ctx.font = `600 ${H * 0.26}px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
  ctx.fillText('প্রস্থান', textCx, H * 0.6);

  if (letters) {
    ctx.font = `700 ${H * 0.18}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = '#232323';
    ctx.fillText(letters, textCx, H * 0.85);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  exitSignCache.set(cacheKey, { geometry, material });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `exit-sign:${letters}`;
  return mesh;
}

/**
 * The dot-matrix PID (passenger information display) board: dark panel,
 * amber monospace rows like "Uttara North   3 min". Not cached (each PID
 * is placed once and driven independently), but the canvas/texture is
 * allocated ONCE per mesh — repaints go through `mesh.userData.update(lines)`,
 * which redraws the same canvas and calls `texture.needsUpdate = true`
 * rather than allocating a new canvas.
 *
 * @param {string[]} lines row strings to display, e.g. ["Uttara North   3 min", "Pallabi   7 min"]
 * @param {number} w world width in metres
 * @param {number} h world height in metres
 * @returns {THREE.Mesh} mesh.userData.update(lines) repaints the same texture cheaply
 */
export function makeNextTrainDisplay(lines, w, h) {
  const PX = 1024;
  const aspect = h / w;
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = Math.max(96, Math.round(PX * aspect));
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  function paint(rows) {
    ctx.fillStyle = '#0a0a08';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2a2a24';
    ctx.lineWidth = H * 0.015;
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

    const rowList = (rows && rows.length ? rows : ['NO SERVICE']).slice(0, 5);
    const rowH = (H * 0.86) / rowList.length;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${rowH * 0.62}px "Courier New", "Consolas", monospace`;
    for (let i = 0; i < rowList.length; i++) {
      const y = H * 0.09 + rowH * (i + 0.5);
      // Faint amber glow, then the crisp text on top, like a dot-matrix panel.
      ctx.fillStyle = 'rgba(255,176,32,0.35)';
      ctx.fillText(rowList[i], W * 0.04, y);
      ctx.fillStyle = '#ffb020';
      ctx.fillText(rowList[i], W * 0.04, y);
    }
    tex.needsUpdate = true;
  }

  paint(lines);

  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'next-train-display';
  mesh.userData.update = paint;
  return mesh;
}

// ---------------------------------------------------------------------------
// Shop signage
// ---------------------------------------------------------------------------

/**
 * Bangla-looking shop names. These are real, common shop-name words so the
 * street reads correctly to anyone who knows the language, rather than being
 * decorative nonsense.
 */
/**
 * Shop categories, weighted to the REAL mix measured from OSM within 500 m
 * of Pallabi metro station (docs/MIRPUR12-RESEARCH.md): 55 pharmacy, 40
 * school/madrasa/coaching combined into "education", 40 bKash/telecom
 * money-transfer, 25 clinic/dental/hospital, 12 restaurant, 9 ATM, 5 bank,
 * plus the general retail mix the corridor already had. `weight` is a
 * relative pick frequency, not a percentage. `bg`/`fg` are per-CATEGORY so
 * a pharmacy is reliably green, not a random colour from a shared palette
 * (advisor, 2026-09-07, per the owner's "real looksike ... texts").
 */
const SHOP_CATEGORIES = [
  { weight: 14, bg: '#177a3f', fg: '#ffffff', accent: 'cross', names: [
    ['ফার্মেসী', 'PHARMACY'], ['ঔষধালয়', 'MEDICINE CORNER'], ['ড্রাগ হাউজ', 'DRUG HOUSE'],
  ] },
  { weight: 10, bg: '#c81f6e', fg: '#ffffff', accent: 'mfs', names: [
    ['বিকাশ', 'BKASH'], ['নগদ', 'NAGAD'], ['মোবাইল ব্যাংকিং', 'MOBILE BANKING'],
  ] },
  { weight: 6, bg: '#e07a1a', fg: '#1a1108', accent: 'mfs', names: [
    ['টেলিকম', 'TELECOM'], ['ফ্লেক্সিলোড', 'FLEXILOAD'], ['মোবাইল সার্ভিস', 'MOBILE SERVICE'],
  ] },
  { weight: 10, bg: '#0f5f9e', fg: '#ffffff', accent: 'book', names: [
    ['একাডেমি', 'ACADEMY'], ['কোচিং সেন্টার', 'COACHING CENTRE'], ['মাদ্রাসা', 'MADRASA'],
  ] },
  { weight: 6, bg: '#ffffff', fg: '#0f5f9e', accent: 'cross', names: [
    ['ডেন্টাল কেয়ার', 'DENTAL CARE'], ['ক্লিনিক', 'CLINIC'], ['মেডিসিন হল', 'MEDICINE HALL'],
  ] },
  { weight: 4, bg: '#b8352f', fg: '#ffffff', accent: null, names: [
    ['হোটেল', 'HOTEL'], ['রেস্টুরেন্ট', 'RESTAURANT'], ['ফাস্ট ফুড', 'FAST FOOD'],
  ] },
  { weight: 3, bg: '#7b3fa0', fg: '#ffffff', accent: null, names: [
    ['ব্যাংক', 'BANK'], ['এটিএম বুথ', 'ATM'],
  ] },
  { weight: 3, bg: '#1d8a4e', fg: '#ffffff', accent: null, names: [
    ['টেইলার্স', 'TAILORS'], ['লন্ড্রি', 'LAUNDRY'], ['ফ্যাশন', 'FASHION'],
  ] },
  { weight: 4, bg: '#1f6fb8', fg: '#ffffff', accent: null, names: [
    ['ষ্টোর', 'STORE'], ['ইলেকট্রনিক্স', 'ELECTRONICS'], ['জেনারেল স্টোর', 'GENERAL STORE'],
    ['কম্পিউটার', 'COMPUTER'], ['ফল ভান্ডার', 'FRUIT SHOP'], ['মিষ্টি', 'SWEETS'], ['বেকারি', 'BAKERY'],
    ['চা ঘর', 'TEA STALL'], ['সেলুন', 'SALOON'], ['বস্ত্রালয়', 'CLOTH STORE'], ['ডিপার্টমেন্টাল', 'DEPARTMENTAL'],
  ] },
];
const SHOP_CATEGORY_TOTAL = SHOP_CATEGORIES.reduce((t, c) => t + c.weight, 0);

function pickShopCategory() {
  let r = rnd() * SHOP_CATEGORY_TOTAL;
  for (const c of SHOP_CATEGORIES) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return SHOP_CATEGORIES[SHOP_CATEGORIES.length - 1];
}

// ---------------------------------------------------------------------------
// Real POI names -> shop signage
//
// tools/build-scene.mjs exports every POI with its surveyed OSM name (2,773
// of the north scene's shop/amenity POIs carry one), but nothing used to
// read `poi.name` at render time -- the street was signed entirely with the
// generic SHOP_CATEGORIES word list above, even in front of a real, named
// business. This section matches named POIs to the nearest signboard bay
// `buildShopSigns()` already creates and renders the REAL name there,
// keeping the same per-category colour/icon so a named pharmacy is still
// green with the cross glyph -- only the text changes.
// ---------------------------------------------------------------------------

/** Bangla Unicode block (U+0980-U+09FF). Used to tell which of a POI's two
 * name fields (`name`, `nameEn`) is the Bangla line and which is English,
 * since OSM here tags either one or both and build-scene.mjs no longer
 * guesses for us (see its comment at the `pois.push` site). */
const BANGLA_RE = /[ঀ-৿]/;

/** amenity/shop kinds worth putting a real name on a shopfront sign for.
 * Deliberately excludes place_of_worship, hospital, university, marketplace,
 * library, post_office, fuel, police, fire_station, bus_station: those read
 * as campus/institutional signage in this game (landmarks.js / interior.js
 * territory), not the shopfront fascia this file renders. */
const SIGNAGE_KINDS = new Set([
  'pharmacy', 'money_transfer', 'restaurant', 'cafe', 'fast_food', 'bank',
  'atm', 'dentist', 'clinic', 'school', 'shop',
]);

/** shop= sub-tags that read as mobile/telecom rather than generic retail. */
const TELECOM_SHOP_SUBS = new Set(['mobile_phone', 'telecom']);
/** shop= sub-tags that read as clothing/fashion/tailoring. */
const FASHION_SHOP_SUBS = new Set(['clothes', 'shoes', 'tailor', 'fashion', 'boutique']);

/** Map a POI's OSM tag onto one of the SHOP_CATEGORIES entries above, so
 * colour/accent stay research-correct (pharmacy green, bKash pink, ...)
 * even though the text on top is now the real surveyed name. Indices refer
 * to the SHOP_CATEGORIES array literal declared above. */
function categoryForPoi(poi) {
  if (poi.k === 'pharmacy') return SHOP_CATEGORIES[0];
  if (poi.k === 'money_transfer') return SHOP_CATEGORIES[1];
  if (poi.k === 'shop' && TELECOM_SHOP_SUBS.has(poi.sub)) return SHOP_CATEGORIES[2];
  if (poi.k === 'school') return SHOP_CATEGORIES[3];
  if (poi.k === 'dentist' || poi.k === 'clinic') return SHOP_CATEGORIES[4];
  if (poi.k === 'restaurant' || poi.k === 'cafe' || poi.k === 'fast_food') return SHOP_CATEGORIES[5];
  if (poi.k === 'bank' || poi.k === 'atm') return SHOP_CATEGORIES[6];
  if (poi.k === 'shop' && FASHION_SHOP_SUBS.has(poi.sub)) return SHOP_CATEGORIES[7];
  return SHOP_CATEGORIES[8];
}

/**
 * Requirement 4 (Bangla + English, no `||` collapse): pick the Bangla and
 * English lines for a named sign. `poi.name`/`poi.nameEn` are whatever OSM
 * actually had -- either can be in either script, or one can be missing --
 * so this sniffs the Bangla Unicode range rather than trusting the field
 * name. When only one script is present, fall back to the category's
 * generic word for the missing line (e.g. a pharmacy tagged only
 * name:en="Lazz Pharma" still gets a Bangla "ফার্মেসী" line).
 */
function poiLines(poi, cat) {
  let bn = null;
  let en = null;
  for (const raw of [poi.name, poi.nameEn]) {
    if (!raw) continue;
    if (BANGLA_RE.test(raw)) bn = bn || raw;
    else en = en || raw;
  }
  const [genBn, genEn] = cat.names[0];
  return { bn: bn || genBn, en: en || genEn };
}

/**
 * Streaming named-sign atlas (memory fix for the real-shop-names pass).
 *
 * The old design gave every named POI its own permanent cell in one big
 * atlas sized to fit them all -- 6144x2880 at NAMED_LIMIT=480, ~71 MB raw /
 * ~94 MB with mipmaps. That is six times the texture memory src/facades.js
 * spends texturing every building facade in the entire city (one 2048x2048
 * atlas, ~16 MB), and it silently relied on GPUs that support textures far
 * past the WebGL2-guaranteed 2048px/side minimum -- a real risk on the
 * mobile/integrated GPUs this is deployed to on Netlify. NAMED_LIMIT (480
 * of 2,773 eligible named POIs) existed purely to keep that atlas from
 * growing further.
 *
 * Fix: a FIXED-size atlas (see detectMaxTextureSize()'s clamp), whose
 * cells are recycled by proximity to the player, the same way src/city.js
 * streams building geometry -- see updateBuildingLOD's BUILD_RADIUS/
 * DISPOSE_RADIUS hysteresis, mirrored here as SIGN_RESIDENT_RADIUS/
 * SIGN_EVICT_RADIUS. Every matched named POI gets a permanent quad in one
 * static geometry (cheap -- position/normal never change, a few thousand
 * triangles at most), but only the ones currently near the player get a
 * live cell in the atlas; every other quad's UV points at a shared
 * per-category "generic" cell baked once at startup -- the exact fallback
 * an unnamed POI already gets, just reached by moving a UV instead of
 * swapping meshes. That removes NAMED_LIMIT entirely: every eligible named
 * POI that lands a frontage bay is reachable as the player walks there.
 */
const NAMED_CELL_W = 256; // quarters the per-cell cost of the retired 384x96
const NAMED_CELL_H = 64;  // design; checked for legibility at street-view
                          // distance in the verification pass (see the
                          // Mirpur 10 screenshot) -- 384x96 is only worth
                          // paying for if this reads as illegible, and it didn't.
const NAMED_ATLAS_TARGET = 2048; // hard ceiling: matches facades.js's atlas

const SIGN_RESIDENT_RADIUS = 120; // m: a matched POI within this claims a cell
const SIGN_EVICT_RADIUS = 170;    // m: ...and keeps it until it's this far away
                                   // (50 m hysteresis gap, mirroring city.js's
                                   // BUILD_RADIUS/DISPOSE_RADIUS gap, so a shop
                                   // sitting near the boundary doesn't thrash).
const SIGN_MATCH_CELL = 50; // spatial-grid bucket size for the slot index below

/**
 * Read the real GPU texture-size ceiling without needing the app's own
 * renderer -- this module is evaluated (and the atlas sized) before
 * main.js constructs one. A throwaway context reports the same value
 * `renderer.capabilities.maxTextureSize` would, since MAX_TEXTURE_SIZE is a
 * hardware/driver ceiling, not a per-context setting.
 */
let cachedMaxTextureSize = null;
function detectMaxTextureSize() {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  let size = 2048; // WebGL2's guaranteed minimum -- the safe floor if detection fails
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      size = gl.getParameter(gl.MAX_TEXTURE_SIZE) || size;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) {
    // Detection failed (headless/unusual environment) -- keep the 2048 floor.
  }
  cachedMaxTextureSize = size;
  return size;
}

let loggedTextureClamp = false;

/** Convert a pixel rect to the [0,1] UV rect three.js expects (V flipped:
 * canvas y grows downward, UV v grows upward). */
function cellRectUV(x, y, w, h, atlasW, atlasH) {
  return {
    u0: x / atlasW,
    u1: (x + w) / atlasW,
    v0: 1 - (y + h) / atlasH,
    v1: 1 - y / atlasH,
  };
}

/**
 * Draw one sign's content into a cell-sized rectangle at (x,y) of `ctx` --
 * the atlas canvas itself for the one-time fallback bake, or a small
 * transient canvas for a streamed cell update. Same two-line Bangla-first
 * layout as before, just parameterised on cell size instead of hardcoded
 * to 384x96.
 */
function drawSignCell(ctx, x, y, w, h, cat, bn, en) {
  ctx.fillStyle = cat.bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cat.fg;

  // Real names run long ("Grameen Phone Customer Care") -- shrink the
  // font until it fits the cell width instead of letting it overflow or
  // get clipped, since these are surveyed strings we don't get to shorten.
  const fitFont = (text, weight, family, startPx, minPx, maxW) => {
    let px = startPx;
    ctx.font = `${weight} ${px}px ${family}`;
    while (px > minPx && ctx.measureText(text).width > maxW) {
      px -= 1;
      ctx.font = `${weight} ${px}px ${family}`;
    }
    return px;
  };

  const maxW = w * 0.84;
  fitFont(bn, 700, '"Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif', Math.round(h * 0.38), 9, maxW);
  ctx.fillText(bn, x + w / 2 + 5, y + h * 0.36);

  fitFont(en, 600, 'system-ui, Arial, sans-serif', Math.round(h * 0.19), 7, maxW);
  ctx.globalAlpha = 0.9;
  ctx.fillText(en, x + w / 2 + 5, y + h * 0.76);
  ctx.globalAlpha = 1;

  if (cat.accent) drawCategoryAccent(ctx, x + w * 0.09, y + h * 0.5, cat.accent, cat.fg);
}

/**
 * Build the fixed-size streaming atlas: the canvas/texture, the reserved
 * per-category fallback cells (drawn once, never evicted), and the pool of
 * recyclable cells the streamer hands out by proximity to the player.
 */
function createNamedAtlas() {
  const maxSize = detectMaxTextureSize();
  let atlasW = NAMED_ATLAS_TARGET;
  let atlasH = NAMED_ATLAS_TARGET;
  let cellW = NAMED_CELL_W;
  let cellH = NAMED_CELL_H;
  if (maxSize < NAMED_ATLAS_TARGET) {
    // Device reports a cap below our target: halve the cell grid (bigger,
    // fewer cells) rather than ever allocate a texture the GPU can't hold.
    atlasW = maxSize;
    atlasH = maxSize;
    cellW = NAMED_CELL_W * 2;
    cellH = NAMED_CELL_H * 2;
    if (!loggedTextureClamp) {
      loggedTextureClamp = true;
      console.warn(
        `[signs] device maxTextureSize ${maxSize} < ${NAMED_ATLAS_TARGET}; ` +
        `clamping the named-sign atlas to ${atlasW}x${atlasH} with ${cellW}x${cellH} cells.`
      );
    }
  }

  const cols = Math.max(1, Math.floor(atlasW / cellW));
  const rows = Math.max(1, Math.floor(atlasH / cellH));

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3226';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // No mipmaps: keeps the atlas at a hard, exact 16 MB (2048x2048x4 bytes,
  // or less if clamped) instead of the ~1.33x a full mip chain adds, and
  // means every streamed cell update is a plain texSubImage2D with nothing
  // to regenerate -- signs are read up close, where mip 0 is what shows anyway.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  // Reserve one cell per SHOP_CATEGORIES entry as the permanent "generic"
  // fallback -- drawn once here with the category's generic word (never a
  // real name) and never evicted. Every named slot starts pointing at its
  // category's fallback rect, and returns to it on eviction.
  const fallbackRects = SHOP_CATEGORIES.map((cat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    drawSignCell(ctx, x, y, cellW, cellH, cat, cat.names[0][0], cat.names[0][1]);
    return cellRectUV(x, y, cellW, cellH, canvas.width, canvas.height);
  });
  tex.needsUpdate = true; // one full upload, at startup -- same one-time cost as before

  // Remaining cells form the recyclable pool the streamer hands out below.
  const poolCells = [];
  for (let i = fallbackRects.length; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    poolCells.push({ x, y, uv: cellRectUV(x, y, cellW, cellH, canvas.width, canvas.height), occupant: -1 });
  }

  return { tex, cols, rows, cellW, cellH, fallbackRects, poolCells };
}

/**
 * Owns cell residency for one built shop-signs group: which matched named
 * POI ("slot") currently occupies which atlas cell, and reassigning that
 * as the player moves. `slots` is built once by buildShopSigns() from the
 * frontage-matching loop (one entry per POI that landed a bay); `uvAttr` is
 * the named-signboards mesh's live UV BufferAttribute, mutated in place.
 *
 * tick() is driven from the named-signboards mesh's onBeforeRender (three.js
 * calls this once per rendered frame with the real renderer+camera, so no
 * change to main.js's frame loop is needed) and does at most ONE claim and
 * ONE eviction per call -- the same "one unit of work per frame" cadence
 * updateBuildingLOD uses for tile geometry.
 */
function createNamedSignStreamer(atlas, slots, uvAttr) {
  const { poolCells, fallbackRects } = atlas;
  const grid = new Map();
  const gridKey = (x, z) => Math.floor(x / SIGN_MATCH_CELL) * 100000 + Math.floor(z / SIGN_MATCH_CELL);
  slots.forEach((s, i) => {
    const k = gridKey(s.x, s.z);
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  });

  const setSlotUV = (slotIdx, rect) => {
    const base = slots[slotIdx].uvBase;
    const a = uvAttr.array;
    // Vertex 0 (x0) is on the VIEWER'S RIGHT: the quad runs a->b along the
    // ring, and seen from outside (down -n, with n = (uz, -ux)) the viewer's
    // right is -u. So u1 goes on x0 and u0 on x1, or the text reads mirrored.
    a[base + 0] = rect.u1; a[base + 1] = rect.v0;
    a[base + 2] = rect.u0; a[base + 3] = rect.v0;
    a[base + 4] = rect.u0; a[base + 5] = rect.v1;
    a[base + 6] = rect.u1; a[base + 7] = rect.v1;
  };

  const claim = (slotIdx, cell, renderer) => {
    const slot = slots[slotIdx];
    const small = document.createElement('canvas');
    small.width = atlas.cellW;
    small.height = atlas.cellH;
    drawSignCell(small.getContext('2d'), 0, 0, atlas.cellW, atlas.cellH, slot.cat, slot.bn, slot.en);
    // A fresh plain Texture (never rendered) forces copyTextureToTexture's
    // CPU-upload path (a direct texSubImage2D from the canvas), instead of
    // treating it as an existing GPU texture to blit from.
    const srcTex = new THREE.Texture(small);
    // copyTextureToTexture's destination offset is in GL texel space (origin
    // bottom-left) and is NOT adjusted for flipY, while cell.x/cell.y and
    // cellRectUV() are in canvas space (origin top-left). Without this flip
    // every name was written into the vertically mirrored row, leaving its
    // own sign showing the blank atlas background.
    const atlasH = atlas.rows * atlas.cellH;
    const dstY = atlas.tex.flipY ? atlasH - cell.y - atlas.cellH : cell.y;
    renderer.copyTextureToTexture(srcTex, atlas.tex, null, new THREE.Vector2(cell.x, dstY));
    cell.occupant = slotIdx;
    slot.cell = cell;
    setSlotUV(slotIdx, cell.uv);
    uvAttr.needsUpdate = true;
  };

  const evict = (cell) => {
    const slot = slots[cell.occupant];
    setSlotUV(cell.occupant, fallbackRects[slot.catIdx]);
    uvAttr.needsUpdate = true;
    cell.occupant = -1;
    slot.cell = null;
  };

  const findFreeCell = () => poolCells.find((c) => c.occupant === -1);

  const findNearestUnresidentSlot = (px, pz) => {
    const cx = Math.floor(px / SIGN_MATCH_CELL);
    const cz = Math.floor(pz / SIGN_MATCH_CELL);
    const span = Math.ceil(SIGN_RESIDENT_RADIUS / SIGN_MATCH_CELL);
    let best = SIGN_RESIDENT_RADIUS;
    let bestIdx = -1;
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const arr = grid.get((cx + i) * 100000 + (cz + j));
        if (!arr) continue;
        for (const idx of arr) {
          if (slots[idx].cell) continue;
          const d = Math.hypot(px - slots[idx].x, pz - slots[idx].z);
          if (d < best) { best = d; bestIdx = idx; }
        }
      }
    }
    return bestIdx;
  };

  let initedTexture = false;

  function tick(px, pz, renderer) {
    if (!initedTexture) {
      initedTexture = true;
      renderer.initTexture(atlas.tex); // allocate GPU storage before any partial copy
      // Prewarm: fill as much of the pool as is within range right away,
      // matching main.js's "PRE-WARM THE SPAWN TILES" call into
      // updateBuildingLOD -- otherwise the very first frame is bare.
      for (let n = 0; n < poolCells.length; n++) {
        const idx = findNearestUnresidentSlot(px, pz);
        if (idx < 0) break;
        const cell = findFreeCell();
        if (!cell) break;
        claim(idx, cell, renderer);
      }
      return;
    }

    // Evict the first occupant that has wandered past SIGN_EVICT_RADIUS.
    for (const cell of poolCells) {
      if (cell.occupant === -1) continue;
      const s = slots[cell.occupant];
      if (Math.hypot(px - s.x, pz - s.z) > SIGN_EVICT_RADIUS) {
        evict(cell);
        break;
      }
    }

    // Claim the nearest still-unresident matched POI, if one is close
    // enough and a cell is free (or can be freed from something farther away).
    const idx = findNearestUnresidentSlot(px, pz);
    if (idx < 0) return;
    let cell = findFreeCell();
    if (!cell) {
      // Pool is full: steal the cell farthest from the player, but only if
      // it's genuinely farther than the new candidate -- otherwise leave it
      // alone rather than thrash two similarly-distant shops back and forth.
      const newD = Math.hypot(px - slots[idx].x, pz - slots[idx].z);
      let farthest = null;
      let farthestD = -Infinity;
      for (const c of poolCells) {
        const s = slots[c.occupant];
        const d = Math.hypot(px - s.x, pz - s.z);
        if (d > farthestD) { farthestD = d; farthest = c; }
      }
      if (farthest && farthestD > newD) {
        evict(farthest);
        cell = farthest;
      }
    }
    if (cell) claim(idx, cell, renderer);
  }

  return { tick };
}

/**
 * Arterial fascias (owner Street View item 7): big brand-style boards with
 * an English name in large letters and a smaller Bangla line underneath —
 * the reverse emphasis of the side-street boards, matching what a large
 * commercial fascia on Begum Rokeya Ave actually looks like. Names are
 * generic categories, not real trademarks, per docs/briefs/P8-MIRPUR12.md
 * ("suggest the palette and layout; do NOT clone real trade dress").
 */
const ARTERIAL_FASCIAS = [
  { bg: '#c8342c', fg: '#ffffff', en: 'FRIED CHICKEN', bn: 'ফ্রাইড চিকেন' },
  { bg: '#0a5aa8', fg: '#ffffff', en: 'PIZZA HOUSE', bn: 'পিৎজা হাউজ' },
  { bg: '#1a1a1a', fg: '#ffffff', en: 'ELECTRONICS PLAZA', bn: 'ইলেকট্রনিক্স প্লাজা' },
  { bg: '#0f7a4a', fg: '#ffffff', en: 'CONVENTION HALL', bn: 'কনভেনশন হল' },
  { bg: '#e0a021', fg: '#1a1108', en: 'CAFE & BAKERY', bn: 'ক্যাফে অ্যান্ড বেকারি' },
  { bg: '#7b1f3f', fg: '#ffffff', en: 'FASHION HOUSE', bn: 'ফ্যাশন হাউজ' },
];

let seed = 7788;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function drawCategoryAccent(ctx, cx, cy, accent, fg) {
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = 4;
  if (accent === 'cross') {
    // Pharmacy/clinic cross.
    ctx.fillRect(cx - 3, cy - 12, 6, 24);
    ctx.fillRect(cx - 12, cy - 3, 24, 6);
  } else if (accent === 'mfs') {
    // Mobile-money: a small rounded phone glyph.
    ctx.strokeRect(cx - 8, cy - 13, 16, 26);
    ctx.fillRect(cx - 4, cy + 8, 8, 2);
  } else if (accent === 'book') {
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 8);
    ctx.lineTo(cx, cy - 3);
    ctx.lineTo(cx + 12, cy - 8);
    ctx.lineTo(cx + 12, cy + 10);
    ctx.lineTo(cx, cy + 5);
    ctx.lineTo(cx - 12, cy + 10);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Two signage grammars, per the owner's Street View
 * (reference/mirpur12/OWNER-STREETVIEW-2026-09-07.md item 7): side-street
 * boards are Bangla-first with a smaller English line and a category colour
 * + icon (pharmacy green+cross, mobile-money pink/orange, etc, weighted to
 * the REAL measured POI mix); arterial fascias are big brand-style boards,
 * English-first and larger, Bangla smaller underneath — the two are
 * genuinely different layouts, not just different colours.
 *
 * Packed as a vertical strip: cells [0, sideCount) are side-street boards,
 * cells [sideCount, sideCount+arterialCount) are arterial fascias. Callers
 * pick from the matching range depending on the road they are placing on.
 */
function buildSignAtlas(sideCount = 16, arterialCount = 8) {
  const W = 512;
  const H = 128;
  const count = sideCount + arterialCount;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H * count;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < sideCount; i++) {
    const y = i * H;
    const cat = pickShopCategory();
    ctx.fillStyle = cat.bg;
    ctx.fillRect(0, y, W, H);

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, y + 3, W - 6, H - 6);

    const [bn, en] = cat.names[Math.floor(rnd() * cat.names.length)];

    // Bangla first and larger (the real board layout): the dominant line.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cat.fg;
    ctx.font = `700 54px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
    ctx.fillText(bn, W / 2 + 14, y + H * 0.38);

    // Smaller English underneath.
    ctx.font = `600 24px system-ui, Arial, sans-serif`;
    ctx.globalAlpha = 0.88;
    ctx.fillText(en, W / 2 + 14, y + H * 0.76);
    ctx.globalAlpha = 1;

    if (cat.accent) drawCategoryAccent(ctx, 40, y + H * 0.5, cat.accent, cat.fg);

    ctx.fillStyle = 'rgba(40,34,26,0.10)';
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(rnd() * W, y + rnd() * H, 10 + rnd() * 90, 3 + rnd() * 10);
    }
  }

  for (let i = 0; i < arterialCount; i++) {
    const y = (sideCount + i) * H;
    const f = ARTERIAL_FASCIAS[i % ARTERIAL_FASCIAS.length];
    ctx.fillStyle = f.bg;
    ctx.fillRect(0, y, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, y, W, H * 0.14); // a top highlight strip, like a lit channel-letter fascia

    // English first and LARGER (owner Street View: big brand fascias,
    // "GRAND PRINCE", "SINGER" etc read as the dominant line on the arterial).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = f.fg;
    ctx.font = `800 44px system-ui, Arial, sans-serif`;
    ctx.fillText(f.en, W / 2, y + H * 0.38);

    ctx.font = `600 28px "Noto Sans Bengali", "Nirmala UI", "Kalpurush", system-ui, sans-serif`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(f.bn, W / 2, y + H * 0.74);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, y + 3, W - 6, H - 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, sideCount, arterialCount, count };
}

/**
 * Hang signboards on the buildings that front an arterial road, at the height
 * of the shopfront fascia. Also adds the projecting sunshade above them.
 *
 * @param {object} scene parsed scene.json
 * @returns {THREE.Group}
 */
export function buildShopSigns(scene) {
  const group = new THREE.Group();
  group.name = 'shop-signs';

  const { tex, sideCount, arterialCount } = buildSignAtlas(16, 8);

  // Real-name pool: every shop/amenity POI with a surveyed name. No cap --
  // the streaming atlas (createNamedAtlas/createNamedSignStreamer above)
  // recycles a fixed set of cells by proximity to the player at runtime, so
  // there's no longer a texture-memory reason to leave any eligible POI out
  // of the matching pool the way NAMED_LIMIT used to.
  const namedEligible = (scene.pois || []).filter(
    (p) => SIGNAGE_KINDS.has(p.k) && (p.name || p.nameEn)
  );
  const namedPois = namedEligible;
  const namedAtlas = createNamedAtlas();

  // Spatial index over the named-POI pool so each frontage bay can claim
  // the nearest still-unclaimed named POI (requirement 1: "a POI should
  // claim the frontage slot nearest its coordinates", and "handle ... a POI
  // whose nearest frontage is already taken" via `namedUsed`).
  const NAMED_MATCH_CELL = 20;
  const NAMED_MATCH_RADIUS = 18; // ~ half a mid-size Mirpur block frontage
  const namedGrid = new Map();
  for (let i = 0; i < namedPois.length; i++) {
    const p = namedPois[i];
    const k = Math.floor(p.x / NAMED_MATCH_CELL) * 100000 + Math.floor(p.z / NAMED_MATCH_CELL);
    let arr = namedGrid.get(k);
    if (!arr) namedGrid.set(k, (arr = []));
    arr.push(i);
  }
  const namedUsed = new Array(namedPois.length).fill(false);
  const namedBays = [];
  const findNearestNamed = (px, pz) => {
    const cx = Math.floor(px / NAMED_MATCH_CELL);
    const cz = Math.floor(pz / NAMED_MATCH_CELL);
    const span = Math.ceil(NAMED_MATCH_RADIUS / NAMED_MATCH_CELL);
    let best = NAMED_MATCH_RADIUS;
    let bestIdx = -1;
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const arr = namedGrid.get((cx + i) * 100000 + (cz + j));
        if (!arr) continue;
        for (const idx2 of arr) {
          if (namedUsed[idx2]) continue;
          const p = namedPois[idx2];
          const d = Math.hypot(px - p.x, pz - p.z);
          if (d < best) {
            best = d;
            bestIdx = idx2;
          }
        }
      }
    }
    return bestIdx;
  };

  // Index arterial road segments for a frontage test. s[5] carries the
  // road's rank so placement can pick the side-street or arterial signage
  // grammar (owner Street View item 7) — rank >= 4 is Begum Rokeya Ave and
  // the other main roads, matching the rank-4 threshold P1-C-DRAWS-METRO
  // already uses for the arterial-only concourse/entrance logic.
  const segs = [];
  for (const r of scene.roads) {
    if (r.rank < 2) continue;
    for (let i = 1; i < r.pts.length; i++) {
      segs.push([r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1], r.w, r.rank]);
    }
  }
  const CELL = 50;
  const grid = new Map();
  for (const s of segs) {
    const cx0 = Math.floor(Math.min(s[0], s[2]) / CELL);
    const cx1 = Math.floor(Math.max(s[0], s[2]) / CELL);
    const cz0 = Math.floor(Math.min(s[1], s[3]) / CELL);
    const cz1 = Math.floor(Math.max(s[1], s[3]) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 100000 + cz;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(s);
      }
    }
  }

  const distToSeg = (px, pz, s) => {
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) return Math.hypot(px - s[0], pz - s[1]);
    let t = ((px - s[0]) * dx + (pz - s[1]) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s[0] + t * dx), pz - (s[1] + t * dz));
  };

  const nearRoad = (px, pz) => {
    const cx = Math.floor(px / CELL);
    const cz = Math.floor(pz / CELL);
    let best = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = grid.get((cx + i) * 100000 + (cz + j));
        if (!arr) continue;
        for (const s of arr) {
          const d = distToSeg(px, pz, s) - s[4] / 2;
          if (d < best) best = d;
        }
      }
    }
    return best;
  };

  // Same search as nearRoad, but also returns the rank of the nearest
  // segment, so a building can be classified arterial vs side-street.
  const nearRoadRank = (px, pz) => {
    const cx = Math.floor(px / CELL);
    const cz = Math.floor(pz / CELL);
    let best = Infinity;
    let bestRank = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = grid.get((cx + i) * 100000 + (cz + j));
        if (!arr) continue;
        for (const s of arr) {
          const d = distToSeg(px, pz, s) - s[4] / 2;
          if (d < best) {
            best = d;
            bestRank = s[5] || 0;
          }
        }
      }
    }
    return bestRank;
  };

  // Collect candidate wall segments facing a road.
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  // Same quad buffers, second material: real-named signs (requirement 6 --
  // a separate mesh/material sharing ONE named-atlas texture, so this costs
  // exactly one extra draw call for the whole group no matter how many
  // named POIs get realised).
  const posNamed = [];
  const norNamed = [];
  const uvsNamed = [];
  const idxNamed = [];
  // One entry per matched named POI, in posNamed/uvsNamed vertex order --
  // this is the streamer's `slots` array (see createNamedSignStreamer):
  // position is fixed forever, but `cat`/`bn`/`en` let a cell be redrawn
  // when the POI becomes resident, and `uvBase` is where its 4 vertices'
  // UVs live in uvsNamed so the streamer can rewrite just those 8 floats.
  const namedSlots = [];
  const shadePos = [];
  const shadeNor = [];
  const shadeIdx = [];

  const SIGN_Y0 = 3.15;
  const SIGN_H = 0.95;
  let placed = 0;
  let namedPlaced = 0;
  const LIMIT = 5200; // keep the sign layer to a sane size

  // The bay loop keeps scanning past LIMIT for named-POI matching only
  // (`namedPlaced < namedPois.length`) -- otherwise buildings later in
  // scene.buildings' (non-spatial) order never got visited at all, and a
  // named POI near one of them was reported "dropped, no frontage" when
  // really its building was simply never reached. Generic filler stops at
  // LIMIT as before; the named pool has no atlas-size cap any more (see
  // createNamedAtlas's comment), so this can cost up to ~2,773 extra bay
  // checks (the full north-scene eligible count) instead of another 5200 --
  // still a one-time build cost, not a per-frame one.
  for (const b of scene.buildings) {
    if (placed >= LIMIT && namedPlaced >= namedPois.length) break;
    if (b.h < 5) continue;

    const { ring } = getClippedFootprint(scene, b);
    if (!ring) continue;
    const n = ring.length / 2;
    for (let i = 0; i < n && (placed < LIMIT || namedPlaced < namedPois.length); i++) {
      const j = (i + 1) % n;
      const ax = ring[i * 2];
      const az = ring[i * 2 + 1];
      const bx = ring[j * 2];
      const bz = ring[j * 2 + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 4) continue;

      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (nearRoad(mx, mz) > 7) continue;

      const ux = dx / len;
      const uz = dz / len;
      // Outward normal for a counter-clockwise ring.
      const nx = uz;
      const nz = -ux;

      // Only face the wall that actually looks at the road.
      if (nearRoad(mx + nx * 2.5, mz + nz * 2.5) > nearRoad(mx - nx * 2.5, mz - nz * 2.5)) {
        continue;
      }

      const bays = Math.max(1, Math.floor(len / 5.5));
      for (let k = 0; k < bays && (placed < LIMIT || namedPlaced < namedPois.length); k++) {
        const t0 = (k + 0.08) / bays;
        const t1 = (k + 0.92) / bays;
        const x0 = ax + dx * t0 + nx * 0.09;
        const z0 = az + dz * t0 + nz * 0.09;
        const x1 = ax + dx * t1 + nx * 0.09;
        const z1 = az + dz * t1 + nz * 0.09;

        // This bay claims the nearest still-unclaimed named POI within
        // NAMED_MATCH_RADIUS of its midpoint, if any -- a real shop's sign
        // lands at its real location. A 5-storey building with four
        // ground-floor shops (common here) gets up to four different bays
        // along its frontage, so up to four different named POIs can each
        // claim their own bay on the same building. Bays that don't match a
        // named POI (no name nearby, or already claimed) fall through to
        // the original generic category art, so the street doesn't visibly
        // thin out. The quad's geometry is permanent either way; only a
        // matched bay's UV moves later, as the streamer brings its POI in
        // and out of residency (see createNamedSignStreamer).
        const namedIdx = findNearestNamed(mx, mz);

        if (namedIdx >= 0) {
          namedUsed[namedIdx] = true;
          namedPlaced++;
          const poi = namedPois[namedIdx];
          // Where this real business's sign hangs, for anything that needs to
          // stand the player at its actual door (streetlife/world.js).
          namedBays.push({ poi, x: (x0 + x1) / 2, z: (z0 + z1) / 2, nx, nz, y: SIGN_Y0 + SIGN_H });
          const cat = categoryForPoi(poi);
          const catIdx = SHOP_CATEGORIES.indexOf(cat);
          const { bn, en } = poiLines(poi, cat);

          const base = posNamed.length / 3;
          posNamed.push(
            x0, SIGN_Y0, z0,
            x1, SIGN_Y0, z1,
            x1, SIGN_Y0 + SIGN_H, z1,
            x0, SIGN_Y0 + SIGN_H, z0
          );
          for (let q = 0; q < 4; q++) norNamed.push(nx, 0, nz);
          idxNamed.push(base, base + 2, base + 1, base, base + 3, base + 2);
          // Placeholder UV -- overwritten below once namedAtlas's fallback
          // rects exist, so every slot starts pointing at its category's
          // generic cell (the same art an unmatched bay gets).
          const uvBase = base * 2;
          uvsNamed.push(0, 0, 0, 0, 0, 0, 0, 0);
          namedSlots.push({
            x: (x0 + x1) / 2, z: (z0 + z1) / 2,
            cat, catIdx, bn, en, uvBase, cell: null,
          });
          placed++;
          continue;
        }

        // Past the generic budget: this bay run is only still happening to
        // give later-in-order buildings a shot at a named-POI match above;
        // don't also keep minting generic filler past LIMIT.
        if (placed >= LIMIT) continue;

        // Arterial frontage (rank >= 4: Begum Rokeya Ave and the other
        // main roads) gets the brand-fascia cells; everything else gets the
        // side-street category boards.
        const arterial = nearRoadRank(mx, mz) >= 4;
        const cellCount = arterial ? arterialCount : sideCount;
        const cellBase = arterial ? sideCount : 0;
        const cell = cellBase + Math.floor(rnd() * cellCount);
        const total = sideCount + arterialCount;
        const v0 = 1 - (cell + 1) / total;
        const v1 = 1 - cell / total;

        const base = pos.length / 3;
        pos.push(
          x0, SIGN_Y0, z0,
          x1, SIGN_Y0, z1,
          x1, SIGN_Y0 + SIGN_H, z1,
          x0, SIGN_Y0 + SIGN_H, z0
        );
        for (let q = 0; q < 4; q++) nor.push(nx, 0, nz);
        // x0 is on the viewer's right (see setSlotUV), so U runs 1 -> 0.
        uvs.push(1, v0, 0, v0, 0, v1, 1, v1);
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        placed++;
      }

      // Projecting concrete sunshade over the shopfront.
      {
        const D = 0.85;
        const y = SIGN_Y0 + SIGN_H + 0.06;
        const base = shadePos.length / 3;
        shadePos.push(
          ax, y, az,
          bx, y, bz,
          bx + nx * D, y - 0.12, bz + nz * D,
          ax + nx * D, y - 0.12, az + nz * D
        );
        for (let q = 0; q < 4; q++) shadeNor.push(0, 1, 0);
        shadeIdx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
  }

  if (idx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
    m.name = 'signboards';
    group.add(m);
  }

  // One more mesh, one more draw call, sharing ONE fixed-size streaming
  // atlas -- this is the entire *texture-memory* cost of real shop names
  // (16 MB or less, never more, see createNamedAtlas), regardless of how
  // many bays matched. Every matched bay's quad exists permanently in this
  // geometry; only its UV moves between the shared atlas and its category
  // fallback as the streamer brings it in and out of residency.
  if (idxNamed.length) {
    // Fill in every slot's initial UV now that namedAtlas's fallback rects
    // exist -- each one starts pointing at its category's generic cell,
    // exactly what an unmatched bay renders, until the streamer claims it.
    for (const s of namedSlots) {
      const rect = namedAtlas.fallbackRects[s.catIdx];
      const b = s.uvBase;
      uvsNamed[b + 0] = rect.u1; uvsNamed[b + 1] = rect.v0;
      uvsNamed[b + 2] = rect.u0; uvsNamed[b + 3] = rect.v0;
      uvsNamed[b + 4] = rect.u0; uvsNamed[b + 5] = rect.v1;
      uvsNamed[b + 6] = rect.u1; uvsNamed[b + 7] = rect.v1;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posNamed, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norNamed, 3));
    const uvAttr = new THREE.Float32BufferAttribute(uvsNamed, 2);
    uvAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('uv', uvAttr);
    g.setIndex(new THREE.Uint32BufferAttribute(idxNamed, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: namedAtlas.tex }));
    m.name = 'named-signboards';
    // Keep onBeforeRender firing every frame even when every named sign is
    // currently off-screen/behind the camera, so cells can be claimed
    // ahead of the player rounding a corner rather than only while visible.
    m.frustumCulled = false;
    const namedStreamer = createNamedSignStreamer(namedAtlas, namedSlots, uvAttr);
    // three.js calls onBeforeRender(renderer, scene, camera, ...) once per
    // rendered frame for every object it draws -- this is the "periodic
    // update, driven by the real frame loop" hook the streaming design
    // needs, without requiring a change to main.js's animate loop (which
    // already drives updateBuildingLOD the same way city.js's tiles need).
    m.onBeforeRender = (renderer, sceneArg, camera) => {
      namedStreamer.tick(camera.position.x, camera.position.z, renderer);
    };
    group.add(m);
    group.userData.namedAtlas = namedAtlas;
    group.userData.namedStreamer = namedStreamer;
  }

  if (shadeIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(shadePos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(shadeNor, 3));
    g.setIndex(new THREE.Uint32BufferAttribute(shadeIdx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ color: 0x9d968a, side: THREE.DoubleSide })
    );
    m.name = 'sunshades';
    m.castShadow = true;
    group.add(m);
  }

  group.userData.signCount = placed;
  // Report placed vs. dropped for the advisor. There is no more atlas-size
  // budget to drop against (NAMED_LIMIT is gone) -- the only way a named POI
  // doesn't make it onto a sign now is "no frontage bay landed within
  // NAMED_MATCH_RADIUS of it", same as before. Every POI that DOES land a
  // bay is reachable at runtime; it just may not currently hold a live
  // atlas cell if the player isn't near it (see namedAtlas/namedStreamer).
  group.userData.namedEligibleTotal = namedEligible.length;
  group.userData.namedPoolSize = namedPois.length;
  group.userData.namedPlaced = namedPlaced;
  group.userData.namedBays = namedBays;
  group.userData.namedDroppedOverBudget = 0;
  group.userData.namedDroppedNoFrontage = namedPois.length - namedPlaced;
  return group;
}
