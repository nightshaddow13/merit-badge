"use strict";
const assert = require("assert");
const { createHvBoard, runPoints } = require("./src/lib/hvboard");
function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const board = { lodges: ["Red", "Blue", "", "Gold"], scores: { "l1-boss": [5, null, null, null] }, levels: 0, updated: null };
const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { Object.assign(board, d); return board; } };
const hex = (n) => n.toString(16).padStart(16, "0");
const run = (n, o) => Object.assign({ id: hex(n), slot: 1, name: "Sam K", sec: 40, wrong: 0 }, o);
(async () => {
  assert.deepStrictEqual([0, 1, 2, 3, 5, 7, 10, 24].map((w) => runPoints({ wrong: w })), [10, 8, 8, 7, 6, 5, 4, 4]);
  const hb = createHvBoard(mem());
  assert.strictEqual((await hb.board(hex(1), sb)).status, 403, "must have played to see the board");
  let r = await hb.submit(run(1), sb);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.you.points, 10);
  assert.deepStrictEqual(board.scores["hvm-avg"], [10, null, null, null]);
  assert.deepStrictEqual(board.scores["l1-boss"], [5, null, null, null], "other rows untouched");
  // validation
  for (const b of [{ id: "zz" }, { slot: 0 }, { slot: 5 }, { name: "Sam 9" }, { sec: -1 }, { sec: 4000 }, { sec: 3 }, { wrong: 25 }, { wrong: 1.5 }]) {
    assert.strictEqual((await hb.submit(run(2, b), sb)).status, 400, JSON.stringify(b));
  }
  assert.strictEqual((await hb.submit(run(2, { slot: 3 }), sb)).status, 409, "squad not set up");
  // best run wins; a worse run does not replace it
  await hb.submit(run(1, { wrong: 3, sec: 30 }), sb);
  assert.strictEqual((await hb.board(hex(1), sb)).body.racers[0].wrong, 0);
  // squad average includes everyone who played; second Scout in squad 1, one in squad 2
  await hb.submit(run(2, { name: "Ana B", wrong: 12 }), sb); // 4 points
  assert.strictEqual(board.scores["hvm-avg"][0], 7, "(10 + 4) / 2");
  await hb.submit(run(3, { slot: 2, name: "Zed Q", wrong: 0, sec: 20 }), sb);
  assert.deepStrictEqual(board.scores["hvm-avg"], [7, 10, null, null]);
  // ranking: fewest wrong, then faster
  await hb.submit(run(4, { name: "Lee P", wrong: 0, sec: 25 }), sb);
  r = await hb.board(hex(1), sb);
  assert.deepStrictEqual(r.body.racers.map((x) => x.name), ["Zed Q", "Lee P", "Sam K", "Ana B"]);
  assert.strictEqual(r.body.racers.find((x) => x.name === "Sam K").you, true);
  assert.ok(r.body.squads.length === 2 && r.body.squads[0].avg >= r.body.squads[1].avg);
  assert.ok(!JSON.stringify(r.body).includes(hex(2)), "no ids leak");
  // reset clears players and the automatic row only
  await hb.reset(sb);
  assert.strictEqual(board.scores["hvm-avg"], undefined);
  assert.deepStrictEqual(board.scores["l1-boss"], [5, null, null, null]);
  assert.strictEqual((await hb.board(hex(1), sb)).status, 403);
  console.log("hvboard tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
