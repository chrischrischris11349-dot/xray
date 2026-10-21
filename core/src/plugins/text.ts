/**
 * Helpers for plugins that rewrite what you type. Code blocks, links,
 * mentions, custom emoji, timestamps and :shortcodes: are never touched;
 * only the plain prose between them is handed to the transform.
 */

/** Fenced and inline code. `split` with this keeps code at the odd indexes. */
export const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
/** Pieces of a message that must keep their exact text. */
const PROTECTED = /(https?:\/\/[^\s<>]+|<[@#:a!t&][^>\s]*>|:[\w~-]+:)/;

/** Runs `transform` on the plain-prose parts of a message. */
export function mapProse(content: string, transform: (prose: string) => string): string {
  return content
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .split(PROTECTED)
            .map((piece, j) => (j % 2 === 1 ? piece : transform(piece)))
            .join(""),
    )
    .join("");
}

/** Runs `transform` on the inside of each fenced code block. */
export function mapCodeBlocks(content: string, transform: (code: string) => string): string {
  return content.replace(/```([^\n`]*\n)?([\s\S]*?)```/g, (_whole, language: string | undefined, code: string) => `\`\`\`${language ?? ""}${transform(code)}\`\`\``);
}

/** A rule written as `find => replace`, where `find` may be `/regex/flags`. */
export interface Rule {
  find: RegExp;
  replace: string;
}

export function parseRules(lines: readonly string[], wholeWords: boolean): Rule[] {
  const rules: Rule[] = [];
  for (const line of lines) {
    const at = line.indexOf("=>");
    if (at === -1) continue;
    const find = line.slice(0, at).trim();
    const replace = line.slice(at + 2).trim();
    if (!find) continue;
    const regex = /^\/(.+)\/([gimsuy]*)$/.exec(find);
    try {
      if (regex) rules.push({ find: new RegExp(regex[1], regex[2].includes("g") ? regex[2] : regex[2] + "g"), replace });
      else {
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        rules.push({ find: new RegExp(wholeWords ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, "giu"), replace });
      }
    } catch {
      // a broken regex is skipped, not fatal
    }
  }
  return rules;
}

/** Keeps a capital first letter when a lowercase rule replaces a capitalized word ("Brb" → "Be right back"). */
export function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  const first = original[0];
  if (first && first !== first.toLowerCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
