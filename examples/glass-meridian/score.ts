import { validateScore } from "../../packages/score/index.ts";
import type { Note, Proposal, Score } from "../../packages/score/index.ts";

const note = (beat: number, length: number, midi: number, velocity: number): Note => ({ beat, length, midi, velocity });
const chords = [
  [45, 57, 60, 64, 71], [41, 53, 57, 60, 64], [48, 55, 60, 64, 67], [43, 55, 57, 62, 65],
  [45, 57, 60, 64, 71], [41, 57, 60, 64, 69], [48, 55, 59, 64, 67], [44, 56, 59, 62, 64],
];
const arp = chords.flatMap((chord, bar) => [1, 3, 2, 4, 1, 3, 2, 4].map((degree, step) =>
  note(bar * 4 + step / 2 + (step % 2) * 0.023, step % 4 === 0 ? 0.47 : 0.33, chord[degree] + 12, step % 4 === 0 ? 0.7 : 0.40)));
const bass = chords.flatMap((chord, bar) => [0, 0.75, 1.5, 2, 2.75, 3.5].map((beat, i) =>
  note(bar * 4 + beat, i % 3 === 0 ? 0.65 : 0.21, chord[0] - (i === 5 ? 0 : 12), i % 3 === 0 ? 0.74 : 0.54)));
const strings = chords.flatMap((chord, bar) =>
  chord.slice(1).map((pitch, index) => note(bar * 4 + index * 0.045, 3.85 - index * 0.045, pitch + (index > 1 ? 12 : 0), 0.49 + index * 0.06)));
const leadPhrases = [
  [null, null, null, null], [null, null, 76, 79], [81, 79, 76, 74], [74, null, 71, null],
  [76, 79, 83, 81], [84, 81, 79, 76], [79, 83, 86, 84], [83, 80, 76, null],
];
const lead = leadPhrases.flatMap((phrase, bar) => phrase.flatMap((pitch, index) =>
  pitch === null ? [] : [note(bar * 4 + [0, 1.1, 2, 3.15][index], [0.84, 0.7, 0.94, 0.7][index], pitch, index === 0 ? 0.71 : 0.55)]));
const drums = (pattern: number[], midi: number, length: number, velocity: number) =>
  chords.flatMap((_, bar) => pattern.map((beat, index) =>
    note(bar * 4 + beat, Math.min(length, 4 - beat), midi, velocity * (index % 2 === 0 ? 1 : 0.68))));

export const score: Score = {
  schemaVersion: 1,
  title: "Glass Meridian",
  bpm: 105,
  bars: 8,
  seed: 4099,
  tracks: [
    { id: "arp", name: "Glass arpeggio", voice: "arp", gainDb: -11, pan: -0.26, notes: arp },
    { id: "bass", name: "Analog bass", voice: "bass", gainDb: -9, pan: 0, notes: bass },
    { id: "strings", name: "Chamber strings", voice: "strings", gainDb: -13, pan: 0.23, notes: strings },
    { id: "lead", name: "Overtone lead", voice: "lead", gainDb: -12, pan: 0.05, notes: lead },
    { id: "kick", name: "Kick", voice: "kick", gainDb: -12, pan: 0, notes: drums([0, 1.5, 2, 3.25], 36, 0.42, 0.85) },
    { id: "snare", name: "Snare", voice: "snare", gainDb: -17, pan: -0.06, notes: drums([1, 3], 38, 0.28, 0.8) },
    { id: "hat", name: "Hi-hat", voice: "hat", gainDb: -23, pan: 0.32, notes: drums([0.5, 1.02, 1.55, 2.5, 3.03, 3.57], 42, 0.16, 0.62) },
  ],
  cues: [{ beat: 0, preset: "mist" }],
};

validateScore(score);

export const demoProposal: Proposal = {
  id: "lift-strings-bar-five",
  baseRevision: 0,
  summary: "第 5 小节抬升弦乐，并在第一拍展开棱镜。",
  changes: [
    { op: "track-gain-range", trackId: "strings", startBeat: 16, endBeat: 20, deltaDb: 5 },
    { op: "cue", cue: { beat: 16, preset: "dispersion" } },
  ],
};
