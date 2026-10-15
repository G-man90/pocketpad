using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

public sealed class GamepadBridge : IDisposable
{
    readonly object gate = new();
    ViGEmClient? client;
    IXbox360Controller? pad;
    string? owner;
    long lastInput;
    long packets;
    long actions;
    string? peer;
    DateTimeOffset? connectedAt;
    DateTimeOffset? lastActionAt;
    string lastAction = "No buttons received yet";
    string connectionNote = "Waiting for a controller";
    public object Snapshot() { lock(gate) return new { connected = owner != null, peer, connectedAt, packets, actions, lastAction, lastActionAt, note = connectionNote }; }
    readonly Timer watchdog;
    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
    public string Status { get; private set; } = "Starting";
    public bool Ready => pad != null;
    public string? Owner { get { lock(gate) return owner; } }
    public event Action<byte, byte>? Rumble;
    public GamepadBridge()
    {
        try
        {
            client = new ViGEmClient(); pad = client.CreateXbox360Controller();
            pad.AutoSubmitReport = false; pad.Connect();
            pad.FeedbackReceived += (_, e) => Rumble?.Invoke(e.LargeMotor, e.SmallMotor);
            Status = "Xbox controller ready";
        }
        catch(Exception ex) { pad = null; Status = "Gamepad driver unavailable: " + ex.GetType().Name; }
        watchdog = new Timer(_ => { lock(gate) { if(owner != null && Environment.TickCount64 - lastInput > 500) { Neutral(); owner = null; connectionNote = "Input stopped. Keep the controller page open and the screen awake."; } } }, null, 100, 100);
    }
    public bool Authorized(string? token) => token != null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(Token));
    public bool Claim(string id, string? token, string? address = null)
    {
        lock(gate)
        {
            if(!Ready || !Authorized(token) || (owner != null && owner != id)) return false;
            owner=id; peer=address ?? "Bluetooth"; connectedAt=DateTimeOffset.UtcNow; packets=0; actions=0; lastActionAt=null; lastAction="No buttons received yet"; connectionNote="Connected. Tap a button on your controller to test."; lastInput=Environment.TickCount64; return true;
        }
    }
    public bool Submit(string id, ReadOnlySpan<byte> data)
    {
        lock(gate)
        {
            if(data.Length != 14 || owner != id || pad == null) return false;
            pad.SetButtonsFull(BinaryPrimitives.ReadUInt16LittleEndian(data[2..]));
            pad.SetSliderValue(Xbox360Slider.LeftTrigger, data[4]);
            pad.SetSliderValue(Xbox360Slider.RightTrigger, data[5]);
            pad.SetAxisValue(Xbox360Axis.LeftThumbX, BinaryPrimitives.ReadInt16LittleEndian(data[6..]));
            pad.SetAxisValue(Xbox360Axis.LeftThumbY, BinaryPrimitives.ReadInt16LittleEndian(data[8..]));
            pad.SetAxisValue(Xbox360Axis.RightThumbX, BinaryPrimitives.ReadInt16LittleEndian(data[10..]));
            pad.SetAxisValue(Xbox360Axis.RightThumbY, BinaryPrimitives.ReadInt16LittleEndian(data[12..]));
            pad.SubmitReport(); lastInput=Environment.TickCount64; packets++;
            var buttons = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
            var labels = new List<string>();
            foreach(var (mask, label) in new (int, string)[] { (1,"Up"),(2,"Down"),(4,"Left"),(8,"Right"),(16,"Start / Options"),(32,"Back / Share"),(64,"L3"),(128,"R3"),(256,"LB / L1"),(512,"RB / R1"),(4096,"A / Cross"),(8192,"B / Circle"),(16384,"X / Square"),(32768,"Y / Triangle") })
                if ((buttons & mask) != 0) labels.Add(label);
            if(data[4] > 0) labels.Add("LT / L2");
            if(data[5] > 0) labels.Add("RT / R2");
            if(BinaryPrimitives.ReadInt16LittleEndian(data[6..]) != 0 || BinaryPrimitives.ReadInt16LittleEndian(data[8..]) != 0) labels.Add("Left stick");
            if(BinaryPrimitives.ReadInt16LittleEndian(data[10..]) != 0 || BinaryPrimitives.ReadInt16LittleEndian(data[12..]) != 0) labels.Add("Right stick");
            if(labels.Count > 0) { actions++; lastAction=string.Join(" + ",labels); lastActionAt=DateTimeOffset.UtcNow; }
            return true;
        }
    }
    public void Release(string id) { lock(gate) { if(owner == id) { Neutral(); owner=null; connectionNote="Controller disconnected. Reopen PocketPad on your device to reconnect."; } } }
    void Neutral() { try { pad?.ResetReport(); pad?.SubmitReport(); } catch { Status="Controller disconnected"; } }
    public void Dispose() { watchdog.Dispose(); lock(gate) { Neutral(); pad?.Disconnect(); client?.Dispose(); pad=null; } }
}
