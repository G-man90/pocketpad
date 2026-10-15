PocketPad 0.2.1 beta makes connection progress visible.

- Fixes code approval leaving the controller disconnected when the approved link only changes the current page's fragment. New QR tokens also reconnect an already-open controller page.
- The laptop distinguishes a pairing request, approval, the device collecting approval, and an active controller connection.
- A controller tester shows the last button or stick movement actually received by Windows, including brief taps.
- Network permission messages explain that allowing access does not itself pair a device.
- Code pairing works without AbortSignal.timeout, improving compatibility with older iPad browsers. iPad desktop-mode browsers are labeled correctly.
- The controller confirms connection, shows helpful connection errors, and no longer displays “NOT CONNECTED” while waiting for its first latency measurement.

**Upgrade:** close your old companion, extract this ZIP, and run PocketPad.exe. Scan the controller QR with your iPad camera and open it in Safari. Keep the controller page visible. The laptop's tester confirms received controls.

**Validation:** automated pairing, timeout, authorization, and Windows controller tests. An actual iPad connection remains to be verified with the user; this release does not claim that the reported network problem is resolved.

Five-letter codes still require local network discovery. Scan the controller QR if discovery is blocked. Some networks block all device-to-device traffic. Offline Wi-Fi creation and physical Bluetooth pairing remain unverified on this laptop; Windows previously rejected Wi-Fi Direct startup and Bluetooth advertising has been intermittent.

Windows 10 version 2004+ / Windows 11 x64. Unsigned self-contained executable. Separately installed legacy ViGEmBus driver required. iPhone/iPad uses Wi-Fi without browser vibration. PS4/PS5 layouts output an Xbox-compatible controller. No driver installation or firewall changes happen automatically.
