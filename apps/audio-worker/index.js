import module from "./audio.wasm";

const { memory, block_ptr, block_size, apply_gain } = new WebAssembly.Instance(module).exports;
const staging = new Uint8Array(memory.buffer, block_ptr(), block_size());
const MAX_BYTES = 32 * 1024 * 1024;
const ONE = 65_536;
const PCM = "audio/pcm";

function error(message, status) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function transformPcm(body, frameBytes, gain, expected) {
  const tail = new Uint8Array(frameBytes);
  let tailLength = 0;
  let bytesSeen = 0;

  function emit(controller, block) {
    if (gain === ONE) {
      controller.enqueue(block);
      return;
    }
    staging.set(block);
    if (!apply_gain(block.length, gain)) throw new Error("Invalid Rust PCM block");
    controller.enqueue(staging.slice(0, block.length));
  }

  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytesSeen += chunk.length;
      if (bytesSeen > (expected ?? MAX_BYTES)) throw new Error("PCM exceeds declared or allowed length");

      let position = 0;
      if (tailLength) {
        position = Math.min(frameBytes - tailLength, chunk.length);
        tail.set(chunk.subarray(0, position), tailLength);
        tailLength += position;
        if (tailLength < frameBytes) return;
        emit(controller, tail.slice());
      }

      const end = chunk.length - (chunk.length - position) % frameBytes;
      while (position < end) {
        const next = Math.min(position + staging.length, end);
        emit(controller, chunk.subarray(position, next));
        position = next;
      }
      tailLength = chunk.length - end;
      if (tailLength) tail.set(chunk.subarray(end));
    },
    flush() {
      if (!bytesSeen || tailLength || (expected !== null && expected !== bytesSeen)) {
        throw new Error("Incomplete or empty PCM frame data");
      }
    },
  }));
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/audio/pcm") return error("Not found", 404);

    const media = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    const encoding = request.headers.get("Content-Encoding")?.toLowerCase();
    if (media !== PCM || (encoding && encoding !== "identity")) {
      return error("Expected uncompressed little-endian PCM16 (audio/pcm)", 415);
    }

    const rate = Number(request.headers.get("X-Sample-Rate"));
    const channels = Number(request.headers.get("X-Channels"));
    if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) return error("X-Sample-Rate must be 8000–192000", 400);
    if (channels !== 1 && channels !== 2) return error("X-Channels must be 1 or 2", 400);
    const frameBytes = 2 * channels;

    const rawGain = url.searchParams.get("gainDb");
    const gainDb = Number(rawGain);
    if (url.searchParams.size > (rawGain === null ? 0 : 1)
      || rawGain?.trim() === "" || !Number.isFinite(gainDb) || gainDb < -60 || gainDb > 18) {
      return error("gainDb must be between -60 and +18", 400);
    }
    const gain = Math.round(10 ** (gainDb / 20) * ONE);

    const length = request.headers.get("Content-Length");
    const expected = length === null ? null : Number(length);
    if (expected !== null) {
      if (expected > MAX_BYTES) return error("PCM stream exceeds 32 MiB", 413);
      if (!Number.isSafeInteger(expected) || expected <= 0 || expected % frameBytes) {
        return error("Incomplete or empty PCM frame data", 400);
      }
    }
    if (!request.body) return error("PCM stream required", 400);

    return new Response(transformPcm(request.body, frameBytes, gain, expected), {
      headers: { "Content-Type": PCM, "Cache-Control": "no-store", "X-Sample-Rate": String(rate), "X-Channels": String(channels) },
    });
  },
};
