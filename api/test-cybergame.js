"use strict";
const assert = require("assert");
const { createCybergame } = require("./src/lib/cybergame");
const { createForge } = require("./src/lib/forge");
const { createTwoKey } = require("./src/lib/twokey");
const { emptyData } = require("./src/lib/scores");
const { totp } = require("./src/lib/totp");
const SECRETS = ["3YOM4E2XJIDV4YEW", "F6CDGCQ26N7CBUOY", "5RUOI55DXSOHUKUT", "ZXRZDCHFJYDTWYOL", "RYFLAN32XS6OAH5X", "O5MPNVMAOPDKK6XN"];
const NOW = 1800000000000 + 5000, CTR = Math.floor(NOW / 30000);

function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const mask = (pw) => { const c = Array.from(pw); return c[0] + "*".repeat(Math.min(c.length - 1, 24)); };

(async () => {
  const forge = createForge(mem()), tk = createTwoKey(mem()), g = createCybergame(mem(), forge, tk);
  let board = emptyData("cybersecurity"); board.lodges = ["Owls", "Hawks", "Wolves", "", "", ""]; board.scores["hashing-press-the-seal"] = [2, 1, null, null, null, null];
  const sb = { async load() { return JSON.parse(JSON.stringify(board)); }, async save(d) { board = JSON.parse(JSON.stringify(d)); return d; } };

  let s = await g.state();
  assert.strictEqual(s.body.active, null);
  assert.strictEqual((await g.control({ action: "end" }, sb)).status, 409);
  assert.strictEqual((await g.control({ action: "start", game: "chess" }, sb)).status, 400);

  // Forge: start opens a fresh round, ranks live, end closes and awards
  s = await g.control({ action: "start", game: "forge" }, sb);
  assert.strictEqual(s.status, 200); assert.strictEqual(s.body.active, "forge"); assert.strictEqual(s.body.gid, 1);
  assert.strictEqual(s.body.forge.round.open, true);
  assert.strictEqual((await g.control({ action: "start", game: "twokey" }, sb)).status, 409);
  const rid = s.body.forge.round.roundId;
  await forge.submit({ lodge: 2, roundId: rid, log10: 9, length: 12, patterns: 1, preview: mask("abcdefghijkl") });
  await forge.submit({ lodge: 1, roundId: rid, log10: 12, length: 20, patterns: 1, preview: mask("abcdefghijklmnopqrst") });
  s = await g.state();
  assert.deepStrictEqual(s.body.forge.ranked.map((e) => e.lodge), [1, 2]);
  assert.strictEqual(s.body.forge.ranked[0].place, 1);
  s = await g.control({ action: "end", award: true }, sb);
  assert.strictEqual(s.body.active, null);
  assert.deepStrictEqual(s.body.awarded.map((a) => a.points), [2, 1]);
  assert.deepStrictEqual(board.scores["passphrase-forge-placing"], [2, 1, null, null, null, null]);
  // existing scores and names untouched
  assert.deepStrictEqual(board.scores["hashing-press-the-seal"], [2, 1, null, null, null, null]);
  assert.deepStrictEqual(board.lodges, ["Owls", "Hawks", "Wolves", "", "", ""]);
  // round closed: late submissions rejected
  assert.strictEqual((await forge.submit({ lodge: 3, roundId: rid, log10: 5, length: 8, patterns: 1, preview: mask("abcdefgh") })).status, 409);

  // Ending without award leaves the scoreboard alone
  board.scores["passphrase-forge-placing"] = [null, null, null, null, null, null];
  await g.control({ action: "start", game: "forge", mode: "standard", banned: ["owl"] }, sb);
  assert.deepStrictEqual((await g.state()).body.forge.round.banned, ["owl"]);
  const rid2 = (await g.state()).body.forge.round.roundId; assert.notStrictEqual(rid2, rid);
  await forge.submit({ lodge: 1, roundId: rid2, log10: 12, length: 20, patterns: 1, preview: mask("abcdefghijklmnopqrst") });
  const e2 = await g.control({ action: "end" }, sb);
  assert.strictEqual(e2.body.awarded, null);
  assert.deepStrictEqual(board.scores["passphrase-forge-placing"], [null, null, null, null, null, null]);

  // Two-Key: start clears nothing, shows the race, end only closes
  await tk.check({ lodge: 1, code: totp(SECRETS[0], CTR - 1) }, SECRETS, sb, NOW);
  s = await g.control({ action: "start", game: "twokey" }, sb);
  assert.strictEqual(s.body.active, "twokey"); assert.strictEqual(s.body.twokey.entries[0].codes, 1);
  await tk.check({ lodge: 1, code: totp(SECRETS[0], CTR) }, SECRETS, sb, NOW);
  assert.strictEqual(board.scores["two-key-rite-mfa"][0], 3);
  s = await g.control({ action: "end" }, sb);
  assert.strictEqual(s.body.active, null); assert.strictEqual(board.scores["two-key-rite-mfa"][0], 3);
  assert.strictEqual((await g.state()).body.gid, 3);
  console.log("cybergame tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
