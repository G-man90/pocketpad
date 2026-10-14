param([Parameter(Mandatory=$true)][string]$AppPath)
$ErrorActionPreference = 'Stop'
$resolvedApp = (Resolve-Path -LiteralPath $AppPath).Path
if ([IO.Path]::GetFileName($resolvedApp) -ne 'PocketPad.exe') { throw 'Select the PocketPad Windows companion.' }
$hash = [System.Security.Cryptography.SHA256]::Create()
$id = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($resolvedApp)))).Replace('-','').Substring(0,12)
$hash.Dispose()
foreach ($port in @(@{Protocol='TCP';Port=3210}, @{Protocol='UDP';Port=5353})) {
    $name = "PocketPad-$id-$($port.Protocol)"
    if (!(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $name -DisplayName "PocketPad local controller ($($port.Protocol))" -Group 'PocketPad' -Direction Inbound -Action Allow -Program $resolvedApp -Protocol $port.Protocol -LocalPort $port.Port -RemoteAddress LocalSubnet -Profile Private,Public | Out-Null
    } else {
        Set-NetFirewallRule -Name $name -Enabled True -Direction Inbound -Action Allow -Program $resolvedApp -Protocol $port.Protocol -LocalPort $port.Port -RemoteAddress LocalSubnet -Profile Private,Public | Out-Null
    }
}
