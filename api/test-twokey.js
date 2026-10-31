"use strict";
// Run with: node test-twokey.js  (no packages needed)
const assert = require("assert");
const { createTwoKey, AWARD_ROW } = require("./src/lib/twokey");

function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const board = { lodges: ["Red", "Blue", "Green", "", "", ""], scores: { "line-of-oaths": [1, null, null, null, null, null] }, updated: null };
  const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { Object.assign(board, d, { updated: "now" }); return board; } };
  const tk = createTwoKey(memoryStore());

  let s = await tk.getState();
  assert.strictEqual(s.body.entries.length, 6);
  assert.ok(s.body.entries.every((e) => e.codes === 0 && !e.place && e.points === 0));

  // one code is not enough; the same window twice does not count twice
  let r = await tk.record({ lodge: 2, counter: 1000 }, sb);
  assert.strictEqual(r.body.result, "counted");
  assert.strictEqual(r.body.entry.codes, 1);
  r = await tk.record({ lodge: 2, counter: 1000 }, sb);
  assert.strictEqual(r.body.result, "duplicate");
  assert.strictEqual(r.body.entry.codes, 1);
  assert.ok(!(AWARD_ROW in board.scores), "no points yet");

  // second distinct window completes it: 1st place = 3
  await sleep(5);
  r = await tk.record({ lodge: 2, counter: 1001 }, sb);
  assert.strictEqual(r.body.result, "complete");
  assert.strictEqual(r.body.entry.place, 1);
  assert.strictEqual(r.body.entry.points, 3);
  assert.deepStrictEqual(board.scores[AWARD_ROW], [null, 3, null, null, null, null]);
  assert.deepStrictEqual(board.scores["line-of-oaths"], [1, null, null, null, null, null], "other rows untouched");
  assert.deepStrictEqual(board.lodges.slice(0, 3), ["Red", "Blue", "Green"]);
  assert.strictEqual((await tk.record({ lodge: 2, counter: 1002 }, sb)).body.result, "already-complete");

  // 2nd = 2, everyone after = 1
  await sleep(5);
  await tk.record({ lodge: 5, counter: 2000 }, sb);
  await tk.record({ lodge: 5, counter: 2001 }, sb);
  await sleep(5);
  await tk.record({ lodge: 1, counter: 3000 }, sb);
  await tk.record({ lodge: 1, counter: 3001 }, sb);
  await sleep(5);
  await tk.record({ lodge: 6, counter: 4000 }, sb);
  await tk.record({ lodge: 6, counter: 4001 }, sb);
  await tk.record({ lodge: 3, counter: 5000 }, sb); // only one code: no points
  assert.deepStrictEqual(board.scores[AWARD_ROW], [1, 3, null, null, 2, 1]);
  s = await tk.getState();
  assert.deepStrictEqual(s.body.entries.map((e) => e.place), [3, 1, null, null, 2, 4]);
  assert.strictEqual(s.body.entries[2].codes, 1);

  // validation
  for (const b of [null, {}, { lodge: 0, counter: 5 }, { lodge: 7, counter: 5 }, { lodge: 1.5, counter: 5 }, { lodge: "1", counter: 5 }, { lodge: 1, counter: 0 }, { lodge: 1, counter: "9" }, { lodge: 1, counter: 1.5 }]) {
    assert.strictEqual((await tk.record(b, sb)).status, 400, JSON.stringify(b));
  }

  // reset clears the scorecard and removes its points from the scoreboard
  r = await tk.reset(sb);
  assert.ok(r.body.entries.every((e) => e.codes === 0 && !e.place));
  assert.ok(!(AWARD_ROW in board.scores));
  assert.deepStrictEqual(board.scores["line-of-oaths"], [1, null, null, null, null, null]);

  console.log("twokey tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
