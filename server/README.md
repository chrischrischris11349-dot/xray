# xray log server

For the 0.5.7 optional always-on Discord bot collector, deploy all four runtime
modules together and follow [VPS bot setup](../docs/VPS_BOT_SETUP.md). It uses
an official bot token, requires server installation/intents and exposes a
separate read-only `bot-history.<accountId>` document. Desktop-only and VPS
observations remain separate. Global bios/private account DMs are not supplied
by the bot gateway.

A small service for your VPS that keeps **xray's own errors** and **your own
voice and plugin events** (fake deafen and server deafen on/off, which server,
plugin switches), so you can see when Discord changed something under xray or
review your own history.

The log stream contains XRay events and confirmed moderation action metadata;
it never contains message bodies or image files. The separate, opt-in document
store added in 0.4 can hold your profile notes, observed profile history and
moderation audits, described below. From 0.4.1, opted-in deletion history includes
up to 500 characters of previously visible text and four attachment names per
event. Files themselves are not archived. Nothing is uploaded until configured.

## Run it

Node 22+ only, no dependencies to install (it uses `node:sqlite`, built in).

```bash
XRAY_LOG_TOKEN="$(openssl rand -hex 32)" node server/log-server.mjs
```

Put it behind HTTPS (Caddy, nginx, a tunnel) so the token isn't sent in the
clear, and keep it bound to localhost (the default) behind that proxy.

| Variable | Default | |
| --- | --- | --- |
| `XRAY_LOG_TOKEN` | — | Required, 16+ chars. The bearer token xray and the page send. |
| `XRAY_LOG_PORT` | `8787` | |
| `XRAY_LOG_BIND` | `127.0.0.1` | |
| `XRAY_LOG_DB` | `./xray-log.sqlite` | |
| `XRAY_LOG_RETENTION_DAYS` | `15` | Events older than this are deleted, on a timer and on every write. |

## Point xray at it

In the xray app's `shell.json` (its config folder), set:

```json
{ "log_endpoint": "https://logs.example.com/ingest", "log_token": "the same token" }
```

The address and token live only there, on the Rust side — Discord's page never
sees them. Then turn on **Send logs to my server** in the xray panel. With no
endpoint set, logging does nothing.

To sync your own settings instead (plugins, theme, switches — never messages or
anyone else's data), set the server's base URL and a token:

```json
{ "sync_endpoint": "https://logs.example.com", "sync_token": "a token" }
```

It can be the same server as the logs (xray calls its `/config` endpoint) or a
different one. Then turn on **Sync settings to my server** in the xray panel.
With no `sync_endpoint` set, sync does nothing and your settings stay local.

## Read the logs

- **In xray:** the panel toggle; a reader view in xray can show the server's
  recent events (planned next to the Message log).
- **On the server:** open the server's URL in a browser. It asks for the token
  once (kept in that tab only), then shows the last `RETENTION_DAYS` of events,
  filterable by kind, with a **Clear all** button.

## Endpoints

All require `Authorization: Bearer <token>`.

| | |
| --- | --- |
| `POST /ingest` | `[event, …]` or `{ "events": [...] }`. Returns `{ added }`. |
| `GET /events.json?kind=error\|voice\|plugin` | The recent events, newest first. |
| `POST /clear` | Deletes every event. |
| `GET /` | The reader page. |
| `GET /config?ns=<plugin>` | A plugin's own saved settings: `{ value, updatedAt }`. |
| `PUT /config?ns=<plugin>` | Body `{ value }`. Stores the plugin's settings; newest write wins. |
| `GET /documents?ns=profile-history.<accountId>` | Account document `{ value, revision }`; a missing document has `null, 0`. |
| `GET /documents?ns=moderation-audit.<accountId>` | Same protocol for the moderation audit. |
| `PUT /documents?ns=<allowed-account-document>` | `{ value: "serialized JSON", revision: <last-read revision> }`; returns the new revision or HTTP 409. |

Config is your own settings only (plugin config like Text Replace rules, your
theme and feature switches) — your data, not anyone else's. It has no
retention; it's overwritten, not appended, and isn't touched by `/clear`. Turn
it on in xray with "Sync settings to my server" after setting `sync_endpoint`
and `sync_token` in `shell.json` (above).

An event is `{ kind, at, source, text, detail }`: `kind` is `error`, `voice`
or `plugin`; `at` is a millisecond timestamp; `source` and `text` are xray's
own strings; `detail` is a small flat bag of xray's own fields. Everything is
length-capped; unexpected shapes are dropped.

## Server storage for notes, history and audits (0.4)

Update this service to the matching 0.4 source before enabling **Store profile
data on my server** in XRay's panel. Reuse `sync_endpoint` and `sync_token` in
`shell.json`; this is separate from the settings-sync switch. On Windows the
file is `%APPDATA%\app.xray.desktop\shell.json`. Keep the token in that file,
not in chat or the shared installer. The new document command reloads this
configuration, so adding the address does not need an app restart.

XRay uploads existing account records, reads migrations back to verify them,
then removes the persistent local history/audit copies. A tiny account-specific
storage preference remains locally. New records are held in memory while the
app runs and saved to your server, without a local disk fallback. Wait for
saves to finish before quitting, logging out or changing accounts; offline
pending changes cannot survive a crash/restart or account switch. A failed
migration keeps its local originals. Conflicting local
and server records stop the migration rather than overwrite either copy.

Documents are stored in the same server SQLite database, independently from
event logs and `/clear`. Writes compare the last-read revision atomically;
HTTP 409 means another device changed the record. Do not blindly retry with
a newer revision: export unsaved notes/history, reload, and reconcile first.
Documents are limited to 2 MB each. History is bounded/pruned on client load
and save (7/30 days, at most 2,000 observations); a dormant server document
retains its previous snapshot until the next save. Audit retention is applied
when appending (30 days / 500 entries). Notes remain until removed.

This is a personal operator service: the bearer token grants access to all
documents on that service. Account namespaces isolate storage keys, not server
authorization. Give friends their own server/token rather than distributing
yours. Any script in the Discord WebView can invoke granted native commands;
the token stays in Rust, but the document contents are available to that
WebView. Restrict database/backup access on your server accordingly.

App binaries, WebView/Discord caches and small settings still need PC disk
space. Document server mode does not archive full chat transcripts, photos, imported
intelligence reports or every third-party plugin's own storage. Photo metadata
inspection is on demand and does not persist the photo or extracted tags.


## Recordings and server monitors (0.5)

Deploy both `log-server.mjs` and `recordings.mjs` together. The service creates a
`recordings` directory beside `XRAY_LOG_DB`; override it with
`XRAY_RECORDINGS_DIR`. It must be writable by the service account. Keep the
service behind the same authenticated HTTPS/private network endpoint. Do not
publish the bearer token or share it in an installer.

`POST /recordings` accepts JSON with `action` equal to `start`, `chunk`,
`finish`, `list`, `read`, or `abort`. Start requires `consent: true`.
Chunks include the recording `id`, zero-based `index`, and base64 `data`
(maximum 128 KB decoded). Retrying the last identical chunk is idempotent;
other out-of-order chunks are rejected. Finish is idempotent; optional `partial: true` marks only the received portion
as partial in metadata and list responses. Read requires a
completed recording, and abort can discard only an incomplete recording.

Limits are 32 MB per recording, 512 MB overall, 100 sessions, and two hours
per incomplete session. Completed recordings expire after seven days. Pruning
runs hourly and during list/quota checks; it touches only recording UUID
files. Uploads use private `.part` files and atomic JSON metadata replacement.
An interrupted append is truncated back to the last committed metadata size
before retry. User downloads explicitly retrieve the completed WebM.

`server-monitors.<accountId>` uses the existing `/documents` protocol and
revision checks. It inherits the existing bearer-token authorization model.
Client retention is seven days/100 events per server/1,000 events overall;
a dormant document remains until the client next prunes and saves it.

Run `node server/test.mjs` and `node --test server/recordings.test.mjs` for
HTTP and recording-store checks. The app still needs small settings, binaries,
notification-avatar cache and WebView cache on the PC; server storage does
not promise zero local disk use.
