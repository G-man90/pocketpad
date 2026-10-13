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
        watchdog = new Timer(_ => { lock(gate) { if(owner != null && Environment.TickCount64 - lastInput > 500) { Neutral(); owner = null; } } }, null, 100, 100);
    }
    public bool Authorized(string? token) => token != null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(Token));
    public bool Claim(string id, string? token)
    {
        lock(gate)
        {
            if(!Ready || !Authorized(token) || (owner != null && owner != id)) return false;
            owner=id; lastInput=Environment.TickCount64; return true;
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
            pad.SubmitReport(); lastInput=Environment.TickCount64; return true;
        }
    }
    public void Release(string id) { lock(gate) { if(owner == id) { Neutral(); owner=null; } } }
    void Neutral() { try { pad?.ResetReport(); pad?.SubmitReport(); } catch { Status="Controller disconnected"; } }
    public void Dispose() { watchdog.Dispose(); lock(gate) { Neutral(); pad?.Disconnect(); client?.Dispose(); pad=null; } }
}
