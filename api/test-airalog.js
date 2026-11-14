"use strict";
const assert = require("assert");
const { createAiraLog } = require("./src/lib/airalog");

function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const board = { lodges: ["Red", "Blue", "", "Gold"], scores: { "l1-boss": [5, null, null, null] }, levels: 3, updated: null };
const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { Object.assign(board, d, { updated: "now" }); return board; } };
const hex = (n) => n.toString(16).padStart(16, "0");
const body = (n, o) => Object.assign({ id: hex(n), slot: 1, name: "Sam K", vault: 6, terms: 10, levels: 2 }, o);

(async () => {
  const log = createAiraLog(memoryStore());
  let r = await log.submit(body(1), sb);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(board.scores["vocab-vault-avg"], [6, null, null, null, null, null]);
  assert.deepStrictEqual(board.scores["terms-avg"], [10, null, null, null, null, null]);
  assert.deepStrictEqual(board.scores["levels-avg"], [10, null, null, null, null, null]);
  assert.deepStrictEqual(board.scores["l1-boss"], [5, null, null, null], "other rows untouched");

  // second Scout with zeros counts in the average
  await log.submit(body(2, { name: "Ana B", vault: 0, terms: 0, levels: 0 }), sb);
  assert.deepStrictEqual(board.scores["vocab-vault-avg"], [3, null, null, null, null, null]);
  assert.strictEqual(r.body.members, 1);

  // validation
  for (const b of [{ id: "xyz" }, { slot: 0 }, { slot: 7 }, { slot: 1.5 }, { name: "" }, { name: "Sam 9" }, { name: "<b>" }, { vault: 11 }, { terms: 17 }, { levels: 9 }, { vault: -1 }, { vault: "5" }, { vault: 1.5 }]) {
    assert.strictEqual((await log.submit(body(3, b), sb)).status, 400, JSON.stringify(b));
  }
  assert.strictEqual((await log.submit(null, sb)).status, 400);
  assert.strictEqual((await log.submit(body(3, { slot: 3 }), sb)).status, 409, "squad not set up");

  // levels capped by counselor-set board.levels; monotonic
  r = await log.submit(body(4, { levels: 8, vault: 10, terms: 16 }), sb);
  assert.strictEqual(r.body.saved.levels, 3);
  r = await log.submit(body(4, { levels: 0, vault: 2, terms: 1 }), sb);
  assert.deepStrictEqual(r.body.saved, { vault: 10, terms: 16, levels: 3 });

  // rounding: (6+0+10)/3 = 5.33 -> 5
  assert.strictEqual(board.scores["vocab-vault-avg"][0], 5);

  // squad cap and total cap
  const l2 = createAiraLog(memoryStore());
  for (let i = 0; i < 12; i++) assert.strictEqual((await l2.submit(body(100 + i), sb)).status, 200);
  assert.strictEqual((await l2.submit(body(200), sb)).status, 409);
  assert.strictEqual((await l2.submit(body(100, { vault: 9 }), sb)).status, 200, "existing scout can still update");
  for (let i = 0; i < 12; i++) await l2.submit(body(300 + i, { slot: 2 }), sb);
  for (let i = 0; i < 12; i++) await l2.submit(body(400 + i, { slot: 4 }), sb);
  assert.strictEqual((await l2.submit(body(500, { slot: 1 }), sb)).status, 409);

  // roster, remove, reset
  const l3 = createAiraLog(memoryStore());
  await l3.submit(body(1), sb); await l3.submit(body(2, { slot: 2, name: "Zed Q" }), sb);
  r = await l3.roster();
  assert.strictEqual(r.body.scouts.length, 2);
  r = await l3.remove({ id: hex(1) }, sb);
  assert.strictEqual(r.body.scouts.length, 1);
  assert.strictEqual(board.scores["vocab-vault-avg"][0], null);
  assert.strictEqual((await l3.remove({ id: "bad" }, sb)).status, 400);
  r = await l3.reset(sb);
  assert.strictEqual(r.body.scouts.length, 0);
  assert.strictEqual(board.scores["vocab-vault-avg"], undefined);
  assert.deepStrictEqual(board.scores["l1-boss"], [5, null, null, null]);
  console.log("airalog tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
