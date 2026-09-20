/**
 * worldaudio.js
 *
 * Street sound (owner, 2026-09-07: "we need to add sound for the traffic
 * and everything"). Two layers, both synthesized (no samples, no download,
 * same reasoning as drive.js's engine — see public/audio/LICENSES.md):
 *
 *  - one always-on ambient bed: low filtered noise plus occasional distant
 *    horn blips, so the street is never silent even before the player gets
 *    in the car;
 *  - positional engine drones on the NEAREST vehicles only (a hard cap —
 *    see MAX_VOICES), each an oscillator+filter voice whose pan and volume
 *    track that vehicle relative to the player every frame, reusing the
 *    same synthesis idea as drive.js's car engine but far cheaper per voice
 *    (no per-voice noise buffer, one shared one instead).
 *
 * Shares the ONE AudioContext in src/audio.js (created on the "Enter the
 * street" gesture in main.js) rather than building its own — see the
 * comment at the top of audio.js for why that matters.
 */
import { getAudioContext, whiteNoiseBuffer } from './audio.js';
import { createMetroAudio } from './metro-audio.js';

const MAX_VOICES = 8; // hard cap: browser audio starts stuttering well before this
const VOICE_RANGE = 55; // m; beyond this a vehicle gets no positional voice
const HORN_RANGE = 30; // m; only vehicles this close can trigger a horn blip

const TYPE_TONE = {
  rickshaw: { freq: 60, type: 'triangle', gain: 0.012 },
  cng: { freq: 95, type: 'sawtooth', gain: 0.02 },
  car: { freq: 80, type: 'sawtooth', gain: 0.026 },
  bus: { freq: 55, type: 'sawtooth', gain: 0.045 },
  bike: { freq: 130, type: 'square', gain: 0.014 },
};

/**
 * @param {object} traffic  the object returned by buildTraffic()
 * @param {object} [metro]  the object returned by buildMetro()
 */
export function createWorldAudio(traffic, metro = null) {
  let audio = null; // built lazily, once the shared context exists
  let voices = []; // { osc, filter, panner, gain, agent } x MAX_VOICES, pooled
  let hornTimer = 0;
  let lastHornAt = new Map(); // agent -> last honk time, so one agent doesn't spam

  function build() {
    const shared = getAudioContext();
    if (!shared) return null;
    const { ctx, master } = shared;

    // --- Ambient bed: always on -------------------------------------------
    const ambNoise = ctx.createBufferSource();
    ambNoise.buffer = whiteNoiseBuffer(ctx, 4);
    ambNoise.loop = true;
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 550;
    const ambGain = ctx.createGain();
    ambGain.gain.value = 0.05;
    ambNoise.connect(ambFilter);
    ambFilter.connect(ambGain);
    ambGain.connect(master);
    ambNoise.start();

    // --- A distant-horn bed: occasional short blips at low volume, not ---
    // tied to any specific vehicle, just general street atmosphere.
    const hornOsc = ctx.createOscillator();
    hornOsc.type = 'square';
    hornOsc.frequency.value = 320;
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    hornOsc.connect(hornGain);
    hornGain.connect(master);
    hornOsc.start();

    // --- Pooled positional voices, created once, reused forever ----------
    const pool = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 80;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(filter);
      filter.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(master);
      } else {
        gain.connect(master);
      }
      osc.start();
      pool.push({ osc, filter, gain, panner, agent: null });
    }

    return { ctx, master, ambGain, hornOsc, hornGain, pool, metroAudio: createMetroAudio(ctx, master) };
  }

  /** Every voice's engine tone eased toward silence, so a stolen voice fades out rather than clicking. */
  function releaseVoice(v) {
    if (!audio) return;
    v.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.15);
    v.agent = null;
  }

  /**
   * @param dt seconds
   * @param player {x,z,yaw} or null
   */
  function update(dt, player, trainStates = []) {
    if (!player) return;
    if (!audio) {
      audio = build();
      if (!audio) return;
    }
    const { ctx, pool } = audio;

    // Gather the nearest live agents across every vehicle system.
    const near = [];
    for (const sys of traffic.systems || []) {
      for (const a of sys.agents) {
        if (a._wx === undefined) continue;
        const d = Math.hypot(a._wx - player.x, a._wz - player.z);
        if (d > VOICE_RANGE) continue;
        near.push({ a, d, type: sys.type });
      }
    }
    near.sort((x, y) => x.d - y.d);
    const top = near.slice(0, MAX_VOICES);

    // Assign the closest agents to voices, stealing the voice currently
    // playing the FARTHEST agent (or an idle one) rather than reallocating
    // nodes — reuse is what keeps this cheap.
    const wanted = new Set(top.map((t) => t.a));
    for (const v of pool) {
      if (v.agent && !wanted.has(v.agent)) releaseVoice(v);
    }
    for (const t of top) {
      let v = pool.find((p) => p.agent === t.a);
      if (!v) v = pool.find((p) => !p.agent);
      if (!v) continue; // pool full of agents still fading out; skip this frame
      v.agent = t.a;

      const tone = TYPE_TONE[t.type] || TYPE_TONE.car;
      const speedNorm = Math.min(1.4, Math.abs(t.a.speed * (t.a.brakeMul ?? 1)) / 8);
      const target = tone.freq * (0.85 + speedNorm * 0.5);
      v.osc.frequency.setTargetAtTime(target, ctx.currentTime, 0.08);
      v.osc.type = tone.type;
      v.filter.frequency.setTargetAtTime(250 + speedNorm * 500, ctx.currentTime, 0.1);

      // Volume falls off with distance; silent past VOICE_RANGE.
      const atten = Math.max(0, 1 - t.d / VOICE_RANGE);
      v.gain.gain.setTargetAtTime(tone.gain * atten * atten, ctx.currentTime, 0.1);

      if (v.panner) {
        // Pan by the agent's position relative to the player's facing.
        const dx = t.a._wx - player.x;
        const dz = t.a._wz - player.z;
        const right = Math.cos(player.yaw) * dx - Math.sin(player.yaw) * dz;
        v.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, right / VOICE_RANGE)), ctx.currentTime, 0.1);
      }

      // Occasional rickshaw bell / CNG horn from a close agent that is
      // braking hard (car-following slowed it for the player or a jam).
      if (t.d < HORN_RANGE && (t.a.brakeMul ?? 1) < 0.7) {
        const last = lastHornAt.get(t.a) || -Infinity;
        if (ctx.currentTime - last > 4 + Math.random() * 6) {
          lastHornAt.set(t.a, ctx.currentTime);
          blip(v, tone.type === 'square' ? 900 : 420, 0.12);
        }
      }
    }

    // Ambient distant-horn bed: a soft random blip every several seconds.
    hornTimer -= dt;
    if (hornTimer <= 0) {
      hornTimer = 3 + Math.random() * 7;
      const g = audio.hornGain.gain;
      const t = ctx.currentTime;
      audio.hornOsc.frequency.setValueAtTime(260 + Math.random() * 180, t);
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(0.02, t + 0.03);
      g.linearRampToValueAtTime(0, t + 0.18);
    }

    if (metro?.trains) audio.metroAudio.update(metro.trains, player, dt, trainStates);
  }

  function blip(v, freq, gain) {
    const t = audio.ctx.currentTime;
    const g = v.gain.gain;
    const prevFreq = v.osc.frequency.value;
    v.osc.frequency.setValueAtTime(freq, t);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(gain, t + 0.02);
    g.linearRampToValueAtTime(g.value * 0.4, t + 0.15);
    v.osc.frequency.setTargetAtTime(prevFreq, t + 0.2, 0.1);
  }

  return { update };
}
