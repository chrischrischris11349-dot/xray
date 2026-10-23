export interface PaletteTokens {
  colorScheme: "dark" | "light";
  label: string; base: string; side: string; chat: string; raised: string;
  text: string; muted: string; faint: string; accent: string; onAccent: string; line: string; wash: string;
}
export const palettes = {
  oak: { label: "Mist & Oak", colorScheme: "dark", base: "#0B0C0D", side: "#15181A", chat: "#1A1D20", raised: "#22262A", text: "#EDE9E2", muted: "#B4ADA3", faint: "#A39C92", accent: "#D29A57", onAccent: "#1B1206", line: "rgba(237,233,226,.16)", wash: "rgba(210,154,87,.14)" },
  graphite: { label: "Graphite", colorScheme: "dark", base: "#101112", side: "#191A1C", chat: "#202124", raised: "#292A2D", text: "#F2F2F4", muted: "#C1C2C6", faint: "#B0B1B6", accent: "#D5D7DD", onAccent: "#161719", line: "rgba(242,242,244,.18)", wash: "rgba(213,215,221,.13)" },
  spaceGray: { label: "Space Gray", colorScheme: "dark", base: "#10151B", side: "#19212A", chat: "#202A35", raised: "#293542", text: "#F1F4F8", muted: "#C2CCD8", faint: "#B3BFCD", accent: "#CAD3DF", onAccent: "#17212C", line: "rgba(241,244,248,.18)", wash: "rgba(202,211,223,.13)" },
  silver: { label: "Silver", colorScheme: "light", base: "#D8DADF", side: "#E3E5E9", chat: "#F1F2F5", raised: "#FFFFFF", text: "#202329", muted: "#535862", faint: "#626874", accent: "#464C58", onAccent: "#FFFFFF", line: "rgba(32,35,41,.20)", wash: "rgba(70,76,88,.10)" },
  offWhite: { label: "Off-white", colorScheme: "light", base: "#DFDCD6", side: "#EAE7E1", chat: "#F7F5F0", raised: "#FFFEFA", text: "#272520", muted: "#58544C", faint: "#686259", accent: "#514A40", onAccent: "#FFFFFF", line: "rgba(39,37,32,.20)", wash: "rgba(81,74,64,.10)" },
  halloween: { label: "Halloween", colorScheme: "dark", base: "#100E14", side: "#18131F", chat: "#1E1927", raised: "#292132", text: "#F4F0F8", muted: "#C8BFD3", faint: "#B8ACC4", accent: "#E8AD79", onAccent: "#261709", line: "rgba(221,205,239,.20)", wash: "rgba(164,132,220,.14)" },
} satisfies Record<string, PaletteTokens>;
export type PaletteId = keyof typeof palettes;

export function paletteVariables(p: PaletteTokens): Record<string, string> {
  return { "--xr-color-scheme": p.colorScheme, "--text": p.text, "--muted": p.muted, "--faint": p.faint, "--accent": p.accent, "--onAccent": p.onAccent,
    "--accentSoft": p.wash, "--raised": p.raised, "--inset": p.chat, "--seg": p.wash, "--hover": p.wash, "--line": p.line, "--line2": p.line, "--switchOff": p.line };
}
