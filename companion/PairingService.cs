using System.Security.Cryptography;

public sealed class PairingService
{
    readonly object gate = new();
    string code = "";
    DateTimeOffset expires;
    readonly Dictionary<string, PairRequest> requests = new();
    DateTimeOffset rateWindow;
    int attempts;
    readonly Func<DateTimeOffset> now;
    public PairingService(Func<DateTimeOffset>? clock = null) { now = clock ?? (() => DateTimeOffset.UtcNow); Rotate(); }
    public string Code { get { lock (gate) { if (now() >= expires) Rotate(); return code; } } }
    public string HostName => "pocketpad-" + Code.ToLowerInvariant() + ".local";
    public DateTimeOffset Expires { get { _ = Code; lock (gate) return expires; } }
    public void Rotate()
    {
        lock (gate)
        {
            const string alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";
            code = new string(Enumerable.Range(0, 5).Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
            expires = now().AddMinutes(15);
            requests.Clear();
        }
    }
    void Prune() { foreach (var id in requests.Where(r => r.Value.Expires <= now()).Select(r => r.Key).ToArray()) requests.Remove(id); }
    public (int Status, string? Id) Request(string? candidate, string? name, string address, string localAddress)
    {
        lock (gate)
        {
            Prune();
            var timestamp = now();
            if (timestamp >= rateWindow) { rateWindow = timestamp.AddMinutes(1); attempts = 0; }
            if (++attempts > 20) return (429, null);
            if (!string.Equals(candidate?.Trim(), Code, StringComparison.OrdinalIgnoreCase)) return (400, null);
            if (requests.Count >= 5) return (429, null);
            var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
            var label = new string((name ?? "Phone").Where(c => !char.IsControl(c)).Take(40).ToArray());
            requests[id] = new(id, label, address, localAddress, timestamp.AddSeconds(60));
            return (202, id);
        }
    }
    public object[] Pending { get { lock (gate) { Prune(); return requests.Values.Where(r => r.Decision == null).Select(r => (object)new { id = r.Id, name = r.Name, address = r.Address }).ToArray(); } } }
    public bool Decide(string id, bool allow)
    {
        lock (gate) { Prune(); if (!requests.TryGetValue(id, out var r) || r.Decision != null) return false; r.Decision = allow; return true; }
    }
    public (int Status, string? LocalAddress) Poll(string id, string address)
    {
        lock (gate)
        {
            Prune();
            if (!requests.TryGetValue(id, out var r) || r.Address != address) return (410, null);
            if (r.Decision == null) return (202, null);
            requests.Remove(id);
            return r.Decision == true ? (200, r.LocalAddress) : (403, null);
        }
    }
    sealed record PairRequest(string Id, string Name, string Address, string LocalAddress, DateTimeOffset Expires)
    { public bool? Decision { get; set; } }
}
