/**
 * streetlife/index.js
 *
 * The on-foot layer: things to do while walking.
 *  - Hail a ride (rides.js): rickshaw, CNG or bus as a passenger.
 *  - Cha stalls: a cup, a line of adda, a saved rest stop, and errands that
 *    pay taka — the income that funds rides and food.
 *  - Street food trail: a food diary across every real eatery in the OSM
 *    data, plus fuchka and jhalmuri carts.
 *  - Places: named parks, fields, ponds, markets, campuses and stations are
 *    "discovered" on first visit.
 *
 * main.js calls update() every frame for the HUD prompt line and interact()
 * on E, after the station systems have had first refusal.
 */

import { createStreetState } from './state.js';
import { createStreetUi } from './ui.js';
import { buildStreetWorld } from './world.js';
import { createRides } from './rides.js';
import './streetlife.css';

const INTERACT_RANGE = 4.2;
const ERRAND_DONE_RANGE = 9;
const DISCOVERY_REWARD = 15;
const LANDMARK_REWARD = 60;

const CHA_MENU = [
  { name: 'Dudh cha', price: 10 },
  { name: 'Rong cha with lemon', price: 8 },
  { name: 'Malai cha', price: 25 },
];

const STALL_FOOD = {
  fuchka: [{ name: 'Fuchka', price: 40 }, { name: 'Chotpoti', price: 40 }, { name: 'Doi fuchka', price: 60 }],
  jhalmuri: [{ name: 'Jhalmuri', price: 20 }, { name: 'Chanachur makha', price: 20 }, { name: 'Amra makha', price: 15 }],
};

const EATERY_MENUS = [
  { match: /biri?yani|kacchi|tehari|kabab|kebab|mughal|mogol/i, dishes: [{ name: 'Kacchi biryani', price: 220 }, { name: 'Beef tehari', price: 150 }, { name: 'Borhani', price: 40 }] },
  { match: /pizza|burger|fried|chicken|kfc|cfc|grill/i, dishes: [{ name: 'Chicken burger', price: 180 }, { name: 'Fried chicken, 2 pcs', price: 190 }, { name: 'French fries', price: 90 }] },
  { match: /chinese|thai|china/i, dishes: [{ name: 'Chicken fried rice', price: 200 }, { name: 'Thai soup', price: 150 }, { name: 'Chicken chow mein', price: 180 }] },
];
const KIND_MENUS = {
  restaurant: [{ name: 'Bhaat, dal and rui mach', price: 120 }, { name: 'Bhuna khichuri', price: 110 }, { name: 'Paratha and dal bhaji', price: 50 }],
  fast_food: [{ name: 'Shingara', price: 10 }, { name: 'Chicken roll', price: 60 }, { name: 'Mughlai paratha', price: 80 }],
  cafe: [{ name: 'Milk tea', price: 30 }, { name: 'Coffee', price: 120 }, { name: 'Club sandwich', price: 150 }],
  sweets: [{ name: 'Roshogolla', price: 30 }, { name: 'Mishti doi', price: 50 }, { name: 'Jilapi', price: 40 }],
};

// Overheard at the tong. Everyday talk only — nothing here is presented as fact about a real person or business.
const ADDA = [
  '“Before the metro it was two hours to Motijheel in the jam. Now people read a book on the way.”',
  '“Rickshaws can’t go on the main road, mama. We know every goli instead.”',
  '“Match day at the stadium — don’t even try to cross Mirpur 2 by car.”',
  '“One shower of rain and Kazipara is a river. Take the metro when it rains.”',
  '“The best cha is where the kettle never leaves the fire.”',
  '“My cousin came back from abroad and couldn’t find his own street. Everything is six storeys now.”',
  '“Rush hour, the metro is packed like a local bus. Still faster than anything on the road.”',
  '“Benarasi Palli is where the wedding sarees come from. People travel across the country for it.”',
  '“Eid morning, the roads are empty. You can hear the birds in Mirpur. Only then.”',
  '“Load-shedding again last night. The generator shops are the only ones smiling.”',
];

/**
 * @param {{ scene: object, scene3: object, hud: HTMLElement, player: object, camera: object, traffic: object,
 *   minimap: object, collision: object, walkable: object, district: object,
 *   stations: Array<{ name: string, x: number, z: number }>, corridor: Array<object>, signBays: Array<object>, teleport: (x: number, z: number, name: string) => void }} options
 */
export function createStreetLife({ scene, scene3, hud, player, camera, traffic, minimap, collision, walkable, district, stations, corridor, signBays, teleport }) {
  const state = createStreetState(district.key);
  const ui = createStreetUi({
    host: hud,
    onPanelClose: () => {
      if (!document.body.classList.contains('touch-game')) player.requestLock?.();
    },
  });
  const world = buildStreetWorld({ scene, roadGraph: minimap.roadGraph, collision, stations, corridor, districtKey: district.key, signBays });
  scene3.add(world.group);

  const foodTotal = world.eateries.length + world.stalls.filter((s) => s.kind !== 'cha').length;
  const data = state.data;
  state.onChange((d) => ui.setWallet(d.taka));
  const refreshErrand = () => ui.setErrand(data.errand ? `Errand · deliver to ${data.errand.name} · ৳${data.errand.reward}` : null);
  refreshErrand();
  if (data.errand) minimap.waypoint = { x: data.errand.x, z: data.errand.z, name: data.errand.name };

  const rides = createRides({
    scene3, player, camera, traffic, roadGraph: minimap.roadGraph, collision, walkable, state, ui,
    corridorPoint: world.corridorPoint,
    destinations() {
      const list = stations.map((s) => {
        const spot = world.roadsidePoint(s.x, s.z) || s;
        return { name: `${s.name} station`, x: spot.x, z: spot.z, station: true };
      });
      if (data.errand) list.push({ name: `${data.errand.name} (errand)`, x: data.errand.x, z: data.errand.z });
      else if (minimap.waypoint) list.push({ name: minimap.waypoint.name || 'Map marker', x: minimap.waypoint.x, z: minimap.waypoint.z });
      if (data.stall) list.push({ name: `${data.stall.name} (last cha stop)`, x: data.stall.x, z: data.stall.z });
      const px = player.position.x;
      const pz = player.position.z;
      const undiscovered = world.places
        .filter((p) => !data.places[p.key] && !p.key.startsWith('station|'))
        .map((p) => ({ p, d: Math.hypot(p.x - px, p.z - pz) * (p.landmark ? 0.35 : 1) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      for (const { p } of undiscovered) list.push({ name: p.name, x: p.x, z: p.z });
      return list;
    },
  });

  const isNew = (item) => (item.type === 'stall' && item.kind === 'cha' ? data.stall?.key !== item.key : !data.foods[item.key]);

  function nearestInteractable() {
    const hit = world.near(player.position.x, player.position.z, INTERACT_RANGE)[0];
    return hit ? hit.item : null;
  }

  function eat(item, dish) {
    if (!state.spend(dish.price)) {
      ui.toast(`${dish.name} is ৳${dish.price} — you have ৳${data.taka}.`, 'warn');
      return;
    }
    const first = !data.foods[item.key];
    data.foods[item.key] = { dish: dish.name, at: item.name };
    state.save();
    const count = Object.keys(data.foods).length;
    ui.toast(first ? `${dish.name} at ${item.name}. Food diary ${count} / ${foodTotal}.` : `${dish.name} again at ${item.name}. Still good.`, 'good');
  }

  function offerErrand(stall) {
    const px = stall.x;
    const pz = stall.z;
    const pool = world.eateries.filter((e) => {
      const d = Math.hypot(e.x - px, e.z - pz);
      return d > 180 && d < 750;
    });
    if (!pool.length) {
      ui.toast('“Nothing today, mama. Ask at another stall.”');
      return;
    }
    const target = pool[Math.floor(Math.random() * pool.length)];
    const metres = Math.hypot(target.x - px, target.z - pz);
    data.errand = { name: target.name, x: target.x, z: target.z, reward: Math.round((30 + metres * 0.16) / 5) * 5, from: stall.name };
    state.save();
    refreshErrand();
    minimap.waypoint = { x: target.x, z: target.z, name: target.name };
    ui.toast(`“Take this parcel to ${target.name}.” ৳${data.errand.reward} on delivery. Route is on your map.`, 'good');
  }

  function openStall(stall) {
    if (stall.kind !== 'cha') {
      ui.showMenu({
        title: world.stallLabel(stall.kind),
        subtitle: stall.street ? `On ${stall.street}` : undefined,
        options: STALL_FOOD[stall.kind].map((dish) => ({
          label: dish.name, detail: `৳${dish.price}`, disabled: !state.canAfford(dish.price), onSelect: () => eat(stall, dish),
        })),
      });
      return;
    }
    const options = CHA_MENU.map((cup) => ({
      label: cup.name,
      detail: `৳${cup.price} · sit, sip, listen`,
      disabled: !state.canAfford(cup.price),
      onSelect() {
        state.spend(cup.price);
        data.cups += 1;
        data.stall = { key: stall.key, name: stall.name, x: stall.x, z: stall.z };
        state.save();
        ui.toast(ADDA[(data.cups - 1) % ADDA.length]);
        ui.toast(`${cup.name}. ${stall.name} is now your rest stop.`, 'good');
      },
    }));
    options.push({
      label: 'Any work, mama?',
      detail: data.errand ? `Finish your errand to ${data.errand.name} first` : 'Run a parcel for a few taka',
      disabled: !!data.errand,
      onSelect: () => offerErrand(stall),
    });
    ui.showMenu({ title: stall.name, subtitle: stall.street ? `Cha stall · ${stall.street}` : 'Cha stall', options });
  }

  function openEatery(eatery) {
    const menu = (EATERY_MENUS.find((m) => m.match.test(eatery.name)) || { dishes: KIND_MENUS[eatery.kind] || KIND_MENUS.restaurant }).dishes;
    ui.showMenu({
      title: eatery.name,
      subtitle: data.foods[eatery.key] ? `You had the ${data.foods[eatery.key].dish} here.` : 'Not in your food diary yet.',
      options: menu.map((dish) => ({
        label: dish.name, detail: `৳${dish.price}`, disabled: !state.canAfford(dish.price), onSelect: () => eat(eatery, dish),
      })),
    });
  }

  function openJournal() {
    const foods = Object.values(data.foods).map((entry) => `${entry.dish} — ${entry.at}`);
    const placeNames = world.places.filter((p) => data.places[p.key]).map((p) => `${p.name} · ${p.label}`);
    const actions = [];
    if (data.stall && !rides.riding) {
      actions.push({ label: `Return to ${data.stall.name}`, onSelect: () => teleport(data.stall.x, data.stall.z, data.stall.name) });
    }
    if (data.errand) {
      actions.push({
        label: 'Drop the current errand',
        onSelect() {
          data.errand = null;
          state.save();
          refreshErrand();
          minimap.clearWaypoint?.();
        },
      });
    }
    ui.showJournal({
      sections: [
        { title: 'Wallet', progress: `৳ ${data.taka}`, items: [`${data.rides} ride(s) taken · ${data.cups} cup(s) of cha · ${data.errandsDone} errand(s) run`] },
        { title: 'Food diary', progress: `${foods.length} / ${foodTotal}`, items: foods.slice(-12).reverse() },
        { title: 'Places discovered', progress: `${placeNames.length} / ${world.places.length}`, items: placeNames.slice(-12).reverse() },
      ],
      actions,
    });
  }

  let slowTimer = 0;
  let focus = null;

  /**
   * @param {number} dt @param {number} elapsed
   * @param {boolean} suspended true while another mode owns the player (driving, train, lift, cinematic)
   * @returns {string} HUD prompt line, '' when there is nothing to do
   */
  function update(dt, elapsed, suspended) {
    ui.setHidden(suspended && !rides.riding);
    rides.update(dt, player.keys);
    if (rides.riding || suspended) {
      // Labels are for someone on foot; bring them straight back afterwards.
      world.hideLabels();
      slowTimer = 0;
      return rides.riding ? rides.promptLine() : '';
    }

    const px = player.position.x;
    const pz = player.position.z;
    slowTimer -= dt;
    if (slowTimer <= 0) {
      slowTimer = 0.4;
      focus = player.feetY > 1 || player.flying ? null : nearestInteractable();
      world.refreshLabels(px, pz, isNew, data.errand, (place) => !!data.places[place.key]);

      for (const place of world.places) {
        if (data.places[place.key] || Math.hypot(place.x - px, place.z - pz) > place.radius) continue;
        data.places[place.key] = true;
        const reward = place.landmark ? LANDMARK_REWARD : DISCOVERY_REWARD;
        state.earn(reward);
        if (place.landmark) ui.toast(`${place.bn} — ${place.blurb}`);
        ui.toast(`${place.landmark ? 'Landmark' : 'Discovered'} · ${place.name} · ${Object.keys(data.places).length} / ${world.places.length}  (+৳${reward})`, 'good');
      }

      if (data.errand && Math.hypot(data.errand.x - px, data.errand.z - pz) < ERRAND_DONE_RANGE) {
        const { name, reward } = data.errand;
        data.errand = null;
        data.errandsDone += 1;
        state.earn(reward);
        refreshErrand();
        minimap.clearWaypoint?.();
        ui.toast(`Parcel delivered to ${name}. +৳${reward}`, 'good');
      }
    }
    world.updateLabels(camera.position.x, camera.position.z);

    if (focus) {
      if (focus.type === 'eatery') return `E: eat at ${focus.name}`;
      return focus.kind === 'cha' ? `E: cha at ${focus.name}` : `E: ${world.stallLabel(focus.kind).toLowerCase()}`;
    }
    return rides.promptLine();
  }

  /** @returns {boolean} true when E was consumed */
  function interact() {
    if (ui.panelOpen) return true;
    if (rides.riding) return rides.interact();
    if (player.feetY > 1 || player.flying) return false;
    const item = nearestInteractable();
    if (item) {
      if (item.type === 'eatery') openEatery(item);
      else openStall(item);
      return true;
    }
    return rides.interact();
  }

  function toggleJournal() {
    if (ui.journalOpen) ui.close();
    else if (!ui.panelOpen) openJournal();
  }

  return { update, interact, toggleJournal, state, world, rides, ui, get riding() { return rides.riding; } };
}
