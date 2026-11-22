export const SAMPLE_RATE = 48_000;
export const VOICES = ["arp", "bass", "strings", "lead", "kick", "snare", "hat"] as const;

export type Voice = typeof VOICES[number];
export type Note = { beat: number; length: number; midi: number; velocity: number };
export type GainRange = { startBeat: number; endBeat: number; deltaDb: number };
export type Track = { id: string; name: string; voice: Voice; gainDb: number; pan: number; notes: Note[]; gainRanges?: GainRange[] };
export type Cue = { beat: number; preset: "mist" | "dispersion" };
export type Score = { schemaVersion: 1; title: string; bpm: number; bars: number; seed: number; tracks: Track[]; cues: Cue[] };
export type Change =
  | { op: "track-gain"; trackId: string; gainDb: number }
  | ({ op: "track-gain-range"; trackId: string } & GainRange)
  | { op: "note-upsert"; trackId: string; index: number; note: Note }
  | { op: "cue"; cue: Cue };
export type Proposal = { id: string; baseRevision: number; summary: string; changes: Change[] };
export type Workspace = { revision: number; score: Score; pending: Proposal | null; lastDecision: { id: string; accepted: boolean } | null };
export class Conflict extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function within(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return within(value, min, max) && Number.isInteger(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function validNote(note: unknown, beats: number): note is Note {
  return record(note)
    && within(note.beat, 0, beats)
    && within(note.length, 1 / 64, beats - note.beat)
    && integer(note.midi, 0, 127)
    && within(note.velocity, 0, 1);
}

function validCue(cue: unknown, beats: number): cue is Cue {
  return record(cue) && within(cue.beat, 0, beats) && cue.beat < beats
    && (cue.preset === "mist" || cue.preset === "dispersion");
}

function validGainRange(range: unknown, beats: number): range is GainRange {
  return record(range) && within(range.startBeat, 0, beats) && within(range.endBeat, 0, beats)
    && range.endBeat - range.startBeat >= 1 / 64 && within(range.deltaDb, -24, 12);
}

export function validateScore(value: unknown): asserts value is Score {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.title !== "string" || !value.title.trim()
    || value.title.length > 100 || !within(value.bpm, 45, 220) || !integer(value.bars, 1, 32)
    || !integer(value.seed, 0, 0xffffffff) || !Array.isArray(value.tracks) || !value.tracks.length
    || value.tracks.length > 12 || !Array.isArray(value.cues) || value.cues.length > 64) {
    throw new Error("Invalid score header");
  }
  const beats = value.bars * 4;
  const ids = new Set<string>();
  for (const track of value.tracks) {
    if (!record(track) || !validId(track.id) || ids.has(track.id) || typeof track.name !== "string"
      || !track.name.trim() || track.name.length > 48 || !VOICES.includes(track.voice as Voice)
      || !within(track.gainDb, -60, 6) || !within(track.pan, -1, 1) || !Array.isArray(track.notes)
      || track.notes.length > 512 || !track.notes.every((note) => validNote(note, beats))) {
      throw new Error("Invalid track or note");
    }
    if (track.gainRanges !== undefined && (!Array.isArray(track.gainRanges) || track.gainRanges.length > 128
      || !track.gainRanges.every((range, index, ranges) => validGainRange(range, beats)
        && (index === 0 || ranges[index - 1].endBeat <= range.startBeat)))) {
      throw new Error("Invalid or overlapping gain automation");
    }
    ids.add(track.id);
  }
  if (!value.cues.every((cue) => validCue(cue, beats))) throw new Error("Invalid visual cue");
}

export function frameAtBeat(beat: number, bpm: number): number {
  return Math.round(beat * 60 * SAMPLE_RATE / bpm);
}

export function compileScore(score: Score) {
  validateScore(score);
  return {
    durationFrames: frameAtBeat(score.bars * 4, score.bpm),
    tracks: score.tracks.map((track) => ({
      ...track,
      gainFrames: track.gainRanges?.map(range => ({ ...range,
        start: frameAtBeat(range.startBeat, score.bpm), end: frameAtBeat(range.endBeat, score.bpm),
      })),
      notes: track.notes.map((note) => ({
        ...note,
        startFrame: frameAtBeat(note.beat, score.bpm),
        lengthFrames: frameAtBeat(note.beat + note.length, score.bpm) - frameAtBeat(note.beat, score.bpm),
      })),
    })),
    cues: [...score.cues].sort((a, b) => a.beat - b.beat),
  };
}

export function freshWorkspace(score: Score): Workspace {
  validateScore(score);
  return { revision: 0, score, pending: null, lastDecision: null };
}

export function applyProposal(score: Score, input: unknown): Score {
  if (!record(input) || !validId(input.id) || !integer(input.baseRevision, 0, Number.MAX_SAFE_INTEGER)
    || typeof input.summary !== "string" || !input.summary.trim() || input.summary.length > 320
    || !Array.isArray(input.changes) || !input.changes.length || input.changes.length > 128) {
    throw new Error("Invalid proposal header");
  }

  const next = structuredClone(score);
  const beats = next.bars * 4;

  for (const change of input.changes) {
    if (!record(change)) throw new Error("Invalid change");
    if (change.op === "cue") {
      if (!validCue(change.cue, beats)) throw new Error("Invalid visual cue");
      const cue = change.cue;
      next.cues = [...next.cues.filter((existing) => existing.beat !== cue.beat), cue];
      continue;
    }

    const track = next.tracks.find((item) => item.id === change.trackId);
    if (!track) throw new Error("Unknown track");

    if (change.op === "track-gain" && within(change.gainDb, -60, 6)) {
      track.gainDb = change.gainDb;
    } else if (change.op === "track-gain-range" && validGainRange(change, beats)) {
      const { startBeat, endBeat, deltaDb } = change;
      const ranges = (track.gainRanges ?? []).filter(range => range.startBeat !== startBeat || range.endBeat !== endBeat);
      track.gainRanges = [...ranges, { startBeat, endBeat, deltaDb }].sort((a, b) => a.startBeat - b.startBeat);
    } else if (change.op === "note-upsert" && integer(change.index, 0, track.notes.length)
      && validNote(change.note, beats)) {
      track.notes[change.index] = change.note;
    } else {
      throw new Error("Invalid musical change");
    }
  }
  validateScore(next);
  return next;
}

export function submitProposal(workspace: Workspace, input: unknown): Workspace {
  applyProposal(workspace.score, input);
  const proposal = input as Proposal;
  if (workspace.pending?.id === proposal.id && JSON.stringify(workspace.pending) === JSON.stringify(proposal)) return workspace;
  if (workspace.revision !== proposal.baseRevision) throw new Conflict("Proposal is based on an older score");
  if (workspace.pending) throw new Conflict("A proposal is already waiting for a decision");
  if (workspace.lastDecision?.id === proposal.id) throw new Conflict("This proposal has already been reviewed");
  return { ...workspace, pending: proposal };
}

export function decide(workspace: Workspace, id: unknown, accepted: unknown): Workspace {
  if (!validId(id) || typeof accepted !== "boolean") throw new Error("Invalid review decision");
  if (!workspace.pending && workspace.lastDecision?.id === id && workspace.lastDecision.accepted === accepted) return workspace;
  if (workspace.pending?.id !== id) throw new Conflict("Proposal is no longer available for review");
  return {
    revision: workspace.revision + Number(accepted),
    score: accepted ? applyProposal(workspace.score, workspace.pending) : workspace.score,
    pending: null,
    lastDecision: { id, accepted },
  };
}
