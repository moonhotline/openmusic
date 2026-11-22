import { createPrism, prismFrame } from "../../packages/prism/index.ts";
import { performances } from "../../examples/releases/performances.ts";

type TrackId = keyof typeof performances;
const media = document.querySelector<HTMLAudioElement>("#master")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const title = document.getElementById("title")!;
const notice = document.getElementById("notice")!;
const playhead = document.getElementById("playhead")!;
const position = document.querySelector<HTMLInputElement>("#position")!;
const stamp = document.getElementById("stamp")!;
const canvas = document.querySelector<HTMLCanvasElement>("#prism")!;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const render = createPrism(canvas);
const trackButtons = document.querySelectorAll<HTMLButtonElement>("[data-track]");
let track: TrackId = "faith";
let frame = 0;

function draw() {
  const piece = performances[track];
  render?.(prismFrame(media.currentTime, piece.bpm, piece.cues, motion.matches));
}

function formatTime(seconds: number) {
  return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

function resize() {
  const { clientWidth: width, clientHeight: height } = canvas;
  const scale = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1_730_000 / Math.max(1, width * height)));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  draw();
}

function tick() {
  draw();
  if (!playhead.hidden) {
    position.value = String(media.currentTime);
    const current = formatTime(media.currentTime) + " / " + formatTime(media.duration);
    if (stamp.textContent !== current) stamp.textContent = current;
  }
  if (!media.paused && !document.hidden) frame = requestAnimationFrame(tick);
}

function update() {
  play.textContent = (media.paused ? "播放" : "暂停") + "《" + performances[track].title + "》";
  cancelAnimationFrame(frame);
  if (!document.hidden) tick();
}

for (const option of trackButtons) option.addEventListener("click", () => {
  const next = option.dataset.track as TrackId;
  if (next === track) return;
  media.pause();
  track = next;
  const piece = performances[track];
  media.src = "/audio/" + piece.file;
  playhead.hidden = true;
  title.textContent = piece.title;
  notice.textContent = "";
  for (const button of trackButtons) button.setAttribute("aria-pressed", String(option === button));
  update();
});

play.addEventListener("click", async () => {
  notice.textContent = "";
  if (!media.paused) return media.pause();
  try { await media.play(); }
  catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) notice.textContent = "音频加载失败，请重试。";
  }
});

position.addEventListener("input", () => { media.currentTime = position.valueAsNumber; });
media.addEventListener("loadedmetadata", () => {
  if (!Number.isFinite(media.duration)) return;
  position.max = String(media.duration);
  playhead.hidden = false;
  update();
});
for (const event of ["play", "pause", "ended", "seeking", "seeked"]) media.addEventListener(event, update);
document.addEventListener("visibilitychange", update);
motion.addEventListener("change", draw);
new ResizeObserver(resize).observe(canvas);
resize();
