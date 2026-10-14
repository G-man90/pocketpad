using System.Net;
using Makaretu.Dns;

public sealed class LocalDiscovery : IDisposable
{
    readonly object gate = new();
    ServiceDiscovery? discovery;
    string signature = "";
    public string Status { get; private set; } = "Starting local discovery…";
    public void Update(string hostName, string? address)
    {
        lock (gate)
        {
            var next = hostName + ":" + address;
            if (signature == next) return;
            discovery?.Dispose(); discovery = null;
            signature = next;
            if (address == null) { Status = "Connect to a network to use a five-letter code."; return; }
            try
            {
                var profile = new ServiceProfile(hostName.Split('.')[0], "_pocketpad._tcp", 3210, new[] { IPAddress.Parse(address) });
                var oldName = profile.HostName;
                profile.HostName = new DomainName(hostName);
                foreach (var record in profile.Resources)
                {
                    if (record.Name.Equals(oldName)) record.Name = profile.HostName;
                    if (record is SRVRecord srv) srv.Target = profile.HostName;
                }
                discovery = new ServiceDiscovery();
                discovery.Advertise(profile);
                discovery.Announce(profile);
                Status = "Five-letter discovery is on. If your network blocks it, scan the controller QR.";
            }
            catch (Exception ex)
            {
                discovery?.Dispose(); discovery = null; signature = "";
                Status = "Local discovery unavailable (" + ex.GetType().Name + "). Scan the controller QR instead.";
            }
        }
    }
    public void Dispose() { lock (gate) { discovery?.Dispose(); discovery = null; } }
}
