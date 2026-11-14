"use strict";
const assert = require("assert");
const { createSchedule, DEFAULTS } = require("./src/lib/schedule");
function mem() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null; },
    async put(k, o) { m.set(k, JSON.parse(JSON.stringify(o))); },
  };
}
const good = { active: true, start: "2026-12-05T14:00:00.000Z", minutes: 180, showFrom: "2026-11-28T05:00:00.000Z", showUntil: "" };
(async () => {
  const s = createSchedule(mem());
  // nothing saved: the defaults match the old hard-coded Nov 14 classes, and every badge is active with no window
  let r = await s.get();
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.badges, DEFAULTS);
  assert.ok(Math.abs(Date.parse(r.body.now) - Date.now()) < 5000);
  assert.strictEqual(DEFAULTS.cy.start, "2026-11-14T14:00:00.000Z");
  assert.strictEqual(DEFAULTS.ai.start, "2026-11-14T18:00:00.000Z");

  // save one badge; the other is kept
  r = await s.save({ badges: { ai: good } }, "pat\n");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.badges.ai, good);
  assert.deepStrictEqual(r.body.badges.cy, DEFAULTS.cy);
  assert.strictEqual(r.body.updatedBy, "pat");
  r = await s.get();
  assert.deepStrictEqual(r.body.badges.ai, good);

  // turning a badge off, and normalizing times
  r = await s.save({ badges: { cy: Object.assign({}, good, { active: false, start: "2026-12-05T09:00:00-05:00" }) } });
  assert.strictEqual(r.body.badges.cy.active, false);
  assert.strictEqual(r.body.badges.cy.start, "2026-12-05T14:00:00.000Z");
  assert.deepStrictEqual(r.body.badges.ai, good, "an untouched badge is not changed");

  // bad input is refused and changes nothing
  const before = JSON.stringify((await s.get()).body.badges);
  const bad = [
    null, [], {}, { badges: null }, { badges: { cy: null } }, { badges: { cy: [] } },
    { badges: { cy: Object.assign({}, good, { active: "yes" }) } },
    { badges: { cy: Object.assign({}, good, { start: "soon" }) } },
    { badges: { cy: Object.assign({}, good, { start: "1999-01-01T00:00:00Z" }) } },
    { badges: { cy: Object.assign({}, good, { minutes: 5 }) } },
    { badges: { cy: Object.assign({}, good, { minutes: 90.5 }) } },
    { badges: { cy: Object.assign({}, good, { minutes: 9999 }) } },
    { badges: { cy: Object.assign({}, good, { showFrom: "nope" }) } },
    { badges: { cy: Object.assign({}, good, { showUntil: 12 }) } },
    { badges: { cy: Object.assign({}, good, { showFrom: "2026-12-10T00:00:00Z", showUntil: "2026-12-01T00:00:00Z" }) } },
    // a good badge next to a bad one: nothing is saved
    { badges: { ai: good, cy: Object.assign({}, good, { minutes: 1 }) } },
  ];
  for (const b of bad) assert.strictEqual((await s.save(b)).status, 400, JSON.stringify(b));
  assert.strictEqual(JSON.stringify((await s.get()).body.badges), before);
  // unknown badges are ignored, not stored
  r = await s.save({ badges: { zz: good, ai: good } });
  assert.deepStrictEqual(Object.keys(r.body.badges).sort(), ["ai", "cy"]);

  // damaged stored data falls back to the defaults field by field
  const st = mem(); await st.put("config", { badges: { cy: { active: 7, start: "garbage", minutes: -3, showFrom: "x" }, ai: "oops" } });
  r = await createSchedule(st).get();
  assert.deepStrictEqual(r.body.badges, DEFAULTS);

  // reset
  await s.reset("pat");
  assert.deepStrictEqual((await s.get()).body.badges, DEFAULTS);
  console.log("schedule tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
