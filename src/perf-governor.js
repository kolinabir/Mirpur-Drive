// Adaptive resolution governor: keeps the game at 60 fps by trading pixels.
//
// Measured 2026-09-20 on an Apple M4 at 1600x900 CSS px: the JS systems cost
// ~3 ms a frame and three.js's own submission ~6 ms, but the GPU needed
// 14-30 ms at street level — full PBR shading of a street wall plus the
// viaduct, at 1.75x device pixels with 4x MSAA, is ~4.4 M shaded pixels
// before overdraw. The frame is fill-rate bound, so the one knob that always
// works, on every GPU, is how many pixels get shaded. A fixed pixel ratio is
// either wasteful on a fast machine or too slow on a modest one; this picks it
// per machine, per moment.
//
// How it decides, once per WINDOW_MS of rendered frames:
//   - average frame time over TARGET  -> drop the ratio. Pixel cost goes with
//     ratio², so the step is sqrt(target/avg), not a fixed decrement: one
//     window is usually enough to get back under budget.
//   - comfortably under for a while   -> probe one step up. A vsync-locked
//     display hides headroom (frame time cannot go below the refresh
//     interval), so the only way to find out is to try; if the probe fails
//     the ratio comes straight back down and the next probe waits twice as
//     long (capped), which stops the resolution visibly breathing.
// Frames longer than HITCH_MS (tab switch, tile build, shader compile) are
// ignored: they say nothing about steady-state fill cost.

const TARGET_MS = 1000 / 60;
const DOWN_MS = TARGET_MS * 1.035; // ~17.25 ms: about two missed vsyncs a second at 60 Hz
const UP_MS = TARGET_MS * 1.015; // at or under budget (a healthy 60 Hz window averages 16.7)
const WINDOW_MS = 750;
const HITCH_MS = 120;
const STEP = 0.05; // ratio quantum; smaller steps mean more buffer reallocations
const PROBE_MIN_S = 5;
const PROBE_MAX_S = 60;

/**
 * @param {import('three').WebGLRenderer} renderer
 * @param {{ max: number, min?: number, enabled?: boolean }} opts
 */
export function createPerfGovernor(renderer, { max, min = 0.7, enabled = true }) {
  min = Math.min(min, max);
  let ratio = max;
  let sumMs = 0;
  let count = 0;
  let windowMs = 0;
  let calmS = 0; // seconds spent under budget since the last change
  let probeWaitS = PROBE_MIN_S;
  let probing = false; // the last change was an upward probe
  let last = 0;

  const quantise = (r) => Math.round(r / STEP) * STEP;

  function apply(next) {
    next = Math.min(max, Math.max(min, quantise(next)));
    if (Math.abs(next - ratio) < STEP / 2) return false;
    ratio = next;
    // setPixelRatio re-runs setSize internally, so the drawing buffer follows.
    renderer.setPixelRatio(ratio);
    return true;
  }

  return {
    get ratio() {
      return ratio;
    },
    /** Lower (or restore) the ceiling, e.g. the Settings "Performance" option. */
    setMax(next) {
      max = Math.max(min, next);
      if (ratio > max) apply(max);
    },
    /** Call once per rendered frame with the wall-clock time (performance.now()). */
    tick(now) {
      if (!enabled) return;
      const ms = last ? now - last : 0;
      last = now;
      if (ms <= 0 || ms > HITCH_MS || document.hidden) return;
      sumMs += ms;
      count++;
      windowMs += ms;
      if (windowMs < WINDOW_MS) return;

      const avg = sumMs / count;
      const seconds = windowMs / 1000;
      sumMs = 0;
      count = 0;
      windowMs = 0;

      if (avg > DOWN_MS) {
        const changed = apply(ratio * Math.sqrt(TARGET_MS / avg) * 0.98);
        if (changed && probing) probeWaitS = Math.min(PROBE_MAX_S, probeWaitS * 2);
        probing = false;
        calmS = 0;
      } else if (avg <= UP_MS) {
        calmS += seconds;
        if (probing && calmS > 2) {
          // The probe held: that resolution is affordable, relax the back-off.
          probing = false;
          probeWaitS = PROBE_MIN_S;
        }
        if (ratio < max && calmS >= probeWaitS) {
          probing = apply(ratio + STEP * 2);
          calmS = 0;
        }
      } else {
        calmS = 0; // in the dead band: neither comfortable nor over budget
      }
    },
  };
}
