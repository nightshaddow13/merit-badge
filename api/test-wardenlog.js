"use strict";
const assert = require("assert");
const { createWardenLog, REQS, SECTION_REQ } = require("./src/lib/wardenlog");
const shared = require("../assets/requirements.js");
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
const hex = (n) => n.toString(16).padStart(16, "0");
const body = (n, o) => Object.assign({ id: hex(n), name: "Sam K", lodge: "Owls", summary: { career: 2, surface: 1, seal: 2, bogus: 2 }, state: { career: { chosen: "Analyst" }, surface: { items: ["phone"] } } }, o);
(async () => {
  assert.strictEqual(require("fs").readFileSync(__dirname + "/../assets/warden-rules.js", "utf8"), require("fs").readFileSync(__dirname + "/src/lib/wardenrules.js", "utf8"), "API copy of the rules matches the site copy");
  assert.deepStrictEqual(shared.cy.map((r) => r.code), REQS, "shared requirement list matches the API");
  shared.cy.filter((r) => r.auto).forEach((r) => assert.strictEqual(SECTION_REQ[r.auto], r.code));
  assert.strictEqual(Object.keys(SECTION_REQ).length, shared.cy.filter((r) => r.auto).length);
  const w = createWardenLog({ logs: mem(), ovr: mem() });
  assert.strictEqual((await w.save(body(1))).status, 200);
  for (const b of [null, [], { ...body(1), id: "zz" }, { ...body(1), state: null }, { ...body(1), state: [] }]) assert.ok((await w.save(b)).status >= 400);
  assert.strictEqual((await w.save(body(1, { state: { big: "x".repeat(150001) } }))).status, 413);
  // text is clamped, junk keys dropped, summary sanitized
  await w.save(body(2, { name: "Ana\nB", summary: { career: 9, seal: 2 }, state: { career: { chosen: "y".repeat(5000), "bad key!": 1 }, deep: [[[[[[[[1]]]]]]]] } }));
  let r = await w.get(hex(2));
  assert.strictEqual(r.body.meta.name, "Ana B"); assert.strictEqual(r.body.meta.summary.career, 0); assert.strictEqual(r.body.meta.summary.seal, 2); assert.strictEqual(r.body.meta.summary.bogus, undefined);
  assert.strictEqual(r.body.state.career.chosen.length, 1000); assert.strictEqual(r.body.state.career["bad key!"], undefined);
  await w.save(body(4, { memberId: "12-34 56x78" })); assert.strictEqual((await w.get(hex(4))).body.meta.memberId, "12345678", "member id keeps digits only"); await w.remove({ id: hex(4) });
  // restore only with the id
  assert.strictEqual((await w.restore(hex(1))).body.state.surface.items[0], "phone");
  assert.strictEqual((await w.restore(hex(1))).body.name, "Sam K");
  assert.strictEqual((await w.restore(hex(9))).status, 404); assert.strictEqual((await w.restore("nope")).status, 400);
  // sign-offs are staff-written, survive a later autosave, and can be undone
  assert.strictEqual((await w.signoff({ id: hex(1), req: "9", signed: true }, "Xavier")).body.signed["9"].by, "Xavier");
  assert.strictEqual((await w.signoff({ id: hex(1), req: "nope", signed: true }, "x")).status, 400);
  assert.strictEqual((await w.signoff({ id: hex(9), req: "9", signed: true }, "x")).status, 404);
  await w.save(body(1, { state: { career: { chosen: "Changed" } } }));
  assert.ok((await w.status(hex(1))).body.signed["9"].at, "autosave cannot erase a sign-off");
  assert.ok((await w.list()).body.logs.find((l) => l.id === hex(1)).signed["9"]);
  assert.strictEqual((await w.signoff({ id: hex(1), req: "9", signed: false }, "x")).body.signed["9"], undefined);
  // waivers: ask, pending, grant, revoke; a granted waiver is not reset to pending by another ask
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "6c", reason: "no device" })).body.waive["6c"], "pending");
  assert.strictEqual((await w.requestWaive({ id: hex(9), req: "6c" })).status, 409);
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "x" })).status, 400);
  assert.strictEqual((await w.grant({ id: hex(1), req: "6c", granted: true })).body.waive["6c"].status, "granted");
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "6c" })).body.waive["6c"], "granted");
  await w.grant({ id: hex(1), req: "6c", granted: false }); assert.deepStrictEqual((await w.status(hex(1))).body.waive, {});
  // staff edit: identity and answers change, summary is recomputed, the Warden device cannot overwrite it blindly
  await w.save(body(6));
  const ed = await w.edit({ id: hex(6), name: "Samuel K", memberId: "1 2 3", data: { career: { careers: ["a", "b", "c"], chosen: "x", daily: "x", why: "x", education: "x", certs: "x", experience: "x", expenses: "x", prospects: "x", salary: "x", advancement: "x", sources: "x", learned: "x" }, evil: { a: 1 } } }, "Xavier");
  assert.strictEqual(ed.status, 200); assert.strictEqual(ed.body.meta.name, "Samuel K"); assert.strictEqual(ed.body.meta.memberId, "123"); assert.strictEqual(ed.body.meta.summary.career, 2); assert.strictEqual(ed.body.state.evil, undefined);
  assert.strictEqual(ed.body.state.surface.items[0], "phone", "other sections untouched");
  assert.strictEqual((await w.edit({ id: hex(9), name: "x" }, "x")).status, 404); assert.strictEqual((await w.edit({ id: hex(6), data: [] }, "x")).status, 400);
  const edAt = ed.body.meta.editedAt;
  r = await w.save(body(6, { name: "Stale" })); assert.strictEqual(r.status, 409); assert.strictEqual(r.body.edited, true);
  assert.strictEqual((await w.get(hex(6))).body.meta.name, "Samuel K", "stale save did not overwrite the edit");
  assert.strictEqual((await w.status(hex(6))).body.editedAt, edAt); assert.strictEqual((await w.restore(hex(6))).body.editedAt, edAt);
  assert.strictEqual((await w.save(body(6, { name: "Samuel K", seenEdit: edAt }))).status, 200, "a device that has seen the edit can save");
  assert.strictEqual((await w.get(hex(6))).body.meta.editedAt, edAt, "edit marker survives normal saves");
  // delete and reset
  assert.strictEqual((await w.remove({ id: hex(2) })).status, 200); assert.strictEqual((await w.get(hex(2))).status, 404);
  assert.strictEqual((await w.resetAll({})).status, 400);
  assert.strictEqual((await w.resetAll({ confirm: "RESET" })).body.removed, 2); assert.strictEqual((await w.list()).body.logs.length, 0);
  // class limit
  const f = createWardenLog({ logs: mem(), ovr: mem() });
  for (let i = 1; i <= 80; i++) assert.strictEqual((await f.save(body(i))).status, 200);
  assert.strictEqual((await f.save(body(81))).status, 409); assert.strictEqual((await f.save(body(5))).status, 200);
  console.log("wardenlog tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
