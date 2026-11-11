"use strict";
const assert = require("assert");
const { createHnn } = require("./src/lib/hnn");
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
(async () => {
  const deck = require("./src/lib/hnncards.json");
  assert.ok(deck.cards.length >= 150, "plenty of cards");
  assert.strictEqual(new Set(deck.cards.map((c) => c.id)).size, deck.cards.length, "unique ids");
  const h = createHnn(mem());
  for (const b of [null, {}, { id: "zz", set: 0 }, { id: hex(1), set: 9 }, { id: hex(1), set: -1 }]) assert.strictEqual((await h.reveal(b)).status, 400);
  const seen = new Set();
  const setCount = deck.cards.filter((c) => c.set === 0 && c.role !== "trick").length;
  for (let i = 0; i < setCount; i++) {
    const r = await h.reveal({ id: hex(100 + Math.floor(i / 10)), set: 0 }); // several Scouts, never more than 10 each
    assert.strictEqual(r.status, 200, "card " + i);
    assert.ok(!seen.has(r.body.card.id), "never dealt twice"); seen.add(r.body.card.id);
    assert.strictEqual(r.body.card.trick, false); assert.ok(!JSON.stringify(r.body).includes("Apple"), "no answer leaked");
  }
  assert.strictEqual((await h.reveal({ id: hex(500), set: 0 })).status, 409, "pool empty");
  const t = await h.reveal({ id: hex(500), set: 0, trick: true });
  assert.strictEqual(t.status, 200); assert.strictEqual(t.body.card.trick, true);
  // answers only for your own card
  const a = await h.answer({ id: hex(500), card: t.body.card.id });
  assert.strictEqual(a.status, 200); assert.ok(/red ball/.test(a.body.answer));
  assert.strictEqual((await h.answer({ id: hex(501), card: t.body.card.id })).status, 403);
  assert.strictEqual((await h.answer({ id: hex(500), card: "nope" })).status, 403);
  // per Scout cap
  const h2 = createHnn(mem()); let last;
  for (let i = 0; i < 16; i++) last = await h2.reveal({ id: hex(7), set: 1 });
  assert.strictEqual(last.status, 409, "per-Scout cap");
  // staff view and reset
  const sv = (await h.staffView()).body;
  assert.strictEqual(sv.used, setCount + 1); assert.ok(sv.cards.every((c) => c.answer));
  assert.strictEqual(sv.sets[0].left, 0 + sv.sets[0].leftTrick);
  await h.reset();
  assert.strictEqual((await h.staffView()).body.used, 0);
  assert.strictEqual((await h.reveal({ id: hex(500), set: 0 })).status, 200, "available again after reset");
  console.log("hnn tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
