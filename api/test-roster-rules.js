"use strict";
// Roster rules that touch more than one module: old (pre-roster) and removed-student logs, the dashboards' roster
// overlay, and team averages after team/student changes.
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
const boardFor = (id) => { let d = emptyData(id); return { async load() { return JSON.parse(JSON.stringify(d)); }, async save(x) { d = JSON.parse(JSON.stringify(x)); return d; }, peek: () => d }; };
const SECTION = "career", REQ = "1a";

(async () => {
  // ---- Warden Log (cybersecurity roster) ----
  const cyBoard = boardFor("cybersecurity");
  const rs = createRoster({ students: mem(), tries: mem(), board: cyBoard });
  await rs.addTeam({ name: "Lodge 1" }); await rs.addTeam({ name: "Lodge 2" });
  const [ana, bo] = (await rs.addStudents({ names: "Ana B, 111\nBo T", slot: 0 })).body.added;
  const logs = mem(), ovr = mem();
  const legacyId = "a".repeat(16);
  const before = createWardenLog({ logs, ovr });                       // before the roster existed
  assert.strictEqual((await before.save({ id: legacyId, name: "Old Warden", lodge: "Red", state: { [SECTION]: { x: "kept" } } })).status, 200);
  const wl = createWardenLog({ logs, ovr }, rs);
  assert.strictEqual((await wl.save({ id: ana.id, name: "x", lodge: "x", state: { [SECTION]: { x: "ana" } } })).status, 200);

  // dashboards: roster name and team overlay, old logs are marked
  let l = (await wl.list()).body.logs; const by = Object.fromEntries(l.map((x) => [x.id, x]));
  assert.deepStrictEqual([by[ana.id].name, by[ana.id].lodge, by[ana.id].legacy], ["Ana B", "Lodge 1", false]);
  assert.deepStrictEqual([by[legacyId].name, by[legacyId].lodge, by[legacyId].legacy], ["Old Warden", "Red", true]);
  await rs.renameTeam({ slot: 0, name: "Wolves" }); await rs.updateStudent({ id: ana.id, name: "Ana Bee" });
  let ans = (await wl.answers(SECTION)).body.answers; const a2 = Object.fromEntries(ans.map((x) => [x.id, x]));
  assert.deepStrictEqual([a2[ana.id].name, a2[ana.id].lodge, a2[ana.id].legacy], ["Ana Bee", "Wolves", false], "section answers use the roster's current name and team");
  assert.deepStrictEqual([a2[legacyId].name, a2[legacyId].legacy], ["Old Warden", true]);

  // old logs: readable, signable, waivable by staff; but not saveable and no student requests
  assert.strictEqual((await wl.get(legacyId)).status, 200);
  assert.strictEqual((await wl.signoff({ id: legacyId, req: REQ, signed: true }, "Counselor")).status, 200);
  assert.ok((await wl.get(legacyId)).body.signed[REQ]);
  assert.strictEqual((await wl.save({ id: legacyId, name: "Old Warden", state: { [SECTION]: { x: "edit" } } })).status, 403);
  assert.strictEqual((await wl.save({ id: legacyId, name: "Old Warden", state: {} })).body.login, true);
  assert.strictEqual((await wl.restore(legacyId)).status, 404, "an old id cannot pull its log through the student restore");
  assert.strictEqual((await wl.requestWaive({ id: legacyId, req: REQ })).status, 403);

  // a removed student's log becomes "old log, read-only" the same way
  await rs.removeStudent({ id: ana.id, confirm: true });
  l = (await wl.list()).body.logs; assert.strictEqual(l.find((x) => x.id === ana.id).legacy, true);
  assert.strictEqual((await wl.save({ id: ana.id, state: {} })).status, 403);
  assert.strictEqual((await wl.signoff({ id: ana.id, req: REQ, signed: true }, "Counselor")).status, 200);

  // ---- Field Log: same rules ----
  const flLogs = mem(), flOld = createFieldLog({ logs: flLogs, ovr: mem() });
  await flOld.save({ id: legacyId, name: "Old Scout", squad: "Red", state: {} });
  const aiBoard = boardFor("ai"), ars = createRoster({ students: mem(), tries: mem(), board: aiBoard });
  const fl = createFieldLog({ logs: flLogs, ovr: mem() }, ars);
  assert.strictEqual((await fl.get(legacyId)).body.meta.legacy, true);
  assert.strictEqual((await fl.save({ id: legacyId, state: {} })).status, 403);
  assert.strictEqual((await fl.signoff({ id: legacyId, req: 2, signed: true }, "Counselor")).status, 200);
  assert.strictEqual((await fl.grant({ id: legacyId, level: 2, granted: true })).status, 200);

  // ---- team averages follow every roster change ----
  await ars.addTeam({ name: "A" }); await ars.addTeam({ name: "B" });
  const stu = (await ars.addStudents({ names: "S1\nS2\nS3\nS4", slot: 0 })).body.added;
  const air = createAiraLog(mem()); aiBoard.peek().levels = 8; const d0 = aiBoard.peek(); d0.levels = 8; await aiBoard.save(d0);
  assert.strictEqual((await air.submit({ id: stu[0].id, vault: 8 }, aiBoard, ars)).status, 200);
  assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][0], 2, "8 points over 4 students, zeros counted");
  await ars.addStudents({ names: "S5\nS6\nS7\nS8", slot: 0 });                    // add: 8 students
  await air.recompute(aiBoard, ars); assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][0], 1);
  await ars.updateStudent({ id: stu[1].id, slot: 1 });                            // move one to B: 7 on A, B gets a zero
  await air.recompute(aiBoard, ars);
  assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][0], Math.round(8 / 7)); assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][1], 0);
  await ars.removeStudent({ id: stu[0].id, confirm: true });                      // the one with points leaves
  await air.recompute(aiBoard, ars); assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][0], 0);
  assert.strictEqual((await air.submit({ id: stu[0].id, vault: 9 }, aiBoard, ars)).status, 403, "a removed student cannot submit");
  const un = (await ars.addStudents({ names: "Loose" })).body.added[0];
  assert.strictEqual((await air.submit({ id: un.id, vault: 9 }, aiBoard, ars)).status, 409, "unassigned students cannot submit");
  const rm = await ars.removeTeam({ slot: 1, confirm: true });                    // removing B un-assigns S2 and clears its points
  assert.strictEqual(rm.body.unassigned, 1);
  await air.recompute(aiBoard, ars);
  assert.strictEqual(aiBoard.peek().scores["vocab-vault-avg"][1], null, "removed team has no points");
  assert.strictEqual((await air.submit({ id: stu[1].id, vault: 3 }, aiBoard, ars)).status, 409, "student of a removed team is now unassigned");
  console.log("roster rules tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
