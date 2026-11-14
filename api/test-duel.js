"use strict";
const assert = require("assert");
const { createDuel } = require("./src/lib/duel");
function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const hex = (n) => n.toString(16).padStart(16, "0");
const names = ["Red", "Blue", "", "Gold"];
const sub = (slot, o) => Object.assign({ id: hex(slot), slot, name: "Sam K", prompt: "You are a tutor. List three causes of the American Revolution.", output: "1. Taxes 2. ..." }, o);
(async () => {
  const d = createDuel(mem(), () => 0);
  assert.strictEqual((await d.state("", 0, names)).body.phase, "off");
  assert.strictEqual((await d.submit(sub(1), names)).status, 409, "no duel yet");
  assert.strictEqual((await d.control({ action: "reveal" }, names)).status, 409);
  await d.control({ action: "start" }, names);
  for (const b of [{ id: "zz" }, { slot: 0 }, { slot: 7 }, { name: "Sam 9" }, { prompt: "short" }, { output: "" }]) assert.strictEqual((await d.submit(sub(1, b), names)).status, 400, JSON.stringify(b));
  assert.strictEqual((await d.submit(sub(3), names)).status, 409, "squad not set up");
  assert.strictEqual((await d.control({ action: "reveal" }, names)).status, 409, "needs two entries");
  await d.submit(sub(1), names); await d.submit(sub(1, { prompt: "Second try prompt that is longer" }), names); await d.submit(sub(2, { name: "Ana B" }), names); await d.submit(sub(4, { name: "Zed Q", prompt: "Gold squad prompt here please" }), names);
  let st = (await d.state(hex(1), 1, names)).body; assert.strictEqual(st.submitted, 3); assert.strictEqual(st.mine.prompt, "Second try prompt that is longer"); assert.strictEqual(st.entries, undefined);
  await d.control({ action: "reveal" }, names);
  assert.strictEqual((await d.submit(sub(1), names)).status, 409, "closed after reveal");
  st = (await d.state(hex(1), 1, names)).body;
  assert.strictEqual(st.phase, "vote"); assert.strictEqual(st.entries.length, 3);
  assert.ok(!JSON.stringify(st).includes("Blue") && !JSON.stringify(st).includes("Ana") && !JSON.stringify(st).includes("Sam K"), "anonymous");
  assert.ok(st.entries.some((e) => e.own), "own entry flagged");
  const own = st.entries.find((e) => e.own).n, other = st.entries.find((e) => !e.own).n;
  assert.strictEqual((await d.vote({ id: hex(11), slot: 1, vote: own })).status, 409, "no self vote");
  assert.strictEqual((await d.vote({ id: hex(11), slot: 1, vote: 9 })).status, 400);
  assert.strictEqual((await d.vote({ id: hex(11), slot: 1, vote: other })).status, 200);
  assert.strictEqual((await d.vote({ id: hex(11), slot: 1, vote: other })).status, 409, "one vote each");
  await d.vote({ id: hex(12), slot: 2, vote: other === 1 ? 2 : other }); // another scout from Blue
  assert.strictEqual((await d.state(hex(11), 1, names)).body.myVote, other);
  assert.strictEqual((await d.state("", 0, names)).body.entries[0].votes, undefined, "no tally before results");
  assert.strictEqual((await d.control({ action: "end" }, names)).status, 200);
  await d.control({ action: "start" }, names);
  assert.strictEqual((await d.staffView(names)).body.votes, 0, "fresh game");
  await d.submit(sub(1), names); await d.submit(sub(2, { name: "Ana B" }), names);
  await d.control({ action: "reveal" }, names);
  assert.strictEqual((await d.control({ action: "results" }, names)).status, 200);
  const res = (await d.state("", 0, names)).body; assert.strictEqual(res.phase, "results"); assert.ok(res.entries.every((e) => e.squad && typeof e.votes === "number"));
  assert.strictEqual((await d.control({ action: "bogus" }, names)).status, 400);
  await d.control({ action: "reset" }, names); assert.strictEqual((await d.staffView(names)).body.entries.length, 0); assert.strictEqual((await d.state("", 0, names)).body.phase, "off");
  assert.strictEqual((await d.control({ action: "reset" }, names)).status, 200, "reset works when idle");
  console.log("duel tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
