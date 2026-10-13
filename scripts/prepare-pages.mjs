import { cp, mkdir, writeFile, rm } from "node:fs/promises";
await mkdir("docs", { recursive: true });
await cp("dist", "docs", { recursive: true });
for (const file of ["host.html", "host.css", "host.js"])
  await rm("docs/" + file, { force: true });
await writeFile("docs/.nojekyll", "");
console.log("GitHub Pages files prepared in docs/");
