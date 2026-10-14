using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

public record NetworkAddress(string Address, string Name, string Kind, bool Virtual, bool Recommended, bool Gateway);

public static class NetworkCatalog
{
    public static NetworkAddress[] Read()
    {
        var result = new List<NetworkAddress>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            var description = nic.Description.ToLowerInvariant();
            var hotspot = description.Contains("wi-fi direct");
            var virtualNic = hotspot || description.Contains("virtual") || description.Contains("hyper-v") || description.Contains("vpn") || nic.NetworkInterfaceType == NetworkInterfaceType.Tunnel;
            var kind = hotspot ? "Hotspot / Wi-Fi Direct" : virtualNic ? "Virtual / VPN" : description.Contains("bluetooth") ? "Bluetooth network" : nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "Wi-Fi" : nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet ? "Ethernet" : "Other network";
            var properties = nic.GetIPProperties();
            var gateway = properties.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
            foreach (var address in properties.UnicastAddresses.Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork))
            {
                var ip = address.Address.ToString();
                if (ip.StartsWith("169.254.") || IPAddress.IsLoopback(address.Address)) continue;
                result.Add(new(ip, nic.Name, kind, virtualNic, false, gateway));
            }
        }
        var sorted = result.OrderBy(a => a.Virtual).ThenByDescending(a => a.Gateway).ThenByDescending(a => a.Kind == "Wi-Fi").ToArray();
        if (sorted.Length > 0) sorted[0] = sorted[0] with { Recommended = true };
        return sorted;
    }
}
