/**
 * switch-camera.js
 *
 * GTA V style player switch / teleport camera animation.
 *
 * Trajectory:
 *  1. Sky Pull-Up: Camera launches upward into the clouds (Y: 240m-460m) with an FOV
 *     zoom punch (68 -> 84 deg), tilting downward to reveal the sprawling city below.
 *  2. High-Altitude Pan: Camera glides across the upper sky along a smooth arc
 *     towards the target destination while a GTA-style satellite location HUD displays.
 *  3. Ground Dive-In: Camera plunges straight back down from the clouds, zooming FOV back
 *     to 68 deg, aligning yaw/pitch, and settling smoothly at the target player position.
 */

import * as THREE from "three";
import { ensureAudioContext, whiteNoiseBuffer, isMuted } from "./audio.js";

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutQuad(x) {
  return 1 - (1 - x) * (1 - x);
}

function easeInQuad(x) {
  return x * x;
}

function shortestAngleDist(a0, a1) {
  const max = Math.PI * 2;
  const da = (a1 - a0) % max;
  return ((2 * da) % max) - da;
}

export function createSwitchCamera(player, camera, scene, sky) {
  let active = false;
  let timer = 0;
  let duration = 1.75;
  let onCompleteCb = null;

  const startPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  let startYaw = 0;
  let targetYaw = 0;
  let startPitch = 0;
  let targetPitch = 0;
  let apexY = 320;
  const baseFov = camera.fov;

  // DOM elements for GTA V HUD
  let overlayEl = null;
  let bannerEl = null;
  let subtitleEl = null;

  function ensureUI() {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.id = "gta-switch-overlay";
    overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 999;
      display: none;
      opacity: 0;
      transition: opacity 0.25s ease;
      background: radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, 0.45) 100%);
    `;

    // Center targeting reticle / corner crosshairs
    const reticle = document.createElement("div");
    reticle.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 140px;
      height: 140px;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(0, 220, 255, 0.25);
      border-radius: 50%;
      box-shadow: 0 0 20px rgba(0, 220, 255, 0.15);
    `;
    overlayEl.appendChild(reticle);

    // Location banner
    const hudBox = document.createElement("div");
    hudBox.style.cssText = `
      position: absolute;
      bottom: 12%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      font-family: "Arial Black", Impact, system-ui, sans-serif;
      text-transform: uppercase;
      letter-spacing: 4px;
      color: #ffffff;
      text-shadow: 0 2px 10px rgba(0,0,0,0.85), 0 0 16px rgba(0, 220, 255, 0.6);
    `;

    bannerEl = document.createElement("div");
    bannerEl.style.cssText = "font-size: 26px; font-weight: 900; line-height: 1.2;";
    subtitleEl = document.createElement("div");
    subtitleEl.style.cssText = `
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 6px;
      color: #38bdf8;
      margin-top: 6px;
    `;

    hudBox.appendChild(bannerEl);
    hudBox.appendChild(subtitleEl);
    overlayEl.appendChild(hudBox);
    document.body.appendChild(overlayEl);
  }

  function playWhooshSound() {
    if (isMuted()) return;
    const shared = ensureAudioContext();
    if (!shared) return;
    const { ctx, master } = shared;
    try {
      const now = ctx.currentTime;
      // High-altitude atmospheric whoosh sweep
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(450, now + 1.2);
      osc.frequency.exponentialRampToValueAtTime(110, now + duration);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 1.4);
      filter.frequency.exponentialRampToValueAtTime(280, now + duration);
      filter.Q.value = 1.8;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.9);
      gain.gain.linearRampToValueAtTime(0.08, now + 2.0);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(now);
      osc.stop(now + duration);

      // Noise layer for atmospheric air rush
      const noise = ctx.createBufferSource();
      noise.buffer = whiteNoiseBuffer(ctx, duration + 0.5);
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = "bandpass";
      nFilter.frequency.setValueAtTime(400, now);
      nFilter.frequency.exponentialRampToValueAtTime(1400, now + 1.1);
      nFilter.frequency.exponentialRampToValueAtTime(300, now + duration);
      nFilter.Q.value = 1.5;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.18, now + 1.0);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(master);

      noise.start(now);
      noise.stop(now + duration);

      // Landing thud trigger
      setTimeout(() => {
        try {
          const lNow = ctx.currentTime;
          const sub = ctx.createOscillator();
          const subGain = ctx.createGain();
          sub.type = "sine";
          sub.frequency.setValueAtTime(95, lNow);
          sub.frequency.exponentialRampToValueAtTime(38, lNow + 0.28);
          subGain.gain.setValueAtTime(0.28, lNow);
          subGain.gain.exponentialRampToValueAtTime(0.001, lNow + 0.32);
          sub.connect(subGain);
          subGain.connect(master);
          sub.start(lNow);
          sub.stop(lNow + 0.35);
        } catch {
          /* ignore */
        }
      }, Math.max(0, (duration - 0.22) * 1000));
    } catch {
      /* ignore audio error */
    }
  }

  function startSwitch({ from, to, targetYaw: tYaw = null, targetPitch: tPitch = 0, locationName = "MIRPUR", onComplete = null }) {
    ensureUI();

    if (active) {
      startPos.copy(camera.position);
      startYaw = camera.rotation.y;
      startPitch = camera.rotation.x;
    } else {
      startPos.copy(from || player.position);
      startYaw = player.yaw;
      startPitch = player.pitch;
    }
    targetPos.copy(to);
    targetYaw = tYaw !== null ? tYaw : player.yaw;
    targetPitch = tPitch;
    onCompleteCb = onComplete;

    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    const dist = Math.hypot(dx, dz);

    // Duration scales dynamically with distance – cinematic pacing
    duration = Math.max(3.2, Math.min(4.5, 2.8 + dist * 0.001));
    apexY = Math.max(240, Math.min(480, Math.max(startPos.y, targetPos.y) + dist * 0.22));

    timer = 0;
    active = true;
    player.switching = true;

    // Show HUD
    if (overlayEl) {
      bannerEl.textContent = locationName || "MIRPUR CORRIDOR";
      subtitleEl.textContent = `TARGET RANGE: ${Math.round(dist)}M`;
      overlayEl.style.display = "block";
      requestAnimationFrame(() => {
        if (overlayEl) overlayEl.style.opacity = "1";
      });
    }

    playWhooshSound();
  }

  function finish() {
    active = false;
    player.switching = false;

    // Settle player directly at target
    player.teleport(targetPos.x, targetPos.z, targetPos.y, targetYaw);
    player.pitch = targetPitch;

    // Reset camera FOV
    camera.fov = baseFov;
    camera.updateProjectionMatrix();

    if (overlayEl) {
      overlayEl.style.opacity = "0";
      setTimeout(() => {
        if (overlayEl) overlayEl.style.display = "none";
      }, 250);
    }

    if (onCompleteCb) {
      const cb = onCompleteCb;
      onCompleteCb = null;
      cb();
    }
  }

  function update(dt) {
    if (!active) return false;
    timer += dt;
    const p = Math.min(1.0, timer / duration);

    // Phase 1: Ascent (0–0.28)  Phase 2: Pan (0.28–0.65)  Phase 3: Descent (0.65–1.0)
    let curX, curY, curZ;
    let curPitch, curYaw;
    let curFov;

    const targetLookPitch = -1.05; // look down at sprawling city during flight

    if (p < 0.28) {
      // Phase 1: Ascent (0 to 0.28)
      const u = p / 0.28;
      const uEase = easeOutQuad(u);
      curX = THREE.MathUtils.lerp(startPos.x, THREE.MathUtils.lerp(startPos.x, targetPos.x, 0.12), uEase);
      curZ = THREE.MathUtils.lerp(startPos.z, THREE.MathUtils.lerp(startPos.z, targetPos.z, 0.12), uEase);
      curY = THREE.MathUtils.lerp(startPos.y, apexY, uEase);

      curPitch = THREE.MathUtils.lerp(startPitch, targetLookPitch, uEase);
      curYaw = startYaw;
      curFov = THREE.MathUtils.lerp(baseFov, baseFov + 14, uEase); // FOV punch!
    } else if (p < 0.65) {
      // Phase 2: High-Altitude Pan (0.28 to 0.65) – the cinematic core
      const u = (p - 0.28) / 0.37;
      const uEase = easeInOutCubic(u);
      curX = THREE.MathUtils.lerp(startPos.x, targetPos.x, uEase);
      curZ = THREE.MathUtils.lerp(startPos.z, targetPos.z, uEase);
      curY = apexY;

      curPitch = targetLookPitch;
      const angleDiff = shortestAngleDist(startYaw, targetYaw);
      curYaw = startYaw + angleDiff * uEase;
      curFov = baseFov + 14;
    } else {
      // Phase 3: Descent (0.65 to 1.0)
      const u = (p - 0.65) / 0.35;
      const uEase = easeInQuad(u);
      curX = THREE.MathUtils.lerp(THREE.MathUtils.lerp(startPos.x, targetPos.x, 0.88), targetPos.x, uEase);
      curZ = THREE.MathUtils.lerp(THREE.MathUtils.lerp(startPos.z, targetPos.z, 0.88), targetPos.z, uEase);
      curY = THREE.MathUtils.lerp(apexY, targetPos.y, uEase);

      curPitch = THREE.MathUtils.lerp(targetLookPitch, targetPitch, uEase);
      const angleDiff = shortestAngleDist(startYaw, targetYaw);
      curYaw = startYaw + angleDiff;
      curFov = THREE.MathUtils.lerp(baseFov + 14, baseFov, uEase);
    }

    camera.position.set(curX, curY, curZ);
    camera.rotation.set(curPitch, curYaw, 0, "YXZ");
    camera.fov = curFov;
    camera.updateProjectionMatrix();

    if (p >= 1.0) {
      finish();
    }
    return true;
  }

  return {
    startSwitch,
    update,
    get active() {
      return active;
    },
    cancel() {
      if (active) finish();
    },
  };
}
