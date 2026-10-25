/** Missing activities mean unknown; an explicit empty list means no custom status. */
export function customStatusSnapshot(activities: unknown): string | null | undefined {
  if (!Array.isArray(activities)) return undefined;
  const activity = activities.find(item => item?.type === 4);
  if (!activity) return null;
  if (activity.state != null && typeof activity.state !== "string") return undefined;
  const state = (activity.state ?? "").slice(0, 128);
  const emoji = activity.emoji;
  const name = typeof emoji?.name === "string" ? emoji.name.slice(0, 80) : "";
  const mark = typeof emoji?.id === "string" && /^\d{14,20}$/.test(emoji.id)
    ? `<${emoji.animated === true ? "a" : ""}:${name}:${emoji.id}>`
    : name;
  return [mark, state].filter(Boolean).join(" ") || null;
}
