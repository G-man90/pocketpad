using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;

public sealed class BluetoothBridge(GamepadBridge bridge) : IDisposable
{
    public const string ServiceId = "b984a100-65b2-4ee5-9946-b88096e0a321";
    GattServiceProvider? provider;
    GattLocalCharacteristic? rumble;
    string? authenticatedDevice;
    readonly SemaphoreSlim startGate = new(1, 1);
    public string Status { get; private set; } = "Checking Bluetooth…";
    public async Task Start()
    {
        try
        {
            var adapter=await BluetoothAdapter.GetDefaultAsync();
            if(adapter == null || !adapter.IsPeripheralRoleSupported) { Status="This Bluetooth adapter cannot host a controller connection. Use Wi-Fi."; return; }
            var radio = await adapter.GetRadioAsync();
            if (radio != null && radio.State != Windows.Devices.Radios.RadioState.On) { Status="Bluetooth is switched off. Turn it on in Windows, then click Check Bluetooth again."; return; }
            var result=await GattServiceProvider.CreateAsync(Guid.Parse(ServiceId));
            if(result.Error != BluetoothError.Success) { Status="Bluetooth unavailable: " + result.Error; return; }
            provider=result.ServiceProvider;
            provider.AdvertisementStatusChanged += (sender, e) => {
                if (sender != provider) return;
                Status = e.Status == GattServiceProviderAdvertisementStatus.Started ? "Bluetooth ready" : e.Status == GattServiceProviderAdvertisementStatus.Aborted ? "Bluetooth is on, but Windows could not advertise the controller service" + (e.Error == BluetoothError.Success ? "." : " (" + e.Error + ").") + " Close other Bluetooth sharing apps and retry, or use Wi-Fi." : "Bluetooth: " + e.Status;
            };
            var auth=await Make("b984a101-65b2-4ee5-9946-b88096e0a321", GattCharacteristicProperties.Write);
            var input=await Make("b984a102-65b2-4ee5-9946-b88096e0a321", GattCharacteristicProperties.WriteWithoutResponse | GattCharacteristicProperties.Write);
            rumble=await Make("b984a103-65b2-4ee5-9946-b88096e0a321", GattCharacteristicProperties.Notify);
            auth.WriteRequested += async (_, args) =>
            {
                var deferral=args.GetDeferral();
                try
                {
                    var request=await args.GetRequestAsync(); if(request==null) return;
                    var token=DataReader.FromBuffer(request.Value).ReadString(request.Value.Length);
                    var id="ble:" + args.Session.DeviceId.Id;
                    if(bridge.Claim(id, token)) { authenticatedDevice=id; request.Respond(); }
                    else request.RespondWithProtocolError(0x08);
                }
                catch { } finally { deferral.Complete(); }
            };
            input.WriteRequested += async (_, args) =>
            {
                var deferral=args.GetDeferral();
                try
                {
                    var request=await args.GetRequestAsync(); if(request==null) return;
                    var id="ble:" + args.Session.DeviceId.Id;
                    var data=new byte[request.Value.Length]; DataReader.FromBuffer(request.Value).ReadBytes(data);
                    if(id==authenticatedDevice && data.Length==14 && bridge.Owner==null) bridge.Claim(id,bridge.Token);
                    var ok=id==authenticatedDevice && bridge.Submit(id,data);
                    if(request.Option == GattWriteOption.WriteWithResponse) { if(ok) request.Respond(); else request.RespondWithProtocolError(0x08); }
                }
                catch { } finally { deferral.Complete(); }
            };
            bridge.Rumble += SendRumble;
            Status="Starting Bluetooth advertising…";
            provider.StartAdvertising(new GattServiceProviderAdvertisingParameters { IsConnectable=true, IsDiscoverable=true });
        }
        catch(Exception ex) { Status="Bluetooth unavailable: " + ex.GetType().Name + ". Use Wi-Fi."; }
    }
    async Task<GattLocalCharacteristic> Make(string id,GattCharacteristicProperties properties)
    {
        var result=await provider!.Service.CreateCharacteristicAsync(Guid.Parse(id),new GattLocalCharacteristicParameters { CharacteristicProperties=properties, WriteProtectionLevel=GattProtectionLevel.EncryptionRequired, ReadProtectionLevel=GattProtectionLevel.EncryptionRequired });
        if(result.Error != BluetoothError.Success) throw new InvalidOperationException(result.Error.ToString());
        return result.Characteristic;
    }
    async void SendRumble(byte large, byte small)
    {
        if(rumble==null || bridge.Owner!=authenticatedDevice) return;
        try { using var writer=new DataWriter(); writer.WriteBytes([large,small]); foreach(var subscriber in rumble.SubscribedClients) if("ble:"+subscriber.Session.DeviceId.Id==authenticatedDevice) await rumble.NotifyValueAsync(writer.DetachBuffer(),subscriber); } catch { }
    }
    public async Task Restart()
    {
        await startGate.WaitAsync();
        try { Dispose(); await Start(); } finally { startGate.Release(); }
    }
    public void Dispose() { bridge.Rumble-=SendRumble; if(authenticatedDevice != null) bridge.Release(authenticatedDevice); authenticatedDevice=null; rumble=null; provider?.StopAdvertising(); provider=null; }
}
