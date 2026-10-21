# xray log server

A small service for your VPS that keeps **xray's own errors** and **your own
voice and plugin events** (fake deafen and server deafen on/off, which server,
plugin switches), so you can see when Discord changed something under xray or
review your own history.

It keeps nothing about other people: no other users, no message content, no
avatars. xray never sends those, and the server drops any field it doesn't
expect.

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

Config is your own settings only (plugin config like Text Replace rules, your
theme and feature switches) — your data, not anyone else's. It has no
retention; it's overwritten, not appended, and isn't touched by `/clear`. Turn
it on in xray with "Sync settings to my server" after setting `sync_endpoint`
and `sync_token` in `shell.json` (above).

An event is `{ kind, at, source, text, detail }`: `kind` is `error`, `voice`
or `plugin`; `at` is a millisecond timestamp; `source` and `text` are xray's
own strings; `detail` is a small flat bag of xray's own fields. Everything is
length-capped; unexpected shapes are dropped.
