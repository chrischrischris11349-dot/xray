// Profile sections that clean builds never insert (ui/profile.ts checks cleanBuild).
const inert = () => { const element = document.createElement("section"); element.hidden = true; return element; };
export function oathnetSection(_id: string) { return { element: inert(), close() {} }; }
export function profileJournal(_data: unknown) { return { element: inert(), changes: document.createElement("span"), update(_data: unknown) {}, close() {} }; }
export function dmArchivePanel(_id: string) { return { element: inert(), close() {}, setFilter(_filter: string) {} }; }
export function recordingLibrary(_id: string) { return { element: inert(), close() {} }; }
export function availableMessages(_id: string): HTMLElement { return inert(); }
export function reportsFor(_id: string): any[] { return []; }
export function rememberReport(_subject: string, _report: unknown): void {}
