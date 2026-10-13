$ErrorActionPreference='Stop'
$pocketRoot=Split-Path $PSScriptRoot
$pocketAssets=Get-Content -LiteralPath (Join-Path $pocketRoot 'companion/obj/project.assets.json') -Raw | ConvertFrom-Json -AsHashtable
$pocketPackages=@($pocketAssets.packageFolders.Keys)[0]
foreach($library in $pocketAssets.libraries.Keys) {
  $package=Join-Path $pocketPackages $library.ToLowerInvariant()
  if(Test-Path -LiteralPath $package) {
    $notices=Get-ChildItem -LiteralPath $package -File | Where-Object { $_.Name -match '^(LICENSE|THIRD-PARTY-NOTICES)(\.|$)' }
    if($notices) {
      $destination=Join-Path $pocketRoot ('release/windows/licenses/'+$library.Replace('/','-'))
      New-Item -ItemType Directory -Force -Path $destination | Out-Null
      foreach($notice in $notices){Copy-Item -LiteralPath $notice.FullName -Destination $destination}
    }
  }
}
