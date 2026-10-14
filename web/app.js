import {
  ACTIONS,
  NAMES,
  clamp,
  defaultLayout,
  cleanLayout,
  stickAxis,
  packet,
  validatePairLink,
} from "./model.js";
import { normalizeCode, codeLink, localCompanion } from "./pairing.js";
const $ = (id) => document.getElementById(id),
  controls = $("controls"),
  stage = $("stage");
let layout = defaultLayout(),
  profiles = {},
  edit = false,
  selected = "a",
  profileName = "",
  sequence = 0,
  transport = null,
  ws = null,
  ble = null,
  bleInput = null,
  bleWriting = false,
  retryTimer = null,
  shouldReconnect = false,
  keepAwake = null;
const touches = new Map(),
  keyActions = new Map(),
  axes = [0, 0, 0, 0];
try {
  layout = cleanLayout(JSON.parse(localStorage.getItem("pocketpad.current")));
} catch {}
try {
  const raw = JSON.parse(localStorage.getItem("pocketpad.profiles") || "{}");
  for (const [name, value] of Object.entries(raw))
    if (name.length <= 40) profiles[name] = cleanLayout(value);
} catch {}
let toastTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function persist() {
  try {
    localStorage.setItem("pocketpad.current", JSON.stringify(layout));
    localStorage.setItem("pocketpad.profiles", JSON.stringify(profiles));
  } catch {
    toast(
      "Storage is unavailable. This layout will last until you close the page.",
    );
  }
}
function buzz(duration = layout.vibration) {
  if (layout.haptics && typeof navigator.vibrate === "function")
    navigator.vibrate(duration);
}
function activeActions() {
  return new Set(
    [...touches.values()]
      .filter((t) => t.action)
      .map((t) => t.action)
      .concat([...keyActions.values()]),
  );
}
function sendState() {
  const data = packet(sequence++, activeActions(), axes);
  if (
    transport === "wifi" &&
    ws?.readyState === WebSocket.OPEN &&
    ws.bufferedAmount < 2048
  )
    ws.send(data);
  if (transport === "bluetooth" && bleInput && !bleWriting) {
    bleWriting = true;
    bleInput
      .writeValueWithoutResponse(data)
      .catch(() => {
        disconnect(false);
        toast("Bluetooth disconnected. Tap Connect to reconnect.");
      })
      .finally(() => (bleWriting = false));
  }
}
function releaseAll() {
  touches.clear();
  keyActions.clear();
  axes.fill(0);
  document
    .querySelectorAll(".pressed")
    .forEach((el) => el.classList.remove("pressed"));
  document.querySelectorAll(".stick-knob").forEach((el) => {
    el.style.setProperty("--dx", "0px");
    el.style.setProperty("--dy", "0px");
  });
  sendState();
}
function controlBounds(c) {
  const widths = {
      face: 7.2,
      shoulder: 14,
      trigger: 11,
      system: 4.6,
      dpad: 5,
      stick: 16,
    },
    heights = { ...widths, shoulder: 4.4, trigger: 4.4, system: 3.2 };
  const r = stage.getBoundingClientRect(),
    aspect = r.width / Math.max(1, r.height);
  return {
    w: (widths[c.kind] * c.size) / 100,
    h: (heights[c.kind] * c.size) / 100,
    aspect,
  };
}
function position(c, el) {
  const { w, h, aspect } = controlBounds(c);
  c.x = clamp(c.x, w / 2 + 1, 99 - w / 2);
  c.y = clamp(c.y, (h * aspect) / 2 + 1, 99 - (h * aspect) / 2);
  el.style.left = c.x + "%";
  el.style.top = c.y + "%";
  el.style.width = w + "cqw";
  el.style.height = h + "cqw";
  el.style.opacity = layout.opacity / 100;
}
function selectControl(id) {
  selected = id;
  controls
    .querySelectorAll(".control")
    .forEach((el) =>
      el.classList.toggle("selected", edit && el.dataset.id === id),
    );
  const c = layout.controls.find((c) => c.id === id);
  $("selectedControl").value = id;
  $("controlSize").value = c.size;
  $("sizeValue").value = c.size + "%";
  $("mapping").disabled = c.kind === "stick";
  $("mapping").value = c.action in ACTIONS ? c.action : "a";
}
function render() {
  releaseAll();
  controls.replaceChildren();
  for (const c of layout.controls) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "control " + c.kind;
    el.dataset.id = c.id;
    el.setAttribute(
      "aria-label",
      c.kind === "stick"
        ? c.id === "ls"
          ? "Left joystick"
          : "Right joystick"
        : (NAMES[c.action] ?? c.label),
    );
    el.setAttribute("aria-pressed", "false");
    if (c.kind === "stick") {
      const knob = document.createElement("span");
      knob.className = "stick-knob";
      knob.textContent = c.label;
      el.append(knob);
    } else el.textContent = c.label;
    controls.append(el);
    position(c, el);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.button !== 0) return;
      if ([...touches.values()].some((t) => t.id === c.id)) return;
      el.setPointerCapture(e.pointerId);
      if (edit) {
        selectControl(c.id);
        touches.set(e.pointerId, {
          id: c.id,
          drag: true,
          startX: e.clientX,
          startY: e.clientY,
          x: c.x,
          y: c.y,
        });
        return;
      }
      el.classList.add("pressed");
      el.setAttribute("aria-pressed", "true");
      buzz();
      touches.set(e.pointerId, {
        id: c.id,
        action: c.kind === "stick" ? null : c.action,
      });
      if (c.kind === "stick") moveStick(c, el, e);
      sendState();
    });
    el.addEventListener("pointermove", (e) => {
      const touch = touches.get(e.pointerId);
      if (!touch || touch.id !== c.id) return;
      if (touch.drag) {
        const r = stage.getBoundingClientRect();
        c.x = touch.x + ((e.clientX - touch.startX) / r.width) * 100;
        c.y = touch.y + ((e.clientY - touch.startY) / r.height) * 100;
        position(c, el);
      } else if (c.kind === "stick") {
        moveStick(c, el, e);
        sendState();
      }
    });
    function up(e) {
      const touch = touches.get(e.pointerId);
      if (!touch) return;
      touches.delete(e.pointerId);
      el.classList.remove("pressed");
      el.setAttribute("aria-pressed", "false");
      if (c.kind === "stick") {
        const i = c.id === "ls" ? 0 : 2;
        axes[i] = axes[i + 1] = 0;
        el.firstChild.style.setProperty("--dx", "0px");
        el.firstChild.style.setProperty("--dy", "0px");
      }
      if (touch.drag) persist();
      sendState();
    }
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    el.addEventListener("keydown", (e) => {
      if (
        edit &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        selectControl(c.id);
        c.x += e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        c.y += e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        position(c, el);
        persist();
      } else if (
        !edit &&
        c.kind !== "stick" &&
        (e.key === " " || e.key === "Enter")
      ) {
        e.preventDefault();
        keyActions.set(c.id, c.action);
        el.classList.add("pressed");
        sendState();
      }
    });
    el.addEventListener("keyup", () => {
      keyActions.delete(c.id);
      el.classList.remove("pressed");
      sendState();
    });
    el.addEventListener("blur", () => {
      keyActions.delete(c.id);
      el.classList.remove("pressed");
      sendState();
    });
  }
  document.querySelectorAll("[data-pad]").forEach((el) => {
    const active = el.dataset.pad === layout.pad;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", active);
  });
  $("padCaption").textContent = {
    xbox: "XBOX LAYOUT",
    ps4: "PLAYSTATION 4 LAYOUT",
    ps5: "PLAYSTATION 5 LAYOUT",
  }[layout.pad];
  for (const key of ["opacity", "sensitivity", "deadzone", "vibration"]) {
    $(key).value = layout[key];
    updateValue(key);
  }
  $("haptics").checked = layout.haptics;
  $("selectedControl").replaceChildren(
    ...layout.controls.map(
      (c) =>
        new Option(
          c.kind === "stick"
            ? c.id === "ls"
              ? "Left joystick"
              : "Right joystick"
            : c.label,
          c.id,
        ),
    ),
  );
  selectControl(selected);
  renderProfiles();
}
function moveStick(c, el, e) {
  const r = el.getBoundingClientRect(),
    radius = r.width * 0.34;
  let x = (e.clientX - r.left - r.width / 2) / radius,
    y = (e.clientY - r.top - r.height / 2) / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const [vx, vy] = stickAxis(
      x,
      y,
      layout.deadzone / 100,
      layout.sensitivity / 100,
    ),
    i = c.id === "ls" ? 0 : 2;
  axes[i] = vx;
  axes[i + 1] = vy;
  el.firstChild.style.setProperty("--dx", x * radius * 0.65 + "px");
  el.firstChild.style.setProperty("--dy", y * radius * 0.65 + "px");
}
function setMode(value) {
  edit = value;
  releaseAll();
  document.body.classList.toggle("editing-page", edit);
  stage.classList.toggle("editing", edit);
  $("playTab").classList.toggle("active", !edit);
  $("editTab").classList.toggle("active", edit);
  $("playTab").setAttribute("aria-pressed", !edit);
  $("editTab").setAttribute("aria-pressed", edit);
  $("editorSettings").hidden = !edit;
  $("editTip").hidden = !edit;
  $("settingsHeading").textContent = edit
    ? "Find your fit."
    : "Feels like you.";
  selectControl(selected);
}
$("mapping").append(
  ...Object.entries(NAMES).map(([key, label]) => new Option(label, key)),
);
$("playTab").onclick = () => setMode(false);
$("editTab").onclick = () => setMode(true);
document.querySelectorAll("[data-pad]").forEach(
  (el) =>
    (el.onclick = () => {
      layout = defaultLayout(el.dataset.pad);
      profileName = "";
      render();
      persist();
      toast("Layout switched. Games receive Xbox-compatible input.");
    }),
);
$("selectedControl").onchange = (e) => selectControl(e.target.value);
$("controlSize").oninput = (e) => {
  const c = layout.controls.find((c) => c.id === selected);
  c.size = +e.target.value;
  position(c, controls.querySelector(`[data-id="${selected}"]`));
  $("sizeValue").value = c.size + "%";
  persist();
};
$("mapping").onchange = (e) => {
  layout.controls.find((c) => c.id === selected).action = e.target.value;
  render();
  persist();
};
function updateValue(key) {
  $(key + "Value").value =
    key === "sensitivity"
      ? (layout[key] / 100).toFixed(1) + "×"
      : key === "vibration"
        ? layout[key] + " ms"
        : layout[key] + "%";
}
for (const key of ["opacity", "sensitivity", "deadzone", "vibration"])
  $(key).oninput = (e) => {
    layout[key] = +e.target.value;
    updateValue(key);
    if (key === "opacity")
      controls
        .querySelectorAll(".control")
        .forEach((el) => (el.style.opacity = layout.opacity / 100));
    persist();
  };
$("haptics").onchange = (e) => {
  layout.haptics = e.target.checked;
  persist();
};
$("testVibration").onclick = () => {
  if (!navigator.vibrate) toast("This browser does not support vibration.");
  else if (!layout.haptics) toast("Turn on haptic feedback first.");
  else {
    buzz();
    toast("Vibration requested. Device settings may disable it.");
  }
};
if (!navigator.vibrate) {
  $("hapticSupport").textContent = "Unavailable in this browser.";
  $("haptics").disabled = true;
}
$("resetLayout").onclick = () => {
  layout = defaultLayout(layout.pad);
  profileName = "";
  render();
  persist();
  toast("Default layout restored.");
};
function renderProfiles() {
  $("profiles").replaceChildren(
    new Option("Default / current layout", ""),
    ...Object.keys(profiles).map((name) => new Option(name, name)),
  );
  $("profiles").value = profileName;
  $("deleteProfile").disabled = !profileName;
}
$("profiles").onchange = (e) => {
  profileName = e.target.value;
  if (profileName) layout = cleanLayout(profiles[profileName]);
  else layout = defaultLayout(layout.pad);
  render();
  persist();
};
$("saveProfile").onclick = () => {
  $("profileName").value = profileName;
  $("profileDialog").showModal();
  $("profileName").focus();
};
$("profileForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("profileName").value.trim();
  if (!name) return;
  profileName = name;
  Object.defineProperty(profiles, name, {
    value: cleanLayout(layout),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  persist();
  renderProfiles();
  $("profileDialog").close();
  toast("Layout saved on this device.");
};
$("deleteProfile").onclick = () => {
  delete profiles[profileName];
  profileName = "";
  persist();
  renderProfiles();
  toast("Saved layout removed. Your current controls are unchanged.");
};
document
  .querySelectorAll(".close-dialog")
  .forEach((el) => (el.onclick = () => el.closest("dialog").close()));
function openConnect() {
  $("connectError").textContent = "";
  $("connectDialog").showModal();
}
let pairAttempt = 0;
async function requestCodePair(value) {
  const attempt = ++pairAttempt;
  try {
    const code = normalizeCode(value);
    $("wifiCode").value = code;
    if (!localCompanion(location)) {
      const url = codeLink(code);
      $("codeFallback").href = url;
      $("codeFallback").hidden = false;
      $("pairStatus").textContent =
        "Opening your laptop. If it cannot be found, use Back and scan the controller QR on your laptop. Both devices must be on the same network.";
      location.assign(url);
      return;
    }
    $("codeConnect").disabled = true;
    $("pairStatus").textContent = "Asking your laptop…";
    const name = /iPhone|iPad/.test(navigator.userAgent)
      ? "iPhone / iPad"
      : /Android/.test(navigator.userAgent)
        ? "Android phone"
        : "Browser controller";
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (response.status !== 202)
      throw Error(data.message || "Could not request pairing.");
    $("pairStatus").textContent =
      "Tap Allow on your laptop to connect this phone. This request expires in one minute.";
    for (let poll = 0; poll < 60 && attempt === pairAttempt; poll++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await fetch(`/api/pair/${data.id}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (attempt !== pairAttempt) return;
      if (result.status === 202) continue;
      if (result.ok) {
        const approved = await result.json();
        location.replace(validatePairLink(approved.url));
        return;
      }
      throw Error(
        result.status === 403
          ? "Your laptop declined this request. Try again when you are ready."
          : "Pairing expired. Check the code on your laptop and try again.",
      );
    }
    if (attempt === pairAttempt)
      throw Error("Pairing timed out. Please try again.");
  } catch (e) {
    if (attempt === pairAttempt)
      $("pairStatus").textContent =
        e.name === "TimeoutError" || e.name === "TypeError"
          ? "Cannot reach the laptop. Check the Wi-Fi, allow local connections in the companion, or try offline Wi-Fi."
          : e.message;
  } finally {
    if (attempt === pairAttempt) $("codeConnect").disabled = false;
  }
}
$("codeForm").onsubmit = (e) => {
  e.preventDefault();
  requestCodePair($("wifiCode").value);
};
for (const id of ["connectTop", "connectBottom", "helpButton"])
  $(id).onclick = openConnect;
$("openPairLink").onclick = () => {
  try {
    location.assign(validatePairLink($("pairLink").value.trim()));
  } catch (e) {
    $("connectError").textContent = e.message;
  }
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($("stage").parentElement.requestFullscreen)
      await $("stage").parentElement.requestFullscreen();
    else toast("Rotate your phone sideways for the full controller view.");
  } catch {
    toast("Fullscreen is unavailable. Rotate your phone sideways.");
  }
};
async function wake() {
  try {
    if ("wakeLock" in navigator)
      keepAwake = await navigator.wakeLock.request("screen");
  } catch {}
}
function status(connected, label) {
  $("connectionDot").classList.toggle("connected", connected);
  $("connectionStatus").textContent = label;
  $("connectTop").textContent = connected ? "✓ Connected" : "↗ Connect device";
  $("connectionTitle").textContent = connected
    ? "You’re in. Let’s play."
    : "Small screen. Big plays.";
  $("connectionDescription").textContent = connected
    ? "Your controls are being sent to your Windows laptop."
    : "Connect to your Windows laptop and get in the game.";
  $("stageHint").textContent = connected
    ? "Windows output · Xbox-compatible controller"
    : "Try the controls · Connect to play on Windows";
  if (!connected) $("latency").textContent = "NOT CONNECTED";
}
let pairingToken = new URLSearchParams(location.hash.slice(1)).get("token");
const incomingCode = new URLSearchParams(location.hash.slice(1)).get("code");
if (pairingToken && /^[a-f0-9]{32}$/.test(pairingToken)) {
  try {
    sessionStorage.setItem("pocketpad.token", pairingToken);
  } catch {}
  history.replaceState(null, "", location.pathname + location.search);
  $("bluetoothToken").value = pairingToken;
} else
  try {
    pairingToken = sessionStorage.getItem("pocketpad.token");
  } catch {}
async function connectWifi() {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState))
    return;
  status(false, "Connecting…");
  shouldReconnect = true;
  const socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );
  ws = socket;
  socket.onopen = () => socket.send(JSON.stringify({ token: pairingToken }));
  socket.onmessage = (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.type === "ready") {
      transport = "wifi";
      status(true, "Connected · Wi-Fi");
      $("connectDialog").close();
      wake();
      sendState();
    } else if (data.type === "error") {
      shouldReconnect = false;
      toast(data.message);
      $("connectError").textContent = data.message;
      socket.close();
    } else if (data.type === "pong")
      $("latency").textContent =
        Math.round(performance.now() - data.ping) + " MS ROUND TRIP";
    else if (data.type === "rumble")
      buzz(
        Math.max(data.large, data.small) > 0
          ? Math.min(120, (Math.max(data.large, data.small) / 255) * 90)
          : 0,
      );
  };
  socket.onerror = () => {
    status(false, "Connection unavailable");
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    transport = null;
    releaseAll();
    status(false, "Disconnected");
    if (shouldReconnect && !document.hidden)
      retryTimer = setTimeout(connectWifi, 1800);
  };
}
function disconnect(manual = true) {
  releaseAll();
  shouldReconnect = false;
  clearTimeout(retryTimer);
  transport = null;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  ble?.gatt?.disconnect();
  bleInput = null;
  ble = null;
  keepAwake?.release().catch(() => {});
  status(false, manual ? "Preview mode" : "Disconnected");
}
$("disconnect").onclick = () => {
  disconnect();
  $("connectDialog").close();
  toast("Disconnected.");
};
const SERVICE = "b984a100-65b2-4ee5-9946-b88096e0a321";
$("bluetoothConnect").onclick = async () => {
  const token = $("bluetoothToken").value.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) {
    $("connectError").textContent =
      "Enter the 32-character pairing key shown by your Windows companion.";
    return;
  }
  if (!navigator.bluetooth) {
    $("connectError").textContent =
      "Bluetooth is unavailable in this browser. Use Wi-Fi QR pairing instead.";
    return;
  }
  try {
    disconnect();
    status(false, "Choosing Bluetooth device…");
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }],
    });
    ble = device;
    device.addEventListener("gattserverdisconnected", () => {
      if (ble === device) {
        transport = null;
        bleInput = null;
        releaseAll();
        status(false, "Bluetooth disconnected");
      }
    });
    const server = await device.gatt.connect(),
      service = await server.getPrimaryService(SERVICE);
    const auth = await service.getCharacteristic(
      "b984a101-65b2-4ee5-9946-b88096e0a321",
    );
    bleInput = await service.getCharacteristic(
      "b984a102-65b2-4ee5-9946-b88096e0a321",
    );
    const feedback = await service.getCharacteristic(
      "b984a103-65b2-4ee5-9946-b88096e0a321",
    );
    await feedback.startNotifications();
    feedback.addEventListener("characteristicvaluechanged", (e) => {
      const v = e.target.value;
      const power = Math.max(v.getUint8(0), v.getUint8(1));
      buzz(power ? Math.max(5, (power / 255) * 90) : 0);
    });
    await auth.writeValueWithResponse(new TextEncoder().encode(token));
    transport = "bluetooth";
    status(true, "Connected · Bluetooth");
    $("latency").textContent = "BLUETOOTH LE";
    $("connectDialog").close();
    wake();
    sendState();
  } catch (e) {
    disconnect(false);
    $("connectError").textContent = "Bluetooth connection failed: " + e.message;
  }
};
if (!navigator.bluetooth)
  $("bluetoothHelp").textContent =
    "This browser cannot use Web Bluetooth. Use Wi-Fi QR pairing, or open the live HTTPS app in Chrome on a compatible Android device.";
setInterval(() => {
  if (transport) sendState();
}, 33);
setInterval(() => {
  if (transport === "wifi" && ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ ping: performance.now() }));
}, 1500);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const resume = shouldReconnect;
    disconnect(false);
    shouldReconnect = resume;
  } else if (shouldReconnect && pairingToken) connectWifi();
});
window.addEventListener("blur", releaseAll);
window.addEventListener("pagehide", () => disconnect());
new ResizeObserver(() => {
  for (const c of layout.controls) {
    const el = controls.querySelector(`[data-id="${c.id}"]`);
    if (el) position(c, el);
  }
}).observe(stage);
render();
if (incomingCode && localCompanion(location)) {
  history.replaceState(null, "", location.pathname);
  openConnect();
  requestCodePair(incomingCode);
} else if (pairingToken && localCompanion(location)) connectWifi();
