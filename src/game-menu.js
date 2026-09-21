/**
 * game-menu.js
 *
 * Pause menu, Settings and Photo mode. Panels follow lift-menu.js and
 * streetlife/ui.js: they release pointer lock while open, close on Escape, and
 * their ids are listed in mobile-controls.js#isGameplayBlocked so movement
 * pauses behind them.
 *
 * Settings persist in localStorage under `mirpurSettings`; every consumer is
 * handed its value through the `apply` callbacks, so this file knows nothing
 * about the renderer, the player or WebAudio.
 */
import './game-menu.css';
import { tr, applyI18n, getLang, setLang } from './i18n.js';

const STORAGE_KEY = 'mirpurSettings';
const DEFAULTS = { volume: 100, sensitivity: 100, quality: 'auto', antialias: 'auto', showStats: false, blood: true };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
  } catch {
    // Private mode or corrupt entry: defaults.
  }
  return { ...DEFAULTS };
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   debugMode: boolean,
 *   apply: { volume: (v: number) => void, sensitivity: (v: number) => void, quality: (q: string) => void, stats: (on: boolean) => void },
 *   onResume: () => void,
 *   openHelp: () => void,
 *   openTravel: () => void,
 * }} options
 */
export function createGameMenu({ canvas, debugMode, apply, onResume, openHelp, openTravel }) {
  const settings = loadSettings();

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; still applies for this session.
    }
  };
  const applyAll = () => {
    apply.volume(settings.volume / 100);
    apply.sensitivity(settings.sensitivity / 100);
    apply.quality(settings.quality);
    apply.blood?.(settings.blood);
    apply.stats(debugMode || settings.showStats); // ?debug forces it on without saving that
  };

  const root = document.createElement('div');
  root.id = 'game-menu';
  root.className = 'game-menu hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Pause menu');
  root.innerHTML = `
    <div class="game-menu-card" data-view="pause">
      <div class="game-menu-eyebrow">MIRPUR DRIVE</div>
      <h2 data-i18n>Paused</h2>
      <button type="button" data-act="resume" class="primary"><span data-i18n>Resume</span><kbd>Esc</kbd></button>
      <button type="button" data-act="travel"><span data-i18n>Travel menu</span><kbd>O</kbd></button>
      <button type="button" data-act="help"><span data-i18n>Controls</span><kbd>H</kbd></button>
      <button type="button" data-act="photo"><span data-i18n>Photo mode</span><kbd>G</kbd></button>
      <button type="button" data-act="settings"><span data-i18n>Settings</span></button>
      <button type="button" data-act="title"><span data-i18n>Back to title</span></button>
      <a class="gh-link game-menu-gh" href="https://github.com/kolinabir/Mirpur-Drive" target="_blank" rel="noopener"><span data-i18n>Source on GitHub</span> ↗</a>
    </div>
    <div class="game-menu-card hidden" data-view="settings">
      <div class="game-menu-eyebrow">MIRPUR DRIVE</div>
      <h2 data-i18n>Settings</h2>
      <label class="game-setting"><span data-i18n>Volume</span><input type="range" min="0" max="100" step="5" data-set="volume"><output></output></label>
      <label class="game-setting"><span data-i18n>Mouse sensitivity</span><input type="range" min="40" max="200" step="10" data-set="sensitivity"><output></output></label>
      <div class="game-setting"><span data-i18n>Graphics</span>
        <div class="game-seg" data-seg="quality"><button type="button" data-value="auto" data-i18n>Auto</button><button type="button" data-value="performance" data-i18n>Performance</button></div>
      </div>
      <div class="game-setting"><span data-i18n>Anti-aliasing</span>
        <div class="game-seg" data-seg="antialias"><button type="button" data-value="auto" data-i18n>Auto</button><button type="button" data-value="off" data-i18n>Off (faster)</button></div>
        <small data-i18n>Off helps most on integrated graphics. Changing it reloads the game.</small>
      </div>
      <div class="game-setting"><span data-i18n>Language</span>
        <div class="game-seg" data-seg="lang"><button type="button" data-value="en">English</button><button type="button" data-value="bn">বাংলা</button></div>
      </div>
      <label class="game-setting game-setting-check"><span data-i18n>Blood</span><input type="checkbox" data-set="blood"></label>
      <label class="game-setting game-setting-check"><span data-i18n>Show FPS counter</span><input type="checkbox" data-set="showStats"></label>
      <button type="button" data-act="back" class="primary"><span data-i18n>Back</span><kbd>Esc</kbd></button>
    </div>`;
  document.body.append(root);

  const photoBar = document.createElement('div');
  photoBar.id = 'photo-bar';
  photoBar.className = 'hidden';
  photoBar.innerHTML = `<button type="button" data-act="shoot"><span data-i18n>Save photo</span><kbd>Enter</kbd></button><button type="button" data-act="exit-photo"><span data-i18n>Exit photo mode</span><kbd>G</kbd></button>`;
  document.body.append(photoBar);

  const views = { pause: root.querySelector('[data-view="pause"]'), settings: root.querySelector('[data-view="settings"]') };
  let photoMode = false;
  let captureRequested = false;

  const isOpen = () => !root.classList.contains('hidden');

  function show(view) {
    for (const [name, node] of Object.entries(views)) node.classList.toggle('hidden', name !== view);
    views[view].querySelector('button, input')?.focus();
  }

  function syncControls() {
    for (const input of root.querySelectorAll('[data-set]')) {
      const key = input.dataset.set;
      if (input.type === 'checkbox') input.checked = !!settings[key];
      else {
        input.value = settings[key];
        input.nextElementSibling.textContent = `${settings[key]}%`;
      }
    }
    for (const seg of root.querySelectorAll('[data-seg]')) {
      const current = seg.dataset.seg === 'lang' ? getLang() : settings[seg.dataset.seg];
      for (const btn of seg.children) btn.classList.toggle('active', btn.dataset.value === current);
    }
  }

  function open(view = 'pause') {
    if (photoMode) setPhotoMode(false);
    root.classList.remove('hidden');
    syncControls();
    show(view);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** @param {boolean} [resume] re-lock the mouse and carry on playing */
  function close(resume = true) {
    if (!isOpen()) return;
    root.classList.add('hidden');
    if (resume) onResume();
  }

  function setPhotoMode(on) {
    photoMode = on;
    document.body.classList.toggle('photo-mode', on);
    photoBar.classList.toggle('hidden', !on);
  }

  root.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.set) return;
    const key = input.dataset.set;
    settings[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
    save();
    applyAll();
    syncControls();
  });

  root.addEventListener('click', (event) => {
    if (event.target === root) return close();
    const segBtn = event.target.closest('[data-seg] button');
    if (segBtn) {
      const seg = segBtn.parentElement.dataset.seg;
      if (seg === 'lang') setLang(segBtn.dataset.value);
      else {
        const changed = settings[seg] !== segBtn.dataset.value;
        settings[seg] = segBtn.dataset.value;
        save();
        applyAll();
        // Anti-aliasing is fixed when the WebGL context is created.
        if (seg === 'antialias' && changed) location.reload();
      }
      syncControls();
      return;
    }
    switch (event.target.closest('[data-act]')?.dataset.act) {
      case 'resume': close(); break;
      case 'settings': show('settings'); break;
      case 'back': show('pause'); break;
      case 'help': close(false); openHelp(); break;
      case 'travel': close(false); openTravel(); break;
      case 'photo': close(); setPhotoMode(true); break;
      case 'title': location.assign(location.pathname); break;
      default: break;
    }
  });

  photoBar.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'shoot') captureRequested = true;
    else if (act === 'exit-photo') setPhotoMode(false);
  });

  applyI18n(root);
  applyI18n(photoBar);
  applyAll();

  return {
    get open() { return isOpen(); },
    get photoMode() { return photoMode; },
    openPause: () => open('pause'),
    close,
    /** Esc inside the menu: Settings steps back to Pause, Pause resumes. */
    escape() {
      if (views.settings.classList.contains('hidden')) close();
      else show('pause');
    },
    togglePhotoMode: () => setPhotoMode(!photoMode),
    requestCapture() { if (photoMode) captureRequested = true; },
    toggleStats() {
      settings.showStats = !settings.showStats;
      save();
      apply.stats(settings.showStats);
    },
    /**
     * Call straight after renderer.render(): the WebGL drawing buffer is only
     * guaranteed readable in the same task it was drawn in.
     */
    afterRender() {
      if (!captureRequested) return;
      captureRequested = false;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `mirpur-drive-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }, 'image/png');
      document.body.classList.add('photo-flash');
      setTimeout(() => document.body.classList.remove('photo-flash'), 180);
    },
  };
}
