import { METRO } from './metro.js';

export function chooseLiftFloor(currentY, hasTicket, onSelect) {
  let panel = document.getElementById('lift-menu');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'lift-menu';
    panel.className = 'hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Choose lift floor');
    document.body.append(panel);
  }
  panel.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = 'Select floor';
  panel.append(heading);
  const close = () => { panel.classList.add('hidden'); document.removeEventListener('keydown', onKey); };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  for (const [name, height] of [['Platform', METRO.PLATFORM_Y], ['Concourse · tickets', METRO.CONCOURSE_Y], ['Street · exit', 0]]) {
    const button = document.createElement('button');
    const current = Math.abs(currentY - height) < 1;
    const ticketNeeded = height === METRO.PLATFORM_Y && !hasTicket;
    button.textContent = `${name}${current ? ' — current floor' : ticketNeeded ? ' — ticket required' : ''}`;
    button.disabled = current || ticketNeeded;
    button.addEventListener('click', () => { close(); onSelect(height); });
    panel.append(button);
  }
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  panel.append(cancel);
  panel.classList.remove('hidden');
  document.addEventListener('keydown', onKey);
  document.exitPointerLock?.();
  panel.querySelector('button:not(:disabled)')?.focus();
}
