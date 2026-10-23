/** Accept Discord's store/REST date shapes without inventing a date for null. */
export function discordDate(value: unknown): Date | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  try {
    if (typeof value === "object" && !(value instanceof Date)) {
      const object = value as { toDate?: () => unknown; valueOf?: () => unknown };
      value = typeof object.toDate === "function" ? object.toDate() : object.valueOf?.();
    }
    if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
    const raw = typeof value === "string" && /^\d{12,14}$/.test(value) ? Number(value) : value;
    const date = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw as string | number);
    return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
  } catch { return null; }
}
export function memberJoinedAt(member: any): Date | null {
  return discordDate(member?.joinedAt) ?? discordDate(member?.joined_at);
}
