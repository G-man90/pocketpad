import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout, connectionSummary } from "../web/connection.js";

test("approval is never presented as an active connection", () => {
  const data = { ready: true, connected: false, pairing: { stage: "approved", at: new Date().toISOString() } };
  assert.match(connectionSummary(data), /Approved.*Waiting/);
  data.pairing.at = new Date(Date.now() - 20000).toISOString();
  assert.match(connectionSummary(data), /has not collected/);
  data.pairing.stage = "received";
  assert.match(connectionSummary(data), /has not connected/);
  data.connected = true;
  data.controller = { packets: 1, peer: "192.168.1.2" };
  assert.match(connectionSummary(data), /Receiving controls/);
  data.connected = false;
  data.controller.connectedAt = new Date().toISOString();
  data.controller.note = "Input stopped";
  assert.equal(connectionSummary(data), "Input stopped");
});

test("requests time out without AbortSignal.timeout", async (t) => {
  t.mock.method(AbortSignal, "timeout", () => { throw Error("Unsupported browser API"); });
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  await assert.rejects(fetchWithTimeout("/api/pair", {}, 10), { name: "AbortError" });
});

test("successful request cancels its timeout", async (t) => {
  let receivedSignal;
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    receivedSignal = signal;
    return { ok: true };
  });
  assert.equal((await fetchWithTimeout("/api/pair", {}, 5)).ok, true);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(receivedSignal.aborted, false);
});
