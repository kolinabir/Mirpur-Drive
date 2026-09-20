/**
 * fullmap-view.js
 *
 * Full-screen GTA pause map:
 *  - Real cursor-anchored wheel zoom & momentum drag-pan
 *  - Right-click & double-click to drop/move GPS waypoints
 *  - Road-network GPS navigation route line with animated flow chevrons
 *  - Instant Teleport to waypoint (T key, [⚡ Teleport] button, Shift+Click)
 *  - Animated destination beacon & ETA stats
 *  - Cross-district overview underlay & collision-avoiding labels
 */

import { METRO_GREEN } from './map-raster.js';
import { resolveDistrict, districtForCoord } from '../districts.js';

export class FullmapView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./map-raster.js').MapRaster} raster
   * @param {import('./navigation.js').NavigationManager} navigation
   * @param {Array} stations
   */
  constructor(canvas, raster, navigation, stations) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.raster = raster;
    this.navigation = navigation;
    this.stations = stations;
    this.onTeleport = null; // callback (x, z)

    // View boundaries
    this.fullMinX = raster.minX;
    this.fullMaxX = raster.maxX;
    this.fullMinZ = raster.minZ;
    this.fullMaxZ = raster.maxZ;

    // Zoom & Pan state
    this.minMpp = 0.5; // metres per pixel (allows zooming in to 50m scale bar / street block level)
    this.maxMpp = 12.0;
    this.mpp = 8.0;
    this.centerX = (raster.minX + raster.maxX) / 2;
    this.centerZ = (raster.minZ + raster.maxZ) / 2;

    // Smooth animation targets
    this._targetMpp = this.mpp;
    this._targetCenterX = this.centerX;
    this._targetCenterZ = this.centerZ;
    this._zoomPanTau = 0.12;
    this._lastAnimT = null;
    this._userMovedView = false;

    // Drag & inertia
    this._drag = null;
    this._justDragged = false;
    this._velocityX = 0;
    this._velocityZ = 0;
    this._teleportBtnBox = null;
    this._offscreenPlayerBox = null;

    // Overview
    this._overview = null;
    this._labelBoxes = [];
    try {
      this._districtKey = resolveDistrict().district.key;
    } catch {
      this._districtKey = null;
    }
    this._loadOverview();

    // DOM elements
    this.scaleBarEl = document.getElementById('map-scale-bar');
    this.scaleLabelEl = document.getElementById('map-scale-label');
    this.wpEl = document.getElementById('map-waypoint');
    this.wpBearingEl = document.getElementById('map-waypoint-bearing');
    this.wpDistEl = document.getElementById('map-waypoint-dist');

    this._attachInput();
  }

  async _loadOverview() {
    try {
      const res = await fetch('map-overview.json');
      if (!res.ok) return;
      const data = await res.json();
      this._overview = data;
      if (data.track && data.track.length) {
        let minX = this.raster.minX, maxX = this.raster.maxX, minZ = this.raster.minZ, maxZ = this.raster.maxZ;
        for (const [x, z] of data.track) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
        const pad = 200;
        this.fullMinX = minX - pad;
        this.fullMaxX = maxX + pad;
        this.fullMinZ = minZ - pad;
        this.fullMaxZ = maxZ + pad;
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Set default 50m zoom centered on the player position.
   * 50m is also locked as the minimum zoom limit (minMpp).
   */
  setDefault50m(playerPos) {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssScale = (rect && rect.width > 0) ? (rect.width / this.canvas.width) : (1 / dpr);
    // 50m minimum zoom: 50m on map renders as ~80px scale bar on screen
    // cssPxPerMetre = (1 / mpp) * cssScale = 1.6 => mpp = cssScale / 1.6
    const targetMpp = Math.max(0.05, cssScale / 1.6);
    this.minMpp = targetMpp;

    const size = this.canvas.width;
    const w = this.fullMaxX - this.fullMinX;
    const h = this.fullMaxZ - this.fullMinZ;
    this.maxMpp = Math.max(targetMpp * 2, Math.max(w / size, h / size));

    this.mpp = targetMpp;
    this._targetMpp = targetMpp;
    const target = playerPos || this._currentPlayerPos;
    if (target) {
      this.centerX = target.x;
      this.centerZ = target.z;
      this._targetCenterX = target.x;
      this._targetCenterZ = target.z;
      this._clampCenter();
      this._clampTarget();
    }
    this._userMovedView = false;
  }

  fitFull(smooth = false) {
    const size = this.canvas.width;
    const w = this.fullMaxX - this.fullMinX;
    const h = this.fullMaxZ - this.fullMinZ;
    this.maxMpp = Math.max(this.minMpp * 2, Math.max(w / size, h / size));
    if (!smooth) {
      this.mpp = this.maxMpp;
      this.centerX = (this.fullMinX + this.fullMaxX) / 2;
      this.centerZ = (this.fullMinZ + this.fullMaxZ) / 2;
      this._targetMpp = this.mpp;
      this._targetCenterX = this.centerX;
      this._targetCenterZ = this.centerZ;
    } else {
      this._targetMpp = this.maxMpp;
      this._targetCenterX = (this.fullMinX + this.fullMaxX) / 2;
      this._targetCenterZ = (this.fullMinZ + this.fullMaxZ) / 2;
      this._clampTarget();
      this._userMovedView = true;
    }
  }

  _clampTarget() {
    const w = this.fullMaxX - this.fullMinX;
    const h = this.fullMaxZ - this.fullMinZ;
    const mx = w * 0.35;
    const mz = h * 0.35;
    this._targetCenterX = Math.min(this.fullMaxX + mx, Math.max(this.fullMinX - mx, this._targetCenterX));
    this._targetCenterZ = Math.min(this.fullMaxZ + mz, Math.max(this.fullMinZ - mz, this._targetCenterZ));
  }

  _clampCenter() {
    const w = this.fullMaxX - this.fullMinX;
    const h = this.fullMaxZ - this.fullMinZ;
    const mx = w * 0.35;
    const mz = h * 0.35;
    this.centerX = Math.min(this.fullMaxX + mx, Math.max(this.fullMinX - mx, this.centerX));
    this.centerZ = Math.min(this.fullMaxZ + mz, Math.max(this.fullMinZ - mz, this.centerZ));
  }

  recenter(playerPos) {
    if (!playerPos) return;
    this._targetCenterX = playerPos.x;
    this._targetCenterZ = playerPos.z;
    this._clampTarget();
    this._userMovedView = true;
  }

  zoomBy(factor) {
    this._targetMpp = Math.min(this.maxMpp, Math.max(this.minMpp, this._targetMpp * factor));
    this._userMovedView = true;
  }

  w2s(x, z, size, destPxPerMetre) {
    return [
      size / 2 + (x - this.centerX) * destPxPerMetre,
      size / 2 + (z - this.centerZ) * destPxPerMetre,
    ];
  }

  s2w(sx, sy, size, mpp) {
    return [
      this.centerX + (sx - size / 2) * mpp,
      this.centerZ + (sy - size / 2) * mpp,
    ];
  }

  teleportTo(x, z, name = null) {
    if (!name && this.navigation.waypoint && Math.hypot(this.navigation.waypoint.x - x, this.navigation.waypoint.z - z) < 25) {
      name = this.navigation.waypoint.name;
    }
    this.navigation.playSound('teleport');
    if (this.onTeleport) {
      this.onTeleport(x, z, name);
    }
  }

  updateAndDraw(playerPos, playerYaw, night = 0) {
    const now = performance.now();
    if (this._lastAnimT != null) {
      const dt = Math.min(0.25, (now - this._lastAnimT) / 1000);
      if (dt > 0) {
        if (!this._drag && (Math.abs(this._velocityX) > 0.1 || Math.abs(this._velocityZ) > 0.1)) {
          this._targetCenterX += this._velocityX * dt;
          this._targetCenterZ += this._velocityZ * dt;
          this._velocityX *= Math.exp(-dt / 0.18);
          this._velocityZ *= Math.exp(-dt / 0.18);
          this._clampTarget();
        }

        const alpha = 1 - Math.exp(-dt / this._zoomPanTau);
        this.mpp += (this._targetMpp - this.mpp) * alpha;
        this.centerX += (this._targetCenterX - this.centerX) * alpha;
        this.centerZ += (this._targetCenterZ - this.centerZ) * alpha;
        if (Math.abs(this.mpp - this._targetMpp) < 0.002) this.mpp = this._targetMpp;
        if (Math.abs(this.centerX - this._targetCenterX) < 0.05) this.centerX = this._targetCenterX;
        if (Math.abs(this.centerZ - this._targetCenterZ) < 0.05) this.centerZ = this._targetCenterZ;
      }
    }
    this._lastAnimT = now;

    this.draw(playerPos, playerYaw, night);
  }

  draw(playerPos, playerYaw, night = 0) {
    const ctx = this.ctx;
    const size = this.canvas.width;
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#0a0d0a';
    ctx.fillRect(0, 0, size, size);

    const destPxPerMetre = 1 / this.mpp;
    this._labelBoxes = [];
    this._teleportBtnBox = null;

    // 1. Cross-district overview layer underlay
    this._drawOverviewLayer(ctx, size, destPxPerMetre);

    // 2. Loaded district base bitmap
    const destPxPerBasePx = destPxPerMetre * this.raster.baseMPP;
    const [cbx, cbz] = this.raster.toBase(this.centerX, this.centerZ);

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(destPxPerBasePx, destPxPerBasePx);
    ctx.translate(-cbx, -cbz);

    ctx.drawImage(this.raster.base, 0, 0);
    if (night > 0.001) {
      ctx.globalAlpha = night;
      ctx.drawImage(this.raster.baseNight, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 3. GPS Navigation Route Line with animated flow chevrons
    const wp = this.navigation.waypoint;
    if (wp && wp.pathPts && wp.pathPts.length > 1) {
      this._drawNavRoute(ctx, size, destPxPerMetre, wp);
    }

    // 4. District Station Blips & Names
    this._drawStations(ctx, size, destPxPerMetre);

    // 5. Curated Place & Road Labels
    this._drawPlaceLabels(ctx, size, destPxPerMetre);
    this._drawRoadLabels(ctx, size, destPxPerMetre);

    // 6. Waypoint Destination Pin & Tag with [⚡ Teleport] action
    if (wp) {
      this._drawWaypoint(ctx, size, destPxPerMetre, wp);
    }

    // 7. Player Indicator (Top layer with prominent marker and offscreen radar beacon)
    if (playerPos) {
      const [psx, psy] = this.w2s(playerPos.x, playerPos.z, size, destPxPerMetre);
      const margin = 36;
      const isOffscreen = psx < margin || psx > size - margin || psy < margin || psy > size - margin;
      if (isOffscreen) {
        this._drawOffscreenPlayer(ctx, size, psx, psy, playerYaw, playerPos);
      } else {
        this._drawPlayerMarker(ctx, psx, psy, playerYaw, size);
      }
    }

    // 8. Scale bar & HUD
    this._updateScaleBar();
    this._updateWaypointHUD();
  }

  _drawNavRoute(ctx, size, destPxPerMetre, wp) {
    const pts = wp.pathPts;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const spts = [];
    for (let i = 0; i < pts.length; i++) {
      spts.push(this.w2s(pts[i][0], pts[i][1], size, destPxPerMetre));
    }

    // Outer glow
    ctx.strokeStyle = 'rgba(192, 38, 211, 0.45)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let i = 0; i < spts.length; i++) {
      if (i === 0) ctx.moveTo(spts[i][0], spts[i][1]);
      else ctx.lineTo(spts[i][0], spts[i][1]);
    }
    ctx.stroke();

    // Solid neon magenta core
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Animated directional flow chevrons
    const now = performance.now();
    const animOffset = (now * 0.025) % 32;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;

    let distAccum = 0;
    let nextMarker = 16 - animOffset;

    for (let i = 0; i < spts.length - 1; i++) {
      const p1 = spts[i];
      const p2 = spts[i + 1];
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (segLen < 0.001) continue;

      const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);

      while (distAccum + segLen >= nextMarker) {
        const t = (nextMarker - distAccum) / segLen;
        const mx = p1[0] + (p2[0] - p1[0]) * t;
        const my = p1[1] + (p2[1] - p1[1]) * t;

        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-4, -3.5);
        ctx.lineTo(3, 0);
        ctx.lineTo(-4, 3.5);
        ctx.stroke();
        ctx.restore();

        nextMarker += 32;
      }
      distAccum += segLen;
    }

    ctx.restore();
  }

  _drawWaypoint(ctx, size, destPxPerMetre, wp) {
    const [wx, wy] = this.w2s(wp.x, wp.z, size, destPxPerMetre);

    // Animated pulse ring
    const pulse = 1 + 0.25 * Math.sin(performance.now() * 0.005);
    ctx.fillStyle = 'rgba(217, 70, 239, 0.3)';
    ctx.beginPath();
    ctx.arc(wx, wy, 16 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Central diamond pin
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#d946ef';
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-7, -7, 14, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Destination Tag Card with [⚡ Teleport] button
    const label = wp.name || 'Waypoint';
    const distStr = wp.roadDist >= 1000 ? `${(wp.roadDist / 1000).toFixed(2)} km` : `${Math.round(wp.roadDist)} m`;
    const tagText = `${label} (${distStr} • ${wp.etaDrive})`;

    ctx.save();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const pad = 8;
    const tw = ctx.measureText(tagText).width;
    // [⚡ Teleport / Travel] pill button
    const isOtherDistrict = districtForCoord(wp.x, wp.z) !== this._districtKey;
    const teleWidth = isOtherDistrict ? 92 : 85;
    const totalW = tw + teleWidth + pad * 3;

    // Card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(wx + 14, wy - 15, totalW, 30, 7);
    ctx.fill();
    ctx.stroke();

    // Text info
    ctx.fillStyle = '#fdf4ff';
    ctx.fillText(tagText, wx + 14 + pad, wy);

    // [⚡ Teleport / Travel] pill button
    const teleX = wx + 14 + pad + tw + pad;
    const teleY = wy - 10;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(teleX, teleY, teleWidth, 20, 5);
    ctx.fill();

    ctx.fillStyle = '#082f49';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText(isOtherDistrict ? '⚡ Travel (T)' : '⚡ Teleport (T)', teleX + 6, wy);

    // Register button bounds for click
    this._teleportBtnBox = {
      x1: teleX,
      y1: teleY,
      x2: teleX + teleWidth,
      y2: teleY + 20,
      x: wp.x,
      z: wp.z,
      name: wp.name,
    };

    ctx.restore();
  }

  _drawStations(ctx, size, destPxPerMetre) {
    ctx.font = '600 13px system-ui, sans-serif';
    for (const s of this.stations) {
      const [sx, sy] = this.w2s(s.x, s.z, size, destPxPerMetre);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = METRO_GREEN;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
      this._drawLabel(ctx, s.name, sx + 8, sy + 4, {
        font: '600 13px system-ui, sans-serif',
        force: true,
      });
    }
  }

  _drawPlayerMarker(ctx, x, y, yaw, size) {
    this._offscreenPlayerBox = null;
    const now = performance.now();
    // Prominent radius: between 18 and 28px (over 2x larger than the old 10px arrow)
    const r = Math.max(18, Math.round(size * 0.024));

    ctx.save();

    // 1. Sonar ripple pulse waves (instantly catches the eye)
    const wavePhase1 = (now * 0.0012) % 1;
    const waveR1 = r * (0.8 + wavePhase1 * 2.2);
    const waveAlpha1 = (1 - wavePhase1) * 0.55;
    ctx.strokeStyle = `rgba(56, 189, 248, ${waveAlpha1})`;
    ctx.fillStyle = `rgba(56, 189, 248, ${waveAlpha1 * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, waveR1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const wavePhase2 = ((now * 0.0012) + 0.5) % 1;
    const waveR2 = r * (0.8 + wavePhase2 * 2.2);
    const waveAlpha2 = (1 - wavePhase2) * 0.55;
    ctx.strokeStyle = `rgba(56, 189, 248, ${waveAlpha2})`;
    ctx.fillStyle = `rgba(56, 189, 248, ${waveAlpha2 * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, waveR2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. High-contrast dark backing disc with vibrant cyan rim
    ctx.fillStyle = 'rgba(10, 18, 30, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Directional Player Chevron / Arrow
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);

    // Thick dark border for silhouette contrast
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.95);
    ctx.lineTo(r * 0.68, r * 0.72);
    ctx.lineTo(0, r * 0.35);
    ctx.lineTo(-r * 0.68, r * 0.72);
    ctx.closePath();
    ctx.stroke();

    // Bright neon cyan fill
    ctx.fillStyle = '#00f0ff';
    ctx.fill();

    // Inner bright white directional core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(r * 0.22, r * 0.4);
    ctx.lineTo(0, r * 0.2);
    ctx.lineTo(-r * 0.22, r * 0.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 4. "YOU" Pill Badge above the arrow
    const badgeW = 40;
    const badgeH = 18;
    const badgeY = y - r * 1.05 - badgeH - 5;
    const badgeX = x - badgeW / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YOU', x, badgeY + badgeH / 2);

    ctx.restore();
  }

  _drawOffscreenPlayer(ctx, size, psx, psy, playerYaw, playerPos) {
    const margin = 36;
    const cx = size / 2;
    const cy = size / 2;
    const dx = psx - cx;
    const dy = psy - cy;
    const angle = Math.atan2(dy, dx);

    // Clamp to canvas edge margin
    const halfW = size / 2 - margin;
    const halfH = size / 2 - margin;
    const scaleX = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : 1;
    const scaleY = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : 1;
    const edgeScale = Math.min(scaleX, scaleY);

    const edgeX = cx + dx * edgeScale;
    const edgeY = cy + dy * edgeScale;

    const now = performance.now();
    const pulse = 1 + 0.22 * Math.sin(now * 0.006);

    ctx.save();

    // Pulse halo
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(edgeX, edgeY, 20 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Backing circle
    ctx.fillStyle = 'rgba(10, 18, 30, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(edgeX, edgeY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pointer chevron pointing towards offscreen player
    ctx.save();
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);
    ctx.fillStyle = '#00f0ff';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Distance string & "YOU" tag
    const distMetres = Math.hypot(playerPos.x - this.centerX, playerPos.z - this.centerZ);
    const distStr = distMetres >= 1000 ? `${(distMetres / 1000).toFixed(1)} km` : `${Math.round(distMetres)} m`;
    const tagText = `YOU • ${distStr}`;
    ctx.font = '700 11px system-ui, sans-serif';
    const tw = ctx.measureText(tagText).width;
    const tagW = tw + 16;
    const tagH = 22;

    let tx = edgeX - tagW / 2;
    let ty = edgeY + (dy > 0 ? -30 : 18);
    tx = Math.max(10, Math.min(size - tagW - 10, tx));
    ty = Math.max(10, Math.min(size - tagH - 10, ty));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tagW, tagH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, tx + tagW / 2, ty + tagH / 2);

    this._offscreenPlayerBox = {
      x1: Math.min(tx, edgeX - 16),
      y1: Math.min(ty, edgeY - 16),
      x2: Math.max(tx + tagW, edgeX + 16),
      y2: Math.max(ty + tagH, edgeY + 16),
    };

    ctx.restore();
  }

  _drawOverviewLayer(ctx, size, destPxPerMetre) {
    const ov = this._overview;
    if (!ov) return;
    const w2s = (x, z) => this.w2s(x, z, size, destPxPerMetre);

    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#173330';
    ctx.beginPath();
    for (const wa of ov.water.areas) {
      for (let i = 0; i < wa.p.length; i += 2) {
        const [sx, sy] = w2s(wa.p[i], wa.p[i + 1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(202,194,166,0.5)';
    for (const r of ov.roads) {
      ctx.lineWidth = r.rank >= 5 ? 2 : 1.2;
      ctx.beginPath();
      r.pts.forEach((p, i) => {
        const [sx, sy] = w2s(p[0], p[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(34,197,94,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ov.track.forEach((p, i) => {
      const [sx, sy] = w2s(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();

    if (ov.gap) {
      const seg = ov.track.slice(ov.gap.startIndex, ov.gap.endIndex + 1);
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(148,163,184,0.75)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      seg.forEach((p, i) => {
        const [sx, sy] = w2s(p[0], p[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    const localNames = new Set(this.stations.map((s) => s.name));
    for (const s of ov.stations) {
      if (localNames.has(s.name)) continue;
      const [sx, sy] = w2s(s.x, s.z);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = METRO_GREEN;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      this._drawLabel(ctx, s.name, sx + 7, sy + 4, {
        font: '600 12px system-ui, sans-serif',
        color: 'rgba(255,255,255,0.75)',
        stroke: 'rgba(0,0,0,0.7)',
      });
    }

    for (const s of ov.gapStations || []) {
      const [sx, sy] = w2s(s.x, s.z);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(148,163,184,0.85)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this._drawLabel(ctx, `${s.name} (not built)`, sx + 7, sy + 4, {
        font: '500 11px system-ui, sans-serif',
        color: 'rgba(148,163,184,0.9)',
        stroke: 'rgba(0,0,0,0.7)',
      });
    }
  }

  _visibleWorldRect(size, marginPx = 60) {
    const halfW = (size / 2 + marginPx) * this.mpp;
    const halfH = (size / 2 + marginPx) * this.mpp;
    return {
      minX: this.centerX - halfW, maxX: this.centerX + halfW,
      minZ: this.centerZ - halfH, maxZ: this.centerZ + halfH,
    };
  }

  _drawLabel(ctx, text, x, y, opts = {}) {
    const font = opts.font || '600 12px system-ui, sans-serif';
    ctx.font = font;
    const w = ctx.measureText(text).width;
    const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
    const h = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
    const pad = 2;
    const box = { x1: x - pad, y1: y - h - pad, x2: x + w + pad, y2: y + pad };
    if (!opts.force) {
      for (const b of this._labelBoxes) {
        if (box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1) return false;
      }
    }
    this._labelBoxes.push(box);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = opts.strokeWidth || 3;
    ctx.strokeStyle = opts.stroke || 'rgba(0,0,0,0.82)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = opts.color || '#ffffff';
    ctx.fillText(text, x, y);
    return true;
  }

  _labelScoreThreshold() {
    const span = this.maxMpp - this.minMpp;
    const t = span > 0 ? Math.min(1, Math.max(0, (this.mpp - this.minMpp) / span)) : 0;
    return t * 85;
  }

  _drawPlaceLabels(ctx, size, destPxPerMetre) {
    const ov = this._overview;
    if (!ov) return;
    const rect = this._visibleWorldRect(size);
    const threshold = this._labelScoreThreshold();
    const candidates = ov.places
      .filter((p) => p.score >= threshold && p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ)
      .sort((a, b) => b.score - a.score);
    for (const p of candidates) {
      const local = p.district === this._districtKey;
      const [sx, sy] = this.w2s(p.x, p.z, size, destPxPerMetre);
      const dotR = p.kind === 'university' || p.kind === 'college' ? 3.2 : 2.4;
      ctx.globalAlpha = local ? 1 : 0.55;
      ctx.fillStyle = local ? '#ffe08a' : 'rgba(255,224,138,0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      this._drawLabel(ctx, p.name, sx + 6, sy + 4, {
        font: local ? '600 12px system-ui, sans-serif' : '500 11px system-ui, sans-serif',
        color: local ? '#ffffff' : 'rgba(255,255,255,0.68)',
        stroke: local ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.6)',
      });
    }
  }

  _drawRoadLabels(ctx, size, destPxPerMetre) {
    const rect = this._visibleWorldRect(size);
    const readableAtStreetLevel = this.mpp < 22;

    if (this._overview) {
      const wide = !readableAtStreetLevel;
      for (const r of this._overview.roads) {
        if (!r.name) continue;
        if (r.district === this._districtKey && !wide) continue;
        const mid = r.pts[Math.floor(r.pts.length / 2)];
        if (!mid || mid[0] < rect.minX || mid[0] > rect.maxX || mid[1] < rect.minZ || mid[1] > rect.maxZ) continue;
        const local = r.district === this._districtKey;
        const [sx, sy] = this.w2s(mid[0], mid[1], size, destPxPerMetre);
        this._drawLabel(ctx, r.name, sx, sy, {
          font: '600 11px system-ui, sans-serif',
          color: local ? 'rgba(232,224,192,0.9)' : 'rgba(232,224,192,0.5)',
          stroke: 'rgba(0,0,0,0.75)',
        });
      }
    }

    if (readableAtStreetLevel && this.raster.scene && this.raster.scene.roads) {
      const named = this.raster.scene.roads
        .filter((r) => r.rank >= 2 && r.name)
        .filter((r) => {
          const mid = r.pts[Math.floor(r.pts.length / 2)];
          return mid && mid[0] >= rect.minX && mid[0] <= rect.maxX && mid[1] >= rect.minZ && mid[1] <= rect.maxZ;
        })
        .sort((a, b) => b.rank - a.rank);
      for (const r of named) {
        const mid = r.pts[Math.floor(r.pts.length / 2)];
        const [sx, sy] = this.w2s(mid[0], mid[1], size, destPxPerMetre);
        this._drawLabel(ctx, r.name, sx, sy, {
          font: '600 11px system-ui, sans-serif',
          color: 'rgba(232,224,192,0.92)',
          stroke: 'rgba(0,0,0,0.78)',
        });
      }
    }
  }

  _updateScaleBar() {
    if (!this.scaleBarEl || !this.scaleLabelEl) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssScale = (rect && rect.width > 0) ? (rect.width / this.canvas.width) : (1 / dpr);
    const cssPxPerMetre = (1 / this.mpp) * cssScale;

    // Minimum scale bar distance is 50m
    const nice = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
    let chosen = nice[0];
    for (const s of nice) {
      chosen = s;
      if (s * cssPxPerMetre >= 60) break;
    }
    const widthPx = Math.max(2, Math.round(chosen * cssPxPerMetre));
    this.scaleBarEl.style.width = `${widthPx}px`;
    this.scaleLabelEl.textContent = chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m`;
  }

  _updateWaypointHUD() {
    const wp = this.navigation.waypoint;
    if (wp && this.wpEl) {
      if (this.wpBearingEl) this.wpBearingEl.textContent = `${wp.bearing}°`;
      if (this.wpDistEl) {
        const d = wp.roadDist;
        this.wpDistEl.textContent = d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`;
      }
      this.wpEl.classList.remove('hidden');
    } else if (this.wpEl) {
      this.wpEl.classList.add('hidden');
    }
  }

  _attachInput() {
    const canvas = this.canvas;

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Right-click or Double-click drops / moves / clears waypoint
    canvas.addEventListener('mousedown', (e) => {
      if (!canvas.classList.contains('expanded')) return;
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        this._handleMarkClick(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('dblclick', (e) => {
      if (canvas.classList.contains('expanded')) {
        e.preventDefault();
        e.stopPropagation();
        this._handleMarkClick(e.clientX, e.clientY);
      }
    });

    // Left click handling: Check teleport button or station click
    canvas.addEventListener('click', (e) => {
      if (!canvas.classList.contains('expanded')) return;
      if (this._justDragged) {
        this._justDragged = false;
        e.stopImmediatePropagation();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const size = canvas.width;
      const sx = (e.clientX - rect.left) * (size / rect.width);
      const sy = (e.clientY - rect.top) * (size / rect.height);

      // 1. Check if clicking [⚡ Teleport] pill button on waypoint card
      if (this._teleportBtnBox) {
        const b = this._teleportBtnBox;
        if (sx >= b.x1 && sx <= b.x2 && sy >= b.y1 && sy <= b.y2) {
          e.stopImmediatePropagation();
          this.teleportTo(b.x, b.z, b.name);
          return;
        }
      }

      // 1b. Check if clicking offscreen player beacon to recenter
      if (this._offscreenPlayerBox) {
        const b = this._offscreenPlayerBox;
        if (sx >= b.x1 && sx <= b.x2 && sy >= b.y1 && sy <= b.y2) {
          e.stopImmediatePropagation();
          this.recenter(this._currentPlayerPos);
          return;
        }
      }

      // 2. Shift+Click or Alt+Click = Quick Teleport to clicked point
      if (e.shiftKey || e.altKey) {
        const [wx, wz] = this.s2w(sx, sy, size, this.mpp);
        e.stopImmediatePropagation();
        this.teleportTo(wx, wz);
        return;
      }

      // 3. Station click -> set waypoint
      const destPxPerMetre = 1 / this.mpp;
      for (const s of this.stations) {
        const [ssx, ssy] = this.w2s(s.x, s.z, size, destPxPerMetre);
        if (Math.hypot(sx - ssx, sy - ssy) < 18) {
          this.navigation.setWaypoint(s.x, s.z, s.name, this._currentPlayerPos);
          e.stopImmediatePropagation();
          return;
        }
      }
    });

    // Cursor-anchored wheel zoom
    canvas.addEventListener('wheel', (e) => {
      if (!canvas.classList.contains('expanded')) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const size = canvas.width;
      const sx = (e.clientX - rect.left) * (size / rect.width);
      const sy = (e.clientY - rect.top) * (size / rect.height);

      const [worldX, worldZ] = this.s2w(sx, sy, size, this.mpp);
      const factor = Math.exp(e.deltaY * 0.0018);
      this._targetMpp = Math.min(this.maxMpp, Math.max(this.minMpp, this._targetMpp * factor));

      const newDestPxPerMetre = 1 / this._targetMpp;
      this._targetCenterX = worldX - (sx - size / 2) / newDestPxPerMetre;
      this._targetCenterZ = worldZ - (sy - size / 2) / newDestPxPerMetre;
      this._clampTarget();
      this._userMovedView = true;
    }, { passive: false });

    // Drag-pan
    canvas.addEventListener('mousedown', (e) => {
      if (!canvas.classList.contains('expanded') || e.button !== 0) return;
      this._drag = { x: e.clientX, y: e.clientY, moved: false, lastT: performance.now() };
      this._velocityX = 0;
      this._velocityZ = 0;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._drag || !canvas.classList.contains('expanded')) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._drag.moved = true;
      if (!this._drag.moved) return;

      const now = performance.now();
      const dt = Math.max(0.001, (now - this._drag.lastT) / 1000);
      const rect = canvas.getBoundingClientRect();
      const worldPerScreenPx = this.mpp * (canvas.width / rect.width);

      const dWorldX = -dx * worldPerScreenPx;
      const dWorldZ = -dy * worldPerScreenPx;

      this.centerX += dWorldX;
      this.centerZ += dWorldZ;
      this._clampCenter();
      this._targetCenterX = this.centerX;
      this._targetCenterZ = this.centerZ;

      this._velocityX = dWorldX / dt * 0.35;
      this._velocityZ = dWorldZ / dt * 0.35;

      this._drag.x = e.clientX;
      this._drag.y = e.clientY;
      this._drag.lastT = now;
      this._userMovedView = true;
    });

    window.addEventListener('mouseup', () => {
      if (this._drag?.moved) this._justDragged = true;
      this._drag = null;
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!canvas.classList.contains('expanded')) return;
      const step = 45 * this.mpp;
      switch (e.code) {
        case 'KeyT':
          // Teleport to waypoint
          if (this.navigation.waypoint) {
            e.preventDefault();
            e.stopPropagation();
            this.teleportTo(this.navigation.waypoint.x, this.navigation.waypoint.z, this.navigation.waypoint.name);
          }
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.zoomBy(0.8);
          e.preventDefault();
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.zoomBy(1.25);
          e.preventDefault();
          break;
        case 'KeyR':
        case 'Space':
          this.recenter(this._currentPlayerPos);
          e.preventDefault();
          break;
        case 'Digit0':
        case 'KeyF':
          this.fitFull(true);
          e.preventDefault();
          break;
        case 'KeyC':
        case 'Delete':
        case 'Backspace':
          this.navigation.clearWaypoint();
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'KeyW':
          this._targetCenterZ -= step;
          this._clampTarget();
          this._userMovedView = true;
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this._targetCenterZ += step;
          this._clampTarget();
          this._userMovedView = true;
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this._targetCenterX -= step;
          this._clampTarget();
          this._userMovedView = true;
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this._targetCenterX += step;
          this._clampTarget();
          this._userMovedView = true;
          e.preventDefault();
          break;
        default:
          break;
      }
    });

    // Button controls
    document.getElementById('map-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomBy(0.75);
    });
    document.getElementById('map-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomBy(1.35);
    });
    document.getElementById('map-recenter')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.recenter(this._currentPlayerPos);
    });
    document.getElementById('map-fit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fitFull(true);
    });
    document.getElementById('map-mark')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.navigation.waypoint) this.navigation.clearWaypoint();
      else this._markArmNextClick();
    });
    document.getElementById('map-mark-clear')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigation.clearWaypoint();
    });
    document.getElementById('map-teleport')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.navigation.waypoint) {
        this.teleportTo(this.navigation.waypoint.x, this.navigation.waypoint.z, this.navigation.waypoint.name);
      }
    });
  }

  _handleMarkClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const size = this.canvas.width;
    const sx = (clientX - rect.left) * (size / rect.width);
    const sy = (clientY - rect.top) * (size / rect.height);
    const [wx, wz] = this.s2w(sx, sy, size, this.mpp);

    // If clicking close to existing waypoint, clear it
    if (this.navigation.waypoint) {
      const d = Math.hypot(this.navigation.waypoint.x - wx, this.navigation.waypoint.z - wz);
      if (d < 30 * this.mpp) {
        this.navigation.clearWaypoint();
        return;
      }
    }

    // Otherwise place or move waypoint
    const streetName = this.navigation.roadGraph?.getStreetName(wx, wz, 100);
    this.navigation.setWaypoint(wx, wz, streetName, this._currentPlayerPos);
  }

  _markArmNextClick() {
    const armHandler = (e) => {
      this.canvas.removeEventListener('click', armHandler, true);
      this._handleMarkClick(e.clientX, e.clientY);
      e.stopImmediatePropagation();
    };
    this.canvas.addEventListener('click', armHandler, true);
  }

  setPlayerPos(pos) {
    this._currentPlayerPos = pos;
  }
}
