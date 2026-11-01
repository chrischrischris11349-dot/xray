import type { Feature } from "../ui/features";
// A separate id, so a setting saved by a full build can't switch this on.
export const intelligence: Feature = { id: "intelligence-unavailable", name: "Intelligence workspace", description: "", enabledByDefault: false, start() {}, stop() {} };
export function openIntelligence(_tab?: string): void {}
