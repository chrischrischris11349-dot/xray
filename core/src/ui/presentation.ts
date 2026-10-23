import { setPresentationNotificationPrivacy } from "../shell/notifications";
import { h } from "./dom";
import { icon } from "./icons";
import { uiRoot } from "./root";
import { pluginState, save } from "../settings";
import { addStyle } from "../api/dom";

let active = false;
let button: HTMLButtonElement | undefined;
export function isPresentationMode(): boolean { return active; }
export function setPresentationMode(on: boolean): void {
  active = on;
  pluginState("presentationMode").data = { active: on }; save();
  uiRoot().host.toggleAttribute("data-presentation", on);
  document.documentElement.toggleAttribute("data-xray-presentation", on);
  setPresentationNotificationPrivacy(on);
  if (on) window.dispatchEvent(new Event("vc-private-controls-hidden"));
  if (button) { button.setAttribute("aria-pressed", String(on)); button.title = on ? "Presentation mode on · show XRay controls" : "Presentation mode · hide XRay controls and previews"; }
}
export function mountPresentation(): void {
  if (button) return;
  addStyle(`html[data-xray-presentation] :is([data-xray-plugin-ui],.xray-fd,.xray-details,.xray-intel-entry,.xray-role-tag,[class^="vc-"],[class*=" vc-"],.fdm-backdrop,.fdm-panel,.phtml-container,.pw-container) { display:none!important; }`);
  button = h("button", { class: "presentation-button", attrs: { type: "button", "aria-pressed": "false", "aria-label": "Presentation mode", title: "Presentation mode · hide XRay controls and previews" }, on: { click: () => setPresentationMode(!active) }, trustedHtml: icon("shield", 15) });
  uiRoot().append(button);
  setPresentationMode(pluginState("presentationMode").data?.active === true);
}
