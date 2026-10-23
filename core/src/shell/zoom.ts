import { onKey } from "../ui/root";
import { invoke } from "./bridge";
import { warn } from "../env";

export function zoomShortcut(event: Pick<KeyboardEvent,"ctrlKey"|"metaKey"|"altKey"|"key">): number | undefined {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
  if (["+","="].includes(event.key)) return 1;
  if (event.key === "-") return -1;
  if (event.key === "0") return 0;
}
export function installZoom(): void {
  onKey(event => {
    const step = zoomShortcut(event);
    if (step === undefined) return false;
    void invoke("change_zoom",{step}).catch(error=>warn("Could not change zoom",error));
    return true;
  });
}
