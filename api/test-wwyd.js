"use strict";
const assert = require("assert");
const { createWwyd } = require("./src/lib/wwyd");
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
const a = (n, scn, o) => Object.assign({ id: hex(n), slot: 1, name: "Sam K", scn, stance: 1, why: "Be helpful and fair." }, o);
(async () => {
  const w = createWwyd(mem(), () => 0.5);
  assert.strictEqual((await w.state("", names)).body.active, false);
  assert.strictEqual((await w.control({ action: "reveal" })).status, 409, "no game yet");
  assert.strictEqual((await w.control({ action: "bogus" })).status, 409);
  await w.control({ action: "start" });
  let st = (await w.state("", names)).body;
  assert.ok(st.active && st.total === 5 && st.round === 0 && st.revealed === false && Number.isInteger(st.scn));
  const s0 = st.scn;
  for (const b of [{ id: "zz" }, { slot: 0 }, { slot: 7 }, { name: "Sam 9" }, { scn: 10 }, { stance: 3 }, { stance: 1.5 }]) {
    assert.strictEqual((await w.submit(a(1, s0, b))).status, 400, JSON.stringify(b));
  }
  assert.strictEqual((await w.submit(a(1, (s0 + 1) % 10))).status, 409, "wrong scenario");
  assert.strictEqual((await w.submit(a(1, s0))).status, 200);
  assert.strictEqual((await w.submit(a(3, s0, { why: "" }))).status, 200, "reason is optional");
  await w.submit(a(1, s0, { why: "Changed my mind" }));
  await w.submit(a(2, s0, { name: "Ana B", slot: 2, stance: 0, why: "A human must check it." }));
  st = (await w.state("", names)).body;
  assert.strictEqual(st.answered, 3); assert.strictEqual(st.answers, undefined, "hidden before reveal");
  assert.strictEqual((await w.state(hex(1), names)).body.mine.why, "Changed my mind");
  assert.strictEqual((await w.control({ action: "next" })).status, 409, "cannot move on before reveal");
  await w.control({ action: "reveal" });
  assert.strictEqual((await w.submit(a(4, s0))).status, 409, "closed after reveal");
  const pub = (await w.state("", names)).body;
  assert.strictEqual(pub.revealed, true); assert.deepStrictEqual(pub.answers.map((x) => x.why).sort(), ["(no reason given)", "A human must check it.", "Changed my mind"]);
  assert.ok(!JSON.stringify(pub).includes("Ana") && !JSON.stringify(pub).includes(hex(2)), "public view has no names or ids");
  assert.strictEqual(pub.answers.find((x) => x.why === "A human must check it.").squad, "Blue");
  const me = (await w.state(hex(1), names)).body;
  assert.ok(me.answers.find((x) => x.name === "Sam K").you && me.answers.some((x) => x.name === "Ana B"), "players see names");
  assert.strictEqual((await w.state(hex(9), names)).body.answers[0].name, undefined, "non-answerers see no names");
  await w.control({ action: "next" });
  st = (await w.state(hex(1), names)).body; assert.strictEqual(st.round, 1); assert.strictEqual(st.revealed, false); assert.strictEqual(st.answered, 0);
  const sv = (await w.staffView(names)).body; assert.strictEqual(sv.count, 3);
  for (let i = 0; i < 3; i++) { await w.control({ action: "reveal" }); await w.control({ action: "next" }); }
  await w.control({ action: "reveal" });
  assert.strictEqual((await w.control({ action: "next" })).status, 409, "last scenario");
  await w.control({ action: "end" });
  assert.strictEqual((await w.state("", names)).body.active, false);
  assert.strictEqual((await w.submit(a(1, s0))).status, 409);
  await w.control({ action: "start" }); assert.strictEqual((await w.staffView(names)).body.count, 0, "start clears old answers");
  await w.clear(); assert.strictEqual((await w.state("", names)).body.active, false);
  console.log("wwyd tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
