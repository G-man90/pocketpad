import test from "node:test";
import assert from "node:assert/strict";
import {
  packet,
  stickAxis,
  cleanLayout,
  defaultLayout,
  validatePairLink,
} from "../web/model.js";
test("simultaneous buttons, both triggers and sticks survive the wire format", () => {
  const v = new DataView(
    packet(65537, ["up", "a", "lb", "lt", "rt"], [1, -1, 0.5, -0.5]),
  );
  assert.equal(v.byteLength, 14);
  assert.equal(v.getUint16(0, true), 1);
  assert.equal(v.getUint16(2, true), 4353);
  assert.equal(v.getUint8(4), 255);
  assert.equal(v.getUint8(5), 255);
  assert.equal(v.getInt16(6, true), 32767);
  assert.equal(v.getInt16(8, true), -32767);
  assert.equal(v.getInt16(10, true), 16384);
});
test("release packet clears every button and axis", () =>
  assert.deepEqual(
    [...new Uint8Array(packet(0, [], [0, 0, 0, 0]))],
    Array(14).fill(0),
  ));
test("deadzone suppresses drift and diagonal motion stays inside unit circle", () => {
  assert.deepEqual(stickAxis(0.03, 0.03, 0.1, 1), [0, 0]);
  const [x, y] = stickAxis(1, 1, 0.1, 1.8);
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-6);
  assert.ok(y < 0);
});
test("stored layouts cannot inject controls, labels or unbounded values", () => {
  const raw = defaultLayout("ps5");
  raw.opacity = 1000;
  raw.controls[0] = {
    ...raw.controls[0],
    x: -90,
    size: 900,
    label: "injected",
    action: "bad",
  };
  const clean = cleanLayout(raw);
  assert.equal(clean.opacity, 100);
  assert.equal(clean.controls[0].size, 155);
  assert.equal(clean.controls[0].x, 5);
  assert.equal(clean.controls[0].label, "L2");
  assert.equal(clean.controls[0].action, "lt");
  assert.throws(() => cleanLayout({ pad: "evil" }));
});
test("all pad presets contain the full independent set of inputs", () => {
  for (const pad of ["xbox", "ps4", "ps5"]) {
    const layout = defaultLayout(pad);
    assert.equal(layout.controls.length, 18);
    assert.equal(new Set(layout.controls.map((c) => c.id)).size, 18);
  }
});
test("pairing links require private address, correct port and strong token", () => {
  const token = "a".repeat(32);
  assert.equal(
    validatePairLink(`http://192.168.1.9:3210/#token=${token}`),
    `http://192.168.1.9:3210/#token=${token}`,
  );
  for (const value of [
    `https://evil.com:3210/#token=${token}`,
    `http://8.8.8.8:3210/#token=${token}`,
    "javascript:alert(1)",
    `http://192.168.1.9:3210/#token=123`,
    `http://user:password@192.168.1.9:3210/#token=${token}`,
  ])
    assert.throws(() => validatePairLink(value));
});
