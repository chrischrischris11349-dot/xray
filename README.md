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

See [the 0.5.2 polish notes](docs/RELEASE_0.5.2.md) for zoom, taskbar Leave VC, profile alignment, image history, screen-share confirmation and sandbox fixes.
See [the 0.5.3 report notes](docs/RELEASE_0.5.3.md) for in-app images, paged message searches, DM labels, exports, clipboard fixes and remaining data limits.
See [the 0.5.4 report fixes](docs/RELEASE_0.5.4.md) for full returned Oathnet fields, search-result paging, older history and recovery after a failed server read.
See [the 0.5.1 polish notes](docs/RELEASE_0.5.1.md) for dropdown fixes and Halloween.
See [the 0.5 release notes](docs/RELEASE_0.5.md) for live provider setup,
server recordings, mini-chat controls, monitoring limits and verification.

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
