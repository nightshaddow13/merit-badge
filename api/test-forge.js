"use strict";
// Run with: node test-forge.js  (no packages needed)
const assert = require("assert");
const { createForge, scoreFromLog10, rank } = require("./src/lib/forge");

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
const mask = (pw) => { const c = Array.from(pw); return c[0] + "*".repeat(Math.min(c.length - 1, 24)); };
const sub = (f, lodge, pw, log10, patterns, roundId) => f.submit({ lodge, roundId, log10, length: Array.from(pw).length, patterns, preview: mask(pw) });

(async () => {
  // score cut-offs match zxcvbn
  assert.deepStrictEqual([0.5, 2.99, 3.01, 5.9, 6.1, 7.9, 8.1, 9.9, 10.1, 20].map(scoreFromLog10), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);

  const store = memoryStore();
  const f = createForge(store);
  let s = await f.getState();
  assert.strictEqual(s.status, 200);
  assert.deepStrictEqual(s.body.entries, []);
  assert.strictEqual(s.body.round.open, true);
  const rid = s.body.round.roundId;

  // submissions
  let r = await sub(f, 3, "violin marble comet harbor", 20.59, 5, rid);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.entry.score, 4);
  assert.strictEqual(r.body.entry.log10, 20.6);
  assert.strictEqual(r.body.entry.preview, "v" + "*".repeat(24));
  await sub(f, 1, "password", 0.48, 1, rid);
  s = await f.getState();
  assert.deepStrictEqual(s.body.entries.map((e) => e.lodge), [1, 3]);
  // replacing an entry keeps one row per lodge
  await sub(f, 1, "Troop9Strong!", 7.3, 3, rid);
  s = await f.getState();
  assert.strictEqual(s.body.entries.length, 2);
  assert.strictEqual(s.body.entries.find((e) => e.lodge === 1).score, 2);

  // the password never reaches storage, only stats and the mask
  assert.ok(!store.dump().includes("violin marble"));
  assert.ok(!store.dump().includes("Troop9Strong"));

  // validation
  const bad = [
    { lodge: 0 }, { lodge: 7 }, { lodge: 2.5 }, { lodge: "2" },
    { log10: -1 }, { log10: 401 }, { log10: "5" }, { log10: NaN },
    { length: 0 }, { length: 129 }, { length: 1.5 },
    { patterns: -1 }, { patterns: 129 },
    { preview: "x" }, { preview: "v" + "*".repeat(5) }, { preview: "vi" + "*".repeat(24) }, { preview: "v\n" + "*".repeat(23) },
  ];
  for (const b of bad) {
    const body = Object.assign({ lodge: 2, roundId: rid, log10: 10, length: 12, patterns: 2, preview: "a" + "*".repeat(11) }, b);
    r = await f.submit(body);
    assert.strictEqual(r.status, 400, "should reject " + JSON.stringify(b));
  }
  assert.strictEqual((await f.submit(null)).status, 400);
  assert.strictEqual((await sub(f, 2, "abcdef", 5, 1, "stale-id")).status, 409);

  // closing submissions
  r = await f.setRound({ open: false });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await sub(f, 2, "abcdef", 5, 1, rid)).status, 409);
  await f.setRound({ open: true });
  assert.strictEqual((await sub(f, 2, "abcdef", 5, 1, rid)).status, 200);

  // banned words are cleaned
  r = await f.setRound({ banned: ["  Troop 12 ", "SILVER", "silver", "", "owl"] });
  assert.deepStrictEqual(r.body.round.banned, ["troop 12", "silver", "owl"]);
  assert.strictEqual((await f.setRound({ banned: Array(21).fill("x") })).status, 400);
  assert.strictEqual((await f.setRound({ banned: ["x".repeat(41)] })).status, 400);
  assert.strictEqual((await f.setRound({ banned: "nope" })).status, 400);
  assert.strictEqual((await f.setRound({ open: "yes" })).status, 400);
  assert.strictEqual((await f.setRound({ mode: "weird" })).status, 400);
  assert.strictEqual((await f.setRound(null)).status, 400);

  // break-the-weak mode needs a starter before lodges can submit
  r = await f.setRound({ mode: "break" });
  assert.strictEqual(r.body.round.starter, null);
  assert.strictEqual((await sub(f, 4, "abcdef", 5, 1, rid)).status, 409);
  r = await f.setRound({ starter: { log10: 3.14, length: 9, preview: "P" + "*".repeat(8) } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.round.mode, "break");
  assert.strictEqual(r.body.round.starter.log10, 3.1);
  assert.strictEqual((await sub(f, 4, "abcdef", 5, 1, rid)).status, 200);
  assert.strictEqual((await f.setRound({ starter: { log10: 3, length: 9, preview: "Password1" } })).status, 400, "starter must be masked");
  r = await f.setRound({ mode: "standard" });
  assert.strictEqual(r.body.round.starter, null);

  // reset clears entries and starts a new round
  await f.setRound({ starter: { log10: 3.14, length: 9, preview: "P" + "*".repeat(8) } });
  s = await f.getState();
  assert.ok(s.body.entries.length >= 3);
  r = await f.reset();
  assert.strictEqual(r.status, 200);
  assert.notStrictEqual(r.body.round.roundId, rid);
  assert.strictEqual(r.body.round.starter, null);
  assert.deepStrictEqual(r.body.round.banned, ["troop 12", "silver", "owl"], "banned words survive a reset");
  s = await f.getState();
  assert.deepStrictEqual(s.body.entries, []);
  assert.strictEqual((await sub(f, 1, "abcdef", 5, 1, rid)).status, 409, "old round id is rejected");
  assert.strictEqual((await sub(f, 1, "abcdef", 5, 1, s.body.round.roundId)).status, 409, "break mode waits for a new starter after reset");
  await f.setRound({ mode: "standard" });
  assert.strictEqual((await sub(f, 1, "abcdef", 5, 1, s.body.round.roundId)).status, 200);
  assert.ok(!store.dump().includes("abcdef"));

  // award: 1st = 2, 2nd = 1, written onto the scoreboard row; re-award replaces
  const sbData = { lodges: ["Red", "Blue", "Green", "", "", ""], scores: { "line-of-oaths": [1, 1, null, null, null, null] }, updated: null };
  const sb = { async load() { return JSON.parse(JSON.stringify(sbData)); }, async save(d) { Object.assign(sbData, d, { updated: "now" }); return sbData; } };
  const fresh = createForge(memoryStore());
  assert.strictEqual((await fresh.award(sb)).status, 409, "nothing to award");
  const rid2 = (await fresh.getState()).body.round.roundId;
  await sub(fresh, 2, "alpha beta gamma delta", 15, 4, rid2);
  await sub(fresh, 5, "violin marble comet harbor", 20.6, 4, rid2);
  await sub(fresh, 1, "password", 0.5, 1, rid2);
  r = await fresh.award(sb);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.awarded, [{ lodge: 5, place: 1, points: 2 }, { lodge: 2, place: 2, points: 1 }]);
  assert.deepStrictEqual(sbData.scores["passphrase-forge-placing"], [null, 1, null, null, 2, null]);
  assert.deepStrictEqual(sbData.scores["line-of-oaths"], [1, 1, null, null, null, null], "other rows untouched");
  assert.deepStrictEqual(sbData.lodges.slice(0, 3), ["Red", "Blue", "Green"]);
  await sub(fresh, 1, "x".repeat(30), 25, 1, rid2); // lodge 1 takes the lead
  await fresh.award(sb);
  assert.deepStrictEqual(sbData.scores["passphrase-forge-placing"], [2, null, null, null, 1, null], "re-award replaces");
  // tie-breaks: log10, then length, then fewer patterns
  const E = (lodge, log10, length, patterns) => ({ lodge, log10, length, patterns });
  assert.deepStrictEqual(rank([E(1, 10, 20, 3), E(2, 10, 22, 3), E(3, 10, 22, 2)], { mode: "standard" }).map((e) => e.lodge), [3, 2, 1]);
  // break mode ranks by improvement, not raw strength
  assert.deepStrictEqual(rank([E(1, 12, 9, 1), E(2, 30, 9, 1)], { mode: "break", starter: { log10: 3 } }).map((e) => e.lodge), [2, 1]);

  console.log("forge tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
