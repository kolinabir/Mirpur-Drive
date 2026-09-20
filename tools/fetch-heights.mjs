/**
 * fetch-heights.mjs
 *
 * Looks up real, satellite-measured building heights from Google's Open
 * Buildings 2.5D Temporal dataset (CC-BY-4.0) for every building footprint
 * in an Overpass OSM dump, and writes them to a small JSON side-table that
 * `build-scene.mjs --heights <file>` merges in ahead of its own footprint-
 * area heuristic.
 *
 * Input:  data/mirpur.osm.json (or any Overpass JSON dump)
 * Output: data/heights-mirpur.json -- { meta, heights: { "<osm id>": metres } }
 *
 * Dataset: storage.googleapis.com/open-buildings-temporal-data (public GCS
 * bucket, no auth). Each yearly epoch is sharded by UTM zone into a handful
 * of manifests; each manifest lists dozens of 25000x25000px Cloud-Optimized
 * GeoTIFFs (COGs) at 0.5 m/px, tiled 512x512, Deflate + floating-point
 * predictor, 3 bands: building_fractional_count, building_height (metres,
 * -99 = nodata), building_presence. Stated accuracy: MAE 1.5 m, effective
 * resolution ~4 m, heights capped at 100 m.
 *
 * The files are 1-1.7 GB each. We never download one whole: everything goes
 * through HTTP Range requests for just the 512x512 tiles a building's
 * footprint actually touches, and those raw (still-compressed) tiles are
 * cached to disk so a re-run over the same extract costs zero network I/O.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
// --in <file>     Overpass JSON dump (default data/mirpur.osm.json)
// --out <file>    output heights JSON (default data/heights-mirpur.json)
// --year <yyyy>   dataset epoch to use (default 2023, the latest available)
// --cache <dir>   raw-tile cache directory (default .cache/obt)
const cliArgs = process.argv.slice(2);
function flag(name, def) {
  const i = cliArgs.indexOf(name);
  return i >= 0 && cliArgs[i + 1] !== undefined ? cliArgs[i + 1] : def;
}

const IN = resolve(ROOT, flag('--in', 'data/mirpur.osm.json'));
const OUT = resolve(ROOT, flag('--out', 'data/heights-mirpur.json'));
const YEAR = flag('--year', '2023');
const CACHE_DIR = resolve(ROOT, flag('--cache', '.cache/obt'));
mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// WGS84 -> UTM forward projection (Snyder's formulas)
//
// This is a *separate* projection from build-scene.mjs's local equirectangular
// metre plane -- it exists purely to index into the Open Buildings raster,
// which is published in UTM. Dhaka (lon ~90.3-90.4E) sits in UTM zone 46N
// (EPSG:32646).
// ---------------------------------------------------------------------------
const UTM_ZONE = 46;
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;

/** lat/lon (degrees) -> UTM [x, y] metres, zone UTM_ZONE, northern hemisphere. */
function toUTM(lat, lon) {
  const lon0 = ((UTM_ZONE * 6 - 183) * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const tanLat = Math.tan(latR);
  const N = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = EP2 * cosLat * cosLat;
  const A = (lonR - lon0) * cosLat;
  const M =
    WGS84_A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * latR -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * latR) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * latR) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * latR));
  const x =
    K0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A ** 5) / 120) +
    500000;
  const y =
    K0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A ** 6) / 720));
  return [x, y];
}

// ---------------------------------------------------------------------------
// Small HTTP helpers
// ---------------------------------------------------------------------------

async function rangeFetch(url, a, b) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** gs://bucket/path -> https://storage.googleapis.com/bucket/path */
function gsToHttps(gsUrl) {
  const m = gsUrl.match(/^gs:\/\/([^/]+)\/(.*)$/);
  if (!m) throw new Error(`bad gs:// url: ${gsUrl}`);
  return `https://storage.googleapis.com/${m[1]}/${m[2]}`;
}

// ---------------------------------------------------------------------------
// Minimal COG (tiled, Deflate + float-predictor GeoTIFF) reader
//
// Ported from the verified Python reference (scratchpad/cogread.py). The
// float predictor's decode has two stages once a tile is zlib-inflated:
//   1. a running byte-wise cumulative sum (mod 256) along each row, undoing
//      the horizontal differencing;
//   2. de-interleaving byte planes -- GDAL's predictor 3 stores each row as
//      4 contiguous byte planes MSB-first, so sample i's little-endian float
//      bytes are [plane3[i], plane2[i], plane1[i], plane0[i]].
// ---------------------------------------------------------------------------
class Cog {
  constructor(url) {
    this.url = url;
  }

  async init() {
    const head = await rangeFetch(this.url, 0, 15);
    this.le = head[0] === 0x49 && head[1] === 0x49; // 'II' = little-endian classic TIFF
    const off = this.le ? head.readUInt32LE(4) : head.readUInt32BE(4);
    const ifdBuf = await rangeFetch(this.url, off, off + 2 + 20 * 12 + 8);
    const n = this.le ? ifdBuf.readUInt16LE(0) : ifdBuf.readUInt16BE(0);
    this.tags = new Map();
    for (let i = 0; i < n; i++) {
      const e = ifdBuf.subarray(2 + i * 12, 14 + i * 12);
      const tag = this.le ? e.readUInt16LE(0) : e.readUInt16BE(0);
      const typ = this.le ? e.readUInt16LE(2) : e.readUInt16BE(2);
      const cnt = this.le ? e.readUInt32LE(4) : e.readUInt32BE(4);
      this.tags.set(tag, { typ, cnt, raw: e.subarray(8, 12) });
    }
    this.w = (await this.val(256))[0];
    this.h = (await this.val(257))[0];
    this.tw = (await this.val(322))[0];
    this.th = (await this.val(323))[0];
    this.offsets = await this.val(324); // TileOffsets
    this.counts = await this.val(325); // TileByteCounts
    this.tilesX = Math.ceil(this.w / this.tw);
    this.tilesY = Math.ceil(this.h / this.th);
  }

  async val(tagId) {
    const t = this.tags.get(tagId);
    if (!t) throw new Error(`GeoTIFF tag ${tagId} not found in ${this.url}`);
    const { typ, cnt, raw } = t;
    // type 3 = SHORT, 4 = LONG (the only ones this reader needs)
    const [readName, size] = typ === 3 ? ['UInt16', 2] : typ === 4 ? ['UInt32', 4] : [null, 0];
    if (!readName) throw new Error(`unsupported TIFF tag type ${typ}`);
    let data = raw;
    if (cnt * size > 4) {
      const off = this.le ? raw.readUInt32LE(0) : raw.readUInt32BE(0);
      data = await rangeFetch(this.url, off, off + cnt * size - 1);
    }
    const out = [];
    const suffix = this.le ? 'LE' : 'BE';
    for (let i = 0; i < cnt; i++) out.push(data[`read${readName}${suffix}`](i * size));
    return out;
  }

  /** Fetch+cache the raw compressed bytes for tile (band,tx,ty); decode to a Float32Array. */
  async tile(band, tx, ty, tileFileTag, stats) {
    const idx = band * this.tilesX * this.tilesY + ty * this.tilesX + tx; // PlanarConfig=2
    const cacheKey = `${tileFileTag}_${band}_${tx}_${ty}`;
    const cachePath = join(CACHE_DIR, cacheKey);
    let raw;
    if (existsSync(cachePath)) {
      raw = readFileSync(cachePath);
      stats.cacheHits++;
    } else {
      const off = this.offsets[idx];
      const cnt = this.counts[idx];
      if (!cnt) return null; // sparse COG: this tile was never written (all-nodata)
      raw = await rangeFetch(this.url, off, off + cnt - 1);
      writeFileSync(cachePath, raw);
      stats.fetched++;
    }
    const inflated = Buffer.from(inflateSync(raw)); // th rows x (tw*4) bytes
    const tw = this.tw;
    const th = this.th;
    // Predictor 3, stage 1: running byte cumulative sum along each row (mod 256).
    for (let r = 0; r < th; r++) {
      const rowOff = r * tw * 4;
      let acc = 0;
      for (let c = 0; c < tw * 4; c++) {
        acc = (acc + inflated[rowOff + c]) & 0xff;
        inflated[rowOff + c] = acc;
      }
    }
    // Stage 2: de-interleave the 4 MSB-first byte planes back into float32s.
    const out = new Float32Array(th * tw);
    const fbuf = Buffer.alloc(4);
    for (let r = 0; r < th; r++) {
      const rowOff = r * tw * 4;
      for (let i = 0; i < tw; i++) {
        fbuf[0] = inflated[rowOff + 3 * tw + i]; // LSB plane
        fbuf[1] = inflated[rowOff + 2 * tw + i];
        fbuf[2] = inflated[rowOff + 1 * tw + i];
        fbuf[3] = inflated[rowOff + 0 * tw + i]; // MSB plane
        out[r * tw + i] = fbuf.readFloatLE(0);
      }
    }
    return out;
  }
}

const cogCache = new Map(); // https url -> Cog (parsed IFD, kept for the whole run)
async function openCog(url) {
  let c = cogCache.get(url);
  if (!c) {
    c = new Cog(url);
    await c.init();
    cogCache.set(url, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Manifest discovery
//
// Per source: v1/manifests/<shard>_EPSG_32646_<year>_06_30.json. Zone 46N
// (Dhaka) happens to be split into two shards, "31" and "37" -- but we don't
// hardcode that: we list the bucket and keep whatever matches the zone/year.
// ---------------------------------------------------------------------------
const EPSG = 32600 + UTM_ZONE;
const BUCKET = 'open-buildings-temporal-data';

async function loadSources() {
  console.log(`Listing manifests for EPSG:${EPSG}, epoch ${YEAR}...`);
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=v1/manifests/&maxResults=2000`;
  const listing = await fetchJson(listUrl);
  const names = (listing.items || [])
    .map((o) => o.name)
    .filter((n) => n.includes(`_EPSG_${EPSG}_`) && n.includes(`_${YEAR}_`));
  if (!names.length) throw new Error(`no manifests found for EPSG:${EPSG} epoch ${YEAR}`);
  console.log(`  ${names.length} manifest(s): ${names.map((n) => n.split('/').pop()).join(', ')}`);

  const sources = [];
  for (const name of names) {
    const manifest = await fetchJson(`https://storage.googleapis.com/${BUCKET}/${name}`);
    // "uriPrefix" concatenates directly with each source's uri, no separator.
    const prefix = manifest.uriPrefix; // gs://open-buildings-temporal-data/v1/geotiffs/<shard>
    for (const tileset of manifest.tilesets) {
      for (const src of tileset.sources) {
        const at = src.affineTransform;
        sources.push({
          url: gsToHttps(`${prefix}${src.uris[0]}`),
          tag: src.uris[0].split('/').pop(), // e.g. tile_XYLMruB9JYI.tif, used as the cache-key prefix
          x0: at.translateX,
          y0: at.translateY,
          sx: at.scaleX,
          sy: at.scaleY,
          w: src.dimensions.width,
          h: src.dimensions.height,
        });
      }
    }
  }
  console.log(`  ${sources.length} raster sources total`);
  return sources;
}

/** Find the source whose pixel window contains UTM point (x,y), or null. */
const sourceLookupCache = []; // small MRU list -- Mirpur only ever touches 1-2 sources
function findSource(sources, x, y) {
  for (const s of sourceLookupCache) {
    const px = (x - s.x0) / s.sx;
    const py = (y - s.y0) / s.sy;
    if (px >= 0 && px < s.w && py >= 0 && py < s.h) return s;
  }
  for (const s of sources) {
    const px = (x - s.x0) / s.sx;
    const py = (y - s.y0) / s.sy;
    if (px >= 0 && px < s.w && py >= 0 && py < s.h) {
      sourceLookupCache.unshift(s);
      if (sourceLookupCache.length > 4) sourceLookupCache.pop();
      return s;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry helpers (deliberately duplicated from build-scene.mjs's small pure
// helpers rather than imported -- that file runs its whole pipeline as
// top-level side effects on import, which we don't want here).
// ---------------------------------------------------------------------------

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

/** Even-odd point-in-polygon test across any number of rings (outer + holes
 *  in one call): a point inside the outer only crosses an odd number of ring
 *  edges total and counts as inside; inside outer AND a hole crosses an even
 *  number and counts as outside. This is exactly the "even-odd fill, holes
 *  handled for free" rule the brief asks for. */
function pointInRings(rings, x, y) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

function percentile(sorted, p) {
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---------------------------------------------------------------------------
// Load the OSM dump and reconstruct building footprints in UTM metres,
// mirroring build-scene.mjs Pass 2 exactly (same relations first,
// consumed-way bookkeeping, area filter) so the two tools agree on which
// ways are "a building".
// ---------------------------------------------------------------------------

console.log('Reading', IN);
const raw = JSON.parse(readFileSync(IN, 'utf8'));
const nodes = new Map();
const ways = new Map();
const relations = [];
for (const el of raw.elements) {
  if (el.type === 'node') nodes.set(el.id, el);
  else if (el.type === 'way') ways.set(el.id, el);
  else if (el.type === 'relation') relations.push(el);
}
console.log(`  ${nodes.size} nodes, ${ways.size} ways, ${relations.length} relations`);

function wayPointsUTM(way) {
  const pts = [];
  for (const nid of way.nodes) {
    const n = nodes.get(nid);
    if (!n) return null;
    pts.push(toUTM(n.lat, n.lon));
  }
  return pts;
}

/** id -> { parts: [{outer, holes}], area } accumulated exactly like pushBuilding. */
const footprints = new Map();
const consumedByRelation = new Set();
let skipped = 0;

function addPart(id, outer, holes) {
  const ring = cleanRing(outer);
  if (ring.length < 3) {
    skipped++;
    return;
  }
  const area = ringArea(ring);
  if (area < 6 || area > 90000) {
    skipped++;
    return;
  }
  const cleanHoles = (holes || []).map(cleanRing).filter((h) => h.length >= 3);
  let entry = footprints.get(id);
  if (!entry) footprints.set(id, (entry = { parts: [], area: 0 }));
  entry.parts.push({ outer: ring, holes: cleanHoles });
  entry.area += area;
}

for (const rel of relations) {
  const t = rel.tags || {};
  if (!t.building && !t['building:part']) continue;
  const outers = [];
  const inners = [];
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const w = ways.get(m.ref);
    if (!w) continue;
    const pts = wayPointsUTM(w);
    if (!pts || pts.length < 3) continue;
    consumedByRelation.add(m.ref);
    if (m.role === 'inner') inners.push(pts);
    else outers.push(pts);
  }
  for (const o of outers) addPart(rel.id, o, inners);
}

for (const way of ways.values()) {
  const t = way.tags;
  if (!t || !t.building) continue;
  if (consumedByRelation.has(way.id)) continue;
  const pts = wayPointsUTM(way);
  if (!pts) {
    skipped++;
    continue;
  }
  addPart(way.id, pts, null);
}

console.log(`  ${footprints.size} building footprints reconstructed (skipped ${skipped})`);

// ---------------------------------------------------------------------------
// Zonal statistic per building
// ---------------------------------------------------------------------------

const sources = await loadSources();
const stats = { fetched: 0, cacheHits: 0 };
const heights = {};
let gotRaster = 0;
let fellBack = 0;
let outsideCoverage = 0;
let tooFewPixels = 0;

const ids = [...footprints.keys()];
let done = 0;
for (const id of ids) {
  const entry = footprints.get(id);
  const samples = [];

  for (const part of entry.parts) {
    // Bounding box of this part's outer ring, in UTM metres.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of part.outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const src = findSource(sources, cx, cy);
    if (!src) continue; // footprint centroid outside every available raster tile

    // UTM -> this source's pixel space (scaleY is negative: rows increase southward).
    const toPx = (x, y) => [(x - src.x0) / src.sx, (y - src.y0) / src.sy];
    const outerPx = part.outer.map(([x, y]) => toPx(x, y));
    const holesPx = part.holes.map((h) => h.map(([x, y]) => toPx(x, y)));
    const allRings = [outerPx, ...holesPx];

    let px0 = Infinity;
    let py0 = Infinity;
    let px1 = -Infinity;
    let py1 = -Infinity;
    for (const [px, py] of outerPx) {
      if (px < px0) px0 = px;
      if (px > px1) px1 = px;
      if (py < py0) py0 = py;
      if (py > py1) py1 = py;
    }
    px0 = Math.max(0, Math.floor(px0));
    py0 = Math.max(0, Math.floor(py0));
    px1 = Math.min(src.w, Math.ceil(px1));
    py1 = Math.min(src.h, Math.ceil(py1));
    if (px1 <= px0 || py1 <= py0) continue;

    const cog = await openCog(src.url);
    const tw = cog.tw;
    const th = cog.th;
    const txStart = Math.floor(px0 / tw);
    const txEnd = Math.floor((px1 - 1) / tw);
    const tyStart = Math.floor(py0 / th);
    const tyEnd = Math.floor((py1 - 1) / th);

    for (let ty = tyStart; ty <= tyEnd; ty++) {
      for (let tx = txStart; tx <= txEnd; tx++) {
        const tileData = await cog.tile(1, tx, ty, src.tag, stats); // band 1 = building_height
        if (!tileData) continue;
        const sx = tx * tw;
        const sy = ty * th;
        const ax0 = Math.max(px0, sx);
        const ay0 = Math.max(py0, sy);
        const ax1 = Math.min(px1, sx + tw);
        const ay1 = Math.min(py1, sy + th);
        for (let y = ay0; y < ay1; y++) {
          for (let x = ax0; x < ax1; x++) {
            if (!pointInRings(allRings, x + 0.5, y + 0.5)) continue;
            const v = tileData[(y - sy) * tw + (x - sx)];
            if (Number.isNaN(v) || v === -99 || v <= 0) continue;
            samples.push(v);
          }
        }
      }
    }
  }

  if (!samples.length) {
    outsideCoverage++;
    fellBack++;
  } else if (samples.length < 4) {
    tooFewPixels++;
    fellBack++;
  } else {
    samples.sort((a, b) => a - b);
    let sum = 0;
    for (const v of samples) sum += v;
    // No [2.5, 100] clamp here -- that range check is an *estimator* decision
    // (calibrate-heights.mjs / build-scene.mjs pick what counts as usable),
    // not an extraction one. Keep every stat the calibration harness needs so
    // re-fetching is never required just to try a different estimator.
    heights[id] = {
      p50: Math.round(percentile(samples, 50) * 100) / 100,
      p75: Math.round(percentile(samples, 75) * 100) / 100,
      p90: Math.round(percentile(samples, 90) * 100) / 100,
      max: Math.round(samples[samples.length - 1] * 100) / 100,
      mean: Math.round((sum / samples.length) * 100) / 100,
      n: samples.length,
      area: Math.round(entry.area * 100) / 100,
    };
    gotRaster++;
  }

  done++;
  if (done % 500 === 0 || done === ids.length) {
    console.log(
      `  ${done}/${ids.length} buildings  |  tiles: ${stats.fetched} fetched, ${stats.cacheHits} cached  |  ${gotRaster} raster heights so far`
    );
  }
}

// ---------------------------------------------------------------------------
// Write output + stats summary
// ---------------------------------------------------------------------------

const FLOOR_H = 3.05; // must match build-scene.mjs, only for the storey histogram below
const PARAPET = 1.1;
const storeyHist = new Map();
for (const rec of Object.values(heights)) {
  const levels = Math.max(1, Math.min(60, Math.round((rec.p75 - PARAPET) / FLOOR_H)));
  storeyHist.set(levels, (storeyHist.get(levels) || 0) + 1);
}

const meta = {
  formatVersion: 2, // v2: per-building {p50,p75,p90,max,mean,n,area} replaces the bare p75 number;
  // no [2.5,100]m clamp at extraction time (moved downstream to the estimator)
  source: 'Google Open Buildings 2.5D Temporal',
  band: 'building_height',
  epoch: YEAR,
  license: 'CC-BY-4.0',
  attribution: 'Google Research Open Buildings 2.5D Temporal Dataset, CC-BY-4.0',
  statistic: 'p50/p75/p90/max/mean of in-footprint pixels (0.5m grid), nodata/<=0 discarded, no range clamp',
  minValidPixels: 4,
  buildingsTotal: footprints.size,
  buildingsWithHeight: gotRaster,
  buildingsFallback: fellBack,
  outsideCoverage,
  tooFewPixels,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ meta, heights }));

console.log('');
console.log(`Wrote ${OUT}`);
console.log(
  `  ${gotRaster}/${footprints.size} buildings got a raster height (${((100 * gotRaster) / footprints.size).toFixed(1)}%)`
);
console.log(
  `  fallback: ${fellBack} (${outsideCoverage} outside raster coverage, ${tooFewPixels} <4 valid pixels)`
);
console.log(`  tiles: ${stats.fetched} fetched over the network, ${stats.cacheHits} served from cache`);
console.log('  storey histogram (raster heights only):');
for (const lv of [...storeyHist.keys()].sort((a, b) => a - b)) {
  console.log(`    ${String(lv).padStart(2)} storeys: ${storeyHist.get(lv)}`);
}
