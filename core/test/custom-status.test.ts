import assert from "node:assert/strict";
import { test } from "node:test";
import { ProfileHistory } from "../src/history/model";
import { HistoryObserver } from "../src/history/observer";
import { customStatusSnapshot } from "../src/history/customStatus";

const id = "300760994454437890";
const custom = (state: string, emoji?: object) => [{ type: 4, state, emoji }];
function fixture(selected: ("profile" | "presence")[] = ["profile"]) {
  let now = Date.now();
  const history = new ProfileHistory(null, () => now++);
  history.configure(id, true, selected);
  const observer = new HistoryObserver(history);
  const update = (activities?: unknown, status = "online") => observer.handle({ type:"PRESENCE_UPDATES", updates:[{ user:{id}, status, ...(activities === undefined ? {} : {activities}) }] });
  return {history, observer, update};
}

test("custom status records text, emoji-only changes and explicit clearing, with no duplicate events", () => {
  const {history, update} = fixture();
  update([]); // Known empty baseline.
  assert.ok(update(custom("At work", {name:"💻"})).has(id));
  update(custom("At work", {name:"💻"}));
  update(custom("At work", {id:"300760994454437891",name:"focus"}));
  update(custom("At work", {id:"300760994454437892",name:"focus",animated:true}));
  update([]);
  const events = history.get(id)!.events;
  assert.equal(events.length, 4);
  assert.equal(events[0].kind, "customStatus");
  assert.equal(events[0].before, "(empty)");
  assert.equal(events[0].after, "💻 At work");
  assert.match(events[2].after!, /<a:focus:300760994454437892>/);
  assert.equal(events[3].after, "(empty)");
  assert.deepEqual(JSON.parse(JSON.stringify(new ProfileHistory(history.serialize()).get(id)!.events)), JSON.parse(JSON.stringify(events)));
});

test("missing activities and hidden/offline activities never manufacture a cleared status", () => {
  const {history, update} = fixture();
  update(custom("Known status"));
  update();update([], "offline");update([], "invisible");
  update([{type:4,state:{invalid:true}}]);
  assert.equal(history.get(id)!.events.length, 0);
  update(custom("Changed status"));
  assert.equal(history.get(id)!.events[0].before, "Known status");
});

test("custom status respects opt-in, pause/resume, reconnect baselines and restart gaps", () => {
  const {history, update} = fixture(["presence"]);
  update([]);update(custom("Not opted in"));
  assert.equal(history.get(id)!.events.length, 0);
  history.configure(id, false, ["profile"]);update(custom("While paused"));
  history.configure(id, true, ["profile"]);update(custom("Resume baseline"));
  assert.equal(history.get(id)!.events.length, 0);
  update(custom("Observed change"));
  history.resetBaselines();update(custom("After reconnect"));
  const restored = new ProfileHistory(history.serialize());
  new HistoryObserver(restored).handle({type:"PRESENCE_UPDATE",user:{id},activities:custom("After restart"),status:"online"});
  assert.equal(restored.get(id)!.events.length, 1);
  assert.equal(restored.get(id)!.events[0].after, "Observed change");
});

test("custom-status parsing keeps ordinary activities separate and bounds untrusted content", () => {
  assert.equal(customStatusSnapshot(undefined), undefined);
  assert.equal(customStatusSnapshot({}), undefined);
  assert.equal(customStatusSnapshot([{type:0,state:"Playing"}]), null);
  assert.equal(customStatusSnapshot([{type:4,emoji:{name:"🌙"}}]), "🌙");
  assert.equal(customStatusSnapshot(custom("x".repeat(10000)))!.length, 128);
});
