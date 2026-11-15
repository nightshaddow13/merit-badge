"use strict";
// Step 2: the logs only accept students from the roster, and name/team come from the roster.
const assert = require("assert");
const { createRoster } = require("./src/lib/roster");
const { createFieldLog } = require("./src/lib/fieldlog");
const { createWardenLog } = require("./src/lib/wardenlog");
const { createAiraLog } = require("./src/lib/airalog");
const { emptyData } = require("./src/lib/scores");

function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
let d = emptyData("ai");
const board = { async load() { return JSON.parse(JSON.stringify(d)); }, async save(x) { d = JSON.parse(JSON.stringify(x)); return d; } };
const state = { levels: {} };

(async () => {
  const rs = createRoster({ students: mem(), tries: mem(), board });
  await rs.addTeam({ name: "Falcons" }); await rs.addTeam({ name: "Owls" });
  const add = (await rs.addStudents({ names: "Sam K, 555\nAna B\nLee C", slot: 0 })).body.added;
  const [ana, lee, sam] = ["Ana B", "Lee C", "Sam K"].map((n) => add.find((x) => x.name === n));
  const stray = "f".repeat(16);

  // field log
  const fl = createFieldLog({ logs: mem(), ovr: mem() }, rs);
  let r = await fl.save({ id: stray, name: "Hacker", squad: "X", state });
  assert.strictEqual(r.status, 403); assert.strictEqual(r.body.login, true);
  r = await fl.save({ id: sam.id, name: "Someone Else", squad: "Owls", state, summary: {} });
  assert.strictEqual(r.status, 200);
  let g = await fl.get(sam.id);
  assert.strictEqual(g.body.meta.name, "Sam K"); assert.strictEqual(g.body.meta.squad, "Falcons"); assert.strictEqual(g.body.meta.scoutId, "555");
  // a team change shows on the dashboard without the student saving again
  await rs.updateStudent({ id: sam.id, slot: 1 });
  let l = await fl.list(); assert.strictEqual(l.body.logs[0].squad, "Owls"); assert.strictEqual(l.body.logs[0].legacy, false);
  assert.strictEqual((await fl.restore(stray)).status, 404);
  assert.strictEqual((await fl.restore(sam.id)).status, 200);
  assert.strictEqual((await fl.requestOverride({ id: stray, level: 1 })).status, 403);

  // legacy logs (saved before the roster) stay readable but cannot be saved to again
  const logs = mem(); const old = createFieldLog({ logs, ovr: mem() });
  await old.save({ id: stray, name: "Old Scout", squad: "Red", state });
  const fl2 = createFieldLog({ logs, ovr: mem() }, rs);
  l = await fl2.list(); assert.strictEqual(l.body.logs[0].legacy, true); assert.strictEqual(l.body.logs[0].name, "Old Scout");
  assert.strictEqual((await fl2.save({ id: stray, name: "Old Scout", state })).status, 403);

  // warden log
  const wl = createWardenLog({ logs: mem(), ovr: mem() }, rs);
  assert.strictEqual((await wl.save({ id: stray, state })).status, 403);
  r = await wl.save({ id: ana.id, name: "Nope", lodge: "Nope", memberId: "1", state });
  assert.strictEqual(r.status, 200);
  g = await wl.get(ana.id); assert.strictEqual(g.body.meta.name, "Ana B"); assert.strictEqual(g.body.meta.lodge, "Falcons"); assert.strictEqual(g.body.meta.memberId, "");
  assert.strictEqual((await wl.requestWaive({ id: stray, req: "1a" })).status, 403);

  // A.I.R.A. points: team average over every student on the team, zeros included
  const air = createAiraLog(mem());
  d.levels = 8;
  assert.strictEqual((await air.submit({ id: stray, vault: 5 }, board, rs)).status, 403);
  await rs.updateStudent({ id: sam.id, slot: 0 });            // Falcons: Sam, Ana, Lee
  r = await air.submit({ id: sam.id, vault: 6, terms: 9, levels: 3 }, board, rs);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.members, 3);
  assert.strictEqual(d.scores["vocab-vault-avg"][0], 2);       // 6 / 3 students
  assert.strictEqual(d.scores["terms-avg"][0], 3);             // 9 / 3
  assert.strictEqual(d.scores["levels-avg"][0], 5);            // 3*5 / 3
  await rs.updateStudent({ id: lee.id, slot: null });          // not on a team: average over 2
  await air.recompute(board, rs);
  assert.strictEqual(d.scores["vocab-vault-avg"][0], 3);
  await rs.updateStudent({ id: ana.id, slot: 1 });
  await air.recompute(board, rs);
  assert.strictEqual(d.scores["vocab-vault-avg"][0], 6); assert.strictEqual(d.scores["vocab-vault-avg"][1], 0);
  // unassigned student cannot report
  assert.strictEqual((await air.submit({ id: lee.id, vault: 1 }, board, rs)).status, 409);
  const ro = await air.roster(rs); assert.strictEqual(ro.body.scouts.length, 2);
  console.log("roster log tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
