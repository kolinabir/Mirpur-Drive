/**
 * minimap.js
 *
 * GTA-style Map and Navigation Facade:
 *  - Circular corner HUD minimap with speed-adaptive radius and heading-up rotation
 *  - Rim-clamped waypoint arrow and GPS route trail along streets with flow chevrons
 *  - Live GPS turn-by-turn instruction HUD (turns, street names, distance)
 *  - Instant Teleportation to waypoint or any map location
 *  - Full-screen interactive pause map with cursor-anchored zoom & momentum panning
 *  - Right-click and double-click to drop/reposition GPS destination
 *  - Real-time A* road-network shortest path solver
 *  - Live street name & district HUD banner
 */

import { RoadGraph } from './map/road-graph.js';
import { NavigationManager } from './map/navigation.js';
import { MapRaster } from './map/map-raster.js';
import { MinimapView } from './map/minimap-view.js';
import { FullmapView } from './map/fullmap-view.js';
import { resolveDistrict } from './districts.js';

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} scene parsed scene.json
   * @param {Array} stations
   */
  constructor(canvas, scene, stations) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = scene;
    this.stations = stations;
    this.onTeleport = null; // callback (x, z)

    // Subsystems
    this.roadGraph = new RoadGraph(scene.roads);
    this.navigation = new NavigationManager(this.roadGraph);
    this.raster = new MapRaster(scene, stations);
    this.miniView = new MinimapView(canvas, this.raster, this.navigation, stations);
    this.fullView = new FullmapView(canvas, this.raster, this.navigation, stations);

    // Wire teleport callback
    this.fullView.onTeleport = (x, z, name) => this.teleportTo(x, z, name);

    // District info
    try {
      this.districtInfo = resolveDistrict();
    } catch {
      this.districtInfo = null;
    }

    // State
    this.smallSize = canvas.width || 190;
    canvas.width = this.smallSize;
    canvas.height = this.smallSize;

    this.expanded = false;
    this.visible = true;

    // Speed-adaptive zoom
    this._speedMps = 0;
    this._lastPos = null;
    this._lastT = null;
    this.miniRadiusM = this.miniView.miniRadiusStand;

    // Night fade
    this._night = 0;
    this._nightTarget = 0;
    this._nightTau = 1.4;

    // UI elements
    this.controlsEl = document.getElementById('map-controls');
    this.scaleEl = document.getElementById('map-scale');
    this.streetHudEl = document.getElementById('minimap-street');
    this.gpsHudEl = document.getElementById('gps-hud');
    this.closeBtn = document.getElementById('map-close');

    this._lastStreetCheck = 0;
    this._currentStreetName = '';

    this._initEvents();
  }

  get waypoint() {
    return this.navigation.waypoint;
  }

  set waypoint(wp) {
    if (!wp) this.navigation.clearWaypoint();
    else this.navigation.setWaypoint(wp.x, wp.z, wp.name || null, this._lastPos);
  }

  teleportTo(x, z, name = null) {
    if (this.onTeleport) {
      this.onTeleport(x, z, name);
    }
    if (this.expanded) {
      this.setExpanded(false);
    }
  }

  _initEvents() {
    this.canvas.addEventListener('click', (e) => {
      if (this.expanded) {
        e.stopImmediatePropagation();
      }
    });

    this.closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setExpanded(false);
    });
  }

  setNight(value) {
    this._nightTarget = typeof value === 'boolean' ? (value ? 1 : 0) : Math.min(1, Math.max(0, value));
  }

  setMarkMode(want) {
    if (this.navigation.waypoint) {
      this.navigation.clearWaypoint();
    } else {
      this.fullView._markArmNextClick();
    }
  }

  clearWaypoint() {
    this.navigation.clearWaypoint();
  }

  setExpanded(want) {
    const next = want === undefined ? !this.expanded : !!want;
    if (next === this.expanded) return this.expanded;
    this.expanded = next;

    if (next) {
      const px = Math.min(1400, Math.max(700, Math.round(Math.min(
        window.innerWidth, window.innerHeight) * 0.88 * (window.devicePixelRatio || 1))));
      this.canvas.width = px;
      this.canvas.height = px;
      this.canvas.classList.add('expanded');
      this.visible = true;
      this.canvas.style.display = 'block';

      this.fullView.setDefault50m(this._lastPos);
      this.fullView.draw(this._lastPos, this._lastYaw || 0, this._night);

      this.controlsEl?.classList.remove('hidden');
      this.scaleEl?.classList.remove('hidden');
      if (this.streetHudEl) this.streetHudEl.style.display = 'none';
      if (this.gpsHudEl) this.gpsHudEl.style.display = 'none';
      if (this.closeBtn) this.closeBtn.classList.remove('hidden');
    } else {
      this.canvas.width = this.smallSize;
      this.canvas.height = this.smallSize;
      this.canvas.classList.remove('expanded');

      this.controlsEl?.classList.add('hidden');
      this.scaleEl?.classList.add('hidden');
      if (this.streetHudEl) this.streetHudEl.style.display = 'block';
      if (this.gpsHudEl && this.navigation.waypoint) this.gpsHudEl.style.display = 'flex';
      if (this.closeBtn) this.closeBtn.classList.add('hidden');
    }

    return this.expanded;
  }

  toggle() {
    if (this.expanded) {
      this.setExpanded(false);
      return;
    }
    this.visible = !this.visible;
    this.canvas.style.display = this.visible ? 'block' : 'none';
    if (this.streetHudEl) this.streetHudEl.style.display = this.visible ? 'block' : 'none';
    if (this.gpsHudEl) this.gpsHudEl.style.display = (this.visible && this.navigation.waypoint) ? 'flex' : 'none';
  }

  update(position, yaw, night) {
    if (!this.visible) return;

    if (night !== undefined) this.setNight(night);

    const now = performance.now();
    this._lastYaw = yaw;

    if (this._lastPos && this._lastT != null) {
      const dt = (now - this._lastT) / 1000;
      if (dt > 0 && dt < 1) {
        const dist = Math.hypot(position.x - this._lastPos.x, position.z - this._lastPos.z);
        const instSpeed = dist / dt;
        const speedAlpha = 1 - Math.exp(-dt / 0.15);
        this._speedMps += (instSpeed - this._speedMps) * speedAlpha;
        const DRIVE_SPEED_THRESHOLD = 8.0; // m/s (on-foot sprint is <= 7.4 m/s; lock strictly to 50m on foot)
        const MAX_SPEED = 24.0;
        const driveSpeed = Math.max(0, this._speedMps - DRIVE_SPEED_THRESHOLD);
        const t = Math.min(1, driveSpeed / (MAX_SPEED - DRIVE_SPEED_THRESHOLD));
        const targetRadius = this.miniView.miniRadiusStand + (this.miniView.miniRadiusDrive - this.miniView.miniRadiusStand) * t;
        const radiusAlpha = 1 - Math.exp(-dt / 0.5);
        this.miniRadiusM += (targetRadius - this.miniRadiusM) * radiusAlpha;

        const nightAlpha = 1 - Math.exp(-dt / this._nightTau);
        this._night += (this._nightTarget - this._night) * nightAlpha;
        if (Math.abs(this._night - this._nightTarget) < 0.002) this._night = this._nightTarget;
      }
    }

    this._lastPos = { x: position.x, y: position.y, z: position.z };
    this._lastT = now;

    this.navigation.update(position);
    this.fullView.setPlayerPos(position);

    if (now - this._lastStreetCheck > 350) {
      this._lastStreetCheck = now;
      this._updateStreetHud(position);
      this._updateGpsHud();
    }

    if (this.expanded) {
      this.fullView.updateAndDraw(position, yaw, this._night);
    } else {
      this.miniView.draw(position, yaw, this._night, this.miniRadiusM);
    }
  }

  _updateStreetHud(position) {
    if (!this.streetHudEl) return;
    const roadName = this.roadGraph.getStreetName(position.x, position.z, 70);
    const districtName = this.districtInfo?.district?.label || 'Mirpur';
    const street = roadName || 'Mirpur Corridor';

    if (street !== this._currentStreetName) {
      this._currentStreetName = street;
      this.streetHudEl.innerHTML = `<span class="street-name">${street}</span><span class="district-name">${districtName}</span>`;
    }
  }

  _updateGpsHud() {
    if (!this.gpsHudEl) return;
    const wp = this.navigation.waypoint;
    if (!wp || this.expanded) {
      this.gpsHudEl.style.display = 'none';
      return;
    }

    this.gpsHudEl.style.display = 'flex';
    const nt = wp.nextTurn;
    const icon = !nt ? '⬆' : nt.type === 'right' ? '↱' : nt.type === 'left' ? '↰' : nt.type === 'arrive' ? '🏁' : '⬆';
    const distText = !nt ? `${Math.round(wp.roadDist)}m` : nt.dist >= 1000 ? `${(nt.dist / 1000).toFixed(1)}km` : `${nt.dist}m`;
    const actionText = !nt ? 'Follow road' : nt.type === 'arrive' ? `Arriving at ${nt.street}` : `Turn ${nt.type.toUpperCase()} onto ${nt.street}`;
    const tripText = `${wp.roadDist >= 1000 ? (wp.roadDist / 1000).toFixed(1) + ' km' : Math.round(wp.roadDist) + ' m'} • ${wp.etaDrive}`;

    this.gpsHudEl.innerHTML = `
      <div class="gps-icon">${icon}</div>
      <div class="gps-details">
        <div class="gps-dist-action"><b class="gps-turn-dist">${distText}</b> <span class="gps-action">${actionText}</span></div>
        <div class="gps-trip-summary">${tripText}</div>
      </div>
    `;
  }
}
