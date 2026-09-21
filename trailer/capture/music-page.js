// Trailer score, synthesized from nothing with Web Audio (OfflineAudioContext),
// for the same reason the game synthesizes its audio: nothing to license.
// 120 BPM, D minor, 60 s. Structure follows the edit in src/timeline.ts:
//   0-12 s   intro: pad + pulse, riser into the drop
//   12-34 s  main: kick, bass, plucked arp, hand-drum pattern
//   34-42 s  breakdown (rain / night): pad + sparse plucks, riser
//   42-52 s  climax (montage): everything, 16th hats
//   52-60 s  final hit and tail (end card)
// Runs in a browser page; returns { sampleRate, left, right } as Float32Arrays.
window.renderTrailerMusic = async function renderTrailerMusic() {
  const SR = 48000;
  const LENGTH = 60.5;
  const BPM = 120;
  const BEAT = 60 / BPM;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * LENGTH), SR);
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  // --- Buses ---------------------------------------------------------------
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
  master.connect(comp).connect(ctx.destination);

  // Pad and bass duck on every kick (the "pumping" that makes a drop feel like one).
  const pump = ctx.createGain();
  pump.connect(master);

  // Reverb: exponentially decaying stereo noise as the impulse response.
  const reverb = ctx.createConvolver();
  {
    const seconds = 2.8;
    const ir = ctx.createBuffer(2, SR * seconds, SR);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) / 4294967296) * 2 - 1; };
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = rnd() * (1 - i / data.length) ** 3.2;
    }
    reverb.buffer = ir;
  }
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(master);

  const noiseBuffer = (() => {
    const buf = ctx.createBuffer(1, SR * 2, SR);
    const data = buf.getChannelData(0);
    let seed = 987654321;
    for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) | 0; data[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }
    return buf;
  })();

  const pan = (value) => { const p = ctx.createStereoPanner(); p.pan.value = value; return p; };

  // --- Harmony -------------------------------------------------------------
  // [start s, end s, root midi (bass octave), chord tones (midi)]
  const Dm = [50, 53, 57, 62], Bb = [46, 50, 53, 58], F = [53, 57, 60, 65], C = [48, 52, 55, 60], Gm = [43, 46, 50, 55], A = [45, 49, 52, 57], D5 = [50, 57, 62, 69];
  const chords = [
    [0, 4, Dm], [4, 8, Bb], [8, 12, C],
    [12, 16, Dm], [16, 20, Bb], [20, 24, F], [24, 28, C], [28, 32, Dm], [32, 34, Bb],
    [34, 38, Gm], [38, 42, A],
    [42, 46, Dm], [46, 50, Bb], [50, 52, C],
    [52, 60.5, D5],
  ];
  const chordAt = (t) => (chords.find(([a, b]) => t >= a && t < b) || chords[chords.length - 1])[2];
  const section = (t) => (t < 12 ? 'intro' : t < 34 ? 'main' : t < 42 ? 'break' : t < 52 ? 'climax' : 'outro');

  // --- Pad -----------------------------------------------------------------
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.Q.value = 0.7;
  padFilter.frequency.setValueAtTime(500, 0);
  padFilter.frequency.linearRampToValueAtTime(1500, 12);
  padFilter.frequency.setValueAtTime(1900, 12);
  padFilter.frequency.linearRampToValueAtTime(900, 36);
  padFilter.frequency.linearRampToValueAtTime(2600, 42);
  padFilter.frequency.linearRampToValueAtTime(3200, 52);
  padFilter.frequency.linearRampToValueAtTime(700, 60);
  // Section dynamics: the breakdown has no kick ducking the pad, so pull it down by hand.
  const padLevel = ctx.createGain();
  padLevel.gain.setValueAtTime(0.75, 0);
  padLevel.gain.setValueAtTime(0.75, 11.5);
  padLevel.gain.linearRampToValueAtTime(1, 12);
  padLevel.gain.setValueAtTime(1, 33.5);
  padLevel.gain.linearRampToValueAtTime(0.42, 34.5);
  padLevel.gain.setValueAtTime(0.42, 39);
  padLevel.gain.linearRampToValueAtTime(1, 42);
  padLevel.gain.setValueAtTime(1, 52);
  padLevel.gain.linearRampToValueAtTime(0.6, 53);
  padFilter.connect(padLevel).connect(pump);
  const padSend = ctx.createGain();
  padSend.gain.value = 0.5;
  padLevel.connect(padSend).connect(reverb);
  for (const [start, end, notes] of chords) {
    notes.slice(1).concat(notes[1] + 12).forEach((note, i) => {
      for (const detune of [-9, 0, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = detune + (i - 1.5) * 2;
        const g = ctx.createGain();
        const level = 0.028;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(level, start + 0.9);
        g.gain.setValueAtTime(level, Math.max(start + 0.9, end - 0.5));
        g.gain.linearRampToValueAtTime(0, end + 0.6);
        osc.connect(g).connect(pan((i - 1.5) * 0.35 + detune * 0.01)).connect(padFilter);
        osc.start(start); osc.stop(end + 0.7);
      }
    });
  }

  // --- Drums ---------------------------------------------------------------
  const kicks = [];
  function kick(t, level = 1) {
    kicks.push(t);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95 * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.35);
  }
  function noiseHit(t, { type = 'highpass', freq = 7000, q = 0.8, decay = 0.05, level = 0.2, panTo = 0, send = 0 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g);
    const out = pan(panTo);
    g.connect(out).connect(master);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(reverb); }
    src.start(t, (t * 0.37) % 1.5); src.stop(t + decay + 0.02);
  }
  /** Hand drum: a short pitched membrane, low ("dha") or high ("tin"). */
  function handDrum(t, high, level) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = high ? 392 : 147;
    osc.frequency.setValueAtTime(f0 * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.11 : 0.2));
    osc.connect(g).connect(pan(high ? 0.3 : -0.25)).connect(master);
    const s = ctx.createGain(); s.gain.value = 0.25; g.connect(s).connect(reverb);
    osc.start(t); osc.stop(t + 0.25);
  }
  // 16-step hand-drum bar: 'D' low, 't' high, '.' rest.
  const HAND = 'D..tD.t..tD.t.tt';

  for (let bar = 0; bar < 30; bar++) {
    const t0 = bar * BEAT * 4;
    const sec = section(t0);
    for (let step = 0; step < 16; step++) {
      const t = t0 + step * (BEAT / 4);
      const onBeat = step % 4 === 0;
      if (sec === 'main' || sec === 'climax') {
        if (onBeat) kick(t);
        if (step === 4 || step === 12) noiseHit(t, { type: 'bandpass', freq: 1900, q: 0.9, decay: 0.19, level: 0.34, send: 0.5 });
        if (sec === 'climax' ? true : step % 2 === 0) noiseHit(t, { freq: 8200, decay: step % 4 === 2 ? 0.07 : 0.035, level: step % 4 === 2 ? 0.11 : 0.06, panTo: step % 2 ? 0.25 : -0.2 });
        const h = HAND[step];
        if (h !== '.') handDrum(t, h === 't', sec === 'climax' ? 0.2 : 0.15);
      } else if (sec === 'intro' && bar >= 2) {
        // Heartbeat pulse under the pad, no full kit yet.
        if (step === 0 || step === 6) kick(t, bar >= 4 ? 0.55 : 0.4);
        if (bar >= 4 && step % 4 === 2) noiseHit(t, { freq: 8200, decay: 0.04, level: 0.05 });
      } else if (sec === 'break') {
        if (step === 0 && bar % 2 === 1) kick(t, 0.5);
        const h = HAND[step];
        if (bar >= 19 && h === 't') handDrum(t, true, 0.08);
      }
    }
  }
  // Snare-roll style build into the climax (40-42 s).
  for (let i = 0; i < 32; i++) {
    const t = 40 + (i / 32) * 2;
    noiseHit(t, { type: 'bandpass', freq: 1700 + i * 40, q: 0.8, decay: 0.09, level: 0.08 + i * 0.006, send: 0.3 });
  }

  // Sidechain: pad and bass dip on each kick.
  pump.gain.setValueAtTime(1, 0);
  for (const t of kicks) {
    pump.gain.setValueAtTime(1, Math.max(0, t - 0.001));
    pump.gain.linearRampToValueAtTime(0.42, t + 0.012);
    pump.gain.linearRampToValueAtTime(1, t + 0.24);
  }

  // --- Bass ----------------------------------------------------------------
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass'; bassFilter.frequency.value = 420; bassFilter.Q.value = 1.2;
  bassFilter.connect(pump);
  function bassNote(t, note, dur, level) {
    for (const [type, mul, gainMul] of [['sine', 1, 1], ['sawtooth', 1, 0.35]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = midi(note) * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level * gainMul, t + 0.01);
      g.gain.setValueAtTime(level * gainMul, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(bassFilter);
      osc.start(t); osc.stop(t + dur + 0.02);
    }
  }
  for (let t = 12; t < 52; t += BEAT / 2) {
    const sec = section(t);
    if (sec === 'break') continue;
    const root = chordAt(t)[0] - 12;
    const eighth = Math.round((t - 12) / (BEAT / 2)) % 8;
    // Off-beat drive with an octave lift at the end of each bar.
    if (eighth % 2 === 1 || sec === 'climax') bassNote(t, eighth === 7 ? root + 12 : root, BEAT / 2 * 0.92, 0.3);
  }
  for (const [start, end, notes] of chords) {
    if (section(start) === 'break' || section(start) === 'outro' || start < 4) bassNote(start, notes[0] - 12, Math.min(end - start, 6), section(start) === 'break' ? 0.13 : 0.2);
  }

  // --- Plucked arp (the hook) ------------------------------------------------
  const arpBus = ctx.createGain();
  arpBus.gain.value = 1;
  arpBus.connect(master);
  const arpSend = ctx.createGain(); arpSend.gain.value = 0.45; arpBus.connect(arpSend).connect(reverb);
  // Dotted-eighth feedback delay.
  const delay = ctx.createDelay(1); delay.delayTime.value = BEAT * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const delayOut = ctx.createGain(); delayOut.gain.value = 0.4;
  arpBus.connect(delay); delay.connect(fb).connect(delay); delay.connect(delayOut).connect(master);
  function pluck(t, note, level, panTo) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midi(note);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth'; osc2.frequency.value = midi(note); osc2.detune.value = 7;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(5200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    osc.connect(f); osc2.connect(g2).connect(f);
    f.connect(g).connect(pan(panTo)).connect(arpBus);
    osc.start(t); osc2.start(t); osc.stop(t + 0.36); osc2.stop(t + 0.36);
  }
  const ARP = [0, 2, 3, 2, 1, 2, 3, 1]; // indices into the chord, per eighth note
  for (let t = 4; t < 52; t += BEAT / 2) {
    const sec = section(t);
    const i = Math.round(t / (BEAT / 2));
    const chord = chordAt(t);
    if (sec === 'intro') { if (i % 4 === 0) pluck(t, chord[ARP[(i / 4) % 8 | 0]] + 12, 0.07, -0.2); continue; }
    if (sec === 'break') { if (i % 4 === 0 || i % 8 === 3) pluck(t, chord[ARP[i % 8]] + 12, 0.08, 0.2); continue; }
    const level = sec === 'climax' ? 0.15 : 0.12;
    pluck(t, chord[ARP[i % 8]] + 12, level, (i % 2 ? 0.3 : -0.3));
    if (sec === 'climax' && i % 2 === 0) pluck(t + BEAT / 4, chord[ARP[(i + 3) % 8]] + 24, 0.07, 0.1);
  }
  // Lead line over the climax: long notes on top of the chords.
  [[42, 74], [44, 77], [46, 74], [48, 72], [50, 76], [51, 79]].forEach(([t, note]) => {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = midi(note);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    osc.connect(f).connect(g).connect(arpBus);
    osc.start(t); osc.stop(t + 2);
  });

  // --- Risers and impacts ----------------------------------------------------
  function riser(start, end, level) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, start);
    f.frequency.exponentialRampToValueAtTime(9000, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, end - 0.02);
    g.gain.linearRampToValueAtTime(0, end + 0.03);
    src.connect(f).connect(g).connect(master);
    const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s).connect(reverb);
    src.start(start); src.stop(end + 0.05);
  }
  function impact(t, level = 1) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 1.9);
    noiseHit(t, { type: 'lowpass', freq: 5000, q: 0.5, decay: 1.4, level: 0.3 * level, send: 0.9 });
  }
  riser(8, 12, 0.2);
  riser(39, 42, 0.24);
  riser(50.5, 52, 0.16);
  impact(12); impact(42); impact(52, 1.1);
  impact(0.02, 0.5);

  // Fade the tail out under the end card.
  master.gain.setValueAtTime(0.9, 56.5);
  master.gain.linearRampToValueAtTime(0, 60.3);

  const rendered = await ctx.startRendering();
  return { sampleRate: SR, left: rendered.getChannelData(0), right: rendered.getChannelData(1) };
};
