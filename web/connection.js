import { validatePairLink } from "./model.js";

// A same-page fragment navigation does not rerun the controller startup code.
export function completeCodePair(value, { origin, connect, navigate }) {
  const url = new URL(validatePairLink(value));
  if (url.origin === origin) connect(new URLSearchParams(url.hash.slice(1)).get("token"));
  else navigate(url.href);
}

// AbortSignal.timeout is unavailable in older iPad browsers.
export async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function connectionSummary(data) {
  const controller = data.controller;
  if (!data.ready) return "Install the gamepad driver, then restart PocketPad.";
  if (data.connected) return controller?.packets > 0
    ? `Receiving controls from ${controller.peer}. Tap a button to test below.`
    : "Device connected. Waiting for its first controls…";
  const progress = data.pairing;
  if (progress && (!controller?.connectedAt || new Date(progress.at) > new Date(controller.connectedAt))) {
    const stale = Date.now() - new Date(progress.at).getTime() > 15000;
    if (progress.stage === "requested") return "Device found. Tap Allow above to approve it.";
    if (progress.stage === "approved") return stale
      ? "Approved, but your device has not collected the approval. Keep Safari open or scan the controller QR to retry."
      : "Approved. Waiting for your device to collect the approval…";
    if (progress.stage === "received") return stale
      ? "Your device received approval but has not connected. Scan the controller QR and keep the page open."
      : "Your device received approval. Opening its controller…";
    if (progress.stage === "expired") return "The pairing request expired. Enter the code again on your device.";
    if (progress.stage === "declined") return "Pairing was declined. Your device is not connected.";
  }
  if (controller?.peer) return controller.note;
  return data.lastVisit
    ? `Controller page reached from ${data.lastVisit.address}. Waiting for pairing. Scan the controller QR if the page stays disconnected.`
    : "No device has reached this companion yet. Scan the controller QR with your iPad camera and open it in Safari.";
}
