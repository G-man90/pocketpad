const $ = (id) => document.getElementById(id);
let info = null,
  link = "";
function makeLink() {
  if (!info) return;
  link = `http://${$("address").value}:3210/#token=${info.token}`;
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  $("qr").innerHTML = qr.createSvgTag({
    cellSize: 4,
    margin: 20,
    scalable: true,
  });
}
async function refresh() {
  try {
    const response = await fetch("/api/host");
    if (!response.ok)
      throw Error("Open this page on the laptop running PocketPad.");
    const data = await response.json();
    $("hostStatus").textContent = data.connected
      ? "Controller connected"
      : "Ready to pair";
    $("driverStatus").textContent = data.driver;
    $("bleStatus").textContent = data.bluetooth;
    $("driverHelp").hidden = data.ready;
    if (!data.ready) $("hostStatus").textContent = "Gamepad driver needed";
    if (
      !info ||
      JSON.stringify(info.addresses) !== JSON.stringify(data.addresses) ||
      info.token !== data.token
    ) {
      info = data;
      $("address").replaceChildren(
        ...data.addresses.map((a) => new Option(a, a)),
      );
      $("pairingKey").textContent = data.token;
      if (data.addresses.length) makeLink();
      else $("qr").textContent = "Connect the laptop to Wi-Fi first.";
    }
    info = data;
  } catch (e) {
    $("hostStatus").textContent = "Companion unavailable";
    $("driverStatus").textContent = e.message;
  }
}
$("address").onchange = makeLink;
async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    button.textContent = "Copy unavailable";
  }
}
$("copyLink").onclick = () => copy(link, $("copyLink"));
$("copyKey").onclick = () => copy(info?.token ?? "", $("copyKey"));
refresh();
setInterval(refresh, 2000);
