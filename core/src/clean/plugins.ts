// Plugins left out of clean builds. plugins/builtins.ts drops the empty default.
export default undefined;
export const personalEditingEnabled = (): boolean => false;
export function onPersonalEditingChanged(_listener: () => void): () => void { return () => {}; }
export const localEditAvailable = (_message: unknown): boolean => false;
export const hasLocalEdit = (_message: unknown): boolean => false;
export function editMessageLocally(_message: unknown): void {}
export function resetMessageLocally(_message: unknown): void {}
export function hideMessageLocally(_message: unknown): void {}
