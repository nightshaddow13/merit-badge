"use strict";
// Checks assets/export.js (the counselor "Export full Field Log" button) against the real Field Log and Warden Log code.
const assert = require("assert");
const { createFieldLog } = require("./src/lib/fieldlog");
const { createWardenLog } = require("./src/lib/wardenlog");
const MBExport = require("../assets/export.js");
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
const reply = (r) => ({ ok: r.status < 400, status: r.status, json: async () => r.body });

(async () => {
  // flatten
  assert.deepStrictEqual(MBExport.flatten({ a: { b: ["x", "", "y"] }, c: 0, d: false, e: null }, "", {}), { "a.b.1": "x", "a.b.3": "y", c: 0, d: false });

  // ---- A.I.R.A. ----
  const fl = createFieldLog({ logs: mem(), ovr: mem() });
  await fl.save({ id: hex(1), name: "Sam, K", squad: "Owls", summary: { unlocked: 3, levels: { 1: [16, 16] } }, state: { memberId: "123456", lv: { 3: { boss: { job: "=HYPERLINK(\"http://x\")", trig: "line1\nline2" } } }, l2: { life: ["a", "b"] } } });
  await fl.save({ id: hex(2), name: "Ana", squad: "Hawks", summary: {}, state: { l2: { work: ["z"] } } });
  await fl.signoff({ id: hex(1), req: 1, signed: true }, "Pat");
  await fl.requestOverride({ id: hex(2), level: 4, missing: ["x"] });
  const routes = {
    "/api/fieldlog/logs": () => fl.list(),
    "/api/fieldlog/log": (id) => fl.get(id),
  };
  global.fetch = async (url) => { const u = new URL(url, "http://x"); return reply(await routes[u.pathname](u.searchParams.get("id"))); };
  const res = await MBExport.fetchAll("/api/fieldlog");
  assert.strictEqual(res.logs.length, 2);
  assert.strictEqual(res.failed.length, 0);
  assert.ok(res.logs.every((j) => j.state && j.meta && j.signed));
  const cfg = { kind: "ai", groupLabel: "Squad", groupKey: "squad", reqs: [[1, "1 Key Concepts"], [4, "4 Ethics"]] };
  const csv = MBExport.toCSV(cfg, res.logs);
  assert.ok(csv.startsWith("﻿Name,Squad,Scouting America ID,Recovery code"));
  assert.ok(csv.includes('"Sam, K"'), "commas are quoted");
  assert.ok(csv.includes("'=HYPERLINK"), "formulas are defused");
  assert.ok(csv.includes('"line1\nline2"'), "newlines survive");
  assert.ok(csv.includes("log.lv.3.boss.job") && csv.includes("log.l2.life.2") && csv.includes("log.l2.work.1"), "every written answer gets a column");
  const rows = csv.trim().split("\r\n");
  const head = rows[0].split(",");
  assert.ok(csv.includes("0000-0000-0000-0001"));
  assert.ok(head.includes("Req 1 Key Concepts signed by") && head.includes("Level 4 Ethics waiver"));
  assert.ok(csv.includes("pending"), "pending waiver is exported");
  assert.ok(csv.includes("Pat"), "who signed is exported");

  // one log that fails does not stop the rest
  routes["/api/fieldlog/log"] = async (id) => (id === hex(1) ? { status: 500, body: {} } : fl.get(id));
  const part = await MBExport.fetchAll("/api/fieldlog");
  assert.strictEqual(part.logs.length, 1);
  assert.deepStrictEqual(part.failed, ["Sam, K"]);

  // ---- Cybersecurity ----
  const wl = createWardenLog({ logs: mem(), ovr: mem() });
  await wl.save({ id: hex(3), name: "Lee", lodge: "Lodge 2", memberId: "99", summary: { career: 2 }, state: { career: { careers: ["a", "b", "c"], why: "because" }, seal: { hashA: "abcd1234" } } });
  await wl.signoff({ id: hex(3), req: "9", signed: true }, "Pat");
  await wl.requestWaive({ id: hex(3), req: "7", reason: "absent" });
  const wr = { "/api/wardenlog/logs": () => wl.list(), "/api/wardenlog/log": (id) => wl.get(id) };
  global.fetch = async (url) => { const u = new URL(url, "http://x"); return reply(await wr[u.pathname](u.searchParams.get("id"))); };
  const c = await MBExport.fetchAll("/api/wardenlog");
  const csv2 = MBExport.toCSV({ kind: "cy", groupLabel: "Lodge", groupKey: "lodge", reqs: [["9", "9"], ["7", "7"]] }, c.logs);
  assert.ok(csv2.includes("Lodge 2") && csv2.includes("log.career.careers.3") && csv2.includes("log.seal.hashA") && csv2.includes("abcd1234"));
  assert.ok(csv2.includes("Req 7 waiver") && csv2.includes("pending") && csv2.includes("Pat"));
  global.fetch = async () => reply({ status: 403, body: { error: "no" } });
  await assert.rejects(MBExport.fetchAll("/api/wardenlog"), /Sign in as a counselor/);
  console.log("export tests ok");
})().catch((e) => { console.error(e); process.exit(1); });
