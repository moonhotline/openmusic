import { analyze, renderScore, wav } from "../../packages/audio/index.ts";
import type { Score } from "../../packages/score/index.ts";

self.addEventListener("message", (event: MessageEvent<{ id: number; score: Score; exportWav?: boolean }>) => {
  const { id, score, exportWav } = event.data;
  try {
    const pcm = renderScore(score);
    const report = analyze(pcm);
    if (exportWav) {
      const bytes = wav(pcm);
      self.postMessage({ id, report, bytes }, { transfer: [bytes] });
    } else {
      self.postMessage({ id, report, pcm }, { transfer: [pcm.left.buffer, pcm.right.buffer] });
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Render failed" });
  }
});
