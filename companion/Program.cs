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
bool Local(HttpContext ctx)=> ctx.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);
app.Use(async(ctx,next)=> {
    if(ctx.Request.Host.Host!="localhost" && !IPAddress.TryParse(ctx.Request.Host.Host,out _)) { ctx.Response.StatusCode=400; return; }
    ctx.Response.Headers["X-Content-Type-Options"]="nosniff";
    ctx.Response.Headers["Referrer-Policy"]="no-referrer";
    ctx.Response.Headers["Cache-Control"]="no-store";
    ctx.Response.Headers["Content-Security-Policy"]="default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' ws:; frame-ancestors 'none'";
    if(ctx.Request.Path.StartsWithSegments("/host") && !Local(ctx)) { ctx.Response.StatusCode=403; return; }
    await next();
});
app.UseWebSockets();
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapGet("/api/host",(HttpContext ctx)=> {
    if(!Local(ctx) || (ctx.Request.Headers.Origin.Count>0 && ctx.Request.Headers.Origin!=$"http://{ctx.Request.Host}")) return Results.StatusCode(403);
    var addresses=NetworkInterface.GetAllNetworkInterfaces().Where(n=>n.OperationalStatus==OperationalStatus.Up && n.NetworkInterfaceType!=NetworkInterfaceType.Loopback)
        .OrderByDescending(n=>n.GetIPProperties().GatewayAddresses.Any(g=>g.Address.AddressFamily==AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any)))
        .ThenByDescending(n=>n.NetworkInterfaceType==NetworkInterfaceType.Wireless80211)
        .SelectMany(n=>n.GetIPProperties().UnicastAddresses).Where(a=>a.Address.AddressFamily==AddressFamily.InterNetwork).Select(a=>a.Address.ToString()).ToArray();
    return Results.Json(new { ready=bridge.Ready, driver=bridge.Status, bluetooth=bluetooth.Status, token=bridge.Token, addresses, connected=bridge.Owner!=null, port=3210 });
});
app.Map("/ws", async ctx=> {
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
        if(!json.RootElement.TryGetProperty("token",out var token) || token.ValueKind!=JsonValueKind.String || !bridge.Claim(id,token.GetString())) { await Send(new { type="error",message=bridge.Ready?"Pairing failed or another controller is connected.":bridge.Status }); return; }
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
