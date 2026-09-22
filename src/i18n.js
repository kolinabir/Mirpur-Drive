/**
 * i18n.js
 *
 * English / Bangla switch for the HUD and menus. Deliberately small: a flat
 * dictionary keyed by the English string, so callers write `tr('Walk')` and an
 * untranslated string just falls through unchanged.
 *
 * Street names stay in English: the OSM extract behind scene-*.json carries no
 * `name:bn` tags yet. Stations, landmarks and places already have `bn` fields
 * and use `localName()`.
 */

const STORAGE_KEY = 'mirpurLang';

const BN = {
  // HUD chrome
  Mode: 'মোড', Time: 'সময়', Controls: 'কন্ট্রোল', Menu: 'মেনু',
  'Drive (V)': 'গাড়ি চালান (V)', 'Exit car (V)': 'গাড়ি থেকে নামুন (V)', 'Travel · O': 'ভ্রমণ · O',
  Walk: 'হাঁটা', Drive: 'ড্রাইভ', Ride: 'যাত্রী', Fly: 'উড়ান', Metro: 'মেট্রো',
  Rain: 'বৃষ্টি',
  'Morning haze': 'ভোরের কুয়াশা', Midday: 'দুপুর', 'Late afternoon': 'বিকেল', Dusk: 'সন্ধ্যা', Night: 'রাত',
  'DHAKA / FREE ROAM': 'ঢাকা / ফ্রি রোম', 'Mirpur corridor': 'মিরপুর করিডোর',
  Mirpur: 'মিরপুর', 'Mirpur North': 'মিরপুর উত্তর', 'Bijoy Sarani': 'বিজয় সরণি',
  'Click to look around': 'চারপাশ দেখতে ক্লিক করুন',
  // Pause + settings
  Paused: 'বিরতি', Resume: 'খেলায় ফিরুন', Settings: 'সেটিংস', 'Photo mode': 'ফটো মোড',
  'Travel menu': 'ভ্রমণ মেনু', 'Back to title': 'শুরুর পর্দায় ফিরুন', Back: 'ফিরে যান',
  Volume: 'শব্দ', 'Mouse sensitivity': 'মাউস সংবেদনশীলতা', Graphics: 'গ্রাফিক্স',
  'Anti-aliasing': 'অ্যান্টি-অ্যালিয়াসিং', 'Off (faster)': 'বন্ধ (দ্রুত)',
  'Off helps most on integrated graphics. Changing it reloads the game.': 'ইন্টিগ্রেটেড গ্রাফিক্সে বন্ধ রাখলে সবচেয়ে বেশি কাজে দেয়। বদলালে গেম রিলোড হবে।',
  Auto: 'স্বয়ংক্রিয়', Performance: 'পারফরম্যান্স', Language: 'ভাষা',
  'Show FPS counter': 'FPS কাউন্টার দেখান', Blood: 'রক্ত', 'Source on GitHub': 'গিটহাবে সোর্স কোড',
  'Save photo': 'ছবি সংরক্ষণ', 'Exit photo mode': 'ফটো মোড বন্ধ করুন',
  // street-fight.js: the rob prompt and its toast
  rob: 'ছিনতাই', Robbed: 'ছিনতাই করা হয়েছে', notoriety: 'কুখ্যাতি',
  // Travel menu
  Here: 'এই এলাকায়', 'By metro': 'মেট্রোতে', Teleport: 'টেলিপোর্ট', 'Ride the metro': 'মেট্রোতে যান',
  'You are here': 'আপনি এখানে',
};

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

let lang = 'en';
try {
  if (localStorage.getItem(STORAGE_KEY) === 'bn') lang = 'bn';
} catch {
  // Storage blocked: stay in English.
}

export const getLang = () => lang;

/** Translate a known UI string; unknown strings come back unchanged. */
export function tr(text) {
  return lang === 'bn' ? BN[text] ?? text : text;
}

/** Bangla numerals in Bangla mode. */
export function num(value) {
  const s = String(value);
  return lang === 'bn' ? s.replace(/\d/g, (d) => BN_DIGITS[d]) : s;
}

/** Pick the Bangla name of a `{ name, bn }` record when Bangla is on. */
export function localName(record) {
  return lang === 'bn' && record?.bn ? record.bn : record?.name ?? '';
}

/** "79 m from Pallabi" in the current language. */
export function distanceFrom(metres, place) {
  return lang === 'bn' ? `${localName(place)} থেকে ${num(metres)} মি` : `${metres} m from ${place.name}`;
}

/** Re-apply every static `[data-i18n]` label under `root`. */
export function applyI18n(root = document) {
  document.documentElement.dataset.lang = lang;
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.dataset.i18nSource ??= node.textContent;
    node.textContent = tr(node.dataset.i18nSource);
  }
}

export function setLang(next) {
  lang = next === 'bn' ? 'bn' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted; still applies for this session.
  }
  applyI18n();
  window.dispatchEvent(new CustomEvent('mirpur:lang', { detail: lang }));
}
