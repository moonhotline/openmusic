import { applyProposal, decide, freshWorkspace, SAMPLE_RATE, submitProposal } from "../../packages/score/index.ts";
import type { Score, Workspace } from "../../packages/score/index.ts";
import { wav } from "../../packages/audio/index.ts";
import type { AudioReport, Stereo } from "../../packages/audio/index.ts";
import { drawPrism } from "../../packages/prism/index.ts";
import { demoProposal, score } from "../../examples/glass-meridian/score.ts";

type Render = { pcm: Stereo; report: AudioReport };
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => byId<HTMLButtonElement>(id);
const seek = byId<HTMLInputElement>("seek");
const canvas = byId<HTMLCanvasElement>("prism");
const drawing = canvas.getContext("2d");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "openmusic-v1";
const renderer = new Worker(new URL("./render-worker.js", import.meta.url), { type: "module" });
const renders = new Map<string, Promise<Render>>();
const jobs = new Map<number, { resolve: (render: Render) => void; reject: (error: Error) => void }>();
let jobId = 0;
let workspace = readWorkspace();
let selected = "A";
let visibleScore = workspace.score;
let sortedCues = [...visibleScore.cues].sort((a, b) => b.beat - a.beat);
let rendered: Render | undefined;
let context: AudioContext | undefined;
let source: AudioBufferSourceNode | undefined;
let buffer: AudioBuffer | undefined;
let auditionGain: GainNode | undefined;
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
  auditionGain.gain.value = Math.min(1, 10 ** ((-18 - rendered.report.rmsDbfs) / 20));
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
  const progress = at / seconds;
  Array.from(byId("wave").children).forEach((bar, index) => bar.classList.toggle("past", index / 96 < progress));
  if (!drawing || document.hidden) return;
  const beat = at * visibleScore.bpm / 60;
  const cue = sortedCues.find((item) => item.beat <= beat);
  const energy = rendered?.report.waveform[Math.min(95, Math.floor(progress * 96))] ?? 0;
  drawPrism(drawing, canvas.width, canvas.height, reduceMotion.matches ? 0 : at, energy, cue?.preset === "dispersion");
}

function tick() {
  paint();
  if (source) animation = requestAnimationFrame(tick);
}

function showWorkspace() {
  const music = displayScore();
  visibleScore = music;
  sortedCues = [...music.cues].sort((a, b) => b.beat - a.beat);
  byId("tempo").textContent = music.bpm + " BPM · " + music.bars + " 小节";
  byId("revision").textContent = "版本 " + workspace.revision;
  byId("review-state").textContent = workspace.pending ? "待审核" : workspace.lastDecision?.accepted ? "已采纳" : workspace.lastDecision ? "已驳回" : "暂无提案";
  byId("summary").textContent = workspace.pending?.summary ?? "导入提案，比较改动前后的声音。";
  byId("auditions").hidden = !workspace.pending;
  byId("decision").hidden = !workspace.pending;
  byId("import").parentElement!.hidden = Boolean(cloud);
  for (const id of ["baseline", "candidate", "accept", "reject"]) button(id).disabled = busy;
  button("baseline").setAttribute("aria-pressed", String(selected === "A"));
  button("candidate").setAttribute("aria-pressed", String(selected === "B"));
  const rows = music.tracks.map((track) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = track.name;
    const lane = document.createElement("span");
    lane.className = "track-notes";
    lane.setAttribute("aria-hidden", "true");
    for (const note of track.notes) {
      const mark = document.createElement("i");
      mark.style.left = note.beat / (music.bars * 4) * 100 + "%";
      mark.style.width = note.length / (music.bars * 4) * 100 + "%";
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
  const wasPlaying = Boolean(source);
  pause();
  rendered = undefined;
  buffer = undefined;
  showWorkspace();
  button("play").disabled = true;
  button("export").disabled = true;
  button("play").textContent = "生成试听…";
  try {
    const result = await render(visibleScore);
    if (version !== requestVersion) return;
    rendered = result;
    seek.max = String(result.report.seconds);
    position = Math.min(position, result.report.seconds);
    byId("wave").replaceChildren(...result.report.waveform.map((peak) => {
      const bar = document.createElement("i");
      bar.style.setProperty("--amplitude", Math.max(3, peak * 93) + "%");
      return bar;
    }));
    button("play").disabled = false;
    button("export").disabled = false;
    button("play").textContent = "播放";
    if (wasPlaying) play();
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
button("cue").addEventListener("click", () => seekTo(16 * 60 / workspace.score.bpm));
button("baseline").addEventListener("click", () => { if (selected !== "A") { selected = "A"; void refresh(); } });
button("candidate").addEventListener("click", () => { if (selected !== "B") { selected = "B"; void refresh(); } });
button("accept").addEventListener("click", () => void review(true));
button("reject").addEventListener("click", () => void review(false));
button("export").addEventListener("click", () => {
  if (!rendered) return;
  const url = URL.createObjectURL(new Blob([wav(rendered.pcm)], { type: "audio/wav" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = selected === "B" ? "glass-meridian-proposal.wav" : "glass-meridian.wav";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

new ResizeObserver(() => {
  const scale = Math.min(devicePixelRatio, 1.5);
  canvas.width = Math.round(canvas.clientWidth * scale);
  canvas.height = Math.round(canvas.clientHeight * scale);
  paint();
}).observe(canvas);
void refresh();
