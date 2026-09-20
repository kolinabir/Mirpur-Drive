import { whiteNoiseBuffer } from './audio.js';

/** @typedef {{ obj: import('three').Object3D, speed?: number }} AudibleTrain */
/** @typedef {{ x: number, y?: number, z: number, yaw: number, insideMetro?: boolean }} Listener */
/** @param {AudioContext} ctx @param {AudioNode} destination */
export function createMetroAudio(ctx, destination) {
  const noiseBuffer = whiteNoiseBuffer(ctx, 3);
  function voice() {
    const output = ctx.createGain(); output.gain.value = 0;
    const panner = ctx.createStereoPanner(); output.connect(panner).connect(destination);
    /** @param {OscillatorType} type @param {number} frequency @param {number} level */
    function tone(type, frequency, level) {
      const source = ctx.createOscillator(); source.type = type; source.frequency.value = frequency;
      const gain = ctx.createGain(); gain.gain.value = level;
      source.connect(gain).connect(output); source.start();
      return { source, gain };
    }
    /** @param {BiquadFilterType} type @param {number} frequency @param {number} level */
    function noise(type, frequency, level) {
      const source = ctx.createBufferSource(); source.buffer = noiseBuffer; source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency;
      const gain = ctx.createGain(); gain.gain.value = level;
      source.connect(filter).connect(gain).connect(output); source.start();
      return { filter, gain };
    }
    const traction = tone('sine', 110, 0);
    const harmonic = tone('sine', 330, 0);
    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = 780;
    const modulation = ctx.createGain(); modulation.gain.value = 0;
    carrier.connect(modulation).connect(traction.source.frequency); carrier.start();
    const rolling = noise('lowpass', 240, 0);
    const air = noise('bandpass', 1000, 0);
    const ventilation = noise('lowpass', 480, .025);
    const brake = noise('bandpass', 2400, 0); brake.filter.Q.value = 3;
    const chime = tone('sine', 880, 0);
    return { output, panner, traction, harmonic, carrier, modulation, rolling, air, ventilation, brake, chime, train: /** @type {AudibleTrain | null} */ (null), previousSpeed: 0, doorPhase: 'closed' };
  }
  const voices = [voice(), voice()];
  let accumulated = 0;
  /** @param {AudibleTrain[]} trains @param {Listener} listener @param {number} dt @param {{ phase: string }[]} states */
  function update(trains, listener, dt, states = []) {
    accumulated += dt;
    if (accumulated < .05) return;
    const step = accumulated; accumulated = 0;
    const nearby = trains.flatMap((train, index) => {
      if (!train.obj.visible) return [];
      const dx = listener.x - train.obj.position.x; const dz = listener.z - train.obj.position.z;
      const heading = train.obj.rotation.y;
      const along = Math.max(-61, Math.min(61, dx * Math.sin(heading) + dz * Math.cos(heading)));
      const x = train.obj.position.x + Math.sin(heading) * along;
      const z = train.obj.position.z + Math.cos(heading) * along;
      const distance = Math.hypot(x - listener.x, train.obj.position.y - (listener.y ?? 0), z - listener.z);
      return distance < 180 ? [{ train, index, x, z, distance }] : [];
    }).sort((a, b) => a.distance - b.distance).slice(0, voices.length);
    const now = ctx.currentTime;
    for (const sound of voices) {
      if (!nearby.some((item) => item.train === sound.train)) {
        sound.output.gain.setTargetAtTime(0, now, .15); sound.train = null;
      }
    }
    for (const item of nearby) {
      const sound = voices.find((candidate) => candidate.train === item.train) ?? voices.find((candidate) => !candidate.train);
      if (!sound) continue;
      const changed = sound.train !== item.train;
      sound.train = item.train;
      const speed = Math.min(32, Math.max(0, item.train.speed ?? 0));
      const acceleration = changed ? 0 : (speed - sound.previousSpeed) / Math.max(.05, step);
      sound.previousSpeed = speed;
      const moving = Math.min(1, speed / 2);
      const cruise = Math.min(1, speed / 24);
      const cabin = listener.insideMetro && item.distance < 8;
      // Stepped carrier bands and smooth motor harmonics avoid the old siren-like sweep.
      const carrierHz = speed < 4 ? 480 : speed < 10 ? 780 : speed < 18 ? 1100 : 1500;
      sound.carrier.frequency.setTargetAtTime(carrierHz, now, .12);
      sound.modulation.gain.setTargetAtTime(moving * (cabin ? 12 : 26) * (1 - cruise * .65), now, .12);
      const fundamental = 72 + speed * 13;
      sound.traction.source.frequency.setTargetAtTime(fundamental, now, .12);
      sound.harmonic.source.frequency.setTargetAtTime(fundamental * 3, now, .12);
      const pulling = Math.min(1, Math.max(.22, acceleration + .45));
      sound.traction.gain.gain.setTargetAtTime(moving * (.018 + pulling * .018) * (cabin ? .45 : 1), now, .12);
      sound.harmonic.gain.gain.setTargetAtTime(moving * .009 * (1 - cruise * .7), now, .12);
      sound.rolling.filter.frequency.setTargetAtTime(120 + speed * 12, now, .2);
      sound.rolling.gain.gain.setTargetAtTime(.09 * Math.pow(cruise, 1.2) * (cabin ? .55 : 1), now, .12);
      sound.air.gain.gain.setTargetAtTime(.045 * cruise * cruise * (cabin ? .3 : 1), now, .15);
      sound.ventilation.gain.gain.setTargetAtTime(cabin ? .065 : .014, now, .25);
      sound.brake.gain.gain.setTargetAtTime(acceleration < -.15 && speed > .4 && speed < 8 ? .015 * (1 - speed / 9) : 0, now, .1);
      const phase = states[item.index]?.phase ?? 'closed';
      if (!changed && phase === 'closing' && sound.doorPhase !== phase) {
        const gain = sound.chime.gain.gain;
        gain.cancelScheduledValues(now);
        for (let note = 0; note < 3; note++) {
          const at = now + note * .32;
          sound.chime.source.frequency.setValueAtTime(note % 2 ? 1046.5 : 880, at);
          gain.setValueAtTime(0, at); gain.linearRampToValueAtTime(.025, at + .025); gain.linearRampToValueAtTime(0, at + .22);
        }
      }
      sound.doorPhase = phase;
      sound.output.gain.setTargetAtTime(Math.pow(Math.max(0, 1 - item.distance / 180), 1.6), now, .1);
      const right = Math.cos(listener.yaw) * (item.x - listener.x) - Math.sin(listener.yaw) * (item.z - listener.z);
      sound.panner.pan.setTargetAtTime(cabin ? 0 : Math.max(-1, Math.min(1, right / 35)), now, .12);
    }
  }
  return { update };
}
