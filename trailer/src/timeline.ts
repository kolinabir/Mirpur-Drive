// The edit. 60 fps, 120 BPM: one beat is 30 frames, one bar is 120 (2 s),
// and every cut sits on a beat of capture/music-page.js.
export const FPS = 60;
export const BEAT = 30;
export const BAR = 120;
export const TOTAL_FRAMES = 60 * FPS;

export type Format = 'wide' | 'tall';

export type Clip = {
  /** File in public/footage/<format>/, without extension. */
  src: string;
  /** Frame in the trailer where the clip starts. */
  at: number;
  /** Frames on screen. */
  length: number;
  /** Frame in the source clip to start from. */
  from: number;
  /** Optional slow push-in over the clip (1 = none). */
  zoomTo?: number;
  playbackRate?: number;
  /** 9:16 only: a different in-point (traffic differs between the two capture runs). */
  fromTall?: number;
  /** 9:16 only: static punch-in, and where it is anchored (CSS transform-origin). */
  tallScale?: number;
  tallOrigin?: string;
};

// Frames inside intro-cinematic.mp4 where the game's own opening cuts
// (logged by capture/shots.js). [first frame, last frame] per shot.
export const INTRO_SHOTS = {
  trainApproach: [210, 299],
  aerialFollow: [378, 653],
  passengerWindow: [654, 810],
} as const;

const b = (bars: number) => Math.round(bars * BAR);

export const CLIPS: Clip[] = [
  // 0-12 s  intro
  { src: 'dawn-crane', at: 0, length: b(2), from: 120 },
  { src: 'intro-cinematic', at: b(2), length: b(2), from: INTRO_SHOTS.aerialFollow[0] + 20 },
  { src: 'footbridge-glide', at: b(4), length: b(1), from: 120 },
  { src: 'benarasi-gate', at: b(5), length: b(1), from: 172 },
  // 12-34 s  main: drive, ride, walk
  { src: 'drive-chase', at: b(6), length: b(2), from: 150, fromTall: 30 },
  // Half speed: the low angle reads better slowed, and it stays clear of a close pass by a CNG.
  { src: 'drive-front', at: b(8), length: b(1), from: 232, playbackRate: 0.5 },
  { src: 'train-chase', at: b(9), length: b(2), from: 100 },
  { src: 'platform-arrival', at: b(11), length: b(2), from: 100, tallScale: 1.18, tallOrigin: 'center top' },
  { src: 'intro-cinematic', at: b(13), length: b(1), from: INTRO_SHOTS.passengerWindow[0] + 24 },
  { src: 'walk-pallabi', at: b(14), length: b(1), from: 90 },
  { src: 'stadium-orbit', at: b(15), length: b(2), from: 60, tallScale: 1.35, tallOrigin: 'center 62%' },
  // 34-42 s  breakdown: rain, night
  { src: 'rain-street', at: b(17), length: b(2), from: 80, zoomTo: 1.04 },
  { src: 'night-street', at: b(19), length: b(2), from: 20, zoomTo: 1.04 },
  // 42-52 s  climax: one-second cuts
  { src: 'drive-chase', at: b(21), length: b(0.5), from: 360 },
  { src: 'train-chase', at: b(21.5), length: b(0.5), from: 20 },
  { src: 'drive-front', at: b(22), length: b(0.5), from: 235 },
  { src: 'platform-arrival', at: b(22.5), length: b(0.5), from: 400, tallScale: 1.18, tallOrigin: 'center top' },
  { src: 'intro-cinematic', at: b(23), length: b(0.5), from: INTRO_SHOTS.trainApproach[0] + 20 },
  { src: 'benarasi-gate', at: b(23.5), length: b(0.5), from: 110 },
  { src: 'stadium-orbit', at: b(24), length: b(0.5), from: 290, tallScale: 1.35, tallOrigin: 'center 62%' },
  { src: 'footbridge-glide', at: b(24.5), length: b(0.5), from: 235 },
  { src: 'night-street', at: b(25), length: b(0.5), from: 135 },
  { src: 'dawn-crane', at: b(25.5), length: b(0.5), from: 295 },
  // 52-60 s  end card over slowed footage
  { src: 'train-chase', at: b(26), length: b(4), from: 150, playbackRate: 0.4 },
];

export const END_CARD_AT = b(26);

/** Big single words that land with a section. */
export const WORDS: { at: number; length: number; text: string }[] = [
  { at: b(6), length: 75, text: 'DRIVE' },
  { at: b(9), length: 75, text: 'RIDE' },
  { at: b(14), length: 75, text: 'WALK' },
];

/** Lower thirds. Bangla strings are copied from the game source, not translated here. */
export const PLACES: { at: number; length: number; name: string; bn?: string }[] = [
  { at: 40, length: 170, name: 'Pallabi Metro Station, Mirpur 12', bn: 'পল্লবী স্টেশন, মিরপুর ১২' },
  { at: b(4) + 12, length: 100, name: 'Mirpur 10 Foot Over Bridge', bn: 'মিরপুর ১০ ফুট ওভার ব্রিজ' },
  { at: b(5) + 12, length: 100, name: 'Benarasi Palli', bn: 'বেনারসি পল্লী' },
  { at: b(11) + 20, length: 170, name: 'Pallabi Metro Station · MRT Line 6', bn: 'পল্লবী স্টেশন' },
  { at: b(15) + 20, length: 190, name: 'Sher-e-Bangla National Cricket Stadium', bn: 'শের-ই-বাংলা জাতীয় ক্রিকেট স্টেডিয়াম' },
];

/** Stacked statements over the montage. */
export const CLAIMS: { at: number; text: string }[] = [
  { at: b(21) + 30, text: 'NO DOWNLOAD' },
  { at: b(22) + 30, text: 'NO INSTALL' },
  { at: b(23) + 30, text: 'JUST A LINK' },
];
export const CLAIMS_END = b(26);

export const PLAY_URL = 'mirpurdrive.recalfy.com';
export const REPO_URL = 'github.com/kolinabir/Mirpur-Drive';
