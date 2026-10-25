#requires -Version 7.0
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$VpsHost,
  [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$VpsUser='root',
  [string]$IdentityFile="$env:USERPROFILE/.ssh/xray_vps"
)
$botSecret = Read-Host 'Discord BOT token (hidden; never paste an account login token)' -AsSecureString
$botPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($botSecret)
try {
  $botValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($botPointer)
  if ($botValue -notmatch '^[a-zA-Z0-9_.-]{20,512}$') { throw 'Invalid bot token format.' }
  try { $botIdentity = Invoke-RestMethod -Uri 'https://discord.com/api/v10/users/@me' -Headers @{Authorization="Bot $botValue"} -TimeoutSec 20 }
  catch { throw 'Discord rejected this BOT token. No credential was sent to the VPS.' }
  if ($botIdentity.bot -ne $true) { throw 'A Discord bot application is required. No credential was sent to the VPS.' }
  $botSetup = [Diagnostics.ProcessStartInfo]::new('ssh')
  foreach ($part in @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-i',$IdentityFile,"$VpsUser@$VpsHost",'umask 077; cat > /etc/xray-discord-bot.env && systemctl restart xray-storage && systemctl is-active xray-storage')) { $botSetup.ArgumentList.Add($part) }
  $botSetup.UseShellExecute=$false;$botSetup.CreateNoWindow=$true;$botSetup.RedirectStandardInput=$true
  $botProcess=[Diagnostics.Process]::Start($botSetup)
  $botProcess.StandardInput.WriteLine("XRAY_BOT_TOKEN=$botValue");$botProcess.StandardInput.Close();$botProcess.WaitForExit()
  if ($botProcess.ExitCode -ne 0) { throw 'The VPS bot configuration could not be completed.' }
  Write-Output 'Bot credential validated and saved in the private VPS environment.'
  Write-Output "Install it in your test server: https://discord.com/oauth2/authorize?client_id=$($botIdentity.id)&scope=bot&permissions=66560"
  Write-Output 'Enable Server Members, Presence and Message Content intents in Discord Developer Portal. Then enable the consenting tester in XRay Server monitors with server storage enabled.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($botPointer)
  $botValue=$null;$botSecret.Dispose()
}
