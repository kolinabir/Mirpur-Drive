# Audio licenses

**No sampled audio files ship in this directory.** Every sound in the car pass (engine,
horn, tyre skid, enter/exit thunk, and the street-ambience bed) is **synthesized at runtime**
by WebAudio nodes in `src/drive.js` (`initAudio()` / `stepAudio()`), not decoded from a file.

## Why no CC0 samples were fetched this pass

The brief asked for CC0 samples specifically for horn, skid, and an ambience bed. A search of
Kenney's audio-tagged packs (kenney.nl) and OpenGameArt's CC0-filtered results during this
pass did not turn up a pack with a Dhaka-appropriate air-horn / tyre-skid / street-ambience
trio that was clearly and individually CC0-licensed (Kenney's `car-kit` pack, used for the
mesh, ships no audio; OpenGameArt's advanced search did not return a matching CC0 hit in the
time budget for this pass). Rather than ship a sample whose licence could not be verified
file-by-file, all four effects were synthesized instead:

- **Horn**: two detuned square oscillators (a "beep-beep" interval, not a continuous tone)
  through a bandpass filter, bound to `H`.
- **Tyre skid**: filtered white noise (bandpass around 1-2 kHz, tightened) gated to the
  handbrake, so it starts/stops with the skid-mark decals.
- **Enter/exit thunk**: a short low-frequency sine burst with a fast exponential decay.
- **Ambience bed**: two filtered-noise loops (looping `AudioBufferSourceNode`s built from
  generated noise buffers, not a downloaded file) mixed low and looping continuously once the
  audio context is running.

This carries zero licensing risk (nothing here is a third-party asset) at the cost of the
"Dhaka air-horn" flavour the brief called out. If a proper CC0 horn/skid/ambience sample pack
is sourced in a later pass, drop the files here, add rows to a table in this file in the same
style as `public/models/LICENSES.md`, and swap the corresponding oscillator/noise voice in
`src/drive.js` for an `AudioBufferSourceNode` playing the sample.
