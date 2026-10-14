PocketPad 0.2.0 beta makes laptop pairing simpler.

- Enter a five-letter code on your phone, then approve it on the laptop. Local discovery replaces typing IP addresses. QR pairing is still available when discovery is blocked.
- Connections are labeled Wi-Fi, Ethernet, Hotspot / Wi-Fi Direct, Virtual / VPN, or Bluetooth network. Physical network connections are preferred.
- Start/stop an offline Wi-Fi Direct network on supported Windows laptops. Separate QR codes join Wi-Fi and open the locally served controller.
- Allow local connections launches a Windows administrator prompt for firewall rules limited to PocketPad's TCP 3210 and UDP 5353 ports and your local subnet.
- Retry Bluetooth after switching the radio on, with clearer status messages.

**Upgrade:** close your old companion, extract this ZIP into a new folder, and run PocketPad.exe. Refresh the live web app to get code pairing.

**Verified:** five-letter discovery and approval in the browser; pairing expiry, rate limits and access checks; real Windows XInput buttons/sticks/triggers, game rumble forwarding, disconnection safety and reconnection.

**Hardware limits:** the test laptop now reports **Bluetooth ready** after an earlier advertising rejection. A real phone Bluetooth connection is still unverified. Windows rejected the first Wi-Fi Direct start, so successful offline network creation and phone joining are also unverified. The app reports start failures instead of claiming it is ready. Some routers block local discovery or all device-to-device traffic.

Windows 10 version 2004+ / Windows 11 x64. Unsigned self-contained executable. Separately installed legacy ViGEmBus driver required. iPhone/iPad uses Wi-Fi without browser vibration. PS4/PS5 layouts still output an Xbox-compatible controller. No driver installation or firewall changes happen automatically.
