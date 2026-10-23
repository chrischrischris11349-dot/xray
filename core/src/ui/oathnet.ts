import { exportControls, resultReport } from "./reportExport";
import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { linkedText } from "./reportText";
import { safeImage, stores } from "../discord";
import { renderImportedReport } from "./importedReport";

type RecordData = Record<string, unknown>;
type Lookup = (kind: "profile" | "history", id: string) => Promise<RecordData>;

export function parseOathnetResponse(response: unknown, kind?: "profile" | "history"): RecordData {
  const result = response as { status?: number; body?: { success?: boolean; message?: string; data?: unknown } } | null;
  const status = result?.status;
  const body = result?.body;
  if (!status || !body || typeof body !== "object") throw new Error("The Oathnet helper returned an unreadable response.");
  if (kind === "history" && status === 200 && body.success === false && typeof body.message === "string" && /^no results? found\.?$/i.test(body.message.trim())) return { history: [] };
  if (status < 200 || status >= 300 || body.success === false) {
    const errors: Record<number, string> = {
      401: "Oathnet rejected the helper’s API key. Update OATHNET_API_KEY and restart the helper.",
      403: "Oathnet denied this lookup. Check the helper’s account access and quota.",
      404: "No Oathnet data was found for this Discord user.",
      429: "Oathnet rate limited this lookup. Try again later.",
    };
    throw new Error(errors[status] ?? (typeof body.message === "string" ? body.message.slice(0, 400) : `Oathnet lookup failed (HTTP ${status}).`));
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new Error("Oathnet returned no profile data.");
  return body.data as RecordData;
}

export function oathnetHistory(data: RecordData): [string, string][] {
  if (!Array.isArray(data.history)) return [];
  return data.history.flatMap(entry => {
    if (!entry || !Array.isArray(entry.name)) return [];
    return entry.name.flatMap((name: unknown, i: number) => typeof name === "string" && name.trim()
      ? [[name, typeof entry.time?.[i] === "string" ? entry.time[i] : "Date unavailable"] as [string, string]] : []);
  });
}

const lookup: Lookup = async (kind, id) => parseOathnetResponse(await invoke("oathnet_lookup", { kind, userId: id }), kind);

/** A persistent section node survives Discord's asynchronous profile redraw. */
export function oathnetSection(userId: string, request: Lookup = lookup): { element: HTMLElement; close(): void } {
  let active = true;
  let busy = false;
  let profile: RecordData | undefined;
  let history: RecordData | undefined;
  const output = h("div");
  const imported = h("div");
  const status = h("p", { class: "pf-note", attrs: { role: "status", "aria-live": "polite" } });
  const button = h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Load full report" });
  const element = h("section", { class: "pf-block wide", attrs: { "aria-label": "Oathnet profile" } },
    h("h3", { class: "pf-title", text: "Full Oathnet report" }),
    h("p", { class: "pf-note", text: "Look up this Discord ID with Oathnet to view profile details and username history." }),
    imported, output, status, button);

  // Saved imports are local reads; opening the sheet does not run a remote search.
  void Promise.resolve().then(() => invoke("oathnet_lookup", { kind: "imported", userId })).then(response => {
    const result = response as { status?: number };
    if (!active || result.status === 404) return;
    imported.replaceChildren(renderImportedReport(parseOathnetResponse(response), userId, safeImage(stores.users?.getUser?.(userId)?.getAvatarURL?.(undefined, 80))));
  }).catch(error => {
    // Tests and browser-only previews have no native bridge; absent imports are optional.
    if (active && typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) imported.textContent = error instanceof Error ? error.message : String(error);
  });

  const render = () => {
    output.replaceChildren();
    if (profile) {
      const fields: [string, string][] = [["id", "Discord ID"], ["username", "Username"], ["global_name", "Display name"], ["creation_date", "Account created"]];
      output.append(h("dl", { class: "pf-facts" }, ...fields.flatMap(([key, label]) => [h("dt", { text: label }), h("dd", { text: typeof profile![key] === "string" ? String(profile![key]) : "Unavailable" })])));
      if (Array.isArray(profile.badges)) {
        output.append(h("h4", { class: "pf-title", text: "Badges" }));
        const badges = profile.badges.flatMap(b => {
          if (!b || typeof b !== "object") return [];
          const name = typeof b.description === "string" ? b.description : typeof b.id === "string" ? b.id : "Badge";
          const icon = typeof b.icon === "string" && /^[a-zA-Z0-9_-]+$/.test(b.icon)
            ? `https://cdn.discordapp.com/badge-icons/${b.icon}.png` : safeImage(b.icon);
          return [h("span", { class: "pf-badge" }, icon ? h("img", { attrs: { src: icon, alt: "", width: "22", height: "22", referrerpolicy: "no-referrer" } }) : null, name)];
        });
        output.append(badges.length ? h("div", { class: "pf-badges" }, ...badges) : h("p", { class: "pf-note", text: "Oathnet returned no badges." }));
      }
    }
    if (history) {
      const rows = oathnetHistory(history);
      output.append(h("h4", { class: "pf-title", text: "Username history" }), rows.length
        ? h("ul", { class: "pf-list compact" }, ...rows.map(([name, time]) => h("li", { class: "pf-item" }, h("span", { class: "pf-item-name", text: name }), h("span", { class: "pf-item-sub", text: time }))))
        : h("p", { class: "pf-note", text: "Oathnet returned no username history." }));
    }
    if(profile)output.append(exportControls(()=>resultReport("Oathnet profile",[{profile,usernameHistory:history??null}])));
    if (profile) output.append(h("details", { class: "pf-report-details" },
      h("summary", { text: "All returned report fields" }),
      h("pre", { class: "pf-report-data" },linkedText({ profile, ...(history ? { usernameHistory: history } : {}) }))));
  };

  button.addEventListener("click", async () => {
    if (busy || !active) return;
    busy = true;
    button.disabled = true;
    element.setAttribute("aria-busy", "true");
    status.textContent = "Loading Oathnet profile…";
    try {
      // Preserve a successful summary if the history request fails; retry only missing data.
      if (!profile) profile = await request("profile", userId);
      if (!active) return;
      render();
      status.textContent = "Loading username history…";
      if (!history) history = await request("history", userId);
      if (!active) return;
      render();
      status.textContent = "Oathnet profile loaded.";
      button.hidden = true;
    } catch (error) {
      if (!active) return;
      status.textContent = error instanceof Error ? error.message : String(error);
      button.textContent = profile ? "Retry username history" : "Retry Oathnet lookup";
    } finally {
      busy = false;
      if (active) { button.disabled = false; element.setAttribute("aria-busy", "false"); }
    }
  });
  return { element, close: () => { active = false; } };
}
