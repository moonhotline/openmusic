import { createWriteStream } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_BYTES = 32 * 1024 * 1024;

async function readAt(file, position, length) {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(bytes, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error("Truncated WAV header");
    offset += bytesRead;
  }
  return bytes;
}

async function inspect(file) {
  const { size } = await file.stat();
  const riff = await readAt(file, 0, 12);
  const end = riff.readUInt32LE(4) + 8;
  if (riff.toString("ascii", 0, 4) !== "RIFF" || riff.toString("ascii", 8, 12) !== "WAVE" || end > size) {
    throw new Error("Expected a complete RIFF/WAVE file");
  }

  let format;
  for (let cursor = 12; cursor + 8 <= end;) {
    const header = await readAt(file, cursor, 8);
    const tag = header.toString("ascii", 0, 4);
    const length = header.readUInt32LE(4);
    const start = cursor + 8;
    cursor = start + length + (length % 2);
    if (cursor > end) throw new Error("Truncated WAV chunk");

    if (tag === "fmt " && length >= 16) {
      const pcm = await readAt(file, start, 16);
      const channels = pcm.readUInt16LE(2);
      const sampleRate = pcm.readUInt32LE(4);
      if (pcm.readUInt16LE(0) !== 1 || pcm.readUInt16LE(14) !== 16 || ![1, 2].includes(channels)
        || sampleRate < 8000 || sampleRate > 192000 || pcm.readUInt16LE(12) !== channels * 2) {
        throw new Error("Expected a mono or stereo PCM16 WAV at 8–192 kHz");
      }
      format = { channels, sampleRate };
    } else if (tag === "data") {
      if (!format || !length || length % (format.channels * 2) || length > MAX_BYTES) {
        throw new Error("WAV needs aligned PCM data of at most 32 MiB");
      }
      return { ...format, start, length, size };
    }
  }
  throw new Error("No PCM data chunk found");
}

function range(file, start, end) {
  return file.createReadStream({ start, end, autoClose: false });
}

async function* replacePcm(file, wave, stream) {
  yield* range(file, 0, wave.start - 1);
  let count = 0;
  for await (const bytes of stream) {
    count += bytes.length;
    if (count > wave.length) throw new Error("Audio Worker returned extra samples");
    yield bytes;
  }
  if (count !== wave.length) throw new Error("Audio Worker returned incomplete samples");
  const suffix = wave.start + wave.length;
  if (suffix < wave.size) yield* range(file, suffix, wave.size - 1);
}

export async function processWav(input, output, gainDb, { endpoint, token }) {
  const gain = Number(gainDb);
  if (!gainDb?.trim() || !Number.isFinite(gain) || gain < -60 || gain > 18) {
    throw new Error("Use --gain-db with a value between -60 and +18");
  }
  if (resolve(input) === resolve(output)) throw new Error("Choose a separate output WAV path");

  const file = await open(input, "r");
  const temporary = output + ".tmp-" + randomUUID();
  let response;
  let upload;
  try {
    const wave = await inspect(file);
    const url = new URL("/v1/audio/pcm", endpoint);
    url.searchParams.set("gainDb", String(gain));
    upload = range(file, wave.start, wave.start + wave.length - 1);
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "audio/pcm",
        "Content-Length": String(wave.length),
        "X-Sample-Rate": String(wave.sampleRate),
        "X-Channels": String(wave.channels),
      },
      body: Readable.toWeb(upload),
      duplex: "half",
      redirect: "error",
    });
    if (!response.ok || !response.body || response.headers.get("Content-Type") !== "audio/pcm") {
      throw new Error("Audio Worker returned HTTP " + response.status);
    }
    if (response.headers.get("X-Sample-Rate") !== String(wave.sampleRate)
      || response.headers.get("X-Channels") !== String(wave.channels)) {
      throw new Error("Audio Worker returned unexpected PCM metadata");
    }
    await mkdir(dirname(output), { recursive: true });
    await pipeline(Readable.from(replacePcm(file, wave, response.body)), createWriteStream(temporary, { flags: "wx" }));
    await link(temporary, output);
    return { path: output, frames: wave.length / (wave.channels * 2), sampleRate: wave.sampleRate, channels: wave.channels, gainDb: gain };
  } finally {
    upload?.destroy();
    await response?.body?.cancel().catch(() => {});
    await file.close();
    await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}
