param([switch]$Personal)
$ErrorActionPreference='Stop'
$workspace=Split-Path -Parent $PSScriptRoot
$keyPath=Join-Path $env:APPDATA 'XRay-build/updater.key'
if(!(Test-Path -LiteralPath $keyPath)){throw 'Generate your updater signing key privately and configure its public key before building a signed release. See docs/UPDATES.md.'}
$oldPersonal=$env:XRAY_PERSONAL_BUILD
$oldSigning=$env:TAURI_SIGNING_PRIVATE_KEY
$oldPassword=$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
try {
 $env:XRAY_PERSONAL_BUILD=if($Personal){'1'}else{'0'}
 $env:TAURI_SIGNING_PRIVATE_KEY=$keyPath
 $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
 Push-Location $workspace
 try { & node node_modules/@tauri-apps/cli/tauri.js build; if($LASTEXITCODE -ne 0){throw "Release build failed ($LASTEXITCODE)"} }
 finally { Pop-Location }
} finally {
 $env:XRAY_PERSONAL_BUILD=$oldPersonal
 $env:TAURI_SIGNING_PRIVATE_KEY=$oldSigning
 $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$oldPassword
}
