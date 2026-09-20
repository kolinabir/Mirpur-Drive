/**
 * map-raster.js
 *
 * Pre-rendered world bitmaps for the map system:
 *  - Whole-corridor base bitmap (day & night, 4096px cap, rendered ONCE)
 *  - Street-scale fine local patch for the corner minimap (re-rendered only
 *    when player strays >150m from the patch centre)
 */

export const METRO_GREEN = '#22c55e';

export const PALETTE = {
  day: {
    ground: '#14150f',
    building: 'rgba(110,104,88,0.55)',
    buildingPatch: 'rgba(110,104,88,0.6)',
  },
  night: {
    ground: '#050603',
    building: 'rgba(52,54,46,0.5)',
    buildingPatch: 'rgba(52,54,46,0.55)',
  },
};

export class MapRaster {
  /**
   * @param {object} scene parsed scene.json
   * @param {Array} stations
   */
  constructor(scene, stations) {
    this.scene = scene;
    this.stations = stations;

    const b = scene.meta.bounds;
    const pad = 40;
    this.minX = b.minX - pad;
    this.maxX = b.maxX + pad;
    this.minZ = b.minZ - pad;
    this.maxZ = b.maxZ + pad;
    this.worldW = this.maxX - this.minX;
    this.worldH = this.maxZ - this.minZ;

    // Whole-corridor base bitmap
    const BASE_MAX_DIM = 4096;
    this.baseMPP = Math.max(this.worldW, this.worldH) / BASE_MAX_DIM;
    this.base = document.createElement('canvas');
    this.base.width = Math.max(1, Math.round(this.worldW / this.baseMPP));
    this.base.height = Math.max(1, Math.round(this.worldH / this.baseMPP));

    this.baseNight = document.createElement('canvas');
    this.baseNight.width = this.base.width;
    this.baseNight.height = this.base.height;

    this._drawBase(this.base, false);
    this._drawBase(this.baseNight, true);
    // Release the shared mask's backing store; only needed while drawing.
    this._mask.width = this._mask.height = 0;
    this._mask = null;

    // Fine-resolution local patch for corner minimap
    this.MINI_PATCH_HALF = 350;       // metres
    this.MINI_PATCH_MPP = 0.4;        // metres per patch px
    this.MINI_PATCH_REGEN_DIST = 150; // regen threshold metres
    this.miniPatch = document.createElement('canvas');
    this.miniPatchNight = document.createElement('canvas');
    const patchPx = Math.round((this.MINI_PATCH_HALF * 2) / this.MINI_PATCH_MPP);
    this.miniPatch.width = patchPx;
    this.miniPatch.height = patchPx;
    this.miniPatchNight.width = patchPx;
    this.miniPatchNight.height = patchPx;
    this.miniPatchOriginX = null;
    this.miniPatchOriginZ = null;
  }

  toBase(x, z) {
    return [(x - this.minX) / this.baseMPP, (z - this.minZ) / this.baseMPP];
  }

  /**
   * Opaque silhouette of every building footprint at base resolution, shared
   * by the day and night bitmaps. Filled in batches: one path holding all
   * ~30k footprints takes ~2 s to rasterise per bitmap, batches take ~60 ms.
   * Opaque fills union cleanly, so compositing the mask once at the palette
   * alpha matches the old single-path fill.
   */
  _buildingMask(W, H) {
    if (this._mask) return this._mask;
    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const ctx = mask.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.beginPath();
    let count = 0;
    for (const bld of this.scene.buildings) {
      const n = bld.p.length / 2;
      if (n < 3) continue;
      for (let i = 0; i < n; i++) {
        const [px, py] = this.toBase(bld.p[i * 2], bld.p[i * 2 + 1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (++count % 256 === 0) {
        ctx.fill();
        ctx.beginPath();
      }
    }
    ctx.fill();
    this._mask = mask;
    return mask;
  }

  _drawBase(canvas, night) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pal = night ? PALETTE.night : PALETTE.day;

    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, W, H);

    // Buildings: composited from one shared opaque mask so overlapping
    // footprints never saturate the translucent fill (see _buildingMask).
    const [, rgb, alpha] = pal.building.match(/rgba\((\d+,\d+,\d+),([\d.]+)\)/);
    const mask = this._buildingMask(W, H);
    const mctx = mask.getContext('2d');
    mctx.globalCompositeOperation = 'source-in';
    mctx.fillStyle = `rgb(${rgb})`;
    mctx.fillRect(0, 0, W, H);
    mctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Number(alpha);
    ctx.drawImage(mask, 0, 0);
    ctx.globalAlpha = 1;

    // Roads, weighted by rank
    for (const r of this.scene.roads) {
      if (r.rank < 1) continue;
      ctx.strokeStyle = r.rank >= 4 ? 'rgba(232,224,192,0.95)' : r.rank === 3 ? 'rgba(202,194,166,0.72)' : 'rgba(150,144,128,0.4)';
      ctx.lineWidth = r.rank >= 4 ? 2.2 : r.rank === 3 ? 1.4 : 0.7;
      ctx.beginPath();
      r.pts.forEach((p, i) => {
        const [px, py] = this.toBase(p[0], p[1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Metro alignment
    ctx.strokeStyle = METRO_GREEN;
    ctx.lineWidth = 3;
    for (const t of this.scene.metro.tracks) {
      ctx.beginPath();
      t.pts.forEach((p, i) => {
        const [px, py] = this.toBase(p[0], p[1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Station blips
    for (const s of this.stations) {
      const [px, py] = this.toBase(s.x, s.z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = METRO_GREEN;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Coarse spatial index (GRID m cells -> building / road indices), built on
   * first use. A patch regen used to walk all ~30k footprints and every road
   * to find the few hundred in range, then fill them as ONE path — a 44 ms
   * stall every 150 m of travel, i.e. a visible hitch every few seconds in
   * the car. With the index the regen only touches the cells under the patch.
   */
  _index() {
    if (this._grid) return this._grid;
    const GRID = 100;
    const cells = new Map();
    const key = (cx, cz) => cx * 65536 + cz;
    const add = (kind, i, minX, minZ, maxX, maxZ) => {
      for (let cx = Math.floor(minX / GRID); cx <= Math.floor(maxX / GRID); cx++) {
        for (let cz = Math.floor(minZ / GRID); cz <= Math.floor(maxZ / GRID); cz++) {
          const k = key(cx, cz);
          let cell = cells.get(k);
          if (!cell) cells.set(k, (cell = { b: [], r: [] }));
          cell[kind].push(i);
        }
      }
    };
    this.scene.buildings.forEach((bld, i) => {
      const n = bld.p.length / 2;
      if (n < 3) return;
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (let j = 0; j < n; j++) {
        const x = bld.p[j * 2], z = bld.p[j * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      add('b', i, minX, minZ, maxX, maxZ);
    });
    this.scene.roads.forEach((r, i) => {
      if (r.rank < 1) return;
      // Per segment, so a long road only lands in the cells it crosses.
      for (let j = 1; j < r.pts.length; j++) {
        const a = r.pts[j - 1], b = r.pts[j];
        add('r', i, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
      }
    });
    this._grid = { GRID, cells, key };
    return this._grid;
  }

  /** Unique building / road indices whose cells overlap the given box. */
  _query(minX, minZ, maxX, maxZ) {
    const { GRID, cells, key } = this._index();
    const b = new Set();
    const r = new Set();
    for (let cx = Math.floor(minX / GRID); cx <= Math.floor(maxX / GRID); cx++) {
      for (let cz = Math.floor(minZ / GRID); cz <= Math.floor(maxZ / GRID); cz++) {
        const cell = cells.get(key(cx, cz));
        if (!cell) continue;
        for (const i of cell.b) b.add(i);
        for (const i of cell.r) r.add(i);
      }
    }
    return { b, r };
  }

  ensureMiniPatch(x, z) {
    if (this.miniPatchOriginX != null) {
      const cx = this.miniPatchOriginX + this.MINI_PATCH_HALF;
      const cz = this.miniPatchOriginZ + this.MINI_PATCH_HALF;
      if (Math.hypot(x - cx, z - cz) < this.MINI_PATCH_REGEN_DIST) return;
    }
    const originX = x - this.MINI_PATCH_HALF;
    const originZ = z - this.MINI_PATCH_HALF;
    this.miniPatchOriginX = originX;
    this.miniPatchOriginZ = originZ;
    this._renderMiniPatch(originX, originZ);
  }

  _renderMiniPatch(originX, originZ) {
    const dayCtx = this.miniPatch.getContext('2d');
    const nightCtx = this.miniPatchNight.getContext('2d');
    const W = this.miniPatch.width;
    const H = this.miniPatch.height;
    const mpp = this.MINI_PATCH_MPP;
    const maxX = originX + W * mpp;
    const maxZ = originZ + H * mpp;
    const pad = 20;
    const widthScale = this.baseMPP / mpp;
    const toPatch = (x, z) => [(x - originX) / mpp, (z - originZ) / mpp];
    const inRange = (px, pz) => px >= originX - pad && px <= maxX + pad && pz >= originZ - pad && pz <= maxZ + pad;

    for (const ctx of [dayCtx, nightCtx]) ctx.clearRect(0, 0, W, H);
    dayCtx.fillStyle = PALETTE.day.ground;
    dayCtx.fillRect(0, 0, W, H);
    nightCtx.fillStyle = PALETTE.night.ground;
    nightCtx.fillRect(0, 0, W, H);

    const near = this._query(originX - pad, originZ - pad, maxX + pad, maxZ + pad);

    // Buildings. Filled in batches: one path holding every footprint is far
    // slower to rasterise than several short ones (see _buildingMask).
    dayCtx.fillStyle = PALETTE.day.buildingPatch;
    nightCtx.fillStyle = PALETTE.night.buildingPatch;
    dayCtx.beginPath();
    nightCtx.beginPath();
    let batched = 0;
    for (const bi of near.b) {
      const bld = this.scene.buildings[bi];
      const n = bld.p.length / 2;
      let hit = false;
      for (let i = 0; i < n; i++) {
        if (inRange(bld.p[i * 2], bld.p[i * 2 + 1])) { hit = true; break; }
      }
      if (!hit) continue;
      for (const ctx of [dayCtx, nightCtx]) {
        for (let i = 0; i < n; i++) {
          const [px, py] = toPatch(bld.p[i * 2], bld.p[i * 2 + 1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      if (++batched % 128 === 0) {
        dayCtx.fill();
        nightCtx.fill();
        dayCtx.beginPath();
        nightCtx.beginPath();
      }
    }
    dayCtx.fill();
    nightCtx.fill();

    // Roads
    // Scene order, so wider roads still paint over the lanes beneath them.
    for (const ri of [...near.r].sort((a, b) => a - b)) {
      const r = this.scene.roads[ri];
      let hit = false;
      for (const p of r.pts) {
        if (inRange(p[0], p[1])) { hit = true; break; }
      }
      if (!hit) continue;
      const stroke = r.rank >= 4 ? 'rgba(232,224,192,0.95)' : r.rank === 3 ? 'rgba(202,194,166,0.72)' : 'rgba(150,144,128,0.45)';
      const lw = (r.rank >= 4 ? 2.6 : r.rank === 3 ? 1.7 : 0.9) * widthScale;
      for (const ctx of [dayCtx, nightCtx]) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.beginPath();
        r.pts.forEach((p, i) => {
          const [px, py] = toPatch(p[0], p[1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    }

    // Metro
    for (const ctx of [dayCtx, nightCtx]) {
      ctx.strokeStyle = METRO_GREEN;
      ctx.lineWidth = 3 * widthScale;
    }
    for (const t of this.scene.metro.tracks) {
      let hit = false;
      for (const p of t.pts) {
        if (inRange(p[0], p[1])) { hit = true; break; }
      }
      if (!hit) continue;
      for (const ctx of [dayCtx, nightCtx]) {
        ctx.beginPath();
        t.pts.forEach((p, i) => {
          const [px, py] = toPatch(p[0], p[1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    }
  }
}
