/** @typedef {{ x: number, z: number }} Position */
/**
 * @param {{ host: HTMLElement, position: Position, location: string | (() => string) }} options
 */
export function createFirstJourney({ host, position, location }) {
  const root = document.createElement('aside');
  root.className = 'first-journey';
  root.hidden = true;
  root.setAttribute('aria-label', 'Getting started');
  const step = document.createElement('div');
  step.className = 'journey-step';
  const title = document.createElement('div');
  title.className = 'journey-title';
  title.setAttribute('role', 'status');
  const copy = document.createElement('p');
  copy.className = 'journey-copy';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'journey-dismiss';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss getting started');
  root.append(step, title, copy, dismiss);
  host.append(root);
  let started = false;
  let dismissed = false;
  let stage = -1;
  let walked = 0;
  let driven = 0;
  let completeTime = 0;
  let lastX = position.x;
  let lastZ = position.z;
  dismiss.addEventListener('click', () => { dismissed = true; root.hidden = true; });

  /** @param {number} next */
  function show(next) {
    if (stage === next) return;
    stage = next;
    step.textContent = next === 3 ? 'You’re ready' : `First journey · 0${next + 1} / 03`;
    const titles = [`Welcome to ${typeof location === 'function' ? location() : location}`, 'Take the wheel', 'Find your rhythm', 'The city is yours'];
    title.textContent = titles[next];
    const instructions = document.body.classList.contains('touch-game') ? [
      'Use the left pad to walk. Drag the view to look around.',
      'Tap Drive to get in a car. You can start right here.',
      'Hold Accelerate to move. Steer with the left pad; Brake slows or reverses.',
      'Keep exploring, or open the map to choose your next stop.',
    ] : [
      'WASD to walk. Click the street and move your mouse to look around.',
      'Press V or click Drive to get in a car. You can start right here.',
      'W accelerates · A / D steer · S brakes and reverses. Take it easy for the first 30 m.',
      'C changes the driving camera · V returns to walking · M opens the map.',
    ];
    copy.textContent = instructions[next];
  }

  return {
    start() { started = true; root.hidden = dismissed; show(0); },
    /** @param {number} dt @param {boolean} driving @param {boolean} blocked */
    update(dt, driving, blocked) {
      const distance = Math.hypot(position.x - lastX, position.z - lastZ);
      lastX = position.x; lastZ = position.z;
      if (!started || dismissed) return;
      root.hidden = blocked;
      if (blocked) return;
      // Ignore teleports and entering/exiting the vehicle as journey progress.
      if (distance < 3) {
        if (driving) driven += distance;
        else walked += distance;
      }
      if (stage === 3) {
        completeTime += dt;
        if (completeTime > 8) { dismissed = true; root.hidden = true; }
      } else if (driven >= 30) show(3);
      else if (driving) show(2);
      else if (walked >= 3 || stage === 2) show(1);
    },
  };
}
