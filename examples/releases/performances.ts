export const performances = {
  faith: { title: "Faith", file: "faith-v2.flac", bpm: 98, seconds: 28 * 240 / 98 + 2.4, look: "warm", cues: [
    { beat: 0, preset: "mist" }, { beat: 32, preset: "dispersion", transitionBeats: 6 },
    { beat: 64, preset: "mist", transitionBeats: 6 }, { beat: 80, preset: "dispersion", transitionBeats: 8 },
    { beat: 108, preset: "mist", transitionBeats: 5 },
  ] },
  agi: { title: "AGI", file: "agi-v2.flac", bpm: 124, seconds: 32 * 240 / 124 + 2.4, look: "cool", cues: [
    { beat: 0, preset: "mist" }, { beat: 32, preset: "dispersion", transitionBeats: 4 },
    { beat: 80, preset: "mist", transitionBeats: 6 }, { beat: 96, preset: "dispersion", transitionBeats: 4 },
    { beat: 124, preset: "mist", transitionBeats: 4 },
  ] },
  mist: { title: "Mist", file: "mist.wav", bpm: 105, seconds: 22 * 240 / 105, cues: [
    { beat: 0, preset: "mist" }, { beat: 40, preset: "dispersion" }, { beat: 48, preset: "mist" },
  ] },
} as const;
