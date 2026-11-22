import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const modules = ["apps/performance", "apps/studio", "packages/score", "packages/audio", "packages/prism", "examples/glass-meridian", "examples/releases"];

for (const directory of modules) {
  await mkdir(resolve(dist, directory), { recursive: true });
  for (const name of await readdir(resolve(root, directory))) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(resolve(root, directory, name), "utf8");
    const js = stripTypeScriptTypes(source).replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
    await writeFile(resolve(dist, directory, name.replace(/\.ts$/, ".js")), js);
  }
}
const assets = {
  "index.html": "apps/performance/index.html",
  "performance.css": "apps/performance/performance.css",
  "gsap.min.js": "node_modules/gsap/dist/gsap.min.js",
  "studio/index.html": "apps/studio/index.html",
  "studio/studio.css": "apps/studio/studio.css",
  "audio/faith-v2.flac": "examples/releases/faith.flac",
  "audio/agi-v2.flac": "examples/releases/agi.flac",
  "audio/mist.wav": "examples/mist/master.wav",
  "prism-standby.webp": "apps/performance/prism-standby.webp",
  "prism-standby-portrait.webp": "apps/performance/prism-standby-portrait.webp",
};
for (const [target, source] of Object.entries(assets)) {
  const file = resolve(dist, target);
  await mkdir(resolve(file, ".."), { recursive: true });
  await cp(resolve(root, source), file);
}

function rangeOf(value, bytes) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(bytes - 1, Number(match[2])) : bytes - 1;
  return start <= end && Number.isFinite(start) ? { start, end } : null;
}

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wav": "audio/wav", ".flac": "audio/flac", ".webp": "image/webp" };
  const port = Number(process.env.PORT || 4173);
  createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
      const entry = pathname === "/studio" || pathname === "/studio/" ? "/studio/index.html" : pathname === "/" ? "/index.html" : pathname;
      const file = resolve(dist, "." + entry);
      if (!file.startsWith(dist + sep)) throw new Error("Not found");
      const entryStat = await stat(file);
      if (!entryStat.isFile()) throw new Error("Not found");
      const { size } = entryStat;
      const range = request.headers.range && rangeOf(request.headers.range, size);
      if (request.headers.range && !range) return response.writeHead(416, { "Content-Range": "bytes */" + size }).end();
      const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": size };
      if (range) {
        headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
        headers["Content-Length"] = range.end - range.start + 1;
      }
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === "HEAD") return response.end();
      const stream = createReadStream(file, range || undefined);
      response.once("close", () => stream.destroy());
      stream.on("error", () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  }).listen(port, "0.0.0.0", () => console.log("OpenMusic http://localhost:" + port));
}
