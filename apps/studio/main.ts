import { applyProposal, decide, freshWorkspace, SAMPLE_RATE, submitProposal } from "../../packages/score/index.ts";
import type { Change, Score, Workspace } from "../../packages/score/index.ts";
import { wav } from "../../packages/audio/index.ts";
import type { AudioReport, Stereo } from "../../packages/audio/index.ts";
import { demoProposal, score } from "../../examples/glass-meridian/score.ts";

type Render = { pcm: Stereo; report: AudioReport };
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => byId<HTMLButtonElement>(id);
const seek = byId<HTMLInputElement>("seek");
const storageKey = "openmusic-v1";
const renderer = new Worker(new URL("./render-worker.js", import.meta.url), { type: "module" });
const renders = new Map<string, Promise<Render>>();
const jobs = new Map<number, { resolve: (render: Render) => void; reject: (error: Error) => void }>();
let jobId = 0;
let workspace = readWorkspace();
let selected = "A";
let rendered: Render | undefined;
let context: AudioContext | undefined;
let source: AudioBufferSourceNode | undefined;
let buffer: AudioBuffer | undefined;
let auditionGain: GainNode | undefined;
let referenceRms = -18;
let startTime = 0;
let position = 0;
let requestVersion = 0;
let animation = 0;
let busy = false;
let cloud: { endpoint: URL; token: string } | undefined;

function readWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved) as Workspace;
  } catch { /* Private mode can disable storage. */ }
  return submitProposal(freshWorkspace(score), demoProposal);
}

function updateWorkspace(next: Workspace) {
  workspace = next;
  if (!cloud) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { notify("当前浏览器无法保存审核记录。"); }
  }
}

function notify(message: string) {
  byId("notice").textContent = message;
}

renderer.onmessage = (event: MessageEvent<Render & { id: number; error?: string }>) => {
  const { id, error } = event.data;
  const job = jobs.get(id);
  jobs.delete(id);
  if (error) job?.reject(new Error(error));
  else job?.resolve(event.data);
};
renderer.onerror = () => {
  for (const job of jobs.values()) job.reject(new Error("音频渲染进程出现错误，请重载网页。"));
  jobs.clear();
};

function render(music: Score) {
  const key = JSON.stringify(music);
  const cached = renders.get(key);
  if (cached) return cached;
  const id = ++jobId;
  const result = new Promise<Render>((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    renderer.postMessage({ id, score: music });
  });
  renders.set(key, result);
  if (renders.size > 2) renders.delete(renders.keys().next().value!);
  void result.catch(() => {
    if (renders.get(key) === result) renders.delete(key);
  });
  return result;
}

function displayScore(): Score {
  return selected === "B" && workspace.pending ? applyProposal(workspace.score, workspace.pending) : workspace.score;
}

function time() {
  return source && context ? position + context.currentTime - startTime : position;
}

function pause(at = time()) {
  if (source) {
    source.onended = null;
    source.stop();
    source.disconnect();
    source = undefined;
  }
  cancelAnimationFrame(animation);
  position = Math.max(0, Math.min(Number(seek.max), at));
  button("play").textContent = "播放";
  paint();
}

function play() {
  if (!context || !rendered || source) return;
  if (position >= rendered.report.seconds - 0.01) position = 0;
  if (!buffer) {
    buffer = context.createBuffer(2, rendered.pcm.left.length, SAMPLE_RATE);
    buffer.copyToChannel(rendered.pcm.left, 0);
    buffer.copyToChannel(rendered.pcm.right, 1);
  }
  const node = context.createBufferSource();
  node.buffer = buffer;
  if (!auditionGain) {
    auditionGain = context.createGain();
    auditionGain.connect(context.destination);
  }
  auditionGain.gain.value = Math.min(1, 10 ** ((-18 - referenceRms) / 20));
  node.connect(auditionGain);
  startTime = context.currentTime;
  source = node;
  node.onended = () => {
    if (source !== node) return;
    node.disconnect();
    source = undefined;
    pause(Number(seek.max));
  };
  node.start(0, position);
  button("play").textContent = "暂停";
  tick();
}

function paint() {
  const at = time();
  const seconds = Number(seek.max);
  seek.value = String(at);
  const stamp = (value: number) => Math.floor(value / 60) + ":" + String(Math.floor(value % 60)).padStart(2, "0");
  byId("time").textContent = stamp(at) + " / " + stamp(seconds);
  const progress = Math.min(1, at / seconds);
  document.querySelector<HTMLElement>(".track-grid")?.style.setProperty("--cursor", progress * 100 + "%");
  Array.from(byId("wave").children).forEach((bar, index) => bar.classList.toggle("past", index / 96 < progress));

}

function tick() {
  paint();
  if (source) animation = requestAnimationFrame(tick);
}

function beatLabel(beat: number) {
  const part = Number((beat % 4 + 1).toFixed(2));
  return "第 " + (Math.floor(beat / 4) + 1) + " 小节第 " + part + " 拍";
}

function changeStart(change: Change) {
  if (change.op === "cue") return change.cue.beat;
  if (change.op === "track-gain-range") return change.startBeat;
  if (change.op === "note-upsert") return change.note.beat;
  return 0;
}

function describeChange(change: Change) {
  const at = beatLabel(changeStart(change));
  if (change.op === "cue") return at + " · " + (change.cue.preset === "dispersion" ? "展开棱镜" : "收束光束");
  const track = workspace.score.tracks.find(item => item.id === change.trackId)!;
  if (change.op === "track-gain") return track.name + " · 整轨 " + track.gainDb + " → " + change.gainDb + " dB";
  if (change.op === "note-upsert") {
    const before = track.notes[change.index];
    const pitch = before ? before.midi + " → " + change.note.midi : String(change.note.midi);
    return track.name + " · " + at + " · 音符 " + pitch;
  }
  const scope = change.endBeat === change.startBeat + 4 && change.startBeat % 4 === 0
    ? "第 " + (change.startBeat / 4 + 1) + " 小节"
    : at + "起 · " + Number((change.endBeat - change.startBeat).toFixed(2)) + " 拍";
  return track.name + " · " + scope + " · " + (change.deltaDb > 0 ? "+" : "") + change.deltaDb + " dB";
}

function affectsBar(change: Change, start: number) {
  if (change.op === "track-gain") return true;
  if (change.op === "track-gain-range") return change.startBeat < start + 4 && change.endBeat > start;
  const at = changeStart(change);
  return at >= start && at < start + 4;
}

function showWorkspace() {
  const music = displayScore();
  const changes = workspace.pending?.changes ?? [];
  const beats = music.bars * 4;
  byId("score-title").textContent = music.title;
  byId("tempo").textContent = music.bpm + " BPM · " + music.bars + " 小节";
  byId("revision").textContent = "版本 " + workspace.revision;
  byId("review-state").textContent = workspace.pending ? "待审核" : workspace.lastDecision?.accepted ? "已采纳" : workspace.lastDecision ? "已驳回" : "暂无提案";
  byId("summary").textContent = workspace.pending?.summary ?? "";
  byId("auditions").hidden = !workspace.pending;
  byId("decision").hidden = !workspace.pending;
  byId("import").parentElement!.hidden = Boolean(cloud);
  byId("cloud-audio").hidden = !cloud;
  for (const id of ["baseline", "candidate", "accept", "reject"]) button(id).disabled = busy;
  button("baseline").setAttribute("aria-pressed", String(selected === "A"));
  button("candidate").setAttribute("aria-pressed", String(selected === "B"));
  byId("changes").replaceChildren(...changes.map(change => {
    const row = document.createElement("li");
    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = describeChange(change);
    jump.addEventListener("click", () => seekTo(changeStart(change) * 60 / music.bpm));
    row.append(jump);
    return row;
  }));
  byId("bars").replaceChildren(...Array.from({ length: music.bars }, (_, index) => {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.textContent = String(index + 1);
    bar.setAttribute("aria-label", "跳到第 " + (index + 1) + " 小节");
    bar.classList.toggle("affected", changes.some(change => affectsBar(change, index * 4)));
    bar.addEventListener("click", () => seekTo(index * 240 / music.bpm));
    return bar;
  }));
  byId("tracks").style.setProperty("--bar-width", 100 / music.bars + "%");
  const rows = music.tracks.map((track) => {
    const trackChanges = changes.filter(change => change.op !== "cue" && change.trackId === track.id);
    const row = document.createElement("li");
    row.classList.toggle("affected", trackChanges.length > 0);
    const name = document.createElement("span");
    name.textContent = track.name;
    const lane = document.createElement("span");
    lane.className = "track-notes";
    lane.setAttribute("aria-hidden", "true");
    for (const range of track.gainRanges ?? []) {
      const region = document.createElement("b");
      region.style.left = range.startBeat / beats * 100 + "%";
      region.style.width = (range.endBeat - range.startBeat) / beats * 100 + "%";
      lane.append(region);
    }
    const pitches = track.notes.map(note => note.midi);
    const high = Math.max(0, ...pitches);
    const low = Math.min(high, ...pitches);
    for (const [index, note] of track.notes.entries()) {
      const mark = document.createElement("i");
      mark.style.left = note.beat / beats * 100 + "%";
      mark.style.width = note.length / beats * 100 + "%";
      mark.style.setProperty("--pitch", low === high ? "46%" : 14 + 63 * (high - note.midi) / (high - low) + "%");
      mark.classList.toggle("changed", trackChanges.some(change => change.op === "note-upsert" && change.index === index));
      lane.append(mark);
    }
    const gain = document.createElement("span");
    gain.className = "track-gain";
    gain.textContent = track.gainDb + " dB";
    row.append(name, lane, gain);
    return row;
  });
  byId("tracks").replaceChildren(...rows);
}

async function refresh() {
  const version = ++requestVersion;
  const baseline = render(workspace.score);
  const candidate = workspace.pending ? render(applyProposal(workspace.score, workspace.pending)) : baseline;
  void candidate.catch(() => {});
  if (!rendered) {
    showWorkspace();
    button("play").disabled = button("export").disabled = button("cloud-export").disabled = true;
    button("play").textContent = "生成试听…";
  }
  try {
    const [result, reference] = await Promise.all([selected === "B" ? candidate : baseline, baseline]);
    if (version !== requestVersion) return;
    const wasPlaying = Boolean(source);
    pause();
    rendered = result;
    referenceRms = reference.report.rmsDbfs;
    buffer = undefined;
    showWorkspace();
    seek.max = String(result.report.seconds);
    position = Math.min(position, result.report.seconds);
    byId("wave").replaceChildren(...result.report.waveform.map((peak) => {
      const bar = document.createElement("i");
      bar.style.setProperty("--amplitude", Math.max(3, peak * 93) + "%");
      return bar;
    }));
    button("play").disabled = false;
    button("export").disabled = false;
    button("cloud-export").disabled = processingAudio;
    if (wasPlaying && position < result.report.seconds - 0.01) play();
    else paint();
  } catch (error) {
    if (version === requestVersion) notify(message(error));
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

async function fetchWorkspace(connection: NonNullable<typeof cloud>, route: string, payload?: unknown) {
  const response = await fetch(new URL(route, connection.endpoint), {
    method: payload ? "POST" : "GET",
    headers: { Authorization: "Bearer " + connection.token, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    redirect: "error",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "请求失败");
  return body as Workspace;
}

async function review(accepted: boolean) {
  if (busy || !workspace.pending) return;
  const id = workspace.pending.id;
  busy = true;
  showWorkspace();
  try {
    updateWorkspace(cloud ? await fetchWorkspace(cloud, "/v1/decision", { id, accepted }) : decide(workspace, id, accepted));
    selected = "A";
    notify(accepted ? "已采纳到版本 " + workspace.revision + "。" : "已驳回提案。");
    await refresh();
  } catch (error) {
    notify(message(error));
  } finally {
    busy = false;
    showWorkspace();
  }
}

button("play").addEventListener("click", async () => {
  if (source) return pause();
  try {
    context ??= new AudioContext();
    await context.resume();
    play();
  } catch (error) { notify(message(error)); }
});

function seekTo(at: number) {
  const playing = Boolean(source);
  pause(at);
  if (playing) play();
}

seek.addEventListener("input", () => seekTo(Number(seek.value)));
button("baseline").addEventListener("click", () => { if (selected !== "A") { selected = "A"; void refresh(); } });
button("candidate").addEventListener("click", () => { if (selected !== "B") { selected = "B"; void refresh(); } });
button("accept").addEventListener("click", () => void review(true));
button("reject").addEventListener("click", () => void review(false));
function downloadWav(bytes: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name + ".wav";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportName() {
  return selected === "B" ? "glass-meridian-proposal" : "glass-meridian";
}

button("export").addEventListener("click", () => {
  if (rendered) downloadWav(wav(rendered.pcm), exportName());
});

let processingAudio = false;
byId("cloud-audio").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!rendered || !cloud || processingAudio) return;
  processingAudio = true;
  button("cloud-export").disabled = true;
  const name = exportName();
  try {
    const bytes = wav(rendered.pcm);
    const samples = new Uint8Array(bytes, 44);
    const endpoint = new URL("/v1/audio/pcm", cloud.endpoint);
    endpoint.searchParams.set("gainDb", byId<HTMLInputElement>("gain-db").value);
    notify("正在通过 Rust Worker 处理音频…");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + cloud.token, "Content-Type": "audio/pcm", "X-Sample-Rate": String(SAMPLE_RATE), "X-Channels": "2" },
      body: samples,
      redirect: "error",
    });
    if (!response.ok || !response.body || response.headers.get("Content-Type") !== "audio/pcm") {
      await response.body?.cancel();
      throw new Error("音频处理失败（HTTP " + response.status + "）。");
    }
    if (response.headers.get("X-Sample-Rate") !== String(SAMPLE_RATE) || response.headers.get("X-Channels") !== "2") {
      await response.body.cancel();
      throw new Error("音频输出格式与当前乐谱不符。");
    }
    let offset = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.length > samples.length) throw new Error("音频输出长度超出预期。");
        samples.set(value, offset);
        offset += value.length;
      }
      if (offset !== samples.length) throw new Error("音频输出不完整。");
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    downloadWav(bytes, name + "-processed");
    notify("音频处理完成，WAV 已导出。");
  } catch (error) {
    notify(message(error));
  } finally {
    processingAudio = false;
    button("cloud-export").disabled = !rendered;
  }
});
byId("import").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy || cloud) return;
  try {
    updateWorkspace(submitProposal(workspace, JSON.parse(byId<HTMLTextAreaElement>("proposal").value)));
    selected = "B";
    notify("提案已加载，可以试听。");
    void refresh();
  } catch (error) { notify(message(error)); }
});
byId("connect").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  showWorkspace();
  try {
    const endpoint = new URL(byId<HTMLInputElement>("endpoint").value);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) {
      throw new Error("共享项目需要 HTTPS。");
    }
    const connection = { endpoint, token: byId<HTMLInputElement>("review-token").value };
    const next = await fetchWorkspace(connection, "/v1/project");
    cloud = connection;
    updateWorkspace(next);
    selected = "A";
    notify("已连接共享项目。");
    await refresh();
  } catch (error) {
    notify(message(error));
  } finally {
    busy = false;
    showWorkspace();
  }
});

const referenceAudio = document.querySelector<HTMLAudioElement>(".reference audio")!;
referenceAudio.addEventListener("play", () => { if (source) pause(); });
button("play").addEventListener("click", () => referenceAudio.pause());
void refresh();
