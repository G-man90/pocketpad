using System.Security.Cryptography;
using Windows.Devices.WiFiDirect;
using Windows.Security.Credentials;
using Windows.Networking.Connectivity;
using Windows.Networking.NetworkOperators;

public sealed class OfflineWifi : IDisposable
{
    readonly object gate = new();
    WiFiDirectAdvertisementPublisher? publisher;
    WiFiDirectConnectionListener? listener;
    readonly List<WiFiDirectDevice> devices = new();
    public string Status { get; private set; } = "Create a private Wi-Fi network for your controller. No internet needed.";
    public bool Active { get; private set; }
    public bool Starting { get; private set; }
    public string Ssid { get; private set; } = "";
    public string Password { get; private set; } = "";
    public string? Address { get; private set; }
    public void Start(string code)
    {
        lock (gate)
        {
            if (Active || Starting) return;
            Stop();
            try
            {
                var internet = NetworkInformation.GetInternetConnectionProfile();
                if (internet != null)
                {
                    try {
                        var tethering = NetworkOperatorTetheringManager.CreateFromConnectionProfile(internet);
                        if (tethering.TetheringOperationalState == TetheringOperationalState.On) {
                            Status = "Windows Mobile hotspot is already on. Turn it off in hotspot settings below, then start offline Wi-Fi here.";
                            return;
                        }
                    } catch { /* Wi-Fi Direct can still work when tethering APIs are unavailable. */ }
                }
                Ssid = "PocketPad-" + code;
                Password = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
                publisher = new WiFiDirectAdvertisementPublisher();
                publisher.StatusChanged += Changed;
                publisher.Advertisement.IsAutonomousGroupOwnerEnabled = true;
                publisher.Advertisement.ListenStateDiscoverability = WiFiDirectAdvertisementListenStateDiscoverability.Normal;
                publisher.Advertisement.LegacySettings.IsEnabled = true;
                publisher.Advertisement.LegacySettings.Ssid = Ssid;
                publisher.Advertisement.LegacySettings.Passphrase = new PasswordCredential { Password = Password };
                listener = new WiFiDirectConnectionListener();
                listener.ConnectionRequested += Requested;
                Starting = true; Status = "Starting your offline Wi-Fi…";
                publisher.Start();
            }
            catch (Exception ex) { Stop(); Status = "Windows could not start offline Wi-Fi (" + ex.GetType().Name + "). Turn on Wi-Fi, turn off Windows Mobile hotspot, and retry. Some adapters do not support this feature."; }
        }
    }
    void Changed(WiFiDirectAdvertisementPublisher sender, WiFiDirectAdvertisementPublisherStatusChangedEventArgs e)
    {
        lock (gate)
        {
            if (sender != publisher) return;
            Active = e.Status == WiFiDirectAdvertisementPublisherStatus.Started;
            Starting = e.Status == WiFiDirectAdvertisementPublisherStatus.Created;
            Status = Active ? "Offline Wi-Fi is on. Join it on your phone, then scan Open controller." : e.Status == WiFiDirectAdvertisementPublisherStatus.Aborted ? "Windows could not start offline Wi-Fi" + (e.Error == WiFiDirectError.Success ? "." : " (" + e.Error + ").") + " Close other nearby-sharing apps, turn off Windows Mobile hotspot, and retry. Your adapter and driver must support Wi-Fi Direct." : "Offline Wi-Fi is off.";
            if (!Active) Address = null;
        }
    }
    async void Requested(WiFiDirectConnectionListener sender, WiFiDirectConnectionRequestedEventArgs e)
    {
        using var request = e.GetConnectionRequest();
        try
        {
            var device = await WiFiDirectDevice.FromIdAsync(request.DeviceInformation.Id);
            lock (gate)
            {
                if (device == null) return;
                if (sender != listener || !Active) { device.Dispose(); return; }
                devices.Add(device);
                Address = device.GetConnectionEndpointPairs().FirstOrDefault()?.LocalHostName.CanonicalName;
                device.ConnectionStatusChanged += (d, _) => { if (d.ConnectionStatus == WiFiDirectConnectionStatus.Disconnected) { lock (gate) { devices.Remove(d); d.Dispose(); } } };
            }
        }
        catch (Exception ex) { lock (gate) Status = "Wi-Fi join failed (" + ex.GetType().Name + "). Rejoin the PocketPad network and retry."; }
    }
    public object Snapshot()
    {
        lock (gate) return new { active = Active, starting = Starting, status = Status, ssid = Active ? Ssid : "", password = Active ? Password : "", address = Active ? Address : null };
    }
    public void Stop()
    {
        lock (gate)
        {
            if (listener != null) listener.ConnectionRequested -= Requested;
            listener = null;
            if (publisher != null) { publisher.StatusChanged -= Changed; try { publisher.Stop(); } catch { } publisher = null; }
            foreach (var device in devices.ToArray()) device.Dispose();
            devices.Clear(); Active = Starting = false; Address = null; Password = ""; Ssid = ""; Status = "Offline Wi-Fi is off.";
        }
    }
    public void Dispose() => Stop();
}
