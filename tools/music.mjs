import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { analyze, renderScore, wav } from "../packages/audio/index.ts";
import { applyProposal, compileScore, frameAtBeat, validateScore } from "../packages/score/index.ts";
import { score as defaultScore, demoProposal } from "../examples/glass-meridian/score.ts";

const { positionals: [command, input], values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, bars: { type: "string" }, proposal: { type: "string" } },
});

const json = (data) => JSON.stringify(data, null, 2) + "\n";

async function readScore(path) {
  if (!path) return defaultScore;
  if (path.endsWith(".json")) return JSON.parse(await readFile(path, "utf8"));
  const module = await import(pathToFileURL(resolve(path)));
  return module.default ?? module.score;
}

function crop(pcm, score, bars) {
  if (!bars) return pcm;
  const range = /^(\d+):(\d+)$/.exec(bars);
  if (!range) throw new Error("Use --bars FIRST:LAST with inclusive, 1-based bar numbers");
  const first = Number(range[1]);
  const last = Number(range[2]);
  if (first < 1 || last < first || last > score.bars) throw new Error("Bar range is outside the score");
  const start = frameAtBeat((first - 1) * 4, score.bpm);
  const end = frameAtBeat(last * 4, score.bpm);
  return { left: pcm.left.subarray(start, end), right: pcm.right.subarray(start, end) };
}

async function save(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function remote(path, payload) {
  const { OPENMUSIC_WORKER, OPENMUSIC_AGENT_TOKEN } = process.env;
  if (!OPENMUSIC_WORKER || !OPENMUSIC_AGENT_TOKEN) throw new Error("Set OPENMUSIC_WORKER and OPENMUSIC_AGENT_TOKEN");
  const endpoint = new URL(OPENMUSIC_WORKER);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) {
    throw new Error("The shared Worker requires HTTPS");
  }
  const result = await fetch(new URL(path, endpoint), {
    method: payload ? "POST" : "GET",
    headers: { Authorization: "Bearer " + OPENMUSIC_AGENT_TOKEN, "Content-Type": "application/json" },
    body: payload,
    redirect: "error",
  });
  if (!result.ok) throw new Error("Worker " + result.status + ": " + await result.text());
  return result.json();
}

async function videoProject(score, directory) {
  const pcm = renderScore(score);
  const report = analyze(pcm);
  const timeline = { seconds: report.seconds, waveform: report.waveform, bpm: score.bpm, cues: compileScore(score).cues };
  const template = await readFile(new URL("./composition.html", import.meta.url), "utf8");
  const title = score.title.replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);
  const prism = stripTypeScriptTypes(await readFile(new URL("../packages/prism/index.ts", import.meta.url), "utf8")).replace("export function", "function");
  const html = template.replaceAll("__SECONDS__", () => String(report.seconds))
    .replace("__TITLE__", () => title)
    .replace("__TIMELINE__", () => JSON.stringify(timeline).replaceAll("<", "\\u003c"))
    .replace("__PRISM__", () => prism);
  await save(resolve(directory, "index.html"), html);
  await cp(new URL("../node_modules/gsap/dist/gsap.min.js", import.meta.url), resolve(directory, "gsap.min.js"));
  await save(resolve(directory, "master.wav"), Buffer.from(wav(pcm)));
  await save(resolve(directory, "report.json"), json(report));
  await save(resolve(directory, "score.json"), json(score));
  console.log(json({ directory, seconds: report.seconds, peakDbfs: report.peakDbfs, clippedSamples: report.clippedSamples }).trim());
}

try {
  if (command === "demo-proposal") {
    if (values.out) await save(values.out, json(demoProposal));
    else process.stdout.write(json(demoProposal));
  } else if (command === "submit") {
    if (!input) throw new Error("Usage: pnpm music submit PROPOSAL.json");
    process.stdout.write(json(await remote("/v1/proposals", await readFile(input, "utf8"))));
  } else if (command === "project") {
    process.stdout.write(json(await remote("/v1/project")));
  } else if (["check", "render", "video"].includes(command)) {
    const base = await readScore(input);
    const proposal = values.proposal ? JSON.parse(await readFile(values.proposal, "utf8")) : null;
    validateScore(base);
    const score = proposal ? applyProposal(base, proposal) : base;
    if (command === "check") {
      const compiled = compileScore(score);
      process.stdout.write(json({ title: score.title, bpm: score.bpm, durationFrames: compiled.durationFrames,
        tracks: compiled.tracks.map(({ id, notes }) => ({ id, notes: notes.length })), cues: compiled.cues }));
    } else if (command === "render") {
      const pcm = crop(renderScore(score), score, values.bars);
      const { waveform, ...report } = analyze(pcm);
      const path = values.out ?? "out/glass-meridian.wav";
      await save(path, Buffer.from(wav(pcm)));
      await save(path.replace(/\.wav$/i, "") + ".json", json(report));
      process.stdout.write(json({ path, ...report }));
    } else {
      await videoProject(score, values.out ?? "out/hyperframes");
    }
  } else {
    console.log("pnpm music <check|render|video> [score.ts] [--proposal proposal.json] [--out path]");
    console.log("pnpm music render --bars 5:8");
    console.log("pnpm music <demo-proposal|project|submit PROPOSAL.json>");
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
