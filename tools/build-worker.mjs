import { mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const targets = [
  ["packages/score/index.ts", "score.js"],
  ["examples/glass-meridian/score.ts", "example.js"],
  ["apps/worker/index.ts", "worker.js"],
];

await mkdir("out/worker", { recursive: true });
for (const [source, target] of targets) {
  const js = stripTypeScriptTypes(await readFile(source, "utf8"))
    .replaceAll("../../packages/score/index.ts", "./score.js")
    .replaceAll("../../examples/glass-meridian/score.ts", "./example.js");
  await writeFile("out/worker/" + target, js);
}
