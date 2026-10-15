import { connectionSummary } from "./connection.js";
const $ = (id) => document.getElementById(id);
let info = null,
  link = "",
  networkSignature = "",
  qrSignature = "",
  offlineSignature = "",
  pendingSignature = "";
function qrAt(id, value) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  $(id).innerHTML = qr.createSvgTag({
    cellSize: 4,
    margin: 20,
    scalable: true,
  });
}
function makeLink() {
  if (!info || !$("address").value) {
    $("qr").textContent = "Connect to Wi-Fi or start offline Wi-Fi.";
    link = "";
    qrSignature = "";
    $("copyLink").disabled = true;
    return;
  }
  link = `http://${$("address").value}:3210/#token=${info.token}`;
  $("copyLink").disabled = false;
  if (qrSignature !== link) {
    qrAt("qr", link);
    qrSignature = link;
  }
  const network = info.addresses.find((a) => a.address === $("address").value);
  $("networkTag").textContent = network
    ? `${network.kind} · ${network.name}`
    : "";
}
async function action(name, body) {
  if (!info) return;
  const response = await fetch(`/api/host/${name}`, {
    method: "POST",
    headers: {
      "X-PocketPad-Token": info.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      data.message || "Could not complete that action. Refresh and try again.",
    );
  if (name === "network-help") $("hostMessage").textContent = data.message + " This grants network access; scan the controller QR to connect your device.";
  await refresh();
}
function bindAction(id, name) {
  $(id).onclick = async () => {
    $(id).disabled = true;
    try {
      await action(name);
    } catch (e) {
      $("hostMessage").textContent = e.message;
    } finally {
      $(id).disabled = false;
    }
  };
}
async function refresh() {
  try {
    const response = await fetch("/api/host");
    if (!response.ok)
      throw Error("Open this page on the laptop running PocketPad.");
    const data = await response.json();
    info = data;
    $("hostStatus").textContent = !data.ready
      ? "Gamepad driver needed"
      : data.connected
        ? "Controller connected"
        : "Ready to pair";
    $("connectionHelp").textContent = connectionSummary(data);
    const controller = data.controller;
    $("inputTest").textContent = controller?.lastActionAt
      ? `${controller.lastAction} ✓ · ${new Date(controller.lastActionAt).toLocaleTimeString()}`
      : "Tap A / Cross or move a stick on your device.";
    $("inputTest").classList.toggle("received", !!controller?.lastActionAt);
    $("inputCount").textContent = data.connected && controller?.inputPaused
      ? "Brief pause · held buttons released for safety"
      : data.connected && controller?.packets > 0
      ? "Live connection · controls are reaching Windows"
      : "Waiting for a live controller connection";
    $("driverStatus").textContent = data.driver;
    $("bleStatus").textContent = data.bluetooth;
    $("driverHelp").hidden = data.ready;
    $("pairCode").textContent = data.code;
    $("pairingKey").textContent = data.token;
    $("codeExpiry").textContent =
      `Refreshes in ${Math.max(1, Math.ceil((new Date(data.codeExpires) - Date.now()) / 60000))} min · Approval required for code pairing`;
    $("discoveryStatus").textContent = data.discovery;
    const signature = JSON.stringify(data.addresses);
    if (signature !== networkSignature) {
      const previous = $("address").value;
      $("address").replaceChildren(
        ...data.addresses.map(
          (a) =>
            new Option(
              `${a.kind} · ${a.name} · ${a.address}${a.recommended ? " — recommended" : ""}`,
              a.address,
            ),
        ),
      );
      if (data.addresses.some((a) => a.address === previous))
        $("address").value = previous;
      networkSignature = signature;
    }
    makeLink();
    const pending = JSON.stringify(data.pending);
    if (pending !== pendingSignature) {
      pendingSignature = pending;
      $("pendingList").replaceChildren();
      $("pairRequests").hidden = !data.pending.length;
      for (const request of data.pending) {
        const row = document.createElement("div");
        row.className = "pair-request";
        const label = document.createElement("span");
        label.textContent = `${request.name || "Phone"} · ${request.address}`;
        row.append(label);
        for (const [text, actionName] of [
          ["Allow", "pair-allow"],
          ["Decline", "pair-deny"],
        ]) {
          const button = document.createElement("button");
          button.className = "button " + (text === "Allow" ? "lime" : "subtle");
          button.textContent = text;
          button.onclick = async () => {
            button.disabled = true;
            try {
              await action(actionName, { id: request.id });
            } catch (e) {
              $("hostMessage").textContent = e.message;
              button.disabled = false;
            }
          };
          row.append(button);
        }
        $("pendingList").append(row);
      }
    }
    const offline = data.offline;
    $("offlineStatus").textContent = offline.status;
    $("offlineStart").hidden = offline.active;
    $("offlineStart").disabled = offline.starting;
    $("offlineStop").hidden = !offline.active && !offline.starting;
    $("offlineSteps").hidden = !offline.active;
    if (offline.active) {
      const address =
        offline.address ||
        data.addresses.find((a) => a.kind === "Hotspot / Wi-Fi Direct")
          ?.address;
      const openLink = address
        ? `http://${address}:3210/#token=${data.token}`
        : `http://${data.hostname}:3210/#code=${data.code}`;
      const signature = [offline.ssid, offline.password, openLink].join("|");
      if (signature !== offlineSignature) {
        offlineSignature = signature;
        qrAt("wifiQr", `WIFI:T:WPA;S:${offline.ssid};P:${offline.password};;`);
        qrAt("offlineQr", openLink);
        $("wifiName").textContent = offline.ssid;
        $("wifiPassword").textContent = offline.password;
      }
      $("offlineOpenHint").textContent = address
        ? "After joining, scan this second code to open PocketPad and play."
        : "Join the Wi-Fi first. This QR uses local discovery; it updates when your phone’s connection is detected.";
    }
  } catch (e) {
    $("hostStatus").textContent = "Companion unavailable";
    $("connectionHelp").textContent = "Open PocketPad.exe on this laptop, then refresh this page.";
    $("inputCount").textContent = "Not connected";
    $("driverStatus").textContent = e.message;
  }
}
$("address").onchange = async () => {
  makeLink();
  try {
    await action("network-select", { address: $("address").value });
  } catch (e) {
    $("hostMessage").textContent = e.message;
  }
};
async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    $("hostMessage").textContent =
      "Copy unavailable in this browser. Scan the QR instead.";
  }
}
$("copyLink").onclick = () => copy(link, $("copyLink"));
$("copyKey").onclick = () => copy(info?.token ?? "", $("copyKey"));
for (const [id, actionName] of [
  ["newCode", "new-code"],
  ["offlineStart", "offline-start"],
  ["offlineStop", "offline-stop"],
  ["networkHelp", "network-help"],
  ["bluetoothRetry", "bluetooth-retry"],
])
  bindAction(id, actionName);
refresh();
setInterval(refresh, 2000);
