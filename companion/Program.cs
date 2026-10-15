using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

var builder=WebApplication.CreateBuilder(new WebApplicationOptions { Args=args, ContentRootPath=AppContext.BaseDirectory, WebRootPath=Path.Combine(AppContext.BaseDirectory,"wwwroot") });
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://0.0.0.0:3210");
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize=4096);
var app=builder.Build();
using var bridge=new GamepadBridge();
using var bluetooth=new BluetoothBridge(bridge);
await bluetooth.Start();
var pairing = new PairingService();
ControllerVisit? lastVisit = null;
using var offline = new OfflineWifi();
using var discovery = new LocalDiscovery();
string? selectedAddress = null;
void UpdateDiscovery() {
    var addresses = NetworkCatalog.Read();
    var address = offline.Active ? offline.Address ?? addresses.FirstOrDefault(a => a.Kind == "Hotspot / Wi-Fi Direct")?.Address : addresses.FirstOrDefault(a => a.Address == selectedAddress)?.Address ?? addresses.FirstOrDefault()?.Address;
    discovery.Update(pairing.HostName, address);
}
using var discoveryTimer = new Timer(_ => { try { UpdateDiscovery(); } catch { } }, null, 0, 3000);
bool Local(HttpContext ctx)=> ctx.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);
bool SameOrigin(HttpContext ctx) => ctx.Request.Headers.Origin.Count == 0 || ctx.Request.Headers.Origin == $"http://{ctx.Request.Host}";
bool HostAction(HttpContext ctx) => Local(ctx) && SameOrigin(ctx) && bridge.Authorized(ctx.Request.Headers["X-PocketPad-Token"]);
app.Use(async(ctx,next)=> {
    if(ctx.Request.Host.Host!="localhost" && !string.Equals(ctx.Request.Host.Host, pairing.HostName, StringComparison.OrdinalIgnoreCase) && !IPAddress.TryParse(ctx.Request.Host.Host,out _)) { ctx.Response.StatusCode=400; return; }
    ctx.Response.Headers["X-Content-Type-Options"]="nosniff";
    ctx.Response.Headers["Referrer-Policy"]="no-referrer";
    ctx.Response.Headers["Permissions-Policy"]="camera=(), microphone=(), geolocation=()";
    ctx.Response.Headers["Cache-Control"]="no-store";
    ctx.Response.Headers["Content-Security-Policy"]="default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' ws:; frame-ancestors 'none'";
    if(ctx.Request.Path.StartsWithSegments("/host") && !Local(ctx)) { ctx.Response.StatusCode=403; return; }
    if(ctx.Request.Method == "GET" && (ctx.Request.Path == "/" || ctx.Request.Path == "/index.html") && !Local(ctx))
        Interlocked.Exchange(ref lastVisit, new ControllerVisit(ctx.Connection.RemoteIpAddress!.ToString(), DateTimeOffset.UtcNow));
    await next();
});
app.UseWebSockets();
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/host",(HttpContext ctx)=> {
    if(!Local(ctx) || !SameOrigin(ctx)) return Results.StatusCode(403);
    return Results.Json(new { ready=bridge.Ready, driver=bridge.Status, bluetooth=bluetooth.Status, token=bridge.Token,
        addresses=NetworkCatalog.Read(), connected=bridge.Owner!=null, port=3210, code=pairing.Code, codeExpires=pairing.Expires,
        hostname=pairing.HostName, discovery=discovery.Status, pending=pairing.Pending, pairing=pairing.Progress,
        controller=bridge.Snapshot(), lastVisit=Volatile.Read(ref lastVisit), offline=offline.Snapshot() });
});
app.MapPost("/api/host/{action}", async (string action, HttpContext ctx) => {
    if (!HostAction(ctx)) return Results.StatusCode(403);
    switch (action) {
        case "new-code": pairing.Rotate(); UpdateDiscovery(); break;
        case "offline-start": offline.Start(pairing.Code); UpdateDiscovery(); break;
        case "offline-stop": offline.Stop(); UpdateDiscovery(); break;
        case "bluetooth-retry": await bluetooth.Restart(); break;
        case "network-help":
            try {
                var script = Path.Combine(AppContext.BaseDirectory, "SetupNetwork.ps1");
                var executable = Environment.ProcessPath!;
                using var process = Process.Start(new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe")) {
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -AppPath \"{executable}\"", UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden
                });
                if (process == null) throw new InvalidOperationException();
                await process.WaitForExitAsync(ctx.RequestAborted);
                if (process.ExitCode != 0) return Results.Json(new { message = "Windows could not add the local connection rules. Check Windows Firewall or your administrator's network policy." }, statusCode: 409);
                return Results.Ok(new { message = "PocketPad local-network access is enabled. Try pairing again. A router may still block connections between devices." });
            } catch { return Results.Json(new { message = "Windows permission was cancelled or unavailable. Allow PocketPad through Windows Firewall for local networks." }, statusCode: 409); }
        case "network-select":
            var selection = await ctx.Request.ReadFromJsonAsync<NetworkSelection>();
            if (!NetworkCatalog.Read().Any(a => a.Address == selection?.Address)) return Results.BadRequest();
            selectedAddress = selection!.Address; UpdateDiscovery(); break;
        case "pair-allow": case "pair-deny":
            var decision = await ctx.Request.ReadFromJsonAsync<PairDecision>();
            if (decision?.Id == null || !pairing.Decide(decision.Id, action == "pair-allow")) return Results.NotFound();
            break;
        default: return Results.NotFound();
    }
    return Results.Ok(new { message = "Done" });
});
app.MapPost("/api/pair", async (HttpContext ctx) => {
    if (!SameOrigin(ctx)) return Results.StatusCode(403);
    if (!bridge.Ready || bridge.Owner != null) return Results.Json(new { message = bridge.Ready ? "A controller is already connected." : bridge.Status }, statusCode: 409);
    var input = await ctx.Request.ReadFromJsonAsync<PairInput>();
    var result = pairing.Request(input?.Code, input?.Name, ctx.Connection.RemoteIpAddress!.ToString(), ctx.Connection.LocalIpAddress!.MapToIPv4().ToString());
    return Results.Json(new { id = result.Id, message = result.Status == 202 ? "Tap Allow on your laptop." : result.Status == 429 ? "Too many requests. Wait a minute and try again." : "That code expired or is incorrect. Check your laptop." }, statusCode: result.Status);
});
app.MapGet("/api/pair/{id}", (string id, HttpContext ctx) => {
    if (!SameOrigin(ctx)) return Results.StatusCode(403);
    var result = pairing.Poll(id, ctx.Connection.RemoteIpAddress!.ToString());
    return result.Status == 200 ? Results.Json(new { url = $"http://{result.LocalAddress}:3210/#token={bridge.Token}" }) : Results.StatusCode(result.Status);
});
app.Map("/ws", async ctx=> {
    if (!SameOrigin(ctx)) { ctx.Response.StatusCode=403; return; }
    if(!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode=400; return; }
    using var ws=await ctx.WebSockets.AcceptWebSocketAsync();
    var id="wifi:"+Guid.NewGuid();
    var buffer=new byte[1024];
    var sendGate=new SemaphoreSlim(1,1);
    using var lifetime=new CancellationTokenSource();
    async Task Send(object message) {
        await sendGate.WaitAsync();
        try { if(ws.State==WebSocketState.Open) await ws.SendAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message)),WebSocketMessageType.Text,true,CancellationToken.None); } catch { } finally { sendGate.Release(); }
    }
    async void Rumble(byte large,byte small) { if(bridge.Owner==id) await Send(new { type="rumble",large,small }); }
    try {
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var hello=await ws.ReceiveAsync(buffer,timeout.Token);
        if(!hello.EndOfMessage || hello.MessageType!=WebSocketMessageType.Text) return;
        using var json=JsonDocument.Parse(buffer.AsMemory(0,hello.Count));
        if(!json.RootElement.TryGetProperty("token",out var token) || token.ValueKind!=JsonValueKind.String || !bridge.Claim(id,token.GetString(),ctx.Connection.RemoteIpAddress?.ToString())) { await Send(new { type="error",message=bridge.Ready?"Pairing failed or another controller is connected. Scan the current QR on your laptop to try again.":bridge.Status }); return; }
        bridge.Rumble+=Rumble;
        await Send(new {type="ready", output="Xbox 360 / XInput"});
        while(ws.State==WebSocketState.Open) {
            using var idle=new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var received=await ws.ReceiveAsync(buffer,idle.Token);
            if(received.MessageType==WebSocketMessageType.Close) break;
            if(!received.EndOfMessage) break;
            if(received.MessageType==WebSocketMessageType.Binary) { if(!bridge.Submit(id,buffer.AsSpan(0,received.Count))) break; }
            else if(received.MessageType==WebSocketMessageType.Text && received.Count<128) {
                using var ping=JsonDocument.Parse(buffer.AsMemory(0,received.Count));
                if(ping.RootElement.TryGetProperty("ping",out var p)) await Send(new {type="pong",ping=p.GetDouble()});
            }
        }
    } catch(OperationCanceledException) { } catch(WebSocketException) { } catch(JsonException) { }
    finally {
        bridge.Rumble-=Rumble; bridge.Release(id);
        try { if(ws.State==WebSocketState.Open) { using var closeTimeout=new CancellationTokenSource(1000); await ws.CloseAsync(WebSocketCloseStatus.NormalClosure,"Session ended",closeTimeout.Token); } } catch { ws.Abort(); }
    }
});
app.Lifetime.ApplicationStarted.Register(()=> {
    Console.WriteLine("PocketPad is running. Open http://localhost:3210/host.html to pair your phone.\n"+bridge.Status+"\n"+bluetooth.Status);
    if(!args.Contains("--no-browser")) Process.Start(new ProcessStartInfo("http://localhost:3210/host.html") { UseShellExecute=true });
});
await app.RunAsync();

record PairInput(string? Code, string? Name);
record PairDecision(string? Id);
record NetworkSelection(string? Address);
record ControllerVisit(string Address, DateTimeOffset At);
