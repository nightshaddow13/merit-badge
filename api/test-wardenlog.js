"use strict";
const assert = require("assert");
const { createWardenLog } = require("./src/lib/wardenlog");
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
  const w = createWardenLog({ logs: mem(), ovr: mem() });
  assert.strictEqual((await w.save(body(1))).status, 200);
  for (const b of [null, [], { ...body(1), id: "zz" }, { ...body(1), state: null }, { ...body(1), state: [] }]) assert.ok((await w.save(b)).status >= 400);
  assert.strictEqual((await w.save(body(1, { state: { big: "x".repeat(150001) } }))).status, 413);
  // text is clamped, junk keys dropped, summary sanitized
  await w.save(body(2, { name: "Ana\nB", summary: { career: 9, seal: 2 }, state: { career: { chosen: "y".repeat(5000), "bad key!": 1 }, deep: [[[[[[[[1]]]]]]]] } }));
  let r = await w.get(hex(2));
  assert.strictEqual(r.body.meta.name, "Ana B"); assert.strictEqual(r.body.meta.summary.career, 0); assert.strictEqual(r.body.meta.summary.seal, 2); assert.strictEqual(r.body.meta.summary.bogus, undefined);
  assert.strictEqual(r.body.state.career.chosen.length, 1000); assert.strictEqual(r.body.state.career["bad key!"], undefined);
  // restore only with the id
  assert.strictEqual((await w.restore(hex(1))).body.state.surface.items[0], "phone");
  assert.strictEqual((await w.restore(hex(9))).status, 404); assert.strictEqual((await w.restore("nope")).status, 400);
  // sign-offs are staff-written, survive a later autosave, and can be undone
  assert.strictEqual((await w.signoff({ id: hex(1), req: "req9a", signed: true }, "Xavier")).body.signed.req9a.by, "Xavier");
  assert.strictEqual((await w.signoff({ id: hex(1), req: "nope", signed: true }, "x")).status, 400);
  assert.strictEqual((await w.signoff({ id: hex(9), req: "req9a", signed: true }, "x")).status, 404);
  await w.save(body(1, { state: { career: { chosen: "Changed" } } }));
  assert.ok((await w.status(hex(1))).body.signed.req9a.at, "autosave cannot erase a sign-off");
  assert.ok((await w.list()).body.logs.find((l) => l.id === hex(1)).signed.req9a);
  assert.strictEqual((await w.signoff({ id: hex(1), req: "req9a", signed: false }, "x")).body.signed.req9a, undefined);
  // waivers: ask, pending, grant, revoke; a granted waiver is not reset to pending by another ask
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "req6c", reason: "no device" })).body.waive.req6c, "pending");
  assert.strictEqual((await w.requestWaive({ id: hex(9), req: "req6c" })).status, 409);
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "x" })).status, 400);
  assert.strictEqual((await w.grant({ id: hex(1), req: "req6c", granted: true })).body.waive.req6c.status, "granted");
  assert.strictEqual((await w.requestWaive({ id: hex(1), req: "req6c" })).body.waive.req6c, "granted");
  await w.grant({ id: hex(1), req: "req6c", granted: false }); assert.deepStrictEqual((await w.status(hex(1))).body.waive, {});
  // delete and reset
  assert.strictEqual((await w.remove({ id: hex(2) })).status, 200); assert.strictEqual((await w.get(hex(2))).status, 404);
  assert.strictEqual((await w.resetAll({})).status, 400);
  assert.strictEqual((await w.resetAll({ confirm: "RESET" })).body.removed, 1); assert.strictEqual((await w.list()).body.logs.length, 0);
  // class limit
  const f = createWardenLog({ logs: mem(), ovr: mem() });
  for (let i = 1; i <= 80; i++) assert.strictEqual((await f.save(body(i))).status, 200);
  assert.strictEqual((await f.save(body(81))).status, 409); assert.strictEqual((await f.save(body(5))).status, 200);
  console.log("wardenlog tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
