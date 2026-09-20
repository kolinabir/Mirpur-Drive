/**
 * calibrate-heights.mjs
 *
 * Validation/fitting harness for the Open Buildings 2.5D raster height
 * estimator. OSM's `building:levels` tag is free, human-surveyed ground
 * truth: ~487 buildings in the mirpur extract and ~1305 in north carry a
 * valid (1-60) value. This script builds that ground-truth set, evaluates a
 * handful of candidate estimators against it with 5-fold cross-validation,
 * and prints a comparison table so the estimator wired into build-scene.mjs
 * is chosen on evidence rather than vibes.
 *
 * Usage: node tools/calibrate-heights.mjs [--extract mirpur|north|both]
 *
 * Important caveat (see the README / brief this tool was written against):
 * buildings with a building:levels tag keep priority over the raster in
 * build-scene.mjs, so this validation set is never a random sample of the
 * population it is meant to generalise to -- it's whatever OSM contributors
 * happened to survey, which over-represents mid-rise 5-6 storey buildings.
 * The small-footprint breakdown printed at the end exists to sanity-check
 * that a chosen estimator's advantage isn't an artefact of that skew.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const cliArgs = process.argv.slice(2);
function flag(name, def) {
  const i = cliArgs.indexOf(name);
  return i >= 0 && cliArgs[i + 1] !== undefined ? cliArgs[i + 1] : def;
}
const EXTRACT = flag('--extract', 'both'); // mirpur | north | both

// Must match build-scene.mjs exactly -- these constants define what "true
// height" means when we convert a building:levels tag into metres, and what
// "predicted levels" means when we convert a candidate's height back.
const FLOOR_H = 3.05;
const PARAPET = 1.1;
const SANITY_MIN = 2.5;
const SANITY_MAX = 100;

// ---------------------------------------------------------------------------
// Geometry + hash helpers, duplicated from build-scene.mjs / fetch-heights.mjs
// (same reasoning as fetch-heights.mjs's own header comment: this script
// doesn't want build-scene.mjs's whole pipeline running as an import side
// effect, so the handful of pure helpers it needs are copied, not imported).
// ---------------------------------------------------------------------------

function rand(id, salt = 0) {
  let h = (id ^ (salt * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a) / 2;
}

function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  while (
    out.length > 1 &&
    Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 &&
    Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6
  ) {
    out.pop();
  }
  return out;
}

function centroid(pts) {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

function distToSeg(px, pz, s) {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - s[0], pz - s[1]);
  let t = ((px - s[0]) * dx + (pz - s[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s[0] + t * dx), pz - (s[1] + t * dz));
}

// Same local equirectangular projection as build-scene.mjs -- the origin is
// fixed regardless of extract (see that file's header comment: "do NOT
// recentre"), so reuse it verbatim rather than re-deriving one.
const LAT0 = 23.8137;
const LON0 = 90.3668;
const M_PER_DEG_LAT = 111320.0;
const M_PER_DEG_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
function project(lat, lon) {
  return [(lon - LON0) * M_PER_DEG_LON, -(lat - LAT0) * M_PER_DEG_LAT];
}

// ---------------------------------------------------------------------------
// Old area heuristic, ported verbatim from build-scene.mjs's buildingHeight()
// -- specifically the branch that runs when neither an explicit height nor a
// building:levels tag is present. This is the "what would the heuristic have
// guessed, if it didn't get to see the tag" counterfactual: exactly the
// comparison the brief wants ("the current raster p75 estimator fails
// against [ground truth]... it is worse than the heuristic it replaced").
// ---------------------------------------------------------------------------

const LEVELS_BY_TYPE = {
  hut: 1, shed: 1, garage: 1, garages: 1, roof: 1, carport: 1, kiosk: 1,
  toilets: 1, service: 1, greenhouse: 1, industrial: 1, warehouse: 1,
  farm_auxiliary: 1, house: 2, detached: 2, bungalow: 1, retail: 3,
  commercial: 5, office: 6, apartments: 6, residential: 5, dormitory: 5,
  hotel: 6, school: 3, college: 4, university: 5, hospital: 6, civic: 3,
  government: 4, public: 3, train_station: 2, mosque: 1, religious: 1,
  temple: 1, church: 1, construction: 4, stadium: 2,
};

// Deliberately excludes build-scene.mjs's nearMainRoad commercial-frontage
// bump and its deterministic per-building jitter. Both exist purely to fake
// visual variety into a guess that has no other source of variation -- they
// are cosmetic, not accuracy features, and including them here measurably
// hurts the numbers: with them, this baseline scores MAE 2.12 / bias +0.59
// on the mirpur labels; without them (just the deterministic type/area
// lookup) it scores MAE 1.85 / bias +0.10, which is the real "how good is
// the signal" baseline this tool exists to beat. Ship-side, jitter still
// runs for genuinely-inferred buildings (there's no ground truth to jitter
// away from there) -- it just shouldn't be credited or blamed in a fair
// accuracy comparison against buildings we happen to have truth for.
function oldHeuristicHeight(tags, area) {
  const type = tags.building;
  let levels = LEVELS_BY_TYPE[type];

  if (levels === undefined) {
    if (area < 35) levels = 1;
    else if (area < 70) levels = 3;
    else if (area < 130) levels = 5;
    else if (area < 260) levels = 6;
    else if (area < 600) levels = 7;
    else levels = 8;
  }

  levels = Math.max(1, Math.min(22, levels));
  return levels * FLOOR_H + PARAPET;
}

// ---------------------------------------------------------------------------
// Load one extract: OSM dump + its heights-*.json side-table. Reconstructs
// footprints exactly like build-scene.mjs Pass 1 (roads, for arterial
// frontage) and Pass 2 (buildings, same relation-then-way order and area
// filter) so ids line up with what's in heights-*.json.
// ---------------------------------------------------------------------------

function loadExtract(name, osmFile, heightsFile) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, osmFile), 'utf8'));
  const heightsDoc = JSON.parse(readFileSync(resolve(ROOT, heightsFile), 'utf8'));
  const raster = heightsDoc.heights;

  const nodes = new Map();
  const ways = new Map();
  const relations = [];
  for (const el of raw.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else if (el.type === 'relation') relations.push(el);
  }

  function wayPoints(way) {
    const pts = [];
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (!n) return null;
      pts.push(project(n.lat, n.lon));
    }
    return pts;
  }

  // --- roads (for arterial frontage, same rank>=3 rule as build-scene.mjs) ---
  const ROAD_RANK = {
    motorway: 5, trunk: 5, primary: 4, primary_link: 4,
    secondary: 3, secondary_link: 3, tertiary: 3, tertiary_link: 3,
    unclassified: 2, residential: 2, living_street: 2, service: 1,
    pedestrian: 1, footway: 0, path: 0, steps: 0, track: 1,
  };
  const arterialSegments = [];
  for (const way of ways.values()) {
    const t = way.tags;
    if (!t || !t.highway) continue;
    const rank = ROAD_RANK[t.highway] ?? 1;
    if (rank < 3) continue;
    const pts = wayPoints(way);
    if (!pts || pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      arterialSegments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    }
  }
  function nearArterial(px, pz, maxDist = 28) {
    for (const s of arterialSegments) if (distToSeg(px, pz, s) < maxDist) return true;
    return false;
  }

  // --- buildings ---
  const consumedByRelation = new Set();
  const records = [];

  function addBuilding(id, tags, outer) {
    const ring = cleanRing(outer);
    if (ring.length < 3) return;
    const area = ringArea(ring);
    if (area < 6 || area > 90000) return;

    const lv = parseInt(tags['building:levels'], 10);
    if (!Number.isFinite(lv) || lv < 1 || lv > 60) return; // only labeled buildings matter here
    const rasterRec = raster[String(id)];
    if (!rasterRec) return; // need raster stats to evaluate raster-based candidates

    const c = centroid(ring);
    records.push({
      id,
      extract: name,
      levelsTrue: lv,
      heightTrue: lv * FLOOR_H + PARAPET,
      area,
      nearMainRoad: nearArterial(c[0], c[1]),
      tags,
      raster: rasterRec,
    });
  }

  for (const rel of relations) {
    const t = rel.tags || {};
    if (!t.building && !t['building:part']) continue;
    const outers = [];
    for (const m of rel.members) {
      if (m.type !== 'way') continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      const pts = wayPoints(w);
      if (!pts || pts.length < 3) continue;
      consumedByRelation.add(m.ref);
      if (m.role !== 'inner') outers.push(pts);
    }
    for (const o of outers) addBuilding(rel.id, t, o);
  }
  for (const way of ways.values()) {
    const t = way.tags;
    if (!t || !t.building) continue;
    if (consumedByRelation.has(way.id)) continue;
    const pts = wayPoints(way);
    if (!pts) continue;
    addBuilding(way.id, t, pts);
  }

  console.log(`${name}: ${records.length} ground-truth buildings (levels tag + raster stats)`);
  return records;
}

const EXTRACTS = {
  mirpur: ['data/mirpur.osm.json', 'data/heights-mirpur.json'],
  north: ['data/north.osm.json', 'data/heights-north.json'],
};

let records = [];
if (EXTRACT === 'both') {
  for (const [name, [osm, h]] of Object.entries(EXTRACTS)) records.push(...loadExtract(name, osm, h));
} else {
  const [osm, h] = EXTRACTS[EXTRACT];
  records = loadExtract(EXTRACT, osm, h);
}
console.log(`Pooled: ${records.length} labeled buildings\n`);

// ---------------------------------------------------------------------------
// Small linear algebra: OLS via normal equations + Gaussian elimination.
// Never more than 3 columns (intercept + up to 2 features) so this doesn't
// need to be fancy.
// ---------------------------------------------------------------------------

function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Ordinary least squares: X is an array of feature rows (no intercept column
 *  needed -- one is added automatically), y the targets. Returns coefficients
 *  [intercept, ...featureWeights]. */
function fitOLS(X, y) {
  const p = X[0].length + 1;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < p; a++) {
      Xty[a] += row[a] * y[i];
      for (let bIdx = 0; bIdx < p; bIdx++) XtX[a][bIdx] += row[a] * row[bIdx];
    }
  }
  return solve(XtX, Xty);
}

function pearsonR(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// ---------------------------------------------------------------------------
// Height <-> storeys conversion, matching build-scene.mjs exactly: sanity
// clamp first, THEN round to whole storeys.
// ---------------------------------------------------------------------------

function heightToLevels(h) {
  const clamped = Math.max(SANITY_MIN, Math.min(SANITY_MAX, h));
  return Math.max(1, Math.min(60, Math.round((clamped - PARAPET) / FLOOR_H)));
}

// Deterministic 5-way fold assignment from the OSM id, so re-runs are stable.
function foldOf(id) {
  let h = Math.imul(id ^ 0x2545f491, 0x27d4eb2f) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h % 5;
}

// ---------------------------------------------------------------------------
// Candidate estimators
// ---------------------------------------------------------------------------

const BANDS = [
  [1, 2], [3, 4], [5, 6], [7, 9], [10, Infinity],
];
function bandLabel([lo, hi]) {
  return hi === Infinity ? `${lo}+` : `${lo}-${hi}`;
}

function evaluate(name, predictorFn) {
  // predictorFn(rec) -> predicted height in metres. No fold logic: used for
  // parameter-free candidates (raw percentiles, the old heuristic), which
  // can't overfit because nothing is fit to this data.
  const predHeights = records.map(predictorFn);
  return summarize(name, predHeights);
}

function evaluateCV(name, buildFeature, fitTarget = 'heightTrue') {
  // buildFeature(rec) -> feature array (without intercept). Fits OLS per
  // fold on the other 4 folds, predicts on the held-out fold, and reports
  // metrics on the assembled out-of-fold predictions -- honest CV, not
  // in-sample fit.
  const predHeights = new Array(records.length);
  for (let fold = 0; fold < 5; fold++) {
    const trainIdx = [];
    const testIdx = [];
    records.forEach((r, i) => (foldOf(r.id) === fold ? testIdx.push(i) : trainIdx.push(i)));
    const X = trainIdx.map((i) => buildFeature(records[i]));
    const y = trainIdx.map((i) => records[i][fitTarget]);
    const coeffs = fitOLS(X, y);
    for (const i of testIdx) {
      const feat = buildFeature(records[i]);
      let h = coeffs[0];
      for (let k = 0; k < feat.length; k++) h += coeffs[k + 1] * feat[k];
      predHeights[i] = h;
    }
  }
  // Also report the coefficients from a fit on the FULL set, for wiring into
  // build-scene.mjs (the per-fold coefficients are only used to get honest
  // CV error estimates above -- the shipped constant uses every label).
  const fullCoeffs = fitOLS(records.map(buildFeature), records.map((r) => r[fitTarget]));
  const result = summarize(name, predHeights);
  result.fullCoeffs = fullCoeffs;
  return result;
}

function summarize(name, predHeights) {
  const n = records.length;
  let sumAbsErr = 0;
  let sumErr = 0;
  let within1 = 0;
  let within2 = 0;
  const bandStats = BANDS.map(() => ({ n: 0, sumErr: 0 }));
  const trueContinuous = [];
  const predContinuous = [];

  for (let i = 0; i < n; i++) {
    const r = records[i];
    const predLevels = heightToLevels(predHeights[i]);
    const err = predLevels - r.levelsTrue;
    sumAbsErr += Math.abs(err);
    sumErr += err;
    if (Math.abs(err) <= 1) within1++;
    if (Math.abs(err) <= 2) within2++;
    const bandIdx = BANDS.findIndex(([lo, hi]) => r.levelsTrue >= lo && r.levelsTrue <= hi);
    bandStats[bandIdx].n++;
    bandStats[bandIdx].sumErr += err;
    trueContinuous.push(r.heightTrue);
    predContinuous.push(predHeights[i]);
  }

  return {
    name,
    n,
    mae: sumAbsErr / n,
    bias: sumErr / n,
    within1: (100 * within1) / n,
    within2: (100 * within2) / n,
    r: pearsonR(predContinuous, trueContinuous),
    bandBias: bandStats.map((b) => (b.n ? b.sumErr / b.n : NaN)),
  };
}

function printTable(results) {
  const bandHeader = BANDS.map(bandLabel).join(' | ');
  console.log(
    `${'estimator'.padEnd(28)} ${'MAE'.padStart(6)} ${'bias'.padStart(7)} ${'±1'.padStart(7)} ${'±2'.padStart(7)} ${'r'.padStart(6)}   band bias (${bandHeader})`
  );
  for (const res of results) {
    const bands = res.bandBias.map((v) => (Number.isNaN(v) ? '   -' : v.toFixed(2).padStart(6))).join(' ');
    console.log(
      `${res.name.padEnd(28)} ${res.mae.toFixed(3).padStart(6)} ${res.bias.toFixed(3).padStart(7)} ${res.within1.toFixed(1).padStart(6)}% ${res.within2.toFixed(1).padStart(6)}% ${res.r.toFixed(3).padStart(6)}   ${bands}`
    );
  }
}

// ---------------------------------------------------------------------------
// Run all candidates
// ---------------------------------------------------------------------------

const results = [];
const predictors = new Map(); // name -> (rec) => predicted height metres, for every candidate

// Baseline: the heuristic being replaced.
results.push(evaluate('old area heuristic', (r) => oldHeuristicHeight(r.tags, r.area)));
predictors.set('old area heuristic', (r) => oldHeuristicHeight(r.tags, r.area));

// Raw percentiles / stats, unmodified -- zero fitted parameters.
for (const key of ['p50', 'p75', 'p90', 'max', 'mean']) {
  const name = `raster raw ${key}`;
  results.push(evaluate(name, (r) => r.raster[key]));
  predictors.set(name, (r) => r.raster[key]);
}

// Linear calibration of each percentile (height_true ~ a*raster + b), CV'd.
for (const key of ['p50', 'p75', 'p90', 'max', 'mean']) {
  const res = evaluateCV(`raster ${key}, linear calib`, (r) => [r.raster[key]]);
  results.push(res);
  const c = res.fullCoeffs;
  predictors.set(res.name, (r) => c[0] + c[1] * r.raster[key]);
}

// Combined: height_true ~ a*raster + b*ln(area) + c, for each percentile base.
for (const key of ['p50', 'p75', 'p90', 'max', 'mean']) {
  const res = evaluateCV(`raster ${key} + log(area)`, (r) => [r.raster[key], Math.log(r.area)]);
  results.push(res);
  const c = res.fullCoeffs;
  predictors.set(res.name, (r) => c[0] + c[1] * r.raster[key] + c[2] * Math.log(r.area));
}

printTable(results);

// ---------------------------------------------------------------------------
// Pick the best candidate.
//
// Ranking purely by CV MAE is misleading here: every OLS-fitted candidate
// (linear calib or +log(area)) pulls its coefficients toward the bulk of the
// label set -- 5-6 storey mid-rise buildings, 673/1823 of them -- which
// systematically shrinks predictions for the rare tall buildings (81 in the
// 10+ band, 130 in 7-9). That's regression-to-the-mean, and it reproduces
// almost exactly the compression problem this tool exists to fix: every
// fitted candidate below shows a *worse* 10+ band bias (-2.9 to -4.8 storeys)
// than the raw, uncalibrated `max` percentile (-0.14 storeys) despite having
// a lower overall MAE. Optimizing squared error over-weights the frequent
// mid-rise buildings and under-weights the rare tall ones -- precisely
// backwards from what "don't flatten the skyline" requires.
//
// So: reject any candidate whose |bias| in the 7-9 or 10+ band exceeds
// TALL_BIAS_LIMIT storeys as "large residual bias in the tall-building
// bands" per the brief, then take the lowest CV MAE among what's left,
// preferring the simpler model within TIE_MARGIN storeys of the best.
// ---------------------------------------------------------------------------

const TALL_BIAS_LIMIT = 2.0; // storeys
const TIE_MARGIN = 0.05; // storeys, per brief: "prefer simpler within ~0.05"

function complexity(name) {
  if (name === 'old area heuristic') return 0;
  if (name.startsWith('raster raw')) return 1; // zero fitted params
  if (name.includes('log(area)')) return 3; // intercept + 2 features
  return 2; // linear calib: intercept + 1 feature
}

const candidates = results.filter((r) => r.name !== 'old area heuristic');
const passesTallBand = candidates.filter(
  (r) => Math.abs(r.bandBias[3]) <= TALL_BIAS_LIMIT && Math.abs(r.bandBias[4]) <= TALL_BIAS_LIMIT
);
const pool = passesTallBand.length ? passesTallBand : candidates; // fall back if nothing passes
pool.sort((a, b) => a.mae - b.mae || complexity(a.name) - complexity(b.name));

console.log(
  `\n${passesTallBand.length}/${candidates.length} candidates keep |bias| <= ${TALL_BIAS_LIMIT} storeys in both the 7-9 and 10+ bands:`
);
for (const c of pool.slice(0, 8)) {
  console.log(
    `  ${c.name.padEnd(28)} MAE ${c.mae.toFixed(3)}  tall-band bias (7-9,10+): ${c.bandBias[3].toFixed(2)}, ${c.bandBias[4].toFixed(2)}`
  );
}

let best = pool[0];
for (const c of pool) {
  if (c.mae - best.mae <= TIE_MARGIN && complexity(c.name) < complexity(best.name)) best = c;
  else if (c.mae < best.mae - TIE_MARGIN) break; // pool is sorted by MAE; nothing further is a tie
}

console.log(`\nSelected: ${best.name}`);
if (best.fullCoeffs) {
  console.log(`  full-data coefficients: ${JSON.stringify(best.fullCoeffs.map((v) => +v.toFixed(6)))}`);
  console.log(
    `  (interpretation: height_m = ${best.fullCoeffs[0].toFixed(4)} + ${best.fullCoeffs[1].toFixed(4)}*raster` +
      (best.fullCoeffs.length > 2 ? ` + ${best.fullCoeffs[2].toFixed(4)}*ln(area_m2)` : '') +
      ')'
  );
} else {
  console.log('  no fitted parameters -- used as-is (plus the usual sanity clamp).');
}

// ---------------------------------------------------------------------------
// Small-footprint check: the label set over-represents mid-rise buildings
// (244/487 in mirpur are 5-6 storeys) because tagging effort correlates with
// building prominence, not because that's the true population mix. Most of
// the UNTAGGED population this estimator actually has to serve is smaller
// footprints. Check whether the winning estimator's edge over the old
// heuristic survives on the small-footprint half of the label set.
// ---------------------------------------------------------------------------

const areasSorted = records.map((r) => r.area).sort((a, b) => a - b);
const medianArea = areasSorted[Math.floor(areasSorted.length / 2)];
const smallIdx = [];
records.forEach((r, i) => { if (r.area <= medianArea) smallIdx.push(i); });

function evaluateSubset(name, predictorFn, idxList) {
  const sub = idxList.map((i) => records[i]);
  const predHeights = sub.map(predictorFn);
  const savedRecords = records;
  records = sub; // summarize() closes over module-level `records`
  const res = summarize(name, predHeights);
  records = savedRecords;
  return res;
}

console.log(`\nSmall-footprint check (area <= median ${medianArea.toFixed(0)} m^2, n=${smallIdx.length}):`);
const smallHeuristic = evaluateSubset(
  'old heuristic (small)',
  (r) => oldHeuristicHeight(r.tags, r.area),
  smallIdx
);
// Re-evaluate the winning estimator with its FULL-DATA parameters (not
// refit on just the small subset) -- that's what actually ships, so this is
// the honest check of whether its edge holds where most of the untagged
// population actually lives.
const smallBest = evaluateSubset(`${best.name} (small)`, predictors.get(best.name), smallIdx);
printTable([smallHeuristic, smallBest]);

