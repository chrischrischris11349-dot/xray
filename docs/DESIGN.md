# XRay design

The current default is Graphite: layered near-black surfaces, silver controls,
fine borders and restrained static highlights. Space Gray, Silver and Off-white
share the same semantic roles. `core/src/theme/palettes.ts` defines them;
`core/src/ui/appearance.ts` applies them without duplicating component styles.
Device indicators use a neutral tone with a small static glow; their tooltips
retain device/status information. Increased contrast and reduced transparency
remove the glow. Photographs and badge art keep their original colors.

Halloween is an optional seasonal palette in the same Appearance selector. It
reuses these surface, text, action and selection roles with near-black plum
surfaces, soft orange actions and a lavender selection wash. Presence, errors,
role badges and photographs retain their meaning and colors. The only extra
decoration is an original outlined pumpkin and ghost beside the XRay settings
title (`core/src/theme/seasonal.ts`): static vector artwork, with no image
requests, emoji font or background animation. Increased contrast and forced
colors hide this decorative mark. All palettes declare their native color
scheme so operating-system dropdowns and form controls match the active theme.

The implementation, current limits and companion roadmap are in
`docs/COMPANION_PLAN.md`. The original Mist & Oak palette remains selectable;
its foundational token reference follows below.

xray's look, its tokens, and the extended profile view. The rules in
`docs/ARCHITECTURE.md` still apply: the theme restyles Discord through its own
CSS variables and stable class-name prefixes, and never changes what anything
does.

## The idea

A dark desk of smoked glass and oiled oak, at night.

- **Mist.** Layered warm charcoal and slate. Content surfaces are solid so
  text stays crisp; the fog lives in the backdrop that shows in the 12px
  gutters between panes.
- **Oak** (muted amber) means one thing: *yours, selected, or the main
  action*. The selected server, channel and settings page; your own messages;
  filled buttons; mentions of you; keyboard focus.
- **Bamboo** (soft green) means one thing: *online or connected*.
- **Brutal structure.** Solid blocks with small radii (4, 6, 10px) on a strict
  12px grid, heavy weights for the few headlines, nothing ornamental. The
  dot grid and corner ticks of the old look are gone.
- **The signature:** a hard oak edge, square-ended, on whatever is selected or
  yours. It is the one bold thing on screen.
- **Glass** only on the floating layer (menus, xray's panel and sheets),
  never on content.
- **One motion:** floating layers rise 4px and fade in over 160ms. Hovers only
  change color (100ms). With Reduce Motion on, nothing animates.

## Tokens

Defined once in `core/src/theme/tokens.ts`. `obsidian.ts` maps them onto
Discord's own variables, `shell.ts` uses them for layout, and
`core/src/ui/styles.ts` uses them for xray's own UI. `tokenCss()` emits them
all as `--xr-<group>-<name>` custom properties.

### Color

| Token | Value | Role |
| --- | --- | --- |
| `mist.m0` | `#0B0C0D` | Backdrop behind the panes |
| `mist.m1` | `#15181A` | Server dock, channel list, account bar |
| `mist.m2` | `#1A1D20` | Chat and other content |
| `mist.m3` | `#22262A` | Raised: menus, popouts, modals, sheets |
| `mist.m4` | `#2B3034` | Hovered or pressed rows |
| `ink.text` | `#EDE9E2` | Primary text |
| `ink.text2` | `#B4ADA3` | Secondary text: descriptions, meta |
| `ink.text3` | `#A39C92` | Tertiary text: placeholders, section labels |
| `accent.oak` | `#D29A57` | Yours, selected, main action |
| `accent.oakHover` | `#DEAA6A` | Oak buttons on hover |
| `accent.onOak` | `#1B1206` | Text on an oak fill |
| `accent.oakWash` | `rgba(210,154,87,.14)` | Behind selected rows |
| `accent.bamboo` | `#9DBF86` | Online, connected |
| `accent.danger` | `#E8806E` | Destructive actions, errors |
| `accent.link` | `#E2B98A` | Links in messages (always underlined too) |
| `edge.soft` / `edge.strong` | warm white at 7% / 14% | Hairlines |

### Contrast

Measured with the WCAG formula and enforced by the tests (`npm test`, the
"design tokens" checks): every text color on every surface it can sit on.

| On | text | text2 | text3 | oak |
| --- | --- | --- | --- | --- |
| m0 | 16.2 | 8.8 | 7.2 | 7.9 |
| m1 | 14.7 | 8.0 | 6.6 | 7.2 |
| m2 | 14.0 | 7.6 | 6.2 | 6.9 |
| m3 | 12.6 | 6.9 | 5.6 | 6.2 |
| m4 | 11.0 | 6.0 | 4.9 | 5.4 |

`onOak` on `oak` (button labels): 7.5:1. Everything clears 4.5:1, the minimum
for small text. With Increase Contrast on, secondary text steps up to primary
and hairlines get firmer.

### Space, shape, type, motion

| Group | Values |
| --- | --- |
| `space` | 4, 8, 12, 16, 24px. Panes sit 12px apart |
| `radius` | `s` 4px (rows, chips), `m` 6px (blocks), `l` 10px (modals, sheets) |
| `type` | Discord's gg sans throughout. 12 / 13 / 15 / 20 / 24px; weight 700 for names and labels, 800 for the few headlines. Mono only for code and key caps |
| `motion` | `ease` cubic-bezier(0.2, 0.8, 0.2, 1); `fast` 100ms; `rise` 160ms |

## Extended profile view

A sheet with more about someone than Discord's own profile shows at once.

**How to open it**

- On anyone's profile popout (click their name or avatar), press the
  **Details** button (the ID-card icon) between Add Friend and More. It also
  appears on the full profile.
- Or right-click them and choose **Profile details**.

Escape, Close, or a click outside closes it. Requires the Profile Details
plugin (on by default).

**What it shows**, all from data Discord already has or loads when you open a
profile (`GET /users/{id}/profile`, the same request Discord makes):

| Section | Shows | When it's missing |
| --- | --- | --- |
| Header | Banner, avatar, name, @username, pronouns, status (as text and a dot), custom status, badges, a Bot tag | No banner: a mist banner tinted by their profile accent. No avatar: their initial |
| About | Bio (server bio first) | Left out |
| Roles | Their roles in this server, highest first, with role colors | Left out outside servers |
| Dates | Account created; joined this server; friends since; boosting since; each with how long ago | Only "Account created" is always there |
| Mutual servers | Up to 12, with icon and their nickname there, then "and N more" | "Loading…" while the request runs; "No servers in common."; "Couldn't load this…" if the request fails |
| Mutual friends | Up to 12 names, then "and N more" | Same as above |
| Connections | Service and account name, marked Verified | Left out when there are none |

Nothing is invented: a server Discord doesn't know the name of is shown as
"A server you're in".

Full-width blocks (About, Roles) come first; the rest pair up two by two, and
an odd one out spans the row so the grid never has holes. Below 560px the
sheet becomes one column with the avatar above the name.

**Code:** `core/src/ui/profile.ts`, in three tested steps:
`gatherProfile` + `mergeProfile` (data), `profileSections` (what to show and
the fallbacks), `renderProfile` (the sheet). The tests in
`core/test/core.test.ts` cover the full, sparse, loading, failed and
malformed cases and render the sheet in a small DOM (linkedom), including that
bios and names stay text and are never parsed as HTML.
