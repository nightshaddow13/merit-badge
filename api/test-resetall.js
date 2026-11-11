"use strict";
const assert = require("assert");
const { createAiraLog } = require("./src/lib/airalog");
const { createHvBoard } = require("./src/lib/hvboard");
const { createWwyd } = require("./src/lib/wwyd");
const { createHnn } = require("./src/lib/hnn");
const { createDuel } = require("./src/lib/duel");
const { createFieldLog } = require("./src/lib/fieldlog");
const { resetAll } = require("./src/lib/resetall");
const { emptyData } = require("./src/lib/scores");
function mem() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
(async () => {
  let board = emptyData("ai"); board.lodges = ["Owls", "Bears", "Gold", "Red"]; board.scores = { "l1-boss": [10, 20, null, null], "side-bonus": [5, null, null, null] }; board.levels = 4;
  const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { board = JSON.parse(JSON.stringify(d)); return d; } };
  const s = { air: mem(), hv: mem(), ww: mem(), hn: mem(), du: mem(), fl: mem(), fo: mem() };
  const parts = { sb, airalog: createAiraLog(s.air), hv: createHvBoard(s.hv), wwyd: createWwyd(s.ww), hnn: createHnn(s.hn), duel: createDuel(s.du), fieldlog: createFieldLog({ logs: s.fl, ovr: s.fo }) };
  const id = "ab".repeat(8);
  (await parts.airalog.submit({ id, name: "Sam K", slot: 1, vault: 6, terms: 10, levels: 2 }, sb)).body;
  await parts.hv.submit({ id, name: "Sam K", slot: 1, right: 5, wrong: 1, sec: 30 }, sb).catch(() => {});
  await parts.wwyd.submit({ id, slot: 1, choice: 0 }).catch(() => {});
  await s.fl.put("log-" + id, { meta: { id, updated: "2026-01-01" }, state: {} });
  await s.fo.put("o-" + id, { levels: {} });
  assert.ok(s.air.m.size > 0);
  const r = await resetAll(parts, {});
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(board.scores.hasOwnProperty("l1-boss") || board.scores.hasOwnProperty("side-bonus"), false, "manual scores cleared");
  assert.strictEqual(board.levels, 0);
  assert.strictEqual(board.lodges[0], "Owls", "squad names kept");
  assert.ok(![...s.air.m.keys()].some((k) => /^scout-/.test(k)), "scouts gone");
  assert.ok(![...s.hv.m.keys()].some((k) => /^s-/.test(k)), "class race gone");
  assert.ok(![...s.ww.m.keys()].some((k) => /^a-/.test(k)), "wwyd answers gone");
  assert.ok(s.fl.m.has("log-" + id), "logs kept by default");
  const r2 = await resetAll(parts, { logs: true });
  assert.strictEqual(r2.body.logs, 1);
  assert.strictEqual(s.fl.m.size, 0); assert.strictEqual(s.fo.m.size, 0);
  console.log("resetall tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
