import { SAMPLE_RATE } from "../score/index.ts";
import type { Voice } from "../score/index.ts";

const TAU = 2 * Math.PI;

function noiseSource(seed: number) {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
}

const decay = (time: number, rate: number) => Math.exp(-time * rate);

export function makeVoice(voice: Voice, midi: number, seed: number) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const startPhase = (seed >>> 0) % 357 / 357;
  const noise = noiseSource(seed);
  let smoothed = 0;
  return (sample: number, length: number): number => {
    const t = sample / SAMPLE_RATE;
    const remaining = (length - sample) / SAMPLE_RATE;
    const phase = TAU * frequency * t;
    const envelope = Math.max(0, Math.min(1, t / 0.006, remaining / 0.024));

    switch (voice) {
      case "kick": {
        const sweep = TAU * (48 * t + 75 / 35 * (1 - decay(t, 35)));
        return envelope * (Math.sin(sweep) * decay(t, 12) + 0.13 * noise() * decay(t, 150));
      }
      case "snare": {
        const white = noise();
        smoothed += (white - smoothed) * 0.31;
        return envelope * (0.85 * (white - smoothed) * decay(t, 17)
          + 0.36 * Math.sin(TAU * 179 * t) * decay(t, 30));
      }
      case "hat": {
        const white = noise();
        smoothed += (white - smoothed) * 0.58;
        return envelope * (white - smoothed) * decay(t, 35);
      }
      case "bass":
        return envelope * (0.68 * Math.sin(phase)
          + decay(t, 3.9) * (0.24 * Math.sin(phase * 2) + 0.13 * Math.sin(phase * 3)));
      case "arp":
        return envelope * decay(t, 4.9) * (0.57 * Math.sin(phase + 1.4 * decay(t, 8) * Math.sin(phase * 2.001))
          + 0.21 * Math.sin(phase * 1.003 + startPhase) + 0.09 * Math.sin(phase * 3.006));
      case "strings": {
        const bow = Math.max(0, Math.min(1, t / 0.34, remaining / 0.26));
        const vibrato = Math.sin(TAU * (4.5 + startPhase) * t + startPhase * 2) * Math.min(t, 0.24);
        const carrier = phase + vibrato + startPhase * TAU;
        const body = Math.sin(carrier) * 0.32 + Math.sin(2 * carrier) * 0.20
          + Math.sin(3 * carrier) * 0.13 + Math.sin(4 * carrier) * 0.07 + Math.sin(5 * carrier) * 0.05;
        const ensemble = Math.sin(phase * 0.997 + startPhase + 1.2) * 0.15
          + Math.sin(phase * 2.006 - vibrato) * 0.08;
        return bow * (body + ensemble);
      }
      case "lead": {
        const vibrato = 0.23 * Math.sin(32 * t) * Math.min(1, t / 0.3);
        const swell = Math.max(0, Math.min(1, t / 0.09, remaining / 0.11));
        return swell * (0.54 * Math.sin(phase + vibrato)
          + 0.23 * Math.sin(phase * 1.004 - vibrato) + 0.14 * Math.sin(phase * 2));
      }
    }
  };
}
