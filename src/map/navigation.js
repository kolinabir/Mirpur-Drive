/**
 * navigation.js
 *
 * Manages destination waypoints, road routing, ETA calculations,
 * turn-by-turn guidance, and GTA-style UI audio feedback.
 */

import { getAudioContext } from '../audio.js';

export class NavigationManager {
  /**
   * @param {import('./road-graph.js').RoadGraph} roadGraph
   */
  constructor(roadGraph) {
    this.roadGraph = roadGraph;
    this.waypoint = null;
    this._lastRoutePlayerPos = null;
    this._arrivalRadius = 18; // metres to trigger arrival
  }

  /**
   * Plays a synthesized GTA UI beep using WebAudio.
   * @param {'set'|'clear'|'arrive'|'teleport'} type
   */
  playSound(type = 'set') {
    try {
      const audio = getAudioContext();
      if (!audio || !audio.ctx || audio.ctx.state !== 'running') return;
      const ctx = audio.ctx;
      const now = ctx.currentTime;

      if (type === 'set') {
        // High double-chirp
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(audio.master || ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'clear') {
        // Low descending blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(audio.master || ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'arrive') {
        // Cheerful triple blip
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + i * 0.07;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(700 + i * 200, t);
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(audio.master || ctx.destination);
          osc.start(t);
          osc.stop(t + 0.07);
        }
      } else if (type === 'teleport') {
        // Sci-fi teleport warp sound
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.22);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440, now);
        osc2.frequency.exponentialRampToValueAtTime(2640, now + 0.24);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audio.master || ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.29);
        osc2.stop(now + 0.29);
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Set waypoint target in world metres.
   * @param {number} x
   * @param {number} z
   * @param {string|null} [name]
   * @param {{x: number, y: number, z: number}} [playerPos]
   */
  setWaypoint(x, z, name = null, playerPos = null) {
    this.waypoint = {
      x,
      z,
      name: name || 'Destination',
      pathPts: [],
      turns: [],
      nextTurn: null,
      roadDist: 0,
      straightDist: 0,
      bearing: 0,
      etaDrive: '0s',
      etaWalk: '0s',
    };

    if (playerPos) {
      this._recomputeRoute(playerPos);
    }
    this.playSound('set');
  }

  clearWaypoint() {
    if (!this.waypoint) return;
    this.waypoint = null;
    this._lastRoutePlayerPos = null;
    this.playSound('clear');
  }

  /**
   * Recalculates route and statistics from playerPos to waypoint.
   * @param {{x: number, y: number, z: number}} playerPos
   */
  _recomputeRoute(playerPos) {
    if (!this.waypoint) return;

    const dx = this.waypoint.x - playerPos.x;
    const dz = this.waypoint.z - playerPos.z;
    const straightDist = Math.hypot(dx, dz);

    let bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
    if (bearing < 0) bearing += 360;

    let pathPts = [];
    let roadDist = straightDist;
    let turns = [];

    if (this.roadGraph) {
      const result = this.roadGraph.findPath(playerPos.x, playerPos.z, this.waypoint.x, this.waypoint.z);
      if (result && result.path && result.path.length > 1) {
        pathPts = result.path;
        roadDist = result.totalDist;
        turns = result.turns || [];
      }
    }

    if (!pathPts.length) {
      pathPts = [[playerPos.x, playerPos.z], [this.waypoint.x, this.waypoint.z]];
    }

    // Drive ETA: ~10 m/s (~36 km/h city driving)
    const driveSec = Math.round(roadDist / 10);
    // Walk ETA: ~1.3 m/s (~4.7 km/h walking)
    const walkSec = Math.round(roadDist / 1.3);

    const formatTime = (sec) => {
      if (sec < 60) return `${sec}s`;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    };

    this.waypoint.pathPts = pathPts;
    this.waypoint.roadDist = roadDist;
    this.waypoint.straightDist = straightDist;
    this.waypoint.bearing = Math.round(bearing);
    this.waypoint.etaDrive = formatTime(driveSec);
    this.waypoint.etaWalk = formatTime(walkSec);
    this.waypoint.turns = turns;
    this._updateNextTurn(playerPos);

    this._lastRoutePlayerPos = { x: playerPos.x, z: playerPos.z };
  }

  _updateNextTurn(playerPos) {
    if (!this.waypoint) return;
    const turns = this.waypoint.turns || [];
    let next = null;

    for (const t of turns) {
      const d = Math.hypot(t.pt[0] - playerPos.x, t.pt[1] - playerPos.z);
      if (d > 16) {
        next = {
          type: t.type,
          street: t.street,
          dist: Math.round(d),
        };
        break;
      }
    }

    if (!next) {
      const remaining = Math.hypot(this.waypoint.x - playerPos.x, this.waypoint.z - playerPos.z);
      next = {
        type: 'arrive',
        street: this.waypoint.name,
        dist: Math.round(remaining),
      };
    }

    this.waypoint.nextTurn = next;
  }

  /**
   * Called each frame with live player position.
   * @param {{x: number, y: number, z: number}} playerPos
   */
  update(playerPos) {
    if (!this.waypoint || !playerPos) return;

    const dx = this.waypoint.x - playerPos.x;
    const dz = this.waypoint.z - playerPos.z;
    const straightDist = Math.hypot(dx, dz);

    // Arrival detection
    if (straightDist < this._arrivalRadius) {
      this.playSound('arrive');
      this.waypoint = null;
      this._lastRoutePlayerPos = null;
      return;
    }

    // Recompute path when moved >25m since last path calculation
    if (!this._lastRoutePlayerPos || Math.hypot(playerPos.x - this._lastRoutePlayerPos.x, playerPos.z - this._lastRoutePlayerPos.z) > 25) {
      this._recomputeRoute(playerPos);
    } else {
      let bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      if (bearing < 0) bearing += 360;
      this.waypoint.straightDist = straightDist;
      this.waypoint.bearing = Math.round(bearing);
      this._updateNextTurn(playerPos);
    }
  }
}
