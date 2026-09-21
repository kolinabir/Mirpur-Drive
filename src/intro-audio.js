/**
 * intro-audio.js
 *
 * Sound for the opening cinematic. Synthesized like the rest of the game's
 * audio (see public/audio/LICENSES.md for why there are no samples), and
 * played through the shared context in src/audio.js so the player's volume
 * and mute settings apply.
 *
 * Every cue is a handful of nodes that stop themselves, so nothing here
 * outlives the intro and there is nothing to tear down on skip except the
 * drone.
 */
import { getAudioContext, whiteNoiseBuffer } from './audio.js';

export function createIntroAudio() {
  let drone = null;

  function shared() {
    const audio = getAudioContext();
    return audio && audio.ctx.state !== 'closed' ? audio : null;
  }

  /** One struck partial: fast attack, exponential ring-out. */
  function partial(ctx, out, freq, level, at, ring, type = 'sine') {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    osc.connect(gain); gain.connect(out);
    osc.start(at); osc.stop(at + ring + 0.05);
  }

  /** A rickshaw's thumb bell: two quick strikes, bright and slightly out of tune. */
  function rickshawBell(delay = 0, pan = -0.4, level = 0.09) {
    const audio = shared();
    if (!audio) return;
    const { ctx, master } = audio;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; panner.connect(master); }
    const out = panner ?? master;
    for (const strike of [0, 0.13, 0.31]) {
      const at = ctx.currentTime + delay + strike;
      partial(ctx, out, 2140, level, at, 0.5);
      partial(ctx, out, 3215, level * 0.55, at, 0.32);
      partial(ctx, out, 5380, level * 0.25, at, 0.18);
    }
  }

  /** A bus air horn somewhere down the avenue: two detuned saws behind a low-pass. */
  function distantHorn(delay = 0, pan = 0.5, level = 0.035, length = 0.55) {
    const audio = shared();
    if (!audio) return;
    const { ctx, master } = audio;
    const at = ctx.currentTime + delay;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.05);
    gain.gain.setValueAtTime(level, at + length);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.25);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    filter.connect(gain);
    if (panner) { panner.pan.value = pan; gain.connect(panner); panner.connect(master); } else gain.connect(master);
    for (const freq of [311, 392]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      osc.connect(filter); osc.start(at); osc.stop(at + length + 0.3);
    }
  }

  /** The metro's door chime: the same two notes metro-audio.js plays at a platform. */
  function metroChime(delay = 0, level = 0.05) {
    const audio = shared();
    if (!audio) return;
    const { ctx, master } = audio;
    [880, 1046.5, 880].forEach((freq, i) => {
      const at = ctx.currentTime + delay + i * 0.26;
      partial(ctx, master, freq, level, at, 0.6);
      partial(ctx, master, freq * 2, level * 0.2, at, 0.3);
    });
  }

  /** The title card's hit: a dhol-like thump, a low swell and a breath of noise. */
  function titleHit(delay = 0) {
    const audio = shared();
    if (!audio) return;
    const { ctx, master } = audio;
    const at = ctx.currentTime + delay;
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, at);
    thump.frequency.exponentialRampToValueAtTime(42, at + 0.35);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, at);
    thumpGain.gain.exponentialRampToValueAtTime(0.5, at + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    thump.connect(thumpGain); thumpGain.connect(master);
    thump.start(at); thump.stop(at + 1.7);

    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoiseBuffer(ctx, 2);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 1800; band.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
    noise.connect(band); band.connect(noiseGain); noiseGain.connect(master);
    noise.start(at); noise.stop(at + 1.3);

    // Open fifth, held under the title.
    for (const [freq, level] of [[73.4, 0.09], [110, 0.06], [220, 0.025]]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 3.4);
      osc.connect(gain); gain.connect(master);
      osc.start(at); osc.stop(at + 3.5);
    }
  }

  /** A low bed under the whole sequence, so the cuts land on something. */
  function startDrone() {
    const audio = shared();
    if (!audio || drone) return;
    const { ctx, master } = audio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 320;
    filter.connect(gain); gain.connect(master);
    const oscillators = [55, 55.4, 82.5].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      osc.connect(filter); osc.start();
      return osc;
    });
    drone = { gain, oscillators };
  }

  function stopDrone(fade = 1.2) {
    const audio = shared();
    if (!drone) return;
    const { gain, oscillators } = drone;
    drone = null;
    if (!audio) return;
    const at = audio.ctx.currentTime;
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + fade);
    for (const osc of oscillators) osc.stop(at + fade + 0.1);
  }

  return { rickshawBell, distantHorn, metroChime, titleHit, startDrone, stopDrone };
}
