/**
 * smoke-street-fight.mjs — headless check on src/street-fight.js.
 *
 * The module registers DOM listeners and reads player/peds/streetlife
 * objects that only exist in a running game, so this stubs the three of them
 * (window, HTMLElement, a canvas) the same way smoke-sangsad.mjs stubs the
 * canvas, and drives the real module through its real input path:
 *
 *   node tools/smoke-street-fight.mjs
 *
 * It asserts the contract main.js and traffic.js depend on:
 *   - a press punches the agent in the cone, and nothing outside it;
 *   - holding the key past KICK_HOLD upgrades to the hard kick;
 *   - blocked modes (driving, menus, elevated) throw nothing;
 *   - R (not E) robs a downed agent exactly once, paying the wallet and
 *     panicking the pavement, and resets the flag when that recycled agent
 *     walks again; the prompt's keycap matches the input (R / E on touch);
 *   - the swing animation starts, is placed in view space, ends and hides,
 *     and hands over to the avatar pose in third person.
 */
import { tr } from '../src/i18n.js';
void tr; // imported first: proves the Bangla dictionary loads without a DOM

globalThis.HTMLElement = class HTMLElement {};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// street-fight.js reads document.body.classList for the touch keycap; the
// smoke test drives that class directly instead of a mobile-controls instance.
const bodyClasses = new Set();
globalThis.document = {
  body: {
    classList: {
      contains: (name) => bodyClasses.has(name),
      toggle: (name, on) => { if (on) bodyClasses.add(name); else bodyClasses.delete(name); },
    },
  },
};
const listeners = {};
globalThis.window = {
  addEventListener: (type, fn) => { listeners[type] = fn; },
  removeEventListener: () => {},
};

const { createStreetFight } = await import('../src/street-fight.js');

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok   ${what}`);
  else { failures.push(what); console.log(`  FAIL ${what}`); }
};

// ---- Stubs: the player faces -Z (player.js: forward = (-sin yaw, 0, -cos yaw))
const player = {
  yaw: 0,
  position: { x: 0, y: 1.68, z: 0 },
  feetY: 0,
  flying: false,
  inLift: false,
  inRide: false,
  locked: true,
  dom: { addEventListener: () => {} },
};
const calls = { strikes: [], panic: 0, said: 0 };
let strikeResult = true;
let blocked = false;
const agents = [];
const peds = {
  agents,
  strike(a, dx, dz, power, blood) {
    calls.strikes.push({ a, dx, dz, power, blood });
    return strikeResult;
  },
  panic() { calls.panic++; },
  say() { calls.said++; },
};
const wallet = { taka: 300 };
const toasts = [];
const streetlife = {
  state: {
    data: { notoriety: 0 },
    earn(n) { wallet.taka += n; },
    save() {},
  },
  ui: { toast(message, tone) { toasts.push({ message, tone }); } },
};

// The swing model needs a scene to be added to and a camera to be placed from;
// both are stubs, so no WebGL is involved.
const added = [];
const scene = { add: (o) => { added.push(o); } };
const camera = { position: { x: 0, y: 1.68, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'YXZ' } };

const fight = createStreetFight({ scene, camera, player, peds, streetlife, isBlocked: () => blocked });

const mkAgent = (x, z) => {
  const a = { _wx: x, _wz: z, dead: false, scale: 1 };
  agents.push(a);
  return a;
};
const reset = () => { fight.state.cooldownUntil = 0; };

// ---- 1. Punch: the agent in the cone is hit, the one behind is not ---------
console.log('punch');
const front = mkAgent(0, -1.5);
const behind = mkAgent(0, 4);
check(fight.probe() === front, 'probe() finds the agent in front (and not the one behind)');
reset();
check(fight.attack() === true, 'attack() reports a hit');
const hit = calls.strikes.at(-1);
check(hit.a === front && hit.power < 0.6 && hit.blood === false,
  'punch: soft power, no blood, correct target');
check(Math.abs(hit.dz + 1) < 1e-6 && Math.abs(hit.dx) < 1e-6, 'hit direction is the player facing (0, -1)');
check(behind.dead !== true, 'the agent behind is untouched');

// ---- 2. Nothing in reach: a whiff, no strike ------------------------------
console.log('whiff');
front._wx = 0;
front._wz = 6; // both now behind
const strikesBefore = calls.strikes.length;
reset();
check(fight.attack() === false, 'attack() reports a miss');
check(calls.strikes.length === strikesBefore, 'no strike was dealt');
front._wx = 0;
front._wz = -1.5;

// ---- 3. Hold Q: keydown punches, the hold upgrades to the kick ------------
console.log('hold to kick');
reset();
listeners.keydown({ code: 'KeyQ', repeat: false, target: null, metaKey: false, ctrlKey: false, altKey: false });
const punch = calls.strikes.at(-1);
check(punch.power < 0.6, 'keydown: punch first');
reset(); // the test does not advance wall-clock time; in game the 0.45 s hold is past the 0.34 s punch cooldown
fight.update(0.5, false); // 0.5 s held > KICK_HOLD (0.45)
const kick = calls.strikes.at(-1);
check(kick.power > 0.6 && kick.blood === true, 'held past 0.45 s: hard kick, blood on');
fight.update(0.5, false);
check(calls.strikes.at(-1) === kick, 'the kick fires once per hold, however long it is held');
listeners.keyup({ code: 'KeyQ' });

// ---- 4. Blocked modes throw nothing ---------------------------------------
console.log('blocked');
blocked = true;
reset();
check(fight.attack() === false, 'blocked (driving/menu): attack() refuses');
player.flying = true;
blocked = false;
check(fight.attack() === false, 'flying: attack() refuses');
player.flying = false;

// ---- 5. Robbery: once per body, wallet paid, pavement panicked ------------
console.log('rob a downed pedestrian');
front.dead = true;
front.rlanded = true;
front.rx = 0.5;
front.rz = -0.6;
fight.update(0.3, false); // the 4 Hz scan is due on the first call
const before = wallet.taka;
check(fight.interact() === true, 'interact() robs a body in reach');
const paid = wallet.taka - before;
check(paid >= 12 && paid <= 59, `wallet paid ৳${paid} (12-59)`);
check(front.robbed === true, 'the body is marked robbed');
check(calls.panic === 1, 'witnesses panicked');
check(calls.said === 1, 'the victim said something');
check(streetlife.state.data.notoriety === 1, 'notoriety persisted to streetlife state');
check(toasts.length === 1 && toasts[0].tone === 'warn', 'toast shown as a warning');
check(fight.interact() === false, 'the same body cannot be robbed twice');

// ---- 6. The recycled agent can be robbed again next life ------------------
front.dead = false;
fight.update(0.3, false); // a scan with them walking clears the flag
check(front.robbed === false, 'a living agent resets its robbed flag');

// ---- 7. Robbery is on R, not E, and only when someone is down -------------
console.log('rob key');
check(fight.interact() === false, 'interact() refuses with nobody down');
const victim2 = mkAgent(0.3, -0.4);
victim2.dead = true;
victim2.rlanded = true;
victim2.rx = 0.3;
victim2.rz = -0.4;
const beforeKey = wallet.taka;
listeners.keydown({ code: 'KeyR', target: null });
const afterOne = wallet.taka;
check(afterOne > beforeKey, 'R robs the body in reach');
check(victim2.robbed === true, 'the body is marked robbed');
listeners.keydown({ code: 'KeyR', target: null });
check(wallet.taka === afterOne, 'R does nothing when the only body is already robbed');
const victim3 = mkAgent(-0.3, -0.5);
victim3.dead = true;
victim3.rlanded = true;
victim3.rx = -0.3;
victim3.rz = -0.5;
blocked = true;
listeners.keydown({ code: 'KeyR', target: null });
check(wallet.taka === afterOne && victim3.robbed !== true, 'blocked (driving/menu): R does not rob');
blocked = false;

// ---- 8. The prompt keycap follows the input the player has ----------------
console.log('prompt keycap');
const desktopLine = fight.update(0.3, false);
check(/^R: .*/.test(desktopLine) && desktopLine.includes('৳'), `desktop prompt is R-prefixed ("${desktopLine}")`);
bodyClasses.add('touch-game');
const touchLine = fight.update(0.3, false);
check(/^E: /.test(touchLine), `touch prompt is E-prefixed ("${touchLine}")`);
bodyClasses.delete('touch-game');

// ---- 9. The swing animation ----------------------------------------------
console.log('swing animation');
reset();
fight.attack('punch');
check(fight.swing === 'punch', 'attack() starts a punch swing');
check(fight.swingGroup.visible === true, 'first person: the swing model is shown');
const tris = fight.swingGroup.children.reduce((n, m) => {
  const g = m.geometry;
  return n + (g.index ? g.index.count : g.attributes.position.count) / 3;
}, 0);
check(tris > 0 && Number.isFinite(tris), `swing geometry is valid (${Math.round(tris)} triangles)`);
fight.update(0.13, false); // mid-swing
const p = fight.swingGroup.position;
check(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.z !== 0,
  'the swing is placed in view space each frame');
check(fight.swingGroup.visible === true, 'still swinging mid-animation');
fight.update(0.2, false); // past PUNCH_ANIM (0.26 s)
check(fight.swing === null && fight.swingGroup.visible === false, 'the swing ends and hides');
player.thirdPerson = true;
reset();
fight.attack('kick');
fight.update(0.2, false);
check(fight.swingGroup.visible === false && player.swingPose?.kind === 'kick',
  'third person: the viewmodel hides and the avatar pose is set instead');
fight.update(0.3, false); // past KICK_ANIM (0.44 s)
check(player.swingPose === null, 'third-person swing clears the avatar pose when done');
player.thirdPerson = false;

console.log(failures.length ? `\nFAIL: ${failures.length} check(s)` : '\nPASS: all checks');
process.exit(failures.length ? 1 : 0);
