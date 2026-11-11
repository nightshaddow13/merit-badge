"use strict";
const assert = require("assert");
const { createHvMatch, TTL, COUNTDOWN } = require("./src/lib/hvmatch");
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
  let t = 1000000;
  const hv = createHvMatch(mem(), { now: () => t });
  assert.strictEqual((await hv.create({ id: "zz", role: "machine" })).status, 400);
  assert.strictEqual((await hv.create({ id: hex(1), role: "boss" })).status, 400);
  let r = await hv.create({ id: hex(1), name: "Sam K", role: "machine" });
  assert.strictEqual(r.status, 200);
  const code = r.body.code; assert.match(code, /^[A-Z2-9]{4}$/);
  assert.strictEqual(r.body.status, "waiting"); assert.strictEqual(r.body.opponent, null);
  const seed = r.body.seed;
  // join: guest gets the other role; third player is refused; wrong code 404; bad names become "Agent"
  r = await hv.join({ code: code.toLowerCase(), id: hex(2), name: "<b>x</b>" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.you.role, "human"); assert.strictEqual(r.body.you.name, "Agent"); assert.strictEqual(r.body.opponent.name, "Sam K");
  assert.strictEqual(r.body.seed, seed); assert.strictEqual(r.body.status, "lobby");
  assert.strictEqual((await hv.join({ code, id: hex(3), name: "Eve P" })).status, 409);
  assert.strictEqual((await hv.join({ code: "ZZZZ", id: hex(3) })).status, 404);
  assert.strictEqual((await hv.join({ code, id: hex(2) })).status, 200, "rejoin is fine");
  assert.strictEqual((await hv.get(code, hex(3))).status, 404, "outsiders cannot look");
  // ready: start time is set only when both are ready
  r = await hv.ready({ code, id: hex(1) }); assert.strictEqual(r.body.startAt, null); assert.strictEqual(r.body.status, "lobby");
  r = await hv.ready({ code, id: hex(2) }); assert.strictEqual(r.body.startAt, t + COUNTDOWN); assert.strictEqual(r.body.status, "go");
  // results: clamped, first write wins, done when both are in
  assert.strictEqual((await hv.result({ code, id: hex(1), result: { sec: 99999, wrong: 50, count: 10, trivia: -3, pink: "Froze\n" } })).status, 200);
  r = await hv.get(code, hex(1)); assert.strictEqual(r.body.status, "go"); assert.deepStrictEqual(r.body.yourResult, { sec: 3600, wrong: 24, count: 10, trivia: 0, pink: "Froze " });
  assert.strictEqual(r.body.opponentResult, null);
  await hv.result({ code, id: hex(1), result: { sec: 1, wrong: 0 } }); assert.strictEqual((await hv.get(code, hex(1))).body.yourResult.sec, 3600);
  await hv.result({ code, id: hex(2), result: { sec: 41.26, wrong: 2, trivia: 20 } });
  r = await hv.get(code, hex(1)); assert.strictEqual(r.body.status, "done"); assert.strictEqual(r.body.opponentResult.sec, 41.3); assert.strictEqual(r.body.opponentResult.trivia, 20);
  assert.ok(!JSON.stringify(r.body).includes(hex(2)), "no ids leak");
  // results before start are refused; expiry
  const c2 = (await hv.create({ id: hex(5), role: "human" })).body.code;
  await hv.join({ code: c2, id: hex(6), name: "Ana B" });
  assert.strictEqual((await hv.result({ code: c2, id: hex(5), result: {} })).status, 409);
  t += TTL + 1; assert.strictEqual((await hv.get(c2, hex(5))).status, 404);
  assert.strictEqual((await hv.create({ id: hex(7), role: "human" })).status, 200);
  console.log("hvmatch tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
