import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadBengali } from '@remotion/google-fonts/NotoSansBengali';

const anton = loadAnton('normal', { weights: ['400'], subsets: ['latin'] });
const inter = loadInter('normal', { weights: ['500', '700'], subsets: ['latin'] });
// The game's own Bangla face (src/streetlife/world.js, src/benarasi-palli.js).
const bengali = loadBengali('normal', { weights: ['500', '700'], subsets: ['bengali'] });

export const FONT = {
  display: `${anton.fontFamily}, Impact, sans-serif`,
  text: `${inter.fontFamily}, Arial, sans-serif`,
  bangla: `${bengali.fontFamily}, ${inter.fontFamily}, sans-serif`,
};

// Red and green of the street bunting in the game (and the flag it comes from).
export const COLOR = {
  red: '#f42a41',
  green: '#0b9f6e',
  white: '#ffffff',
  ink: '#0b0f0e',
};
