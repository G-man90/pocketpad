# PocketPad

Your phone, your controller. A customizable touch gamepad for Windows 10 (version 2004 or newer) and Windows 11, with Xbox, PS4, and PS5 layouts.

**Live web app:** https://g-man90.github.io/pocketpad/

**Windows download:** https://github.com/G-man90/pocketpad/releases/download/v0.1.0-beta/PocketPad-Windows-x64.zip

## Start playing

1. Download and extract the Windows ZIP. Run `PocketPad.exe`. The package includes its .NET runtime; no developer tools are needed.
2. The companion opens a page on your laptop with a QR code. Keep the companion running while playing.
3. Connect your phone/tablet and laptop to the same trusted Wi-Fi network. Scan the QR code with your phone camera.
4. Pick a controller layout, then open a Windows game that supports Xbox controllers.
5. To personalize the layout, tap **Customize**, select or drag a control, change its size or action, then **Save layout**. Tap **Play** to resume.

If Windows asks, allow PocketPad on your **Private** network. Do not disable your firewall. If you have several network adapters, choose the Wi-Fi address in the companion. Guest networks may isolate devices.

The desktop companion uses a separately installed **ViGEmBus** driver. If it says the driver is unavailable, the official release is https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0. ViGEmBus is an archived, end-of-life dependency. PocketPad does not bundle or silently install it. This beta uses the driver already installed on the development laptop. A maintained driver backend should be evaluated before a broad production release.

This is an unsigned beta executable, not a signed installer. Windows reputation checks may appear. The source is available here for inspection and local builds. Windows x64 is the packaged target; ARM64 is not verified.

## Connections and compatibility

| Feature                  | Android Chrome                       | iPhone / iPad Safari                   | Windows companion                       |
| ------------------------ | ------------------------------------ | -------------------------------------- | --------------------------------------- |
| Local Wi-Fi controller   | Supported                            | Supported                              | Required                                |
| Bluetooth LE             | Implemented; device testing required | Browser does not support it            | Requires peripheral-capable BLE adapter |
| Touch vibration          | Browser/hardware dependent           | Unavailable via standard Vibration API | Relays game rumble                      |
| Xbox / PS4 / PS5 layouts | Yes                                  | Yes                                    | All output is Xbox-compatible XInput    |

The public HTTPS site provides the controller editor, Bluetooth entry point, and companion download. For Wi-Fi, the QR code opens the **same controller app served directly by the laptop**. This avoids mixed-content restrictions between an HTTPS website and a local HTTP receiver. Settings belong to the origin where they are saved: layouts on the live website and local companion address are separate. Changing the laptop IP can also change the local storage origin.

Bluetooth setup: start the companion, verify it reports **Bluetooth ready**, open the live HTTPS website in Android Chrome, tap Connect, enter the companion's 32-character key, and select the advertising laptop. Accept Bluetooth pairing on your own devices if requested. GATT writes require link encryption. Regular OS Bluetooth pairing alone does not create a controller: the companion and virtual gamepad driver are still needed. On unsupported hardware, use Wi-Fi.

PS4/PS5 presets provide touch layouts and labels. They do not emulate a DualShock/DualSense device, pressure-sensitive triggers, adaptive trigger resistance, motion sensors, or PlayStation console connectivity. Touch triggers in this beta are digital (0 or 100%).

## Features

- Independent multi-touch sticks, directional pad, face buttons, bumpers, triggers, and stick clicks.
- Drag-to-position layout editor, per-control size and button remapping.
- Local saved profiles, transparency, stick sensitivity and dead-zone controls.
- Button feedback plus game-rumble forwarding where web vibration is supported.
- Fullscreen when supported and compact landscape layout for mobile.
- Random per-run pairing keys, one active controller, and a 500 ms input watchdog to release stuck controls.
- Visible connection status and measured Wi-Fi round-trip time (not total game input latency).

## Build and run

Requirements: Node.js 22+, .NET 10 SDK, Windows 10 2004+ / Windows 11 x64 for the receiver, and the separately installed virtual driver.

```powershell
npm ci
npm run build
npm test
dotnet run --project companion/PocketPad.csproj -c Release
```

Web-only development: `npm run preview` opens a local preview server at http://localhost:4173. The preview has working touch controls and editing but sends no game inputs until connected to the companion.

Windows integration test (start the companion first and disconnect any controller):

```powershell
dotnet run --project tests/windows/Integration.csproj
```

The test sends inputs to the real virtual controller and reads them back using Windows XInput. It checks authentication, simultaneous controls, session ownership, rumble forwarding, watchdog release, reconnection, and malformed input rejection. It briefly creates controller inputs, so close any active game while running it.

Package a self-contained Windows download:

```powershell
./scripts/package-windows.ps1
```

To update GitHub Pages, run `npm run build`, then `node scripts/prepare-pages.mjs`, commit and push. Pages uses the `main` branch's `/docs` folder.

## Project structure

- `web/`: controller, layout model, editor, and laptop pairing dashboard.
- `companion/`: .NET web receiver, Bluetooth GATT service, and virtual Xbox bridge.
- `tests/`: JavaScript unit tests and real Windows/XInput integration checks.
- `docs/`: generated GitHub Pages deployment; edit `web/`, then regenerate.
- `scripts/`: build, local preview, and packaging helpers.

## Protocol and privacy

The receiver listens on local port 3210. Wi-Fi uses a WebSocket with the random 128-bit pairing token sent in the first message; unauthenticated connections are rejected. Only the laptop loopback address can retrieve the pairing key or dashboard. Inputs are 14-byte little-endian full-state packets: sequence (`uint16`), button bitmask (`uint16`, XInput values), left/right triggers (`uint8` each), and four stick axes (`int16` each). Neutral state is sent on release and visibility changes. The receiver releases controls after 500 ms without valid input; Wi-Fi connections time out after 3 seconds without messages.

BLE service UUID: `b984a100-65b2-4ee5-9946-b88096e0a321`. Characteristics end in `a101` (pairing token write), `a102` (input write), and `a103` (rumble notification; two bytes). Writes require encrypted Bluetooth links. Bluetooth sessions use the same ownership check and watchdog as Wi-Fi.

No analytics, accounts, cloud input relay, or remote keyboard/mouse injection. Wi-Fi traffic uses local HTTP/WebSocket, so use a trusted private network. Anyone with the pairing key and local access could operate the virtual gamepad. Do not share pairing screenshots or port-forward the companion. The public site never receives your pairing key. Keys are in QR URL fragments, removed from the address bar after loading, and retained only in session storage for reconnection.

## Verification status

See [VALIDATION.md](VALIDATION.md) for exact checks and limits. Browser emulation does not prove physical iPhone multi-touch, Android vibration, or Bluetooth behavior. Actual game-specific compatibility and latency require device testing.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for dependencies and trademarks.
