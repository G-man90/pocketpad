$ErrorActionPreference='Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  npm run build
  if($LASTEXITCODE -ne 0){throw 'Web build failed.'}
  dotnet publish companion/PocketPad.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o release/windows
  if($LASTEXITCODE -ne 0){throw 'Companion build failed.'}
  Copy-Item README.md,THIRD-PARTY-NOTICES.md,RELEASE-NOTES.md -Destination release/windows
  Compress-Archive -Path release/windows/* -DestinationPath release/PocketPad-Windows-x64.zip -Force
  Write-Output 'Packaged release/PocketPad-Windows-x64.zip'
} finally {Pop-Location}
