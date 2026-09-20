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

    // Buildings
    dayCtx.beginPath();
    nightCtx.beginPath();
    for (const bld of this.scene.buildings) {
      const n = bld.p.length / 2;
      if (n < 3) continue;
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
    }
    dayCtx.fillStyle = PALETTE.day.buildingPatch;
    dayCtx.fill();
    nightCtx.fillStyle = PALETTE.night.buildingPatch;
    nightCtx.fill();

    // Roads
    for (const r of this.scene.roads) {
      if (r.rank < 1) continue;
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
