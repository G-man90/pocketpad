# PocketPad beta validation

Checked on 13 October 2026.

## Passed

- Six JavaScript tests cover the wire format, simultaneous controls, neutral release, joystick dead zones, stored layout validation, all presets, and pairing-link restrictions.
- Windows companion compiles for Windows x64 with no build errors.
- Real XInput integration: wrong pairing key rejected; valid pairing accepted; simultaneous button, trigger, and joystick values read back from Windows; second controller denied while the first is active; Windows rumble returned to the client; stale inputs released; reconnection accepted; malformed input rejected.
- Browser interaction: PS5 preset, control resize, button remap, saved profile, persistence after reload, profile removal, reset, and keyboard positioning in edit mode.
- QR pairing dashboard renders a QR code. Opening its displayed address with the pairing key connects the controller web app through WebSocket and shows **Connected · Wi-Fi**.
- Responsive inspection at desktop, 390 × 844 portrait, and 844 × 390 landscape sizes. Mobile layouts fit without horizontal overflow.
- No browser console errors during controller and pairing checks.
- Packaged self-contained executable launches successfully, and the XInput integration checks pass against it. Pairing-key requests with an untrusted Origin receive 403; untrusted Host headers receive 400.

## Device testing still required

- Physical Android and iPhone/iPad multi-touch, orientation behavior, and screen-sleep behavior.
- Real Wi-Fi connections from a separate phone, including Windows Firewall and router isolation behavior.
- Physical Android vibration and game-rumble feel. Safari on iPhone/iPad does not expose the standard Vibration API.
- Bluetooth GATT connection, encryption pairing, and rumble on compatible hardware. The development laptop reports **RadioNotAvailable**, so Bluetooth was compiled but not tested over the air.
- Game-specific compatibility and measured input latency. XInput readback confirms a real virtual-controller output; it does not certify every game or anti-cheat system.
- Clean-machine installation with the separately installed legacy ViGEmBus driver. This laptop already had it installed.

The release is a beta, not a claim of universal Bluetooth support or production certification.
