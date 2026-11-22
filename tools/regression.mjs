import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyze, renderScore, wav } from "../packages/audio/index.ts";
import { applyProposal, frameAtBeat } from "../packages/score/index.ts";
import { demoProposal, score } from "../examples/glass-meridian/score.ts";
import worker, { MusicProject } from "../apps/worker/index.ts";

const values = new Map();
const store = { get: async (key) => values.get(key), put: async (key, value) => { values.set(key, value); } };
const project = new MusicProject({ storage: { ...store, transaction: (fn) => fn(store) } });
const env = {
  AGENT_TOKEN: "regression-agent-token-0000",
  REVIEW_TOKEN: "regression-review-token-0000",
  STUDIO_ORIGINS: "https://studio.test",
  PROJECT: { idFromName: (name) => name, get: () => project },
};

async function request(path, token, body, origin) {
  const headers = new Headers();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (body) headers.set("Content-Type", "application/json");
  if (origin) headers.set("Origin", origin);
  return worker.fetch(new Request("https://worker.test" + path, {
    headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
  }), env);
}

const agent = env.AGENT_TOKEN;
const reviewer = env.REVIEW_TOKEN;
assert.equal((await request("/v1/project", null)).status, 401);
assert.equal((await request("/v1/project", reviewer, null, "https://unrecognized.test")).status, 403);
assert.equal((await request("/v1/proposals", reviewer, demoProposal)).status, 401);

function pcmRequest(token) {
  const headers = { "Content-Type": "audio/pcm", "X-Sample-Rate": "48000", "X-Channels": "2", Origin: "https://studio.test" };
  if (token) headers.Authorization = "Bearer " + token;
  return new Request("https://worker.test/v1/audio/pcm?gainDb=-6", { method: "POST", headers, body: new Uint8Array([1, 2, 3, 4]) });
}

assert.equal((await worker.fetch(pcmRequest(), env)).status, 401);
assert.equal((await worker.fetch(pcmRequest(agent), env)).status, 503);
const bound = {
  ...env,
  AUDIO: { async fetch(incoming) {
    assert.equal(incoming.headers.get("Authorization"), null);
    assert.equal(incoming.bodyUsed, false);
    assert.equal(new URL(incoming.url).searchParams.get("gainDb"), "-6");
    return new Response(incoming.body, { headers: { "Content-Type": "audio/pcm", "X-Sample-Rate": "48000", "X-Channels": "2" } });
  } },
};
for (const token of [agent, reviewer]) {
  const response = await worker.fetch(pcmRequest(token), bound);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://studio.test");
  assert.match(response.headers.get("Access-Control-Expose-Headers"), /X-Channels/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
}
const pending = await request("/v1/proposals", agent, demoProposal);
assert.equal(pending.status, 200);
assert.equal((await pending.json()).pending.id, demoProposal.id);
assert.equal((await request("/v1/proposals", agent, demoProposal)).status, 200);
const altered = { ...demoProposal, summary: "A different pending revision" };
assert.equal((await request("/v1/proposals", agent, altered)).status, 409);
const decision = { id: demoProposal.id, accepted: true };
assert.equal((await request("/v1/decision", agent, decision)).status, 401);
const approved = await request("/v1/decision", reviewer, decision, "https://studio.test");
assert.equal(approved.status, 200);
assert.equal(approved.headers.get("Access-Control-Allow-Origin"), "https://studio.test");
const result = await approved.json();
assert.equal(result.revision, 1);
assert.equal(result.pending, null);
assert.deepEqual(result.score, applyProposal(score, demoProposal));
assert.deepEqual(await (await request("/v1/decision", reviewer, decision)).json(), result);
assert.equal((await request("/v1/proposals", agent, demoProposal)).status, 409);

const a = renderScore(score);
const b = renderScore(result.score);
const metrics = analyze(b);
assert.equal(metrics.frames, frameAtBeat(32, 105));
assert.equal(metrics.clippedSamples, 0);
assert.ok(metrics.peakDbfs > -8 && metrics.peakDbfs < 0);
assert.ok(metrics.rmsDbfs > -25);
const digest = (pcm) => createHash("sha256").update(Buffer.from(wav(pcm))).digest("hex");
assert.notEqual(digest(a), digest(b));
assert.equal(digest(b), digest(renderScore(result.score)));
const output = new DataView(wav(b));
assert.equal(output.getUint16(22, true), 2);
assert.equal(output.getUint32(24, true), 48000);
assert.equal(output.getUint32(40, true), metrics.frames * 4);
console.log("Passed agent submit, human decision, stale revision, CORS, deterministic A/B and WAV export.");
