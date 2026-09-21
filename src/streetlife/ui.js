/**
 * streetlife/ui.js
 *
 * DOM for the on-foot layer: wallet chip, toasts, the choice menu used by
 * rides/stalls/eateries, and the journal. Panels follow lift-menu.js: they
 * release pointer lock while open and close on Escape. Their ids are listed
 * in mobile-controls.js#isGameplayBlocked so movement pauses behind them.
 */

/** @param {string} tag @param {string} [className] @param {string} [text] */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {{ host: HTMLElement, onPanelClose?: () => void }} options
 */
export function createStreetUi({ host, onPanelClose }) {
  // Wallet and errand share one block pinned to the top of the minimap, so
  // money and the current objective read together.
  const status = el('div', 'street-status');
  const wallet = el('div', 'street-wallet');
  wallet.setAttribute('aria-label', 'Wallet');
  const coin = el('span', 'street-coin', '৳');
  coin.setAttribute('aria-hidden', 'true');
  const amount = el('span', 'street-amount');
  const journalHint = el('span', 'street-wallet-hint');
  journalHint.append(el('kbd', '', 'J'));
  wallet.append(coin, amount, journalHint);
  const errandLine = el('div', 'street-errand');
  errandLine.hidden = true;
  status.append(wallet, errandLine);
  const toasts = el('div', 'street-toasts');
  toasts.setAttribute('role', 'status');
  host.append(status, toasts);
  /** @type {number | null} */
  let lastTaka = null;

  const menu = el('div', 'street-panel hidden');
  menu.id = 'street-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  const journal = el('div', 'street-panel hidden');
  journal.id = 'street-journal';
  journal.setAttribute('role', 'dialog');
  journal.setAttribute('aria-modal', 'true');
  journal.setAttribute('aria-label', 'Journal');
  document.body.append(menu, journal);

  let openPanel = null;
  let errandText = '';
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };

  function open(panel) {
    close(true);
    openPanel = panel;
    panel.classList.remove('hidden');
    document.addEventListener('keydown', onKey);
    document.exitPointerLock?.();
    panel.querySelector('button:not(:disabled)')?.focus();
  }

  /** @param {boolean} [silent] skip the resume callback when swapping panels */
  function close(silent = false) {
    if (!openPanel) return;
    openPanel.classList.add('hidden');
    openPanel = null;
    document.removeEventListener('keydown', onKey);
    if (!silent) onPanelClose?.();
  }

  /**
   * @param {{ title: string, subtitle?: string, options: Array<{ label: string, detail?: string, disabled?: boolean, onSelect: () => void }> }} config
   */
  function showMenu({ title, subtitle, options }) {
    menu.replaceChildren();
    menu.setAttribute('aria-label', title);
    menu.append(el('h2', '', title));
    if (subtitle) menu.append(el('p', 'street-panel-sub', subtitle));
    for (const option of options) {
      const button = el('button');
      button.type = 'button';
      button.append(el('span', 'street-option-label', option.label));
      if (option.detail) button.append(el('span', 'street-option-detail', option.detail));
      button.disabled = !!option.disabled;
      button.addEventListener('click', () => {
        close();
        option.onSelect();
      });
      menu.append(button);
    }
    const cancel = el('button', 'street-cancel', 'Never mind');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close());
    menu.append(cancel);
    open(menu);
  }

  /**
   * @param {{ sections: Array<{ title: string, progress: string, items: string[] }>, actions?: Array<{ label: string, onSelect: () => void }> }} config
   */
  function showJournal({ sections, actions = [] }) {
    journal.replaceChildren();
    journal.append(el('h2', '', 'Journal'));
    for (const section of sections) {
      const head = el('div', 'street-journal-head');
      head.append(el('span', '', section.title), el('b', '', section.progress));
      journal.append(head);
      const list = el('ul', 'street-journal-list');
      if (section.items.length === 0) list.append(el('li', 'empty', 'Nothing yet.'));
      for (const item of section.items) list.append(el('li', '', item));
      journal.append(list);
    }
    for (const action of actions) {
      const button = el('button', '', action.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        close();
        action.onSelect();
      });
      journal.append(button);
    }
    const done = el('button', 'street-cancel', 'Close');
    done.type = 'button';
    done.addEventListener('click', () => close());
    journal.append(done);
    open(journal);
  }

  /** @param {string} message @param {'info' | 'good' | 'warn'} [tone] */
  function toast(message, tone = 'info') {
    const node = el('div', `street-toast ${tone}`, message);
    toasts.append(node);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => node.classList.add('leaving'), 3600);
    setTimeout(() => node.remove(), 4200);
  }

  return {
    showMenu,
    showJournal,
    toast,
    close,
    get panelOpen() {
      return openPanel !== null;
    },
    get journalOpen() {
      return openPanel === journal;
    },
    /** @param {number} taka */
    setWallet(taka) {
      amount.textContent = taka.toLocaleString('en-US');
      if (lastTaka !== null && taka !== lastTaka) {
        const diff = taka - lastTaka;
        const delta = el('span', `street-delta ${diff > 0 ? 'gain' : 'loss'}`, `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`);
        wallet.append(delta);
        delta.addEventListener('animationend', () => delta.remove());
        setTimeout(() => delta.remove(), 2000); // reduced-motion: no animationend
      }
      lastTaka = taka;
    },
    /** @param {string | null} text */
    setErrand(text) {
      errandText = text || '';
      errandLine.hidden = !errandText || wallet.hidden;
      errandLine.textContent = errandText;
    },
    /** @param {boolean} hidden */
    setHidden(hidden) {
      if (wallet.hidden === hidden) return;
      wallet.hidden = hidden;
      toasts.hidden = hidden;
      errandLine.hidden = hidden || !errandText;
    },
  };
}
