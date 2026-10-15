import { cp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("docs", { recursive: true });
await cp("dist", "docs", { recursive: true });
// GitHub Pages caches assets. Change entry URLs when their contents change.
// Hash dependencies before their importers so cached modules cannot break updates.
const moduleHashes = new Map();
for (const asset of ["model.js", "pairing.js", "connection.js", "app.js"]) {
  let source = await readFile(`docs/${asset}`, "utf8");
  for (const [dependency, hash] of moduleHashes)
    source = source.replaceAll(`"./${dependency}"`, `"./${dependency}?v=${hash}"`);
  await writeFile(`docs/${asset}`, source);
  moduleHashes.set(asset, createHash("sha256").update(source).digest("hex").slice(0, 12));
}
let html = await readFile("docs/index.html", "utf8");
for (const asset of ["app.js", "style.css"]) {
  const hash = createHash("sha256").update(await readFile(`docs/${asset}`)).digest("hex").slice(0, 12);
  html = html.replace(`"${asset}"`, `"${asset}?v=${hash}"`);
}
await writeFile("docs/index.html", html);
for (const file of ["host.html", "host.css", "host.js"])
  await rm("docs/" + file, { force: true });
await writeFile("docs/.nojekyll", "");
console.log("GitHub Pages files prepared in docs/");
