"use strict";
const assert = require("assert");
const { createFieldLog } = require("./src/lib/fieldlog");
function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
    async list() { return [...m].map(([rowKey, data]) => ({ rowKey, data: JSON.parse(JSON.stringify(data)) })); },
    async remove(k) { m.delete(k); },
  };
}
const hex = (n) => n.toString(16).padStart(16, "0");
const body = (n, o) => Object.assign({ id: hex(n), name: "Sam K", squad: "Owls", summary: { unlocked: 2, won: false, vault: 8, aiOrNot: 7, levels: { 1: [16, 16], 2: [10, 21] } }, state: { answers: { a: 1 }, l2: { life: ["x"] } } }, o);
(async () => {
  const f = createFieldLog({ logs: mem(), ovr: mem() });
  assert.strictEqual((await f.save(body(1))).status, 200);
  for (const b of [null, { ...body(1), id: "zz" }, { ...body(1), state: null }, { ...body(1), state: [] }, { ...body(1), state: { big: "x".repeat(150001) } }]) assert.ok((await f.save(b)).status >= 400);
  // list is a summary only, newest first, and strips control characters
  await f.save(body(2, { name: "Ana\nB" }));
  let r = await f.list();
  assert.strictEqual(r.body.logs.length, 2);
  assert.strictEqual(r.body.logs[0].name, "Ana B");
  assert.strictEqual(r.body.logs[0].state, undefined);
  assert.deepStrictEqual(r.body.logs[0].summary.levels[2], [10, 21]);
  // clamp bogus summary values
  await f.save(body(3, { summary: { unlocked: 99, vault: "x", levels: { 2: [1e9, 5], 9: [1, 1] } } }));
  r = await f.get(hex(3)); assert.strictEqual(r.body.meta.summary.unlocked, 1); assert.deepStrictEqual(r.body.meta.summary.levels, {});
  assert.strictEqual((await f.get(hex(9))).status, 404);
  assert.deepStrictEqual((await f.get(hex(1))).body.state.l2.life, ["x"]);

  // override: request -> pending -> granted -> survives autosave -> revoke
  assert.strictEqual((await f.requestOverride({ id: hex(77), level: 2, missing: ["x"] })).status, 409, "needs a backed-up log");
  assert.strictEqual((await f.requestOverride({ id: hex(1), level: 9 })).status, 400);
  r = await f.requestOverride({ id: hex(1), level: 2, missing: ["5 items on this page", "<b>x</b>"] });
  assert.deepStrictEqual(r.body, { granted: [], pending: [2], signed: {} });
  assert.deepStrictEqual((await f.overrideStatus(hex(1))).body, { granted: [], pending: [2], signed: {} });
  assert.strictEqual((await f.list()).body.logs.find((l) => l.id === hex(1)).overrides[2].status, "pending");
  assert.strictEqual((await f.grant({ id: hex(1), level: 2, granted: true })).status, 200);
  await f.save(body(1)); // the Scout's autosave must not undo the grant
  assert.deepStrictEqual((await f.overrideStatus(hex(1))).body, { granted: [2], pending: [], signed: {} });
  r = await f.requestOverride({ id: hex(1), level: 2 }); assert.deepStrictEqual(r.body.granted, [2], "re-request keeps the grant");
  assert.strictEqual((await f.grant({ id: hex(1), level: 3, granted: true })).status, 200, "staff can waive without a request");
  assert.strictEqual((await f.grant({ id: hex(1), level: 2, granted: false })).status, 200);
  assert.deepStrictEqual((await f.overrideStatus(hex(1))).body, { granted: [3], pending: [], signed: {} });
  assert.strictEqual((await f.grant({ id: hex(1), level: 2, granted: "yes" })).status, 400);
  assert.strictEqual((await f.grant({ id: hex(55), level: 2, granted: true })).status, 404);

  // recovery by code
  assert.deepStrictEqual((await f.restore(hex(2))).body.state.l2.life, ["x"]);
  assert.strictEqual((await f.restore(hex(99))).status, 404);
  assert.strictEqual((await f.restore("nope")).status, 400);

  // delete, and roster cap
  await f.remove({ id: hex(1) });
  assert.strictEqual((await f.get(hex(1))).status, 404);
  assert.deepStrictEqual((await f.overrideStatus(hex(1))).body, { granted: [], pending: [], signed: {} });
  const g = createFieldLog({ logs: mem(), ovr: mem() });
  for (let i = 0; i < 80; i++) assert.strictEqual((await g.save(body(i + 1))).status, 200);
  assert.strictEqual((await g.save(body(500))).status, 409);
  assert.strictEqual((await g.save(body(1))).status, 200, "existing log can still update");
  // requirement sign-offs: staff-written, survive autosave, show in list/get/override status
  assert.strictEqual((await g.signoff({ id: hex(1), req: 3, signed: true }, "Xavier")).body.signed[3].by, "Xavier");
  assert.strictEqual((await g.signoff({ id: hex(1), req: 9, signed: true }, "x")).status, 400);
  assert.strictEqual((await g.signoff({ id: hex(900), req: 3, signed: true }, "x")).status, 404);
  await g.save(body(1));
  assert.ok((await g.overrideStatus(hex(1))).body.signed[3].at);
  assert.ok((await g.list()).body.logs.find((l) => l.id === hex(1)).signed[3]);
  assert.ok((await g.get(hex(1))).body.signed[3]);
  assert.strictEqual((await g.signoff({ id: hex(1), req: 3, signed: false }, "x")).body.signed[3], undefined);
  console.log("fieldlog tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
