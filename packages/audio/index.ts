import { SAMPLE_RATE, compileScore } from "../score/index.ts";
import type { Score } from "../score/index.ts";
import { makeVoice } from "./voices.ts";

export type Stereo = { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> };
export type AudioReport = { frames: number; seconds: number; peakDbfs: number; rmsDbfs: number; clippedSamples: number; waveform: number[] };

function db(amplitude: number) {
  return Math.round(200 * Math.log10(Math.max(1e-6, amplitude))) / 10;
}

export function renderScore(score: Score): Stereo {
  const compiled = compileScore(score);
  const left = new Float32Array(compiled.durationFrames);
  const right = new Float32Array(compiled.durationFrames);
  const crossDelay = Math.round(SAMPLE_RATE * 0.217);
  const nearDelay = Math.round(SAMPLE_RATE * 0.083);

  for (const track of compiled.tracks) {
    const gain = 10 ** (track.gainDb / 20);
    const pan = (track.pan + 1) * Math.PI / 4;
    const leftGain = Math.cos(pan) * gain;
    const rightGain = Math.sin(pan) * gain;
    const wet = track.voice === "strings" || track.voice === "lead" ? 0.24 : track.voice === "arp" ? 0.18 : 0;

    for (const [index, note] of track.notes.entries()) {
      const voice = makeVoice(track.voice, note.midi, score.seed ^ Math.imul(note.midi + 3, index + 177));
      for (let i = 0; i < note.lengthFrames; i++) {
        const sample = voice(i, note.lengthFrames) * note.velocity;
        const frame = note.startFrame + i;
        left[frame] += sample * leftGain;
        right[frame] += sample * rightGain;
        if (!wet) continue;
        if (frame + nearDelay < left.length) left[frame + nearDelay] += sample * rightGain * wet * 0.66;
        if (frame + crossDelay < right.length) right[frame + crossDelay] += sample * leftGain * wet;
      }
    }
  }

  for (let frame = 0; frame < left.length; frame++) {
    const fade = Math.min(1, (left.length - frame - 1) / 2400);
    left[frame] = 0.96 * Math.tanh(left[frame] * 2.3) * fade;
    right[frame] = 0.96 * Math.tanh(right[frame] * 2.3) * fade;
  }
  return { left, right };
}

export function analyze(pcm: Stereo): AudioReport {
  const frames = pcm.left.length;
  const waveform = new Array<number>(96).fill(0);
  let peak = 0;
  let sum = 0;
  let clippedSamples = 0;

  for (let i = 0; i < frames; i++) {
    const left = pcm.left[i];
    const right = pcm.right[i];
    const magnitude = Math.max(Math.abs(left), Math.abs(right));
    peak = Math.max(peak, magnitude);
    sum += left * left + right * right;
    clippedSamples += Number(Math.abs(left) >= 1) + Number(Math.abs(right) >= 1);
    const bucket = Math.floor(i * waveform.length / frames);
    waveform[bucket] = Math.max(waveform[bucket], magnitude);
  }
  return { frames, seconds: frames / SAMPLE_RATE, peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(sum / (2 * frames))),
    clippedSamples, waveform };
}

export function wav(pcm: Stereo): ArrayBuffer {
  const length = pcm.left.length * 4;
  const output = new ArrayBuffer(length + 44);
  const view = new DataView(output);
  const tag = (text: string, offset: number) =>
    [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  tag("RIFF", 0);
  view.setUint32(4, length + 36, true);
  tag("WAVEfmt ", 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  tag("data", 36);
  view.setUint32(40, length, true);
  const sample = (value: number) => Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767));
  for (let i = 0; i < pcm.left.length; i++) {
    view.setInt16(44 + i * 4, sample(pcm.left[i]), true);
    view.setInt16(46 + i * 4, sample(pcm.right[i]), true);
  }
  return output;
}
