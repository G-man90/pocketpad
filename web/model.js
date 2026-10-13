export const ACTIONS = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  start: 16,
  back: 32,
  l3: 64,
  r3: 128,
  lb: 256,
  rb: 512,
  a: 4096,
  b: 8192,
  x: 16384,
  y: 32768,
  lt: "lt",
  rt: "rt",
};
export const NAMES = {
  up: "D-pad up",
  down: "D-pad down",
  left: "D-pad left",
  right: "D-pad right",
  start: "Start / Options",
  back: "Back / Share",
  l3: "Left stick click",
  r3: "Right stick click",
  lb: "Left shoulder",
  rb: "Right shoulder",
  a: "A / Cross",
  b: "B / Circle",
  x: "X / Square",
  y: "Y / Triangle",
  lt: "Left trigger",
  rt: "Right trigger",
};
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function defaultLayout(pad = "xbox") {
  const ps = pad !== "xbox";
  const controls = [
    ["lt", 17, 14, "LT", "trigger"],
    ["lb", 17, 25, "LB", "shoulder"],
    ["rt", 83, 14, "RT", "trigger"],
    ["rb", 83, 25, "RB", "shoulder"],
    ["ls", ps ? 35 : 22, ps ? 67 : 48, "L", "stick"],
    ["rs", 65, 67, "R", "stick"],
    ["up", ps ? 19 : 37, ps ? 41 : 61, "↑", "dpad"],
    ["down", ps ? 19 : 37, ps ? 59 : 79, "↓", "dpad"],
    ["left", ps ? 14 : 32, ps ? 50 : 70, "←", "dpad"],
    ["right", ps ? 24 : 42, ps ? 50 : 70, "→", "dpad"],
    ["y", 81, 37, "Y", "face"],
    ["x", 73, 52, "X", "face"],
    ["b", 89, 52, "B", "face"],
    ["a", 81, 67, "A", "face"],
    ["back", 45, 39, "▱", "system"],
    ["start", 55, 39, "≡", "system"],
    ["l3", ps ? 35 : 22, ps ? 88 : 73, "L3", "system"],
    ["r3", 65, 89, "R3", "system"],
  ];
  const labels = ps
    ? {
        lt: "L2",
        rt: "R2",
        lb: "L1",
        rb: "R1",
        a: "×",
        b: "○",
        x: "□",
        y: "△",
        back: pad === "ps5" ? "⋮" : "SH",
        start: "≡",
      }
    : {};
  return {
    pad,
    opacity: 100,
    sensitivity: 100,
    deadzone: 10,
    haptics: true,
    vibration: 20,
    controls: controls.map(([id, x, y, label, kind]) => ({
      id,
      x,
      y,
      label: labels[id] ?? label,
      kind,
      size: 100,
      action: id,
    })),
  };
}
export function cleanLayout(value) {
  if (!value || !["xbox", "ps4", "ps5"].includes(value.pad))
    throw Error("Invalid layout");
  const base = defaultLayout(value.pad);
  for (const [key, min, max] of [
    ["opacity", 35, 100],
    ["sensitivity", 50, 180],
    ["deadzone", 0, 35],
    ["vibration", 5, 70],
  ])
    if (Number.isFinite(value[key])) base[key] = clamp(value[key], min, max);
  base.haptics = value.haptics !== false;
  base.controls = base.controls.map((c) => {
    const src = value.controls?.find((x) => x.id === c.id);
    if (!src) return c;
    for (const [key, min, max] of [
      ["x", 5, 95],
      ["y", 8, 92],
      ["size", 65, 155],
    ])
      if (Number.isFinite(src[key])) c[key] = clamp(src[key], min, max);
    if (src.action in ACTIONS) c.action = src.action;
    return c;
  });
  return base;
}
export function stickAxis(x, y, deadzone, sensitivity) {
  const length = Math.hypot(x, y);
  if (length < deadzone || length === 0) return [0, 0];
  const magnitude = clamp(
    ((Math.min(length, 1) - deadzone) / (1 - deadzone)) * sensitivity,
    0,
    1,
  );
  return [(x / length) * magnitude, (-y / length) * magnitude];
}
export function packet(sequence, active, axes) {
  const buffer = new ArrayBuffer(14),
    v = new DataView(buffer);
  let buttons = 0,
    lt = 0,
    rt = 0;
  for (const action of active) {
    if (action === "lt") lt = 255;
    else if (action === "rt") rt = 255;
    else buttons |= ACTIONS[action] ?? 0;
  }
  v.setUint16(0, sequence & 65535, true);
  v.setUint16(2, buttons, true);
  v.setUint8(4, lt);
  v.setUint8(5, rt);
  axes.forEach((n, i) =>
    v.setInt16(
      6 + i * 2,
      Math.round(clamp(Number.isFinite(n) ? n : 0, -1, 1) * 32767),
      true,
    ),
  );
  return buffer;
}
export function validatePairLink(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.port !== "3210" ||
    url.username ||
    url.password
  )
    throw Error("Use the full pairing link shown in your Windows companion.");
  const host = url.hostname;
  const privateHost =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (
    !privateHost ||
    !host.split(".").every((x) => !/^\d+$/.test(x) || Number(x) <= 255)
  )
    throw Error("Use a local Wi-Fi address from the companion.");
  if (
    !/^[a-f0-9]{32}$/.test(
      new URLSearchParams(url.hash.slice(1)).get("token") ?? "",
    )
  )
    throw Error("The pairing link must include its 32-character key.");
  url.pathname = "/";
  url.search = "";
  return url.href;
}
