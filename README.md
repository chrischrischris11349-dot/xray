# xray

A lightweight Discord client for Windows. It runs Discord's own web app in a
small Tauri shell, with xray's mod core and plugins built in, plus
[Equicord](https://github.com/Equicord/Equicord)'s plugins (see
[equicord/README.md](equicord/README.md)). It's dark, glassy and fast, and you
pick exactly which plugins run.

Licensed under GPL-3.0-or-later; see [LICENSE](LICENSE). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together and the
rules it follows, and [docs/DESIGN.md](docs/DESIGN.md) for the look (design
tokens) and the extended profile view.

## Develop

```bash
npm install
npm test            # core checks
npm run app:dev     # build the core, run the shell
npm run app:build   # release build + installer
```

Requires Node 22+, pnpm and Rust (stable). Ctrl+Shift+X opens the xray panel inside Discord.

## Credits

Equicord and Vencord (GPL-3.0-or-later) by Vendicated, the Equicord team and
their contributors; xray builds them from source, minus the plugins listed in
[equicord/excluded.json](equicord/excluded.json). Icons are
[Lucide](https://lucide.dev) (ISC).
