/**
 * Ranking for the search palette. Plain rules, no index: the palette searches
 * a few thousand names at most, and only while it's open.
 */

export interface Searchable {
  title: string;
  /** Extra text that can match, like a server name for a channel. */
  keywords?: string;
  /** Added to the score, e.g. so recent DMs come before old ones. */
  boost?: number;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** How well `query` matches `text`: 0 is no match. Exact beats prefix, which beats word start, then anywhere, then in-order letters. */
export function score(query: string, text: string): number {
  const q = normalize(query.trim());
  const t = normalize(text);
  return normalizedScore(q, t);
}

function normalizedScore(q: string, t: string): number {
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - Math.min(t.length - q.length, 30) / 3;
  const at = t.indexOf(q);
  if (at > 0 && /[\s\-_#.@/]/.test(t[at - 1])) return 60;
  if (at !== -1) return 40;
  let next = 0;
  for (const char of t) if (char === q[next]) next++;
  return next === q.length ? 15 : 0;
}

const prepared = new WeakMap<Searchable, { title: string; keywords: string | undefined; normalizedTitle: string; normalizedKeywords: string }>();
function prepare(item: Searchable) {
  let value = prepared.get(item);
  if (!value || value.title !== item.title || value.keywords !== item.keywords) {
    value = { title: item.title, keywords: item.keywords, normalizedTitle: normalize(item.title), normalizedKeywords: item.keywords ? normalize(item.keywords) : "" };
    prepared.set(item, value);
  }
  return value;
}

/** The best `limit` matches, best first. The title counts fully, keywords count less. */
export function rank<T extends Searchable>(query: string, items: readonly T[], limit: number): T[] {
  const normalizedQuery = normalize(query.trim());
  const scored: { item: T; points: number }[] = [];
  for (const item of items) {
    const cached = prepare(item);
    const points = Math.max(normalizedScore(normalizedQuery, cached.normalizedTitle), item.keywords ? normalizedScore(normalizedQuery, cached.normalizedKeywords) * 0.6 : 0);
    if (points > 0) scored.push({ item, points: points + (item.boost ?? 0) });
  }
  return scored.sort((a, b) => b.points - a.points).slice(0, limit).map((entry) => entry.item);
}
