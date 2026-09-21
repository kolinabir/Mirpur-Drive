/**
 * Mirpur Drive's game-style opening. The hero views are separate shots, not
 * one impossible fly-through: cuts happen behind black so the camera never
 * crosses a building. The sequence is a cold open on sound, three quick
 * long-lens details, a wide reveal that carries the title, a look out of the
 * train, and then ONE unbroken crane from the viaduct down into the player's
 * eyes, so control arrives without a cut.
 *
 * Long lenses throughout (FOV 20-36 against the game's 68): a telephoto stacks
 * the pillars, signboards and rickshaws on top of each other, which is how
 * Begum Rokeya Avenue actually feels. It plays in morning light and eases
 * into the player's own time of day during the crane.
 */
import * as THREE from 'three';
import { buildTrainInterior } from './traininterior.js';
import { createCinematicClearance } from './cinematic-clearance.js';
import { createIntroAudio } from './intro-audio.js';
import './first-journey.css';

const CUT_DURATION = 0.16;
const SKIP_BLEND = 0.45;
const HANDOFF = 1.3; // s before the end at which the letterbox opens
const INTRO_LIGHT = 'morning';
// Fleet members pulled onto the avenue for the shoot (traffic.gather).
// Over the southbound carriageway: 4 m clear of the viaduct's edge on one side
// and of the kerb-line street lights (9 m poles, arms over the road) on the other.
const CRANE_START = [-263.5, 23, -1548];
const CROWD = { rickshaw: 22, cng: 9, car: 6, bus: 4, bike: 9 };
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => n * n * (3 - 2 * n);

export function createIntroCinematic({ player, camera, metro, sky, traffic, district, startSpot, world }) {
  let active = false;
  let reducedMotion = false;
  let elapsed = 0;
  let duration = 0;
  let activeShot = -1;
  let blending = false;
  let blendElapsed = 0;
  let handedOff = false;
  let onHandOff = null;
  let onComplete = null;
  let playerLight = null;
  const baseFov = camera.fov;
  const playerPos = new THREE.Vector3();
  const playerLook = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  const shotEnd = new THREE.Vector3();
  const lookEnd = new THREE.Vector3();
  let shots = [];
  let root; let blackout; let lower; let title; let primary; let secondary; let opening;
  const clearance = createCinematicClearance(world);
  const audio = createIntroAudio();
  const previousPosition = new THREE.Vector3();
  const intended = new THREE.Vector3(); // where the shot wanted the camera last frame, blocked or not
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

    const grain = document.createElement('div');
    grain.className = 'cinematic-grain';
    root.appendChild(grain);

    // 2.39:1 letterbox. The bars sliding away IS the "you have control" cue.
    for (const edge of ['top', 'bottom']) {
      const bar = document.createElement('div');
      bar.className = `cinematic-bar cinematic-bar-${edge}`;
      root.appendChild(bar);
    }

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

    opening = document.createElement('div');
    opening.className = 'cinematic-opening';
    opening.innerHTML = '<span lang="bn" class="cinematic-bengali">ঢাকা · সকাল ৬টা ৪০</span><span>DHAKA · 6:40 AM</span>';
    root.appendChild(opening);

    lower = document.createElement('div');
    lower.className = 'cinematic-caption';
    primary = document.createElement('div');
    primary.className = 'cinematic-label';
    secondary = document.createElement('div');
    secondary.className = 'cinematic-detail';
    lower.append(primary, secondary); root.appendChild(lower);

    title = document.createElement('div');
    title.className = 'cinematic-title';
    title.innerHTML = '<strong lang="bn" class="cinematic-bengali">মিরপুর ড্রাইভ</strong><em>MIRPUR DRIVE</em><span>DHAKA · BANGLADESH</span>';
    root.appendChild(title);
    document.body.appendChild(root);
  }

  function configurePlayerTarget() {
    const x = startSpot?.x ?? -262; const y = startSpot?.y ?? 1.68; const z = startSpot?.z ?? -1466;
    const yaw = startSpot?.yaw ?? .25;
    playerPos.set(x, y, z);
    playerLook.set(x - Math.sin(yaw) * 48, y, z - Math.cos(yaw) * 48);
  }

  /**
   * The closing crane. Height comes off early and the travel happens late, so
   * the camera is already at head height before it slides in under Pallabi's
   * platform overhang, and the last second is a level walk into the player.
   */
  function cranePose(u, position, look) {
    const drop = 1 - Math.pow(1 - u, 2.2);
    const travel = Math.pow(u, 1.35);
    position.set(
      THREE.MathUtils.lerp(CRANE_START[0], playerPos.x, travel),
      THREE.MathUtils.lerp(CRANE_START[1], playerPos.y, drop),
      THREE.MathUtils.lerp(CRANE_START[2], playerPos.z, travel),
    );
    look.set(-275, 14.5, -1640).lerp(playerLook, smooth(u));
  }

  function northShots() {
    // Avenue runs along z; north (and the arriving train) is -z. Viaduct
    // centre x is about -270 here, carriageways 2-11.5 m either side of it.
    const list = [
      { length: 1.8, black: true, p0: [-274.8, 1.0, -1580], p1: [-274.8, 1.0, -1580], l0: [-265, 1.3, -1500], l1: [-265, 1.3, -1500], f0: 21, f1: 21, label: '', sub: '' },
      // Kerb height by the median, looking south with the sun behind: the
      // northbound rickshaws come at the lens lit, pillars stacked down the right.
      { length: 1.7, p0: [-274.8, 1.0, -1580], p1: [-274.5, 1.0, -1577.5], l0: [-265, 1.3, -1500], l1: [-265, 1.3, -1500], f0: 21, f1: 20, label: '', sub: '' },
      // Level with the rails, outside the parapet: the train comes round the curve at the lens.
      { length: 1.5, p0: [-264.2, 17.2, -1530], p1: [-264.2, 17.2, -1530], l0: [-287, 16.6, -1640], l1: [-286, 16.6, -1634], f0: 18, f1: 17, label: '', sub: '', train: { approach: 300, endApproach: 262 } },
      // Across the avenue at the signboards, pillars and traffic stacked in between.
      { length: 1.3, p0: [-263, 3.2, -1565], p1: [-262.6, 3.2, -1563], l0: [-286, 7, -1512], l1: [-286, 7, -1512], f0: 24, f1: 23, label: '', sub: '' },
      // The reveal: above the track, the train running away underneath towards Pallabi.
      { length: 4.6, p0: [-287, 33, -1668], p1: [-286, 31, -1652], l0: [-266.5, 13, -1430], l1: [-266.5, 13, -1430], f0: 26, f1: 23, label: 'PALLABI', sub: 'MRT LINE 6 · BEGUM ROKEYA AVENUE', title: true, train: { approach: 240, endApproach: 130 } },
      { length: 2.6, p0: [-276, 32, -1650], p1: [-276, 32, -1600], l0: [-266, 17, -1610], l1: [-266, 17, -1560], f0: 52, f1: 50, label: 'A WINDOW ON MIRPUR', sub: 'ON BOARD · MRT LINE 6', ride: true, train: { approach: 300, endApproach: 245 } },
      { length: 5.6, pose: cranePose, p0: CRANE_START, p1: playerPos.toArray(), l0: [-275, 14.5, -1640], l1: playerLook.toArray(), f0: 36, f1: baseFov, fovEase: (u) => u * u, label: 'YOUR JOURNEY STARTS HERE', sub: 'PALLABI · DHAKA', crane: true, train: { approach: 235, endApproach: 70 } },
    ];
    return list;
  }
  function fallbackShots() {
    // An arbitrary spawn has no authored clear flight corridor.
    return [{ length: 8, p0: playerPos.toArray(), p1: playerPos.toArray(), l0: playerLook.toArray(), l1: playerLook.toArray(), f0: baseFov - 14, f1: baseFov, label: district?.label ?? 'DHAKA', sub: '', title: true, crane: true }];
  }
  function shotList() {
    const atPallabi = district?.key === 'north' && Math.hypot(playerPos.x + 262, playerPos.z + 1466) < 10 && playerPos.y < 3;
    const list = atPallabi ? northShots() : fallbackShots();
    let at = 0;
    for (const shot of list) { shot.from = at; at += shot.length; shot.to = at; }
    duration = at;
    return list;
  }
  function shotForTime() {
    const list = shots;
    const index = list.findIndex((shot) => elapsed >= shot.from && elapsed < shot.to);
    return index === -1 ? list.length - 1 : index;
  }
  function cutTo(index) {
    if (index === activeShot) return;
    activeShot = index;
    const shot = shots[index];
    cabin?.detach();
    if (shot.train) {
      const { approach, endApproach } = shot.train;
      metro?.setCinematicTrain?.({ stationName: 'Pallabi', index: 3, duration: shot.length, approach, endApproach: reducedMotion ? approach : endApproach });
    } else {
      metro?.setCinematicTrain?.(null);
    }
    if (shot.ride) {
      cabin ??= buildTrainInterior();
      cabin.attachTo(metro.trains[3].obj);
    }
    cue(index);
  }

  /** Sound is cut to picture: each cue fires once, as its shot starts. */
  function cue(index) {
    const shot = shots[index];
    if (shot.black) {
      audio.startDrone();
      audio.rickshawBell(0.3, -0.5);
      audio.distantHorn(0.85, 0.55);
      audio.rickshawBell(1.25, 0.3, 0.06);
    } else if (shot.title) {
      audio.titleHit(0.75);
      audio.distantHorn(2.6, -0.6, 0.025);
    } else if (shot.ride) {
      audio.metroChime(0.15);
    } else if (shot.crane) {
      audio.rickshawBell(2.4, 0.4, 0.07);
      audio.distantHorn(3.3, -0.4, 0.03, 0.35);
      audio.stopDrone(shot.length);
    } else if (index === 1) {
      audio.rickshawBell(0.2, 0.2);
    } else if (index === 3) {
      audio.distantHorn(0.1, -0.3, 0.04, 0.3);
    }
  }

  /** A hand on the camera: a fraction of a degree, more on the wider lenses. */
  function sway(shot, fade) {
    if (reducedMotion || shot.ride || fade <= 0) return;
    const amount = fade * camera.fov / 40;
    camera.rotateY((Math.sin(elapsed * 1.31) + Math.sin(elapsed * 2.87 + 1.2) * .5) * .0021 * amount);
    camera.rotateX((Math.sin(elapsed * 1.73 + .6) + Math.sin(elapsed * 3.41) * .5) * .0016 * amount);
  }

  function updateShot() {
    const list = shots;
    const index = shotForTime();
    const changedShot = index !== activeShot;
    previousPosition.copy(camera.position);
    cutTo(index);
    const shot = list[index];
    const last = index === list.length - 1;
    const linear = clamp01((elapsed - shot.from) / (shot.to - shot.from));
    const u = reducedMotion ? (last ? 1 : 0.5) : smooth(linear);
    if (shot.pose) shot.pose(u, camera.position, cameraLook);
    else {
      camera.position.set(...shot.p0).lerp(shotEnd.set(...shot.p1), u);
      cameraLook.set(...shot.l0).lerp(lookEnd.set(...shot.l1), u);
    }
    const train = metro?.trains?.[3]?.obj;
    if (shot.ride && train) {
      // Seated by the window, looking ahead and down the avenue rather than
      // square at the facades, so the street slides through the frame.
      const car = train.userData.cars[3];
      car.updateWorldMatrix(true, true);
      camera.position.set(-.75, 2.05, .4);
      cameraLook.set(-8, 1.3, 6.6);
      car.localToWorld(camera.position); car.localToWorld(cameraLook);
    }
    // Tested from last frame's INTENDED position, not from where a blocked
    // camera was left: otherwise one pole stalls the rest of the shot, every
    // later ray starting behind it. This way the move resumes as soon as the
    // path itself is clear again.
    const clear = clearance.isClear(changedShot ? camera.position : intended, camera.position, shot.ride ? .28 : .8, changedShot);
    intended.copy(camera.position);
    if (!clear) {
      blockedMoves++;
      if (changedShot) {
        // Never reveal an unsafe cut; use the known gameplay pose behind black.
        camera.position.copy(playerPos); cameraLook.copy(playerLook);
      } else camera.position.copy(previousPosition);
    }
    camera.lookAt(cameraLook);
    camera.fov = THREE.MathUtils.lerp(shot.f0, shot.f1, shot.fovEase ? shot.fovEase(u) : u); camera.updateProjectionMatrix();
    sway(shot, last ? clamp01((shot.to - elapsed - .4) / 1.6) : 1);

    // The last shot carries the light from the intro's morning to the player's own.
    if (last && playerLight && playerLight !== INTRO_LIGHT) sky?.setBlend?.(INTRO_LIGHT, playerLight, smooth(clamp01((linear - .3) / .6)));

    primary.textContent = shot.label; secondary.textContent = shot.sub;
    const fadeIn = shot.black ? 1 : 1 - clamp01((elapsed - shot.from) / (index === 1 ? .55 : CUT_DURATION));
    const fadeOut = !last && !shot.black ? 1 - clamp01((shot.to - elapsed) / CUT_DURATION) : 0;
    blackout.style.opacity = String(changedShot ? 1 : Math.max(fadeIn, fadeOut));
    opening.style.opacity = shot.black && elapsed > .25 && elapsed < shot.to - .35 ? '1' : '0';
    const titled = shot.title && elapsed - shot.from > .75 && shot.to - elapsed > .5;
    title.style.opacity = titled ? '1' : '0';
    title.style.transform = `translateY(${titled ? 0 : 14}px)`;
    lower.style.opacity = shot.black ? '0' : '1';
    root.classList.toggle('handoff', last && shot.to - elapsed < HANDOFF);
  }
  function restoreLight() {
    if (playerLight && sky) sky.setTime(playerLight);
    playerLight = null;
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
    audio.stopDrone(.6);
    restoreLight();
    player.teleport(playerPos.x, playerPos.z, playerPos.y, startSpot?.yaw ?? .25);
    player.pitch = 0; camera.position.copy(playerPos); camera.lookAt(playerLook);
    player.keys.clear();
    camera.fov = baseFov; camera.updateProjectionMatrix(); root.style.display = 'none';
    if (onComplete) { const callback = onComplete; onComplete = null; callback(); }
  }
  function skipIntro() {
    if (!active || blending) return;
    blending = true; blendElapsed = 0;
    title.style.opacity = '0'; lower.style.opacity = '0'; opening.style.opacity = '0';
    root.classList.add('handoff');
    audio.stopDrone(.4);
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
    root.classList.remove('handoff');
    clearance.refresh(playerPos); // once: every shot is within its 450 m, and isClear() rechecks visibility itself
    if (shots.length > 1) {
      // Staged behind the opening black: golden light and a full avenue.
      playerLight = sky?.current ?? null;
      if (playerLight && playerLight !== INTRO_LIGHT) sky.setTime(INTRO_LIGHT);
      traffic?.gather?.(-270, -1530, CROWD);
    }
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
        restoreLight();
      }
      if (u >= 1) { handOff(); finish(); }
      return true;
    }
    elapsed += dt; updateShot();
    if (elapsed >= duration) { handOff(); finish(); }
    return true;
  }
  return { start, update, skip: skipIntro, get active() { return active; }, get status() { return { elapsed, duration, shot: activeShot, onBoard: active && !!shots[activeShot]?.ride, blockedMoves }; } };
}
