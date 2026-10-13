import { cp, mkdir, rm } from "node:fs/promises";
await mkdir("web/vendor", { recursive: true });
await cp("node_modules/qrcode-generator/dist/qrcode.js", "web/vendor/qr.js");
await rm("dist", { recursive: true, force: true });
await cp("web", "dist", { recursive: true });
console.log("Built PocketPad web app in dist/");
