// Run explicitly while the Windows companion is running: node tests/pairing-api.mjs
import assert from "node:assert/strict";
import http from "node:http";
const base = "http://localhost:3210";
const host = await (await fetch(base + "/api/host")).json();
async function post(path, body = {}, headers = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const auth = { "X-PocketPad-Token": host.token };
assert.equal((await post("/api/host/new-code")).status, 403);
assert.equal(
  (
    await post(
      "/api/host/new-code",
      {},
      { ...auth, Origin: "https://evil.example" },
    )
  ).status,
  403,
);
assert.equal(
  (
    await fetch(base + "/api/host", {
      headers: { Origin: "https://evil.example" },
    })
  ).status,
  403,
);
const wrongHost = await new Promise((resolve, reject) => {
  const request = http.get(
    base + "/api/host",
    { headers: { Host: "evil.example" } },
    (response) => {
      response.resume();
      resolve(response.statusCode);
    },
  );
  request.on("error", reject);
});
assert.equal(wrongHost, 400);
const lan = host.addresses.find((a) => !a.virtual)?.address;
assert.ok(lan, "an active physical network exists");
assert.equal((await fetch(`http://${lan}:3210/api/host`)).status, 403);
assert.ok(
  host.addresses.every((a) => a.address && a.name && a.kind),
  "all networks have tags",
);
assert.equal((await post("/api/pair", { code: "WRONG" })).status, 400);
const pending = await post("/api/pair", { code: host.code, name: "API test" });
assert.equal(pending.status, 202);
const { id } = await pending.json();
assert.equal((await fetch(base + "/api/pair/" + id)).status, 202);
assert.equal((await post("/api/host/pair-allow", { id }, auth)).status, 200);
const receipt = await (await fetch(base + "/api/pair/" + id)).json();
assert.equal(new URL(receipt.url).hash, "#token=" + host.token);
assert.equal((await fetch(base + "/api/pair/" + id)).status, 410);
const denied = await (await post("/api/pair", { code: host.code })).json();
assert.equal(
  (await post("/api/host/pair-deny", { id: denied.id }, auth)).status,
  200,
);
assert.equal((await fetch(base + "/api/pair/" + denied.id)).status, 403);
console.log(
  "PASS: host authorization, same-origin checks, network tags, short-code approval, denial and receipt replay prevention",
);
