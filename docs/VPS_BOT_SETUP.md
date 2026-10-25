# Always-on tester history on the VPS

The storage service can continue running when the Windows PC is off. To receive Discord events, it needs its own Discord **bot application** installed in a server containing the consenting testers. Main and alt accounts are targets, not authentication identities for this service.

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), open **Bot**, and enable **Server Members Intent**, **Presence Intent** and **Message Content Intent**. Discord approval requirements can depend on the application. Copy the bot token privately; do not paste it in chat.
2. On your Windows PC, run PowerShell 7 from the matching source folder:

   ```powershell
   pwsh -File scripts/configure-vps-bot.ps1 -VpsHost your-vps-hostname
   ```

   The default key is your existing `~/.ssh/xray_vps`; use `-IdentityFile` or `-VpsUser` if needed. SSH host verification must already be established. The hidden prompt accepts a bot token, validates it using `Authorization: Bot`, requires `bot: true`, sends it over SSH standard input and saves it only in `/etc/xray-discord-bot.env` with private permissions. It never uses a user-account token or places a secret in command-line arguments.
3. Use the printed bot install link to add it to each test server you manage. Its default permissions request View Channels and Read Message History; channel permission overrides still apply. It does not need Administrator, voice joining, or message deletion permissions.
4. In XRay, enable **Store profile data on my server**. Right-click the shared server, add it to **Server monitors**, choose an agreed tester and start monitoring. Other testers with profile history explicitly enabled can also be observed in that enabled server. Enable **Observed messages**, **Edits** and **Deletions** on each consenting test profile if their text/image references should be retained.
5. Open a tester's full profile and refresh **VPS bot history**. Confirm the collector is connected and that a new test message appears. Edit/delete that test message, close XRay, repeat from another client, then reopen XRay and refresh to verify PC-off coverage.

The service reads `XRAY_BOT_TOKEN` from the optional private environment file. A systemd drop-in should contain:

```ini
[Service]
EnvironmentFile=-/etc/xray-discord-bot.env
```

Deploy `log-server.mjs`, `recordings.mjs`, `bot-history.mjs` and `discord-bot.mjs` together. The existing `xray-storage` service and SQLite database are reused. Service output contains state/errors, not account tokens or message bodies. Restart the service after changing its token/intents. Do not distribute the environment file, database or storage bearer token with the installer.

The collector persists at most 200 events per tester and 2,000 overall, subject to 7/30-day retention and the bounded document size. Its message cache is capped at 10,000 messages and 30 days; cleanup runs during activity and hourly. Stopping a monitor or opting a profile out stops future eligible collection; old retained observations expire normally. Existing message text is retained only for the selected history categories. A bot cannot attribute a message deletion to an actor or recover content it never received.

A bot sees permitted events in its own shared servers. It does not gain access to your main/alt's private DMs, other servers, hidden presence or global bio history. Those limitations follow the [Discord gateway access and intents model](https://docs.discord.com/developers/events/gateway#gateway-intents). Files are represented by attachment names/links; binary files and live voice audio are not captured by this collector.
