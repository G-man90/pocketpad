import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, codeLink, localCompanion } from "../web/pairing.js";

test("five letters locate exactly one local companion; punctuation cannot inject a URL", () => {
  assert.equal(normalizeCode(" abcde "), "ABCDE");
  assert.equal(
    codeLink("abcde"),
    "http://pocketpad-abcde.local:3210/#code=ABCDE",
  );
  for (const value of [
    "ABCD",
    "ABCDEF",
    "A1BCD",
    "a.bcd",
    "https://evil.test",
    "ＡＢＣＤＥ",
  ])
    assert.throws(() => codeLink(value));
});
test("public website never sends pairing requests to its static hosting", () => {
  assert.equal(
    localCompanion(new URL("https://g-man90.github.io/pocketpad/")),
    false,
  );
  assert.equal(
    localCompanion(new URL("http://pocketpad-abcde.local:3210/")),
    true,
  );
  assert.equal(localCompanion(new URL("http://192.168.137.1:3210/")), true);
});
