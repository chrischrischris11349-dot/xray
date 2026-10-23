/**
 * xray's own UI features (quick reply, the search palette). Like plugins,
 * each one has its own switch in the panel, and turning it off removes it
 * completely.
 */
import { featureEnabled, setFeatureEnabled } from "../settings";

export interface Feature {
  id: string;
  name: string;
  description: string;
  enabledByDefault?: boolean;
  start(): void;
  stop(): void;
}

const registered: Feature[] = [];
const listeners = new Set<() => void>();

export function registerFeature(feature: Feature): void {
  registered.push(feature);
  if (featureEnabled(feature.id, feature.enabledByDefault ?? true)) feature.start();
}

export function features(): readonly Feature[] {
  return registered;
}

export function isFeatureOn(feature: Feature): boolean {
  return featureEnabled(feature.id, feature.enabledByDefault ?? true);
}

export function setFeature(feature: Feature, on: boolean): void {
  setFeatureEnabled(feature.id, on);
  if (on) feature.start();
  else feature.stop();
  listeners.forEach((listener) => listener());
}

export function onFeaturesChanged(listener: () => void): void {
  listeners.add(listener);
}
