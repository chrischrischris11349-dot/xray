import type { Impact, Plugin } from "./types";

export type OverallImpact = Impact | "none";

const ORDER: readonly Impact[] = ["light", "moderate", "heavy"];

/**
 * Combines the impact ratings of every enabled plugin into the one rating
 * shown at the top of the plugin list ("Impact: Moderate").
 *
 * TODO(you): pick the rule. The placeholder below says "the worst plugin
 * wins", which means one moderate plugin rates the same as ten. Things to
 * weigh:
 *   - Many light plugins can add up to real cost. Should 6+ lights count as
 *     moderate?
 *   - Should two or more moderates count as heavy?
 *   - On a 240 Hz screen, heavy plugins that animate every frame cost 4× what
 *     they would at 60 Hz, so should one heavy always mean heavy?
 * Return "none" when nothing is enabled.
 */
export function combineImpact(enabled: readonly Pick<Plugin, "impact">[]): OverallImpact {
  if (enabled.length === 0) return "none";
  return enabled.reduce<Impact>((worst, p) => (ORDER.indexOf(p.impact) > ORDER.indexOf(worst) ? p.impact : worst), "light");
}
