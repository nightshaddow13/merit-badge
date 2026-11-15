"use strict";
const assert = require("assert");
const { createRoster, MAX_STUDENTS, PW_LEN, ALPHABET } = require("./src/lib/roster");
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
function boardMem(id) { let d = emptyData(id); return { async load() { return JSON.parse(JSON.stringify(d)); }, async save(x) { d = JSON.parse(JSON.stringify(x)); return d; }, peek: () => d }; }
const mk = (id) => { const board = boardMem(id || "ai"); return { r: createRoster({ students: mem(), tries: mem(), board }), board }; };

(async () => {
  const { r, board } = mk("ai");
  // starts with no teams
  let x = await r.list();
  assert.deepStrictEqual(x.body.teams, []); assert.strictEqual(x.body.slots, 6);
  assert.strictEqual((await r.addStudents({ names: ["Sam K"], slot: 0 })).status, 400, "slot 0 is not a team yet");

  // teams: first team, more teams fill the first free slot, names unique, cap at the 6 slots
  let t = await r.addTeam({ name: "  Falcons " }); assert.deepStrictEqual(t.body.team, { slot: 0, name: "Falcons" });
  assert.strictEqual((await r.addTeam({ name: "falcons" })).status, 409);
  assert.strictEqual((await r.addTeam({ name: "" })).status, 400);
  assert.strictEqual((await r.addTeam({ name: "Owls" })).body.team.slot, 1);
  for (const n of ["C", "D", "E", "F"]) assert.strictEqual((await r.addTeam({ name: n })).status, 200);
  assert.strictEqual((await r.addTeam({ name: "G" })).status, 409, "no free slot");
  assert.deepStrictEqual(board.peek().lodges, ["Falcons", "Owls", "C", "D", "E", "F"], "teams are the scoreboard names");

  // rename
  assert.strictEqual((await r.renameTeam({ slot: 1, name: "Hawks" })).status, 200);
  assert.strictEqual((await r.renameTeam({ slot: 1, name: "Falcons" })).status, 409);
  assert.strictEqual((await r.renameTeam({ slot: 9, name: "Z" })).status, 404);
  assert.strictEqual(board.peek().lodges[1], "Hawks");

  // students: bulk add, passwords are short, unique, from the safe alphabet
  let a = await r.addStudents({ names: "Sam K\n\n  Ana  B \nSam K", slot: 0 });
  assert.strictEqual(a.status, 200); assert.strictEqual(a.body.added.length, 3);
  const pws = a.body.added.map((s) => s.password);
  assert.ok(pws.every((p) => p.length === PW_LEN && [...p].every((c) => ALPHABET.includes(c))));
  assert.strictEqual(new Set(pws).size, 3);
  assert.deepStrictEqual(a.body.added.map((s) => s.name), ["Sam K", "Ana B", "Sam K"]);
  assert.ok(a.body.added.every((s) => /^[a-f0-9]{16}$/.test(s.id)), "ids fit the existing log key format");
  // adding to a slot that is not a team is refused
  { const m = mk("ai"); await m.r.addTeam({ name: "Only" }); assert.strictEqual((await m.r.addStudents({ names: ["x"], slot: 3 })).status, 400); assert.strictEqual((await m.r.addStudents({ names: [], slot: 0 })).status, 400); }

  // students can be added with no team and assigned later from the table
  { const m = mk("ai"); await m.r.addTeam({ name: "A" });
    const added = (await m.r.addStudents({ names: ["Una S", "Bo T"] })).body.added;
    assert.ok(added.every((x) => x.slot === null));
    assert.deepStrictEqual(await m.r.find(added[0].id), { id: added[0].id, name: "Una S", slot: null, scoutId: "", team: "" });
    assert.deepStrictEqual((await m.r.login({ password: added[0].password })).body, { id: added[0].id, name: "Una S", slot: null, scoutId: "", team: "" });
    await m.r.updateStudent({ id: added[1].id, slot: 0 });
    assert.deepStrictEqual((await m.r.list()).body.students.map((x) => [x.name, x.slot]), [["Una S", null], ["Bo T", 0]], "unassigned students are listed first");
    assert.strictEqual((await m.r.updateStudent({ id: added[1].id, slot: null })).body.student.slot, null, "can go back to unassigned");
    assert.strictEqual((await m.r.removeTeam({ slot: 0, confirm: true })).status, 200, "a team with no students can go");
  }

  // login: only the password; case, spaces and dashes do not matter
  const sam = a.body.added[0];
  let l = await r.login({ password: " " + sam.password.toUpperCase().slice(0, 3) + "-" + sam.password.slice(3) + " " });
  assert.strictEqual(l.status, 200);
  assert.deepStrictEqual(l.body, { id: sam.id, name: "Sam K", slot: 0, scoutId: "", team: "Falcons" });
  assert.strictEqual((await r.login({ password: "zzzzzz" })).status, 401);
  assert.strictEqual((await r.login({ password: "ab" })).status, 400);
  assert.strictEqual((await r.login({})).status, 400);
  assert.strictEqual((await r.login(null)).status, 400);
  // the login answer never includes any password
  assert.ok(!JSON.stringify(l.body).includes(sam.password));

  // login throttle: lots of wrong guesses in one minute lock logins for that minute, even for a right password
  for (let i = 0; i < 40; i++) await r.login({ password: "wrong" + i });
  assert.strictEqual((await r.login({ password: "nope99" })).status, 429);
  assert.strictEqual((await r.login({ password: sam.password })).status, 429);

  // update: rename, move team, reset password (new unique password; old one stops working)
  const fresh = mk("ai"); await fresh.r.addTeam({ name: "A" }); await fresh.r.addTeam({ name: "B" });
  const s1 = (await fresh.r.addStudents({ names: ["Pat Q"], slot: 0 })).body.added[0];
  let u = await fresh.r.updateStudent({ id: s1.id, name: " Patricia Q ", slot: 1 });
  assert.deepStrictEqual([u.body.student.name, u.body.student.slot, u.body.student.password], ["Patricia Q", 1, s1.password]);
  assert.strictEqual((await fresh.r.updateStudent({ id: s1.id, slot: 5 })).status, 400, "slot 5 is not a team");
  assert.strictEqual((await fresh.r.updateStudent({ id: s1.id, name: "  " })).status, 400);
  assert.strictEqual((await fresh.r.updateStudent({ id: "ffffffffffffffff", name: "x" })).status, 404);
  u = await fresh.r.updateStudent({ id: s1.id, resetPassword: true });
  assert.notStrictEqual(u.body.student.password, s1.password);
  assert.strictEqual((await fresh.r.login({ password: s1.password })).status, 401);
  assert.strictEqual((await fresh.r.login({ password: u.body.student.password })).body.team, "B");
  // find() is what the log code uses; a team rename shows up straight away
  await fresh.r.renameTeam({ slot: 1, name: "Bees" });
  assert.deepStrictEqual(await fresh.r.find(s1.id), { id: s1.id, name: "Patricia Q", slot: 1, scoutId: "", team: "Bees" });
  assert.strictEqual(await fresh.r.find("nope"), null);

  // remove a team: needs confirm, un-assigns its students, clears that slot's points (including automatic rows) and the name
  const f2 = mk("ai"); await f2.r.addTeam({ name: "A" }); await f2.r.addTeam({ name: "B" });
  const d = f2.board.peek(); d.scores = { "l1-boss": [10, 20, null, null, null, null], "vocab-vault-avg": [3, 4, null, null, null, null] }; await f2.board.save(d);
  const st = (await f2.r.addStudents({ names: ["Zed"], slot: 1 })).body.added[0];
  assert.strictEqual((await f2.r.removeTeam({ slot: 1 })).status, 400, "needs confirm");
  const rm = await f2.r.removeTeam({ slot: 1, confirm: true });
  assert.deepStrictEqual(rm.body, { removed: true, unassigned: 1 }, "students on the removed team are un-assigned, not deleted");
  assert.strictEqual((await f2.r.find(st.id)).slot, null);
  assert.strictEqual((await f2.r.login({ password: st.password })).status, 200, "an un-assigned student can still sign in");
  assert.strictEqual((await f2.r.list()).body.students.length, 1);
  assert.deepStrictEqual(f2.board.peek().lodges.slice(0, 2), ["A", ""]);
  assert.deepStrictEqual(f2.board.peek().scores["l1-boss"].slice(0, 2), [10, null], "removed team's points are cleared, others kept");
  assert.deepStrictEqual(f2.board.peek().scores["vocab-vault-avg"].slice(0, 2), [3, null]);
  assert.strictEqual((await f2.r.addTeam({ name: "New" })).body.team.slot, 1, "the freed slot is reused, with no old points");
  assert.strictEqual((await f2.r.removeTeam({ slot: 3, confirm: true })).status, 404);

  // remove a student: needs confirm; the password stops working
  assert.strictEqual((await f2.r.removeStudent({ id: st.id })).status, 400);
  assert.strictEqual((await f2.r.removeStudent({ id: st.id, confirm: true })).status, 200);
  assert.strictEqual((await f2.r.login({ password: st.password })).status, 401);

  // the roster holds at most 80 students per badge
  const big = mk("cybersecurity"); await big.r.addTeam({ name: "Lodge" });
  assert.strictEqual((await big.r.addStudents({ names: Array.from({ length: MAX_STUDENTS }, (_, i) => "S" + i), slot: 0 })).body.added.length, MAX_STUDENTS);
  assert.strictEqual((await big.r.addStudents({ names: ["one more"], slot: 0 })).status, 409);
  assert.strictEqual(new Set((await big.r.list()).body.students.map((s) => s.password)).size, MAX_STUDENTS, "passwords are unique across a full class");

  // list is sorted by team then name and carries passwords (the caller must be staff)
  const l3 = mk("ai"); await l3.r.addTeam({ name: "A" }); await l3.r.addTeam({ name: "B" });
  await l3.r.addStudents({ names: ["Zoe", "Abe"], slot: 1 }); await l3.r.addStudents({ names: ["Mia"], slot: 0 });
  assert.deepStrictEqual((await l3.r.list()).body.students.map((s) => s.name), ["Mia", "Abe", "Zoe"]);
  console.log("roster tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
// scouting id (optional)
(async () => {
  const { r } = mk("ai");
  const a = await r.addStudents({ names: "Sam K, 123-4567\nAna B\nLee, Jo" });
  assert.strictEqual(a.status, 200);
  const by = Object.fromEntries(a.body.added.map((x) => [x.name, x]));
  assert.strictEqual(by["Sam K"].scoutId, "1234567".slice(0, 3) + "-4567");
  assert.strictEqual(by["Ana B"].scoutId, "");
  assert.ok(by["Lee, Jo"] && by["Lee, Jo"].scoutId === "", "comma without digits stays in the name");
  let u = await r.updateStudent({ id: by["Ana B"].id, scoutId: " 99 88<x> " });
  assert.strictEqual(u.body.student.scoutId, "9988x");
  u = await r.updateStudent({ id: by["Ana B"].id, scoutId: "" });
  assert.strictEqual(u.body.student.scoutId, "");
  const l = await r.list(); assert.ok(l.body.students.every((x) => typeof x.scoutId === "string"));
  console.log("scout id tests passed");
})();
