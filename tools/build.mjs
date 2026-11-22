import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const modules = ["apps/studio", "packages/score", "packages/audio", "packages/prism", "examples/glass-meridian"];

for (const directory of modules) {
  await mkdir(resolve(dist, directory), { recursive: true });
  for (const name of await readdir(resolve(root, directory))) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(resolve(root, directory, name), "utf8");
    const js = stripTypeScriptTypes(source).replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
    await writeFile(resolve(dist, directory, name.replace(/\.ts$/, ".js")), js);
  }
}
for (const name of ["index.html", "studio.css"]) await cp(resolve(root, "apps/studio", name), resolve(dist, name));

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const port = Number(process.env.PORT || 4173);
  createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
      const file = resolve(dist, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(dist + sep) || !(await stat(file)).isFile()) throw new Error("Not found");
      response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end("Not found");
    }
  }).listen(port, "0.0.0.0", () => console.log("OpenMusic http://localhost:" + port));
}
