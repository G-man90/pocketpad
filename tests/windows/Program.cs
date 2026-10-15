using System.Buffers.Binary;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

using var http=new HttpClient();
using var host=JsonDocument.Parse(await http.GetStringAsync("http://localhost:3210/api/host"));
if(!host.RootElement.GetProperty("ready").GetBoolean())throw new Exception("Virtual controller is unavailable");
var token=host.RootElement.GetProperty("token").GetString()!;
async Task<ClientWebSocket> Connect(string key) { var ws=new ClientWebSocket();await ws.ConnectAsync(new Uri("ws://localhost:3210/ws"),CancellationToken.None);await ws.SendAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{token=key})),WebSocketMessageType.Text,true,CancellationToken.None);return ws; }
async Task<JsonDocument> Receive(ClientWebSocket ws) { var buffer=new byte[1024];using var timeout=new CancellationTokenSource(3000);var result=await ws.ReceiveAsync(buffer,timeout.Token);return JsonDocument.Parse(buffer.AsMemory(0,result.Count)); }
void Check(bool ok,string name){if(!ok)throw new Exception("FAIL: "+name);Console.WriteLine("PASS: "+name);}
using(var rejected=await Connect("wrong")){using var error=await Receive(rejected);Check(error.RootElement.GetProperty("type").GetString()=="error","incorrect pairing key rejected");}
using(var ws=await Connect(token)){
 using var ready=await Receive(ws);Check(ready.RootElement.GetProperty("type").GetString()=="ready","authenticated controller accepted");
 var packet=new byte[14];BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(2),0x1101);packet[4]=255;packet[5]=128;BinaryPrimitives.WriteInt16LittleEndian(packet.AsSpan(6),16384);BinaryPrimitives.WriteInt16LittleEndian(packet.AsSpan(8),-16384);
 await ws.SendAsync(packet,WebSocketMessageType.Binary,true,CancellationToken.None);
 using var heartbeatStop=new CancellationTokenSource();
 var heartbeat=Task.Run(async()=>{try{while(!heartbeatStop.IsCancellationRequested){await Task.Delay(33,heartbeatStop.Token);await ws.SendAsync(packet,WebSocketMessageType.Binary,true,heartbeatStop.Token);}}catch(OperationCanceledException){}});
 uint slot=99;for(var attempt=0;attempt<12&&slot==99;attempt++){for(uint i=0;i<4;i++)if(Native.XInputGetState(i,out var s)==0&&s.Gamepad.Buttons==0x1101&&s.Gamepad.LeftTrigger==255&&s.Gamepad.ThumbLX==16384)slot=i;if(slot==99)await Task.Delay(15);}
 Check(slot!=99,"real Windows XInput reports simultaneous buttons, trigger and joystick");
 using(var diagnostics=JsonDocument.Parse(await http.GetStringAsync("http://localhost:3210/api/host"))){var d=diagnostics.RootElement.GetProperty("controller");Check(d.GetProperty("packets").GetInt64()>0&&d.GetProperty("lastAction").GetString()!.Contains("A / Cross"),"host tester reports actual received controls");}
 using(var competing=await Connect(token)){using var denied=await Receive(competing);Check(denied.RootElement.GetProperty("type").GetString()=="error","second controller cannot take over active session");}
 var vibration=new Native.Vibration{LeftMotor=30000,RightMotor=15000};Native.XInputSetState(slot,ref vibration);using var feedback=await Receive(ws);Check(feedback.RootElement.GetProperty("type").GetString()=="rumble"&&feedback.RootElement.GetProperty("large").GetInt32()>0,"game rumble returns over WebSocket");
 vibration=default;Native.XInputSetState(slot,ref vibration);
 heartbeatStop.Cancel();await heartbeat;
 await Task.Delay(750);Native.XInputGetState(slot,out var neutral);Check(neutral.Gamepad.Buttons==0&&neutral.Gamepad.LeftTrigger==0&&neutral.Gamepad.ThumbLX==0,"stalled sender releases all controls within watchdog window");
 await ws.SendAsync(packet,WebSocketMessageType.Binary,true,CancellationToken.None);
 await Task.Delay(80);Native.XInputGetState(slot,out var resumed);Check(resumed.Gamepad.Buttons==0x1101&&resumed.Gamepad.ThumbLX==16384,"brief input pause resumes on the same connection without re-pairing");
 ws.Abort();
}
await Task.Delay(150);
using(var ws=await Connect(token)){using var ready=await Receive(ws);Check(ready.RootElement.GetProperty("type").GetString()=="ready","reconnect succeeds after dropped controller");await ws.SendAsync(new byte[13],WebSocketMessageType.Binary,true,CancellationToken.None);using var timeout=new CancellationTokenSource(2000);try{var r=await ws.ReceiveAsync(new byte[1024],timeout.Token);Check(r.MessageType==WebSocketMessageType.Close,"malformed input closes session");}catch(WebSocketException){Console.WriteLine("PASS: malformed input terminates session");}}
Console.WriteLine("Windows integration checks completed.");
static class Native{
 [StructLayout(LayoutKind.Sequential)]public struct Gamepad {public ushort Buttons;public byte LeftTrigger,RightTrigger;public short ThumbLX,ThumbLY,ThumbRX,ThumbRY;}
 [StructLayout(LayoutKind.Sequential)]public struct State{public uint Packet;public Gamepad Gamepad;}
 [StructLayout(LayoutKind.Sequential)]public struct Vibration{public ushort LeftMotor,RightMotor;}
 [DllImport("xinput1_4.dll")]public static extern uint XInputGetState(uint index,out State state);
 [DllImport("xinput1_4.dll")]public static extern uint XInputSetState(uint index,ref Vibration vibration);
}
