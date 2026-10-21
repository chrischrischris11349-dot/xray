/**
 * Translate: right-click a message to read it in your language. The text goes
 * to Google's translate endpoint through xray's Rust side (Discord's page
 * can't reach it), only when you ask, and only that message's text.
 */
import { menu } from "../api/menus";
import { invoke } from "../shell/bridge";
import { showDialog } from "../ui/dialog";
import { definePlugin } from "./types";

const LANGUAGES: readonly [code: string, name: string][] = [
  ["en", "English"], ["es", "Spanish"], ["pt-BR", "Portuguese"], ["fr", "French"], ["de", "German"], ["it", "Italian"],
  ["nl", "Dutch"], ["pl", "Polish"], ["ru", "Russian"], ["uk", "Ukrainian"], ["tr", "Turkish"], ["ar", "Arabic"],
  ["hi", "Hindi"], ["ja", "Japanese"], ["ko", "Korean"], ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"],
  ["vi", "Vietnamese"], ["th", "Thai"], ["id", "Indonesian"], ["sv", "Swedish"],
];

interface Translation {
  text: string;
  from: string;
}

const languageName = (code: string) => LANGUAGES.find(([c]) => c.toLowerCase() === code.toLowerCase())?.[1] ?? code;

export default definePlugin({
  id: "translate",
  name: "Translate",
  description: "Right-click a message to translate it into your language.",
  category: "Chat",
  impact: "light",
  impactReason: "Only runs when you pick Translate",
  needsReload: false,
  enabledByDefault: true,
  options: {
    to: { type: "select", label: "Translate into", default: "en", choices: LANGUAGES.map(([value, label]) => ({ value, label })) },
  },
  start(ctx) {
    ctx.menu("message", (items, { message }) => {
      const text = message?.content?.trim();
      if (!text) return;
      items.push(
        menu.item({
          id: "translate",
          label: "Translate",
          action: async () => {
            const to = ctx.options.to;
            try {
              const result = (await invoke("translate", { text, to })) as Translation;
              const from = result.from ? languageName(result.from) : "another language";
              showDialog({ title: `From ${from}`, body: result.text, actions: [{ label: "Close", primary: true }] });
            } catch (err) {
              showDialog({ title: "Couldn't translate", body: `The translator didn't answer (${String(err)}). Check your connection and try again.` });
            }
          },
        }),
      );
    });
  },
});
