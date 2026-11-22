export const performances = {
  faith: { title: "Faith", file: "faith.flac", bpm: 98, seconds: 28 * 240 / 98 + 2.4, cues: [
    { beat: 0, preset: "mist" }, { beat: 32, preset: "dispersion" }, { beat: 64, preset: "mist" },
    { beat: 80, preset: "dispersion" },
  ] },
  agi: { title: "AGI", file: "agi.flac", bpm: 124, seconds: 32 * 240 / 124 + 2.4, cues: [
    { beat: 0, preset: "mist" }, { beat: 32, preset: "dispersion" }, { beat: 80, preset: "mist" },
    { beat: 96, preset: "dispersion" },
  ] },
  mist: { title: "Mist", file: "mist.wav", bpm: 105, seconds: 22 * 240 / 105, cues: [
    { beat: 0, preset: "mist" }, { beat: 40, preset: "dispersion" }, { beat: 48, preset: "mist" },
  ] },
} as const;
