"use strict";
// Run with: node test-twokey.js  (no packages needed)
const assert = require("assert");
const { createTwoKey, AWARD_ROW } = require("./src/lib/twokey");
const { totp } = require("./src/lib/totp");

const SECRETS = ["3YOM4E2XJIDV4YEW", "F6CDGCQ26N7CBUOY", "5RUOI55DXSOHUKUT", "ZXRZDCHFJYDTWYOL", "RYFLAN32XS6OAH5X", "O5MPNVMAOPDKK6XN"];
let NOW = 1800000000000 + 5000;
const C = () => Math.floor(NOW / 30000);

function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
    dump() { return JSON.stringify([...m]); },
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // RFC 6238 test vector (SHA-1, secret "12345678901234567890", T=59s -> 94287082 -> last 6 digits)
  assert.strictEqual(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082");

  const board = { lodges: ["Red", "Blue", "Green", "", "", ""], scores: { "line-of-oaths": [1, null, null, null, null, null] }, updated: null };
  const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { Object.assign(board, d, { updated: "now" }); return board; } };
  const store = memoryStore();
  const tk = createTwoKey(store);
  const code = (lodge, d) => totp(SECRETS[lodge - 1], C() + d);
  const check = (lodge, c) => tk.check({ lodge, code: c }, SECRETS, sb, NOW);

  let s = await tk.getState();
  assert.strictEqual(s.body.entries.length, 6);
  assert.ok(s.body.entries.every((e) => e.codes === 0 && !e.place && e.points === 0));

  // a valid code counts once; the same window twice does not count twice
  let r = await check(2, code(2, 0));
  assert.strictEqual(r.body.valid, true);
  assert.strictEqual(r.body.result, "counted");
  assert.strictEqual(r.body.entry.codes, 1);
  r = await check(2, code(2, 0));
  assert.strictEqual(r.body.result, "duplicate");
  assert.ok(!(AWARD_ROW in board.scores), "no points yet");
  // spaces in the typed code are fine
  const c2 = code(2, 1);
  await sleep(5);
  r = await check(2, c2.slice(0, 3) + " " + c2.slice(3));
  assert.strictEqual(r.body.result, "complete");
  assert.strictEqual(r.body.entry.place, 1);
  assert.strictEqual(r.body.entry.points, 3);
  assert.deepStrictEqual(board.scores[AWARD_ROW], [null, 3, null, null, null, null]);
  assert.deepStrictEqual(board.scores["line-of-oaths"], [1, null, null, null, null, null], "other rows untouched");
  assert.strictEqual((await check(2, code(2, -1))).body.result, "already-complete");

  // wrong lodge's code, wrong digits, out-of-window code are all just "not valid"
  assert.strictEqual((await check(1, code(5, 0))).body.valid, false);
  assert.strictEqual((await check(1, "000000")).body.valid, false);
  assert.strictEqual((await check(1, totp(SECRETS[0], C() + 2))).body.valid, false);
  s = await tk.getState();
  assert.strictEqual(s.body.entries[0].codes, 0);

  // 2nd = 2, everyone after = 1
  await sleep(5);
  await check(5, code(5, 0)); await check(5, code(5, 1));
  await sleep(5);
  await check(1, code(1, 0)); await check(1, code(1, -1));
  await sleep(5);
  await check(6, code(6, 0)); await check(6, code(6, 1));
  await check(3, code(3, 0)); // only one code: no points
  assert.deepStrictEqual(board.scores[AWARD_ROW], [1, 3, null, null, 2, 1]);
  s = await tk.getState();
  assert.deepStrictEqual(s.body.entries.map((e) => e.place), [3, 1, null, null, 2, 4]);
  assert.strictEqual(s.body.entries[2].codes, 1);

  // apply re-writes the points (e.g. after someone cleared the row by hand)
  delete board.scores[AWARD_ROW];
  r = await tk.apply(sb);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.awarded, [{ lodge: 2, place: 1, points: 3 }, { lodge: 5, place: 2, points: 2 }, { lodge: 1, place: 3, points: 1 }, { lodge: 6, place: 4, points: 1 }]);
  assert.deepStrictEqual(board.scores[AWARD_ROW], [1, 3, null, null, 2, 1]);
  assert.strictEqual((await createTwoKey(memoryStore()).apply(sb)).status, 409, "nothing to apply yet");

  // the stored scorecard never contains a secret or a typed code
  assert.ok(!SECRETS.some((x) => store.dump().includes(x)));

  // validation
  for (const b of [null, {}, { lodge: 0, code: "123456" }, { lodge: 7, code: "123456" }, { lodge: "1", code: "123456" }, { lodge: 1, code: "12345" }, { lodge: 1, code: 123456 }, { lodge: 1, code: "abcdef" }]) {
    assert.strictEqual((await tk.check(b, SECRETS, sb, NOW)).status, 400, JSON.stringify(b));
  }
  assert.strictEqual((await tk.check({ lodge: 1, code: "123456" }, [], sb, NOW)).status, 503, "no secrets configured");

  // guessing is limited per lodge: 10 wrong per minute, then locked until the minute passes
  const g = createTwoKey(memoryStore());
  for (let i = 0; i < 10; i++) assert.strictEqual((await g.check({ lodge: 4, code: "000000" }, SECRETS, sb, NOW + i)).body.valid, false);
  assert.strictEqual((await g.check({ lodge: 4, code: "000000" }, SECRETS, sb, NOW + 11)).status, 429);
  assert.strictEqual((await g.check({ lodge: 4, code: totp(SECRETS[3], C()) }, SECRETS, sb, NOW + 12)).status, 429, "even the right code waits");
  assert.strictEqual((await g.check({ lodge: 5, code: "000000" }, SECRETS, sb, NOW + 12)).status, 200, "other lodges unaffected");
  assert.strictEqual((await g.check({ lodge: 4, code: totp(SECRETS[3], Math.floor((NOW + 61000) / 30000)) }, SECRETS, sb, NOW + 61000)).body.valid, true, "unlocks after a minute");

  // reset clears the scorecard and removes its points from the scoreboard
  r = await tk.reset(sb);
  assert.ok(r.body.entries.every((e) => e.codes === 0 && !e.place));
  assert.ok(!(AWARD_ROW in board.scores));
  assert.deepStrictEqual(board.scores["line-of-oaths"], [1, null, null, null, null, null]);

  console.log("twokey tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
