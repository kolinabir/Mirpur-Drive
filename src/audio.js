/**
 * audio.js
 *
 * ONE AudioContext for the whole app, shared by drive.js (car engine/horn)
 * and worldaudio.js (street ambience + positional traffic). Previously
 * drive.js built its own `new AudioContext()` on the Drive gesture, which
 * worked for the car alone but would have meant a SECOND context once
 * ambient/traffic audio was added — exactly the "hard browser rule" this
 * project already holds every executor to (docs/briefs/P4-CAR.md: "exactly
 * ONE AudioContext for the whole app").
 *
 * Must be created/resumed only inside a real user gesture — Chrome mutes a
 * context created at module load. main.js calls ensureAudioContext() from
 * the "Enter the street" click; drive.js calls it again from the Drive
 * button/V keydown, which is a no-op after the first call (getter, not a
 * constructor) and a safety net if audio was never unlocked on entry.
 */
let ctx = null;
let master = null;
let analyser = null;
const BASE_GAIN = 0.55;
let muted = false;
let volume = 1;

function applyGain() {
  if (master) master.gain.setTargetAtTime(muted ? 0 : BASE_GAIN * volume, ctx.currentTime, 0.05);
}

export function ensureAudioContext() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume();
    return { ctx, master, analyser };
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null; // no WebAudio support; run silently
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : BASE_GAIN * volume;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  return { ctx, master, analyser };
}

/** Non-creating accessor: null until ensureAudioContext() has run once. */
export function getAudioContext() {
  return ctx ? { ctx, master, analyser } : null;
}

export function whiteNoiseBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function setMuted(v) {
  muted = v;
  applyGain();
  window.dispatchEvent(new CustomEvent('mirpur:mute', { detail: muted }));
}
/** @param {number} v 0..1, the player's Settings volume */
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  applyGain();
}
export function isMuted() {
  return muted;
}
