import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { ImageDrafts } from "../src/ui/imageDrafts";
import { sendMiniChatMessage } from "../src/ui/imageUpload";
import { notificationIdentity } from "../src/shell/notificationIdentity";
import { addedElementRoots } from "../src/api/addedElements";
import { StableRows, reconcileChildren } from "../src/ui/reconcile";
import { rank, score } from "../src/ui/search";
import { messageVisualKey } from "../src/ui/chatMessage";
import { capturePreferences } from "../src/plugins/screenShare";
import { clampPanel } from "../src/ui/panelGeometry";

const image = (name = "photo.png", size = 1024) => ({ name, size, type: "image/png" }) as File;

test("settings geometry survives invalid saves, dragging, resizing and smaller windows", () => {
  assert.deepEqual(clampPanel({}, 1280, 820), { x: 844, y: 52, width: 420, height: 760 });
  assert.deepEqual(clampPanel({ x: -999, y: -999, width: 10, height: 10 }, 940, 600), { x: 8, y: 52, width: 340, height: 240 });
  const small = clampPanel({ x: 2000, y: 900, width: 800, height: 900 }, 940, 600);
  assert.equal(small.x + small.width, 932); assert.equal(small.y + small.height, 592);
  assert.equal(clampPanel({ x: NaN, y: Infinity, width: NaN }, 1280, 820).width, 420);
});

test("screen-share preferences preserve audio, browser defaults and explicit capture limits", () => {
  const input = { audio: true, video: { frameRate: { max: 30 }, width: { ideal: 1920 } } };
  assert.equal(capturePreferences(input, "native", "auto"), input);
  const changed = capturePreferences(input, "60", "window");
  assert.equal(changed.audio, true);
  assert.deepEqual(changed.video, { frameRate: { max: 30, ideal: 30 }, width: { ideal: 1920 }, displaySurface: "window" });
  assert.deepEqual(input.video.frameRate, { max: 30 });
});

test("screen-share budgets bound capture without mutating caller constraints or audio", () => {
  const input = { audio: false, video: { frameRate: 120, width: { max: 1280 }, height: { max: 720 } }, systemAudio: "exclude" };
  const changed = capturePreferences(input, "60", "auto", "1080");
  assert.equal(changed.audio, false);
  assert.equal(changed.systemAudio, "exclude");
  assert.deepEqual(changed.video, { frameRate: { ideal: 60, max: 60 }, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 } });
  assert.equal(input.video.frameRate, 120);
  assert.deepEqual(input.video.width, { max: 1280 });
  assert.deepEqual(capturePreferences({ video: true }, "30", "window", "720").video, {
    frameRate: { ideal: 30, max: 30 }, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, displaySurface: "window",
  });
  const disabled = { video: false, audio: true };
  assert.equal(capturePreferences(disabled, "60", "window", "720"), disabled);
});

test("image drafts preserve channel and text boundaries and release previews", () => {
  const revoked: string[] = [];
  const drafts = new ImageDrafts({ create: file => `blob:${file.name}`, revoke: url => revoked.push(url) });
  drafts.add("one", [image()]); drafts.get("one").text = "caption";
  drafts.get("two").text = "another conversation";
  const sent = drafts.get("one").images[0].id;
  drafts.get("one").text = "new draft while send finishes";
  drafts.complete("one", "caption", [sent]);
  assert.equal(drafts.get("one").text, "new draft while send finishes");
  assert.equal(drafts.get("two").text, "another conversation");
  assert.deepEqual(revoked, ["blob:photo.png"]);
  assert.throws(() => drafts.add("one", [{ ...image(), type: "image/svg+xml" } as File]), /Choose PNG/);
  assert.throws(() => drafts.add("one", [image("huge.png", 51 * 1024 * 1024)]), /50 MB/);
  drafts.add("one", [image("second.png")]); drafts.clear();
  assert.equal(revoked.length, 2);
  drafts.get("spaces").text = "  caption  ";
  drafts.complete("spaces", "  caption  ", []);
  assert.equal(drafts.get("spaces").text, "");
});

test("image sending uses native upload objects and one send to the captured channel", async () => {
  const calls: any[] = [];
  class Upload { constructor(public item: unknown, public channel: string) {} }
  const actions = { async sendMessage(...args: any[]) { calls.push(args); return { ok: true }; } };
  await sendMiniChatMessage("one", "caption", [image()], actions, Upload);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "one");
  assert.equal(calls[0][1].content, "caption");
  assert.equal(calls[0][3].attachmentsToUpload[0].item.platform, 1);
  assert.equal(calls[0][3].attachmentsToUpload[0].channel, "one");
  await assert.rejects(sendMiniChatMessage("two", "", [image()], { async sendMessage() { return { ok: false }; } }, Upload), /draft is saved/);
  assert.equal(calls.length, 1);
});

test("notifications identify the supplied sender without guessing from the latest message", () => {
  const person = (id: string) => id === "300760994454437890" ? { name: "Alex", avatar: "https://cdn.discordapp.com/avatars/300760994454437890/abc.png" } : null;
  assert.equal(notificationIdentity("Discord", { icon: "https://cdn.discordapp.com/avatars/300760994454437890/abc.png" }, person, () => null).title, "Alex");
  assert.equal(notificationIdentity("Team channel", { data: { author: { id: "300760994454437890" } } }, person, () => null).title, "Alex · Team channel");
  assert.equal(notificationIdentity("Discord", { data: { channelId: "one" } }, person, () => { throw new Error("must not look up a last message"); }).title, "Discord");
  assert.equal(notificationIdentity("Discord", { icon: "https://evil.example/avatars/300760994454437890/abc.png" }, person, () => null).title, "Discord");
});

test("observer batching scans overlapping added subtrees once and retains independent roots", () => {
  const { document } = parseHTML("<html><body><main><section><span></span></section></main><aside></aside></body></html>");
  const parent = document.querySelector("main")!, child = document.querySelector("section")!, leaf = document.querySelector("span")!, other = document.querySelector("aside")!;
  assert.deepEqual(addedElementRoots([leaf, child, parent, child, other, document.createElement("div")]), [parent, other]);
});

test("unchanged rows survive refreshes; changed/removed rows are reconciled correctly", () => {
  const { document } = parseHTML("<html><body><main></main></body></html>");
  const parent = document.querySelector("main") as unknown as HTMLElement, cache = new StableRows();
  let created = 0;
  const make = () => { created++; return document.createElement("div") as unknown as HTMLElement; };
  const a = cache.get("a", "one", make), b = cache.get("b", "one", make);
  reconcileChildren(parent, [a, b]); a.dataset.revealed = "true";
  for (let i = 0; i < 100; i++) reconcileChildren(parent, [cache.get("a", "one", make), cache.get("b", "one", make)]);
  assert.equal(created, 2); assert.equal(a.dataset.revealed, "true");
  const changed = cache.get("b", "edited", make);
  reconcileChildren(parent, [changed, a]); assert.equal(parent.firstChild, changed); assert.equal(parent.lastChild, a);
  cache.retain(new Set(["b"])); reconcileChildren(parent, [changed]); assert.equal(parent.childNodes.length, 1);
  const message = { id: "300760994454437890", embeds: [{ image: { url: "first" } }] };
  const first = messageVisualKey(message, false, ""); message.embeds[0].image.url = "second";
  assert.notEqual(messageVisualKey(message, false, ""), first);
});

test("cached search preserves ordering, accents, ties and mutable item updates", () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ title: `${i % 2 ? "Café" : "Alpha"} user ${i}`, keywords: `design server ${i % 7}`, boost: i % 4 }));
  const reference = (query: string) => items.map(item => ({ item, points: Math.max(score(query, item.title), score(query, item.keywords) * .6) })).filter(row => row.points > 0).map(row => ({ ...row, points: row.points + row.item.boost })).sort((a, b) => b.points - a.points).slice(0, 60).map(row => row.item);
  for (const query of ["cafe", "user 20", "dsr", "design", "", "no match"]) assert.deepEqual(rank(query, items, 60), reference(query));
  items[0].title = "Unique edited name"; items[0].keywords = "new keyword";
  assert.equal(rank("Unique edited name", items, 1)[0], items[0]);
  assert.deepEqual(rank("new keyword", items, 60), reference("new keyword"));
});
