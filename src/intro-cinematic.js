/**
 * Mirpur Drive's game-style opening. The hero views are separate shots, not
 * one impossible fly-through: cuts happen behind black so the camera never
 * crosses a building, followed by one clear move into the player's street.
 */
import * as THREE from 'three';
import { buildTrainInterior } from './traininterior.js';
import { createCinematicClearance } from './cinematic-clearance.js';
import './first-journey.css';

const DURATION = 15;
const CUT_DURATION = 0.18;
const SKIP_BLEND = 0.45;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => n * n * (3 - 2 * n);

export function createIntroCinematic({ player, camera, metro, sky, district, startSpot, world }) {
  let active = false;
  let reducedMotion = false;
  let elapsed = 0;
  let activeShot = -1;
  let blending = false;
  let blendElapsed = 0;
  let handedOff = false;
  let onHandOff = null;
  let onComplete = null;
  const baseFov = camera.fov;
  const playerPos = new THREE.Vector3();
  const playerLook = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  const shotEnd = new THREE.Vector3();
  const lookEnd = new THREE.Vector3();
  let shots = [];
  let root; let blackout; let lower; let title; let primary; let secondary;
  const clearance = createCinematicClearance(world);
  const previousPosition = new THREE.Vector3();
  let cabin = null;
  let blockedMoves = 0;

  function makeUi() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'intro-cinematic-overlay';
    root.setAttribute('aria-label', 'Mirpur Drive introduction');
    root.className = 'cinematic';

    // Used only between camera cuts and on the initial reveal: it is never a
    // grey screen laid over the scenery.
    blackout = document.createElement('div');
    blackout.className = 'cinematic-blackout';
    root.appendChild(blackout);

    const top = document.createElement('div');
    top.className = 'cinematic-top';
    const brand = document.createElement('div');
    brand.textContent = 'MIRPUR DRIVE';
    brand.className = 'cinematic-brand';
    const skip = document.createElement('button');
    skip.type = 'button'; skip.textContent = 'Skip intro';
    skip.className = 'cinematic-skip';
    skip.addEventListener('click', (event) => { event.stopPropagation(); skipIntro(); });
    top.append(brand, skip); root.appendChild(top);

    lower = document.createElement('div');
    lower.className = 'cinematic-caption';
    primary = document.createElement('div');
    primary.className = 'cinematic-label';
    secondary = document.createElement('div');
    secondary.className = 'cinematic-detail';
    lower.append(primary, secondary); root.appendChild(lower);

    title = document.createElement('div');
    title.className = 'cinematic-title';
    title.innerHTML = '<span lang="bn" class="cinematic-bengali">মিরপুর</span><strong>MIRPUR<br>DRIVE</strong><span>DHAKA · BANGLADESH</span>';
    root.appendChild(title);
    document.body.appendChild(root);
  }

  function configurePlayerTarget() {
    const x = startSpot?.x ?? -262; const y = startSpot?.y ?? 1.68; const z = startSpot?.z ?? -1466;
    const yaw = startSpot?.yaw ?? .25;
    playerPos.set(x, y, z);
    playerLook.set(x - Math.sin(yaw) * 48, y, z - Math.cos(yaw) * 48);
  }

  function northShots() {
    return [
      { from: 0, to: 3, p0: [-280, 29, -1488], p1: [-280, 27, -1478], l0: [-266, 16, -1387], l1: [-266, 16, -1387], f0: 53, f1: 50, label: 'PALLABI', sub: 'MRT LINE 6', train: 'arrival' },
      { from: 3, to: 7, p0: [-276, 32, -1650], p1: [-276, 32, -1600], l0: [-266, 17, -1610], l1: [-266, 17, -1560], f0: 58, f1: 58, label: 'A WINDOW ON MIRPUR', sub: 'ON BOARD · MRT LINE 6', train: 'ride' },
      { from: 7, to: 10, p0: [-276, 57, -1565], p1: [-276, 52, -1550], l0: [-253, 13, -1410], l1: [-253, 13, -1410], f0: 60, f1: 57, label: '', sub: '', title: true },
      { from: 10, to: 13, p0: [-276, 3.4, -1508], p1: [-270, 3.15, -1490], l0: [-255, 3.2, -1463], l1: [-253, 3.1, -1454], f0: 62, f1: 60, label: 'BEGUM ROKEYA AVENUE', sub: 'PALLABI · DHAKA' },
      { from: 13, to: 15, p0: [playerPos.x, playerPos.y + .65, playerPos.z], p1: [playerPos.x, playerPos.y, playerPos.z], l0: [playerLook.x, playerLook.y, playerLook.z], l1: [playerLook.x, playerLook.y, playerLook.z], f0: baseFov + 2, f1: baseFov, label: 'YOUR JOURNEY STARTS HERE', sub: '' },
    ];
  }
  function fallbackShots() {
    // An arbitrary spawn has no authored clear flight corridor.
    return [{ from: 0, to: 15, p0: playerPos.toArray(), p1: playerPos.toArray(), l0: playerLook.toArray(), l1: playerLook.toArray(), f0: baseFov, f1: baseFov, label: district?.label ?? 'DHAKA', sub: '', title: true }];
  }
  function shotList() {
    const atPallabi = district?.key === 'north' && Math.hypot(playerPos.x + 262, playerPos.z + 1466) < 10 && playerPos.y < 3;
    return atPallabi ? northShots() : fallbackShots();
  }
  function shotForTime() {
    const list = shots;
    const index = list.findIndex((shot) => elapsed >= shot.from && elapsed < shot.to);
    return index === -1 ? list.length - 1 : index;
  }
  function cutTo(index) {
    if (index === activeShot) return;
    activeShot = index;
    cabin?.detach();
    if (shots[index].train) {
      metro?.setCinematicTrain?.({ stationName: 'Pallabi', index: 3, duration: shots[index].train === 'ride' ? 4 : 3, approach: shots[index].train === 'ride' ? 310 : 180, endApproach: reducedMotion ? (shots[index].train === 'ride' ? 310 : 180) : (shots[index].train === 'ride' ? 225 : 95) });
    } else if (index === 2) {
      metro?.setCinematicTrain?.(null);
    }
    if (shots[index].train === 'ride') {
      cabin ??= buildTrainInterior();
      cabin.attachTo(metro.trains[3].obj);
    }
    clearance.refresh(playerPos);
  }

  function updateShot() {
    const list = shots;
    const index = shotForTime();
    const changedShot = index !== activeShot;
    previousPosition.copy(camera.position);
    cutTo(index);
    const shot = list[index];
    const u = reducedMotion ? (index === list.length - 1 ? 1 : 0.5) : smooth(clamp01((elapsed - shot.from) / (shot.to - shot.from)));
    camera.position.set(...shot.p0).lerp(shotEnd.set(...shot.p1), u);
    cameraLook.set(...shot.l0).lerp(lookEnd.set(...shot.l1), u);
    const train = metro?.trains?.[3]?.obj;
    if (shot.train && train && (!reducedMotion || shot.train === 'ride')) {
      cameraLook.copy(train.position); cameraLook.y += 2;
      if (shot.train === 'ride') {
        const car = train.userData.cars[3];
        car.updateWorldMatrix(true, true);
        camera.position.set(0, 2.18, .85);
        cameraLook.set(-8, 2.05, 1.8);
        car.localToWorld(camera.position); car.localToWorld(cameraLook);
      }
    }
    if (!clearance.isClear(changedShot ? camera.position : previousPosition, camera.position, shot.train === 'ride' ? .28 : .8)) {
      blockedMoves++;
      if (changedShot) {
        // Never reveal an unsafe cut; use the known gameplay pose behind black.
        camera.position.copy(playerPos); cameraLook.copy(playerLook);
      } else camera.position.copy(previousPosition);
    }
    camera.lookAt(cameraLook);
    camera.fov = THREE.MathUtils.lerp(shot.f0, shot.f1, u); camera.updateProjectionMatrix();
    primary.textContent = shot.label; secondary.textContent = shot.sub;
    const fadeIn = 1 - clamp01((elapsed - shot.from) / CUT_DURATION);
    const fadeOut = index < list.length - 1 ? 1 - clamp01((shot.to - elapsed) / CUT_DURATION) : 0;
    blackout.style.opacity = String(changedShot ? 1 : Math.max(fadeIn, fadeOut));
    title.style.opacity = shot.title && elapsed - shot.from > .3 ? '1' : '0';
    title.style.transform = `translateY(${shot.title && elapsed - shot.from > .3 ? 0 : 12}px)`;
  }
  function handOff() {
    if (handedOff) return;
    handedOff = true;
    if (onHandOff) { const callback = onHandOff; onHandOff = null; callback(); }
  }
  function finish() {
    if (!active) return;
    active = false; blending = false; player.switching = false;
    window.removeEventListener('keydown', onKey, true);
    cabin?.detach();
    metro?.setCinematicTrain?.(null);
    player.teleport(playerPos.x, playerPos.z, playerPos.y, startSpot?.yaw ?? .25);
    player.pitch = 0; camera.position.copy(playerPos); camera.lookAt(playerLook);
    player.keys.clear();
    camera.fov = baseFov; camera.updateProjectionMatrix(); root.style.display = 'none';
    if (onComplete) { const callback = onComplete; onComplete = null; callback(); }
  }
  function skipIntro() {
    if (!active || blending) return;
    blending = true; blendElapsed = 0;
    title.style.opacity = '0'; lower.style.opacity = '0';
  }

  function onKey(event) {
    if (active && (event.code === 'Space' || event.code === 'Escape')) { event.preventDefault(); event.stopImmediatePropagation(); skipIntro(); }
  }
  function start({ onHandOff: handoff, onComplete: complete } = {}) {
    if (active) finish();
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    makeUi(); configurePlayerTarget(); shots = shotList(); blockedMoves = 0;
    active = true; elapsed = 0; activeShot = -1; blending = false; handedOff = false; onHandOff = handoff; onComplete = complete;
    player.switching = true; player.keys.clear(); lower.style.opacity = '1'; root.style.display = 'block'; blackout.style.opacity = '1'; title.style.opacity = '0';
    updateShot();
    window.addEventListener('keydown', onKey, true);
  }
  function update(dt) {
    if (!active) return false;
    if (blending) {
      blendElapsed += dt;
      const u = clamp01(blendElapsed / SKIP_BLEND);
      blackout.style.opacity = String(u < .4 ? u / .4 : u < .6 ? 1 : (1 - u) / .4);
      if (u >= .4) {
        camera.position.copy(playerPos); camera.lookAt(playerLook);
        camera.fov = baseFov; camera.updateProjectionMatrix();
      }
      if (u >= 1) { handOff(); finish(); }
      return true;
    }
    elapsed += dt; updateShot();
    if (elapsed >= DURATION) { handOff(); finish(); }
    return true;
  }
  return { start, update, skip: skipIntro, get active() { return active; }, get status() { return { elapsed, shot: activeShot, blockedMoves }; } };
}
