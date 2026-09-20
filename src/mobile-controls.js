import './mobile-controls.css';

/** @type {{keys: Set<string>, forward: number, strafe: number}} */
export const touchInput = { keys: new Set(), forward: 0, strafe: 0 };

const coarsePointer = matchMedia('(any-pointer: coarse)');
const noHover = matchMedia('(hover: none)');
const compactViewport = matchMedia('(max-width: 1024px), (max-height: 600px)');

export function prefersTouchControls() {
  const touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  return coarsePointer.matches || (touchCapable && (noHover.matches || compactViewport.matches));
}

export function isGameplayBlocked() {
  return ['start', 'loading', 'gateway', 'help-modal', 'teleport-modal', 'lift-menu', 'street-menu', 'street-journal'].some((id) => {
    const element = document.getElementById(id);
    return element && !element.classList.contains('hidden');
  }) || !!document.querySelector('#minimap.expanded');
}

/** @param {EventTarget | null} target */
export function isEditableTarget(target) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

/**
 * @param {{player: import('./player.js').Player, getDrive: () => {driving: boolean, look: (x: number, y: number) => void, cycleCamera: () => void} | undefined, isBlocked: () => boolean, onInteract: () => void}} options
 */
export function createMobileControls({ player, getDrive, isBlocked, onInteract }) {
  const touchToggle = document.getElementById('touch-controls-toggle');
  if (touchToggle instanceof HTMLInputElement) touchToggle.checked = prefersTouchControls();
  const root = document.createElement('div');
  root.id = 'mobile-controls';
  root.innerHTML = `<div class="touch-instruction">Left thumb to move · drag the street to look</div>
    <div class="touch-stick" role="group" aria-label="Movement joystick"><span class="touch-stick-knob"></span><span class="touch-stick-label">MOVE</span></div>
    <div class="touch-actions"><button type="button" data-action="interact">Interact</button><button type="button" data-action="view">View</button><button type="button" data-action="run">Run</button><button type="button" data-action="jump">Jump</button><button type="button" data-action="descend">Descend</button></div>
    <div class="touch-pedals"><button type="button" data-action="brake">Brake / reverse</button><button type="button" data-action="gas">Accelerate</button></div>`;
  document.body.append(root);
  const stick = root.querySelector('.touch-stick');
  const knob = root.querySelector('.touch-stick-knob');
  const label = root.querySelector('.touch-stick-label');
  const jump = root.querySelector('[data-action="jump"]');
  const canvas = player.dom;
  if (!(stick instanceof HTMLElement) || !(knob instanceof HTMLElement) || !label || !jump) throw new Error('Touch controls failed to initialize');
  let stickPointer = -1;
  let lookPointer = -1;
  let lookX = 0;
  let lookY = 0;
  let enabled = false;
  let touchObserved = false;
  /** @type {boolean | null} */
  let manualTouchPreference = null;
  let wasDriving = false;
  /** @type {Map<number, string>} */
  const heldButtons = new Map();
  const abort = new AbortController();
  const signal = abort.signal;
  touchToggle?.addEventListener('change', () => {
    if (touchToggle instanceof HTMLInputElement) manualTouchPreference = touchToggle.checked;
    update();
  }, { signal });
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || touchObserved) return;
    touchObserved = true;
    if (manualTouchPreference === null && touchToggle instanceof HTMLInputElement) touchToggle.checked = true;
    update();
  }, { signal, capture: true });
  const blocked = () => !enabled || isBlocked() || isGameplayBlocked() || player.switching || player.inLift;
  function reset() {
    touchInput.keys.clear();
    touchInput.forward = 0;
    touchInput.strafe = 0;
    stickPointer = -1;
    lookPointer = -1;
    heldButtons.clear();
    knob.style.transform = 'translate(0, 0)';
    root.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  }
  /** @param {PointerEvent} event */
  function moveStick(event) {
    const bounds = stick.getBoundingClientRect();
    const radius = bounds.width * 0.34;
    let x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    let y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    touchInput.strafe = Math.abs(x) > 0.12 ? x : 0;
    touchInput.forward = Math.abs(y) > 0.12 ? -y : 0;
    knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
  }
  stick.addEventListener('pointerdown', (event) => {
    if (blocked() || stickPointer !== -1) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    moveStick(event);
  }, { signal });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickPointer) moveStick(event);
  }, { signal });
  /** @param {PointerEvent} event */
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = -1;
    touchInput.forward = 0;
    touchInput.strafe = 0;
    knob.style.transform = 'translate(0, 0)';
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, releaseStick, { signal });
  canvas.addEventListener('pointerdown', (event) => {
    if ((event.pointerType !== 'touch' && !document.body.classList.contains('touch-game')) || blocked() || lookPointer !== -1) return;
    event.preventDefault();
    lookPointer = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointer || blocked()) return;
    const dx = event.clientX - lookX;
    const dy = event.clientY - lookY;
    lookX = event.clientX;
    lookY = event.clientY;
    const drive = getDrive();
    if (drive?.driving) drive.look(dx, dy);
    else player.look(dx * 1.6, dy * 1.6);
  }, { signal });
  /** @param {PointerEvent} event */
  const releaseLook = (event) => { if (event.pointerId === lookPointer) lookPointer = -1; };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, releaseLook, { signal });
  /** @type {Record<string, string | undefined>} */
  const keyForAction = { run: 'ShiftLeft', jump: 'Space', brake: 'KeyS', gas: 'KeyW', descend: 'KeyC' };
  root.querySelectorAll('button').forEach((button) => {
    const action = button.dataset.action || '';
    const key = keyForAction[action];
    if (!key) {
      button.addEventListener('click', () => {
        if (blocked()) return;
        if (action === 'interact') onInteract();
        else if (getDrive()?.driving) getDrive()?.cycleCamera();
        else player.toggleView();
      }, { signal });
      return;
    }
    button.addEventListener('pointerdown', (event) => {
      if (blocked()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      heldButtons.set(event.pointerId, key);
      touchInput.keys.add(key);
      button.classList.add('pressed');
    }, { signal });
    /** @param {PointerEvent} event */
    const release = (event) => {
      if (!heldButtons.has(event.pointerId)) return;
      heldButtons.delete(event.pointerId);
      if (![...heldButtons.values()].includes(key)) touchInput.keys.delete(key);
      button.classList.remove('pressed');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release, { signal });
  });
  window.addEventListener('blur', reset, { signal });
  document.addEventListener('visibilitychange', reset, { signal });
  window.addEventListener('mirpur:drivingchange', reset, { signal });
  function update() {
    enabled = manualTouchPreference ?? (prefersTouchControls() || touchObserved);
    if (touchToggle instanceof HTMLInputElement) touchToggle.checked = enabled;
    document.body.classList.toggle('touch-game', enabled);
    const driving = !!getDrive()?.driving;
    const hidden = blocked() || document.getElementById('hud')?.classList.contains('hidden');
    root.hidden = hidden;
    if (hidden || driving !== wasDriving) reset();
    root.classList.toggle('driving', driving);
    root.classList.toggle('flying', player.flying && !driving);
    document.body.classList.toggle('touch-driving', enabled && driving);
    label.textContent = driving ? 'STEER' : 'MOVE';
    jump.textContent = driving ? 'Handbrake' : player.flying ? 'Rise' : 'Jump';
    wasDriving = driving;
  }
  update();
  return { update, dispose() { reset(); abort.abort(); root.remove(); document.body.classList.remove('touch-game', 'touch-driving'); } };
}
