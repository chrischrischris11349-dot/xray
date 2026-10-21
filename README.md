# xray

A lightweight Discord client for Windows. It runs Discord's own web app in a
small Tauri shell, with xray's mod core and plugins built in. It's dark, glassy
and fast, and every plugin is rated for how much it costs to run.

Private source. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it
fits together and the rules it follows.

## Develop

```bash
npm install
npm test            # core checks
npm run app:dev     # build the core, run the shell
npm run app:build   # release build + installer
```

Requires Node 22+ and Rust (stable). Ctrl+Shift+X opens the xray panel inside Discord.
