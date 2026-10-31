/**
 * xray's design tokens: "mist and oak". Every color, space, radius, type
 * size and motion value the theme uses comes from here, so the look is
 * adjusted in one place. Documented in docs/DESIGN.md.
 *
 *   - Mist: layered warm charcoal and slate. Content surfaces are solid;
 *     the fog lives in the backdrop between panes.
 *   - Oak: muted amber. It means one thing: yours, selected, or the main
 *     action. Never decoration.
 *   - Bamboo: soft green. It means one thing: online or connected.
 *   - Brutal structure: square-ish 6px blocks on a strict 12px grid, heavy
 *     weights for titles, nothing ornamental.
 *
 * Contrast is checked by the tests (core/test/core.test.ts): body text
 * against every surface it can sit on.
 */

/** Surfaces, darkest to lightest. */
export const mist = {
  /** The backdrop behind the panes. */
  m0: "#040506",
  /** Server dock, channel list, account bar. */
  m1: "#090B0D",
  /** Chat and other content. */
  m2: "#0E1114",
  /** Raised: menus, popouts, modals, cards. */
  m3: "#14181C",
  /** Hovered or pressed rows on any surface. */
  m4: "#1D2228",
} as const;

export const ink = {
  /** Primary text. */
  text: "#EDE9E2",
  /** Secondary text: descriptions, timestamps, meta. */
  text2: "#B4ADA3",
  /** Tertiary text: placeholders, section labels. */
  text3: "#A39C92",
} as const;

export const accent = {
  /** Yours, selected, the main action. */
  oak: "#D29A57",
  oakHover: "#DEAA6A",
  /** Text and icons on an oak fill. */
  onOak: "#1B1206",
  /** A quiet oak wash behind selected rows and your own messages. */
  oakWash: "rgba(210, 154, 87, 0.14)",
  /** Online, connected. */
  bamboo: "#9DBF86",
  /** Destructive and errors. */
  danger: "#E8806E",
  /** Links in messages. */
  link: "#E2B98A",
} as const;

/** Hairlines, from the text color so they stay warm. */
export const edge = {
  soft: "rgba(237, 233, 226, 0.07)",
  strong: "rgba(237, 233, 226, 0.14)",
  hover: "rgba(237, 233, 226, 0.05)",
} as const;

/** A 4px base; the layout gutters use 12. */
export const space = { s1: "4px", s2: "8px", s3: "12px", s4: "16px", s6: "24px" } as const;

/** Small, deliberate radii: blocks read as blocks. */
export const radius = { s: "4px", m: "6px", l: "10px", round: "999px" } as const;

/** Discord's own gg sans; weight carries hierarchy. */
export const type = {
  family: '"gg sans", "Noto Sans", "Segoe UI", system-ui, sans-serif',
  xs: "12px",
  sm: "13px",
  md: "15px",
  lg: "20px",
  xl: "24px",
  bold: "700",
  heavy: "800",
} as const;

/** One motion moment (floating layers rising in) and quick color changes. */
export const motion = {
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  fast: "100ms",
  rise: "160ms",
} as const;

/** The tokens as CSS custom properties, for any stylesheet that wants them. */
export function tokenCss(): string {
  const groups: Record<string, Record<string, string>> = { mist, ink, accent, edge, space, radius, type, motion };
  const lines: string[] = [];
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, value] of Object.entries(values)) lines.push(`--xr-${group}-${kebab(name)}: ${value};`);
  }
  return lines.join("\n  ");
}

function kebab(name: string): string {
  return name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, "");
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
