# PocketPad 0.2.0 beta validation

Checked on 14 October 2026 in the Desktop PocketPad project.

## Passed

- Eight JavaScript tests: simultaneous input packets, neutral release, dead zones, saved-layout sanitization, presets, private pairing-link validation, five-letter URL construction and public/local routing.
- Pairing-service tests: uppercase codes, case-insensitive input, mandatory laptop approval, address-bound receipts, single redemption, denial, one-minute request expiry, fifteen-minute code renewal, global rate limits and recovery.
- HTTP integration: unauthorized host changes rejected, cross-origin host access rejected, untrusted Host rejected, LAN clients cannot read the host dashboard API, labeled networks, code approval, denial and receipt replay rejection.
- Browser: local name resolved from a five-letter code, displayed a laptop approval request, then connected the controller to the actual LAN address over WebSocket.
- The self-contained 0.2.0 Windows package passed the HTTP pairing/security and real XInput integration checks. The package includes the firewall setup helper and locally served pairing module.
- Real Windows XInput: bad token rejected, valid token accepted, simultaneous button/trigger/stick state read back, second controller denied, game rumble returned, 500 ms watchdog neutralized input, reconnection accepted, malformed packets rejected.
- Original 0.1.0 browser checks covered PS5 preset, resizing, remapping, saved profiles, persistence, deletion, reset and keyboard positioning. These controller mechanisms were retained.

## Network and hardware findings

- The current Wi-Fi network is classified Public. Existing PocketPad firewall allow rules were found, including this project's executable paths. Public status alone is therefore not proof that the firewall caused the user's failed phone connection.
- Main Wi-Fi, a Wi-Fi Direct virtual adapter, and Hyper-V networking were detected. Ethernet was disconnected. The network picker labels these instead of presenting indistinguishable addresses.
- Bluetooth radio: On. Adapter reports peripheral-role support. Windows initially aborted GATT advertising; a later check of the packaged companion reported **Bluetooth ready**. No successful over-the-air phone connection is claimed.
- The new pairing form was inspected at 390 × 844. A clipped input was corrected; the dialog's scroll width and client width both measured 320 pixels, with no horizontal content overflow. No browser console errors were recorded during this check.
- First offline Wi-Fi Direct start: Windows reported Aborted. A subsequent read-only check found Mobile hotspot Off and tethering capability Enabled. That does not establish the cause of the failure.
- Automatic approval review blocked a later combined command containing a second offline Wi-Fi start, giving only "blocked by policy". No alternate tool was used to bypass that block. Successful offline hotspot start, phone join and phone controller input remain unverified.
- The firewall setup helper is packaged and scoped to local-subnet access for PocketPad's executable and two ports. Its elevated installation was not run during this update.

## Physical device checks still needed

Android/iPhone touch input, orientation and sleep; actual phone connections on the user's router; Android vibration; Bluetooth encryption and rumble; offline Wi-Fi joining on a compatible laptop; game-specific behavior and clean-machine driver installation. The separately installed ViGEmBus backend is archived/end-of-life.
