import { spawnSync } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const build = spawnSync(process.env.CARGO ?? "cargo", [
  "rustc", "--locked", "--release", "--target", "wasm32-unknown-unknown", "-p", "openmusic-audio-worker",
  "--", "-C", "link-arg=--strip-all",
], { stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const target = resolve(process.env.CARGO_TARGET_DIR ?? "target");
await mkdir("out/audio-worker", { recursive: true });
await cp(resolve(target, "wasm32-unknown-unknown/release/openmusic_audio_worker.wasm"), "out/audio-worker/audio.wasm");
await cp("apps/audio-worker/index.js", "out/audio-worker/index.js");
