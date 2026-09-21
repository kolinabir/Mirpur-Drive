/**
 * platform-boards.js
 *
 * Next-train boards over every platform: the next four arrivals on that side,
 * counting down in m:ss, and NOW while a train is standing there.
 *
 * Accuracy: the times are not estimates. metro.arrivals() computes them from
 * the same closed-form timetable metro.update() moves the trains with (see the
 * "Timetable" note in src/metro.js), so a row reaches 0:00 on the frame its
 * train comes to rest. The display is re-evaluated at the exact instant the
 * next digit is due to change, not on a fixed tick, so it is never a beat
 * behind.
 *
 * Cost: ONE texture and ONE material for every board in the district. The
 * atlas holds both static board faces and a strip of LED glyphs; a countdown
 * is twenty small quads per face whose UVs are re-pointed at other glyphs.
 * Nothing is redrawn to a canvas and no texture is re-uploaded at runtime: a
 * digit change writes a few hundred floats. Only the station the viewer is at
 * is live (two draw calls); every other station's boards are hidden and not
 * even evaluated.
 */
import * as THREE from 'three';
import { METRO } from './metro.js';

const LIVE_RANGE = 280; // m from the station centre; a platform is 180 m long
const ROWS = 4;
const CHARS = 5; // "mm:ss"
const BOARD_W = 2.6; // m
const BOARD_H = 1.3;
const BOARD_DEPTH = 0.09;
const BOARD_Y = 3.3; // centre, above the platform floor: clear of heads, under the canopy
const BOARD_X = 6.1; // from the station centreline: over the middle of the side platform
const BOARD_Z = [-52, 0, 52]; // along the platform
const BN_FONT = '"Noto Sans Bengali", "Kohinoor Bangla", "Nirmala UI", sans-serif';
const LED = '#ffb62e';
const LED_DIM = '#a8741a';

// Atlas layout, px. Two 512x256 faces on top, two rows of 80x112 glyph cells under them.
const ATLAS_W = 1024; const ATLAS_H = 512;
const FACE_W = 512; const FACE_H = 256;
const CELL_W = 80; const CELL_H = 112;
const GLYPHS = '0123456789: NOW';
const glyphCell = (ch) => { const i = Math.max(0, GLYPHS.indexOf(ch)); return { x: (i % 10) * CELL_W, y: FACE_H + Math.floor(i / 10) * CELL_H }; };
const BLACK = { x: 900, y: 440 }; // a texel that is always background, for the casing
// Where the countdown sits on a face, px.
const TIME_X = 352; const ROW_Y = [84, 126, 168, 210]; const ROW_H = 38; const CHAR_W = 29;

function drawFace(ctx, ox, northbound) {
  ctx.fillStyle = '#0a0b0c'; ctx.fillRect(ox, 0, FACE_W, FACE_H);
  ctx.fillStyle = '#15171a'; ctx.fillRect(ox + 6, 6, FACE_W - 12, FACE_H - 12);
  ctx.fillStyle = '#060707'; ctx.fillRect(ox + 10, 10, FACE_W - 20, FACE_H - 20);
  ctx.textBaseline = 'middle';
  // Header: where this side goes.
  ctx.fillStyle = '#1f6f4a'; ctx.fillRect(ox + 10, 10, FACE_W - 20, 56);
  ctx.fillStyle = '#f2f4ee'; ctx.textAlign = 'left';
  ctx.font = `700 25px ${BN_FONT}`; ctx.fillText(northbound ? 'উত্তরা উত্তর' : 'মতিঝিল', ox + 24, 30);
  ctx.font = '700 15px system-ui, sans-serif'; ctx.fillText(northbound ? 'TO UTTARA NORTH' : 'TO MOTIJHEEL', ox + 24, 53);
  ctx.textAlign = 'right';
  ctx.font = `600 17px ${BN_FONT}`; ctx.fillText('পরবর্তী ট্রেন', ox + FACE_W - 24, 30);
  ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText('NEXT TRAINS', ox + FACE_W - 24, 53);
  ctx.textAlign = 'left';
  ROW_Y.forEach((y, row) => {
    const mid = y + ROW_H / 2;
    if (row % 2 === 0) { ctx.fillStyle = '#0d0f10'; ctx.fillRect(ox + 10, y - 2, FACE_W - 20, ROW_H + 4); }
    ctx.shadowColor = LED; ctx.shadowBlur = 5;
    ctx.fillStyle = LED_DIM; ctx.font = '700 22px ui-monospace, Menlo, Consolas, monospace'; ctx.fillText(String(row + 1), ox + 24, mid);
    ctx.fillStyle = LED; ctx.font = '700 21px system-ui, sans-serif'; ctx.fillText(northbound ? 'Uttara North' : 'Motijheel', ox + 58, mid - 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = LED_DIM; ctx.font = `600 15px ${BN_FONT}`; ctx.fillText(northbound ? 'উত্তরা উত্তর' : 'মতিঝিল', ox + 200, mid);
  });
}

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W; canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#060707'; ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
    drawFace(ctx, 0, true);
    drawFace(ctx, FACE_W, false);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 96px ui-monospace, Menlo, Consolas, monospace';
    for (const ch of GLYPHS) {
      if (ch === ' ') continue;
      const cell = glyphCell(ch);
      ctx.shadowColor = LED; ctx.shadowBlur = 12; ctx.fillStyle = LED;
      ctx.fillText(ch, cell.x + CELL_W / 2, cell.y + CELL_H / 2 + 4, CELL_W - 6);
    }
    ctx.shadowBlur = 0;
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // The Bengali webfont arrives after first paint (index.html): redraw ONCE when it has.
  document.fonts?.load(`700 25px "Noto Sans Bengali"`, 'মতিঝিল').then((faces) => { if (faces?.length) { draw(); texture.needsUpdate = true; } }).catch(() => {});
  return texture;
}

const uvOf = (px, py, pw, ph) => [px / ATLAS_W, 1 - (py + ph) / ATLAS_H, (px + pw) / ATLAS_W, 1 - py / ATLAS_H];

/**
 * @param {{ stations: object[], timetable: object[], arrivals: Function }} metro the object buildMetro() returns
 */
export function createPlatformBoards(metro) {
  const group = new THREE.Group(); group.name = 'platform-boards';
  group.userData.cinematicIgnore = true; // src/cinematic-clearance.js: signage, not an obstacle
  if (!metro?.timetable?.length || !metro.stations?.length) return { group, update() {}, setDetailScale() {}, setQuality() {}, stats: { boards: 0 } };

  const material = new THREE.MeshBasicMaterial({ map: buildAtlas(), toneMapped: false }); // LEDs: unlit, same day and night
  const glyphUv = new Map([...GLYPHS].map((ch) => { const c = glyphCell(ch); return [ch, uvOf(c.x + 2, c.y + 2, CELL_W - 4, CELL_H - 4)]; }));
  const blackUv = uvOf(BLACK.x, BLACK.y, 4, 4);

  /** One mesh per (station, rail): three double-sided boards that all read the same. */
  function buildSide(northbound, side) {
    const pos = []; const uv = []; const idx = [];
    const glyphAt = []; // uv-attribute offset of every glyph quad, grouped [row][char] -> offsets across all faces
    for (let r = 0; r < ROWS; r++) { glyphAt.push([]); for (let c = 0; c < CHARS; c++) glyphAt[r].push([]); }
    const quad = (corners, rect) => {
      const base = pos.length / 3;
      for (const p of corners) pos.push(...p);
      uv.push(rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      return base * 2;
    };
    const faceUv = uvOf(northbound ? 0 : FACE_W, 0, FACE_W, FACE_H);
    const pxToM = BOARD_W / FACE_W;
    const x0 = side * BOARD_X;
    for (const z0 of BOARD_Z) {
      const top = BOARD_Y + BOARD_H / 2;
      // Both faces look along the platform, so they are read walking either way.
      for (const facing of [1, -1]) {
        const z = z0 + facing * BOARD_DEPTH / 2;
        // A face whose normal is +z is read by someone looking down -z, whose right hand is +x; the other face mirrors that.
        const xAt = (px) => (facing > 0 ? x0 - BOARD_W / 2 + px * pxToM : x0 + BOARD_W / 2 - px * pxToM);
        const yAt = (py) => top - py * pxToM;
        const rectAt = (px, py, pw, ph, lift) => {
          const zz = z + facing * lift;
          return [[xAt(px), yAt(py + ph), zz], [xAt(px + pw), yAt(py + ph), zz], [xAt(px + pw), yAt(py), zz], [xAt(px), yAt(py), zz]];
        };
        quad(rectAt(0, 0, FACE_W, FACE_H, 0), faceUv);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < CHARS; c++) {
          glyphAt[r][c].push(quad(rectAt(TIME_X + c * CHAR_W, ROW_Y[r] + 1, CHAR_W, ROW_H - 2, 0.004), glyphUv.get(' ')));
        }
      }
      // Casing edges and the two rods up to the canopy, all mapped to one black texel.
      const hw = BOARD_W / 2; const hd = BOARD_DEPTH / 2;
      const box = (cx, cy, cz, sx, sy, sz) => {
        const a = [cx - sx, cx + sx]; const b = [cy - sy, cy + sy]; const c = [cz - sz, cz + sz];
        quad([[a[0], b[1], c[0]], [a[1], b[1], c[0]], [a[1], b[1], c[1]], [a[0], b[1], c[1]]], blackUv); // top
        quad([[a[0], b[0], c[1]], [a[1], b[0], c[1]], [a[1], b[0], c[0]], [a[0], b[0], c[0]]], blackUv); // bottom
        quad([[a[0], b[0], c[0]], [a[0], b[0], c[1]], [a[0], b[1], c[1]], [a[0], b[1], c[0]]], blackUv); // -x
        quad([[a[1], b[0], c[1]], [a[1], b[0], c[0]], [a[1], b[1], c[0]], [a[1], b[1], c[1]]], blackUv); // +x
      };
      box(x0, BOARD_Y, z0, hw, BOARD_H / 2, hd);
      for (const rod of [-0.9, 0.9]) box(x0 + rod, top + 0.6, z0, 0.02, 0.6, 0.02);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? v + METRO.PLATFORM_Y : v)), 3));
    const uvAttribute = new THREE.Float32BufferAttribute(uv, 2);
    uvAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('uv', uvAttribute);
    geometry.setIndex(idx);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.material.side = THREE.DoubleSide; // rods and casing are seen from both sides; faces are 9 cm apart
    return { mesh, uvAttribute, glyphAt, shown: '' };
  }

  const stations = metro.stations.map((st, stationIndex) => {
    const holder = new THREE.Group();
    holder.name = `platform-boards:${st.name}`;
    holder.position.set(st.x, 0, st.z);
    holder.rotation.y = st.heading; // the same frame metro.js builds the station in
    holder.visible = false;
    const sides = [];
    for (const line of metro.timetable) {
      if (line.arriveAt[stationIndex] == null) continue;
      const built = buildSide(line.northbound, line.side[stationIndex]);
      built.lineIndex = line.lineIndex;
      holder.add(built.mesh);
      sides.push(built);
    }
    holder.updateMatrixWorld(true);
    holder.matrixAutoUpdate = false;
    for (const s of sides) s.mesh.matrixAutoUpdate = false;
    group.add(holder);
    return { st, stationIndex, holder, sides };
  });

  const clock = (eta) => {
    const s = Math.ceil(eta - 1e-6); // 0:01 for the whole last second, then NOW as the train stops
    const m = Math.min(99, Math.floor(s / 60));
    return `${m < 10 ? ' ' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
  };

  function write(side, rows) {
    const text = rows.join('|');
    if (text === side.shown) return;
    side.shown = text;
    const array = side.uvAttribute.array;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < CHARS; c++) {
      const rect = glyphUv.get((rows[r] ?? '     ')[c]) ?? glyphUv.get(' ');
      for (const at of side.glyphAt[r][c]) {
        array[at] = rect[0]; array[at + 1] = rect[1]; array[at + 2] = rect[2]; array[at + 3] = rect[1];
        array[at + 4] = rect[2]; array[at + 5] = rect[3]; array[at + 6] = rect[0]; array[at + 7] = rect[3];
      }
    }
    side.uvAttribute.needsUpdate = true;
  }

  let live = null;
  let due = 0; // `elapsed` at which the next digit changes
  let range = LIVE_RANGE;
  let lastElapsed = 0;

  /** @param {number} elapsed the SAME clock metro.update() is given @param {{x: number, z: number}} viewPos */
  function update(elapsed, viewPos) {
    let nearest = null; let best = range;
    for (const entry of stations) {
      const d = Math.hypot(entry.st.x - viewPos.x, entry.st.z - viewPos.z);
      if (d < best) { best = d; nearest = entry; }
    }
    if (nearest !== live) {
      if (live) live.holder.visible = false;
      live = nearest;
      if (live) live.holder.visible = true;
      due = 0;
    }
    if (!live) return;
    if (elapsed < lastElapsed) due = 0; // the clock was reset
    lastElapsed = elapsed;
    if (elapsed < due) return;

    let wait = 1;
    for (const side of live.sides) {
      const next = metro.arrivals(live.stationIndex, side.lineIndex, elapsed, ROWS);
      write(side, next.map((a) => (a.eta === 0 ? ' NOW ' : clock(a.eta))));
      // Sleep until the first thing on this board is due to change: a second rolling over, or a train leaving.
      for (const a of next) {
        const until = a.eta === 0 ? a.departsIn : a.eta - Math.floor(a.eta - 1e-6);
        if (until > 1e-4 && until < wait) wait = until;
      }
    }
    due = elapsed + wait + 1e-4;
  }

  return {
    group,
    update,
    /** @param {number} scale 0.5..1, from the perf governor's detail stage */
    setDetailScale(scale) { range = Math.max(200, LIVE_RANGE * scale); }, // never shorter than a platform's far end
    setQuality() {}, // two draw calls and a few hundred floats a second: nothing to cut
    stats: { boards: stations.reduce((n, s) => n + s.sides.length * BOARD_Z.length, 0) },
  };
}
