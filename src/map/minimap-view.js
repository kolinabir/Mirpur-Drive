/**
 * minimap-view.js
 *
 * GTA-style circular corner minimap (HUD radar):
 *  - Player fixed at centre, pointing straight up (heading-up mode)
 *  - World rotates under the player with speed-adaptive zoom
 *  - Real-time GPS navigation route line with animated directional flow chevrons
 *  - Rim-clamped waypoint indicator when destination is outside radar radius
 *  - Station blips + upright labels
 */

import { METRO_GREEN } from './map-raster.js';

export class MinimapView {
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

    this.miniRadiusStand = 50;  // metres at standstill (50m minimum zoom radius)
    this.miniRadiusDrive = 140; // metres at top speed
    this.miniRadiusM = this.miniRadiusStand;
  }

  /**
   * Draw the corner minimap.
   * @param {{x: number, y: number, z: number}} position
   * @param {number} yaw player yaw in radians
   * @param {number} night 0..1 night crossfade factor
   * @param {number} radius current smoothed zoom radius in metres
   */
  draw(position, yaw, night = 0, radius = 50) {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 4;
    this.miniRadiusM = radius;

    ctx.clearRect(0, 0, size, size);

    // Regenerate fine local patch if needed
    this.raster.ensureMiniPatch(position.x, position.z);
    const patchMpp = this.raster.MINI_PATCH_MPP;
    const [ppx, ppz] = [
      (position.x - this.raster.miniPatchOriginX) / patchMpp,
      (position.z - this.raster.miniPatchOriginZ) / patchMpp,
    ];

    const destPxPerMetre = R / this.miniRadiusM;
    const destPxPerPatchPx = destPxPerMetre * patchMpp;
    const cosT = Math.cos(yaw);
    const sinT = Math.sin(yaw);

    // 1. Circular Radar Background & Clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0a0c0a';
    ctx.fillRect(0, 0, size, size);

    // 2. Rotated World Bitmap (Heading-up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(yaw);
    ctx.scale(destPxPerPatchPx, destPxPerPatchPx);
    ctx.translate(-ppx, -ppz);

    // Day bitmap + night crossfade
    ctx.drawImage(this.raster.miniPatch, 0, 0);
    if (night > 0.001) {
      ctx.globalAlpha = night;
      ctx.drawImage(this.raster.miniPatchNight, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 3. GPS Navigation Route Line with Animated Chevrons
    const wp = this.navigation.waypoint;
    if (wp && wp.pathPts && wp.pathPts.length > 1) {
      this._drawNavRoute(ctx, position, cosT, sinT, cx, cy, destPxPerMetre);
    }

    // Drop circular clip for overlays that touch the rim
    ctx.restore();

    // 4. Station Blips & Upright Labels
    this._drawStations(ctx, position, cosT, sinT, cx, cy, destPxPerMetre, size);

    // 5. Waypoint Blip & Rim Clamping (GTA style)
    if (wp) {
      this._drawWaypoint(ctx, position, wp, cosT, sinT, cx, cy, destPxPerMetre, R);
    }

    // 6. Outer GTA Bezel / Ring
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 7. North Indicator Tick (rotates opposite yaw)
    const nx = cx + R * Math.sin(yaw);
    const ny = cy - R * Math.cos(yaw);
    ctx.fillStyle = '#ff5a4d';
    ctx.beginPath();
    ctx.arc(nx, ny, 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `700 ${Math.max(9, Math.round(size * 0.032))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('N', cx + (R - 13) * Math.sin(yaw), cy - (R - 13) * Math.cos(yaw));
    ctx.textBaseline = 'alphabetic';

    // 8. Player Arrow (Fixed at center, pointing up - enlarged & prominent)
    this._drawPlayerArrow(ctx, cx, cy, Math.max(14, Math.round(size * 0.068)));
  }

  _drawNavRoute(ctx, playerPos, cosT, sinT, cx, cy, destPxPerMetre) {
    const pts = this.navigation.waypoint.pathPts;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const spts = [];
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - playerPos.x;
      const dz = pts[i][1] - playerPos.z;
      const rx = dx * cosT - dz * sinT;
      const ry = dx * sinT + dz * cosT;
      spts.push([cx + rx * destPxPerMetre, cy + ry * destPxPerMetre]);
    }

    // Outer glow
    ctx.strokeStyle = 'rgba(192, 38, 211, 0.45)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i < spts.length; i++) {
      if (i === 0) ctx.moveTo(spts[i][0], spts[i][1]);
      else ctx.lineTo(spts[i][0], spts[i][1]);
    }
    ctx.stroke();

    // Neon purple core
    ctx.strokeStyle = '#d946ef';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Animated directional flow chevrons
    const now = performance.now();
    const animOffset = (now * 0.025) % 26;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.6;

    let distAccum = 0;
    let nextMarker = 13 - animOffset;

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
        ctx.moveTo(-3, -3);
        ctx.lineTo(2.5, 0);
        ctx.lineTo(-3, 3);
        ctx.stroke();
        ctx.restore();

        nextMarker += 26;
      }
      distAccum += segLen;
    }

    ctx.restore();
  }

  _drawStations(ctx, playerPos, cosT, sinT, cx, cy, destPxPerMetre, size) {
    ctx.font = `600 ${Math.max(9, Math.round(size * 0.033))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    for (const s of this.stations) {
      const dist = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
      if (dist > this.miniRadiusM * 0.98) continue;
      const dx = s.x - playerPos.x;
      const dz = s.z - playerPos.z;
      const rx = dx * cosT - dz * sinT;
      const ry = dx * sinT + dz * cosT;
      const sx = cx + rx * destPxPerMetre;
      const sy = cy + ry * destPxPerMetre;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = METRO_GREEN;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(s.name, sx + 6, sy + 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s.name, sx + 6, sy + 3);
    }
  }

  _drawWaypoint(ctx, playerPos, wp, cosT, sinT, cx, cy, destPxPerMetre, R) {
    const dx = wp.x - playerPos.x;
    const dz = wp.z - playerPos.z;
    const rx = dx * cosT - dz * sinT;
    const ry = dx * sinT + dz * cosT;
    const distMetres = Math.hypot(dx, dz);
    const distOnScreen = Math.hypot(rx, ry) * destPxPerMetre;

    const margin = 10;
    const isInside = distOnScreen < (R - margin);

    ctx.save();
    if (isInside) {
      const sx = cx + rx * destPxPerMetre;
      const sy = cy + ry * destPxPerMetre;

      const pulse = 1 + 0.2 * Math.sin(performance.now() * 0.006);
      ctx.fillStyle = 'rgba(217, 70, 239, 0.35)';
      ctx.beginPath();
      ctx.arc(sx, sy, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#d946ef';
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-4.5, -4.5, 9, 9);
      ctx.fill();
      ctx.stroke();
    } else {
      const angle = Math.atan2(ry, rx);
      const clampR = R - 8;
      const bx = cx + clampR * Math.cos(angle);
      const by = cy + clampR * Math.sin(angle);

      ctx.translate(bx, by);
      ctx.rotate(angle);

      ctx.fillStyle = '#d946ef';
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.rotate(-angle);
      const distStr = distMetres >= 1000 ? `${(distMetres / 1000).toFixed(1)}k` : `${Math.round(distMetres)}m`;
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      const textDist = clampR - 12;
      const tx = (textDist - clampR) * Math.cos(angle);
      const ty = (textDist - clampR) * Math.sin(angle);
      ctx.strokeText(distStr, tx, ty);
      ctx.fillStyle = '#fdf4ff';
      ctx.fillText(distStr, tx, ty);
    }
    ctx.restore();
  }

  _drawPlayerArrow(ctx, x, y, r) {
    const now = performance.now();
    ctx.save();

    // 1. Breathing pulse halo around player
    const pulse = 1 + 0.15 * Math.sin(now * 0.005);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // 2. High-contrast dark backing disc with cyan rim
    ctx.fillStyle = 'rgba(10, 18, 30, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Directional Player Chevron (pointing straight up in heading-up mode)
    ctx.save();
    ctx.translate(x, y);

    // Thick dark outer stroke
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.lineTo(r * 0.65, r * 0.68);
    ctx.lineTo(0, r * 0.32);
    ctx.lineTo(-r * 0.65, r * 0.68);
    ctx.closePath();
    ctx.stroke();

    // Neon cyan fill
    ctx.fillStyle = '#00f0ff';
    ctx.fill();

    // Crisp white inner spine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.86);
    ctx.lineTo(r * 0.2, r * 0.36);
    ctx.lineTo(0, r * 0.18);
    ctx.lineTo(-r * 0.2, r * 0.36);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }
}
