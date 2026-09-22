/**
 * streetlife/state.js
 *
 * The on-foot layer's persistent state: a taka wallet, the food diary, places
 * discovered, rides taken, the last cha stall rested at and the active errand.
 * Saved to localStorage per district so progress survives a reload.
 */

const STORAGE_PREFIX = 'mirpur.streetlife.v2.';
const STARTING_TAKA = 300;

/** @param {string} districtKey */
export function createStreetState(districtKey) {
  const storageKey = STORAGE_PREFIX + districtKey;
  const listeners = new Set();

  const data = {
    taka: STARTING_TAKA,
    foods: {}, // poi key -> { dish, at }
    places: {}, // place key -> true
    rides: 0,
    errandsDone: 0,
    cups: 0,
    stall: null, // { name, x, z }
    errand: null, // { name, x, z, reward, from }
    // street-fight.js: robberies the street remembers, decayed in that module
    // and only ever read here (the journal does not show it yet).
    notoriety: 0,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') Object.assign(data, saved);
  } catch {
    // Private mode or corrupt entry: start fresh, keep playing.
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Storage full or blocked; progress just won't persist.
    }
    for (const fn of listeners) fn(data);
  }

  return {
    data,
    save,
    /** @param {(data: object) => void} fn */
    onChange(fn) {
      listeners.add(fn);
      fn(data);
    },
    canAfford: (amount) => data.taka >= amount,
    /** @returns {boolean} false when the wallet is short */
    spend(amount) {
      if (data.taka < amount) return false;
      data.taka -= amount;
      save();
      return true;
    },
    earn(amount) {
      data.taka += amount;
      save();
    },
  };
}
