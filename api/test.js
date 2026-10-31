"use strict";
// Run with: node test.js  (no packages needed)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validate, hasRole, emptyData } = require("./src/lib/scores");
const { BOARDS } = require("./src/lib/boards");

const fill = (n, v) => Array(n).fill(v);
const principal = (roles) => Buffer.from(JSON.stringify({ userRoles: roles })).toString("base64");

// ---- cybersecurity (6 lodges)
assert.strictEqual(emptyData("cybersecurity").lodges.length, 6);
assert.ok(!("levels" in emptyData("cybersecurity")));
let r = validate("cybersecurity", { lodges: [" Red ", "Blue", "", "", "", ""], scores: { "line-of-oaths": [3, 2, null, "", null, null], "locked-vault": fill(6, null) }, levels: 5 });
assert.ok(r.ok);
assert.strictEqual(r.value.lodges[0], "Red");
assert.deepStrictEqual(r.value.scores["line-of-oaths"], [3, 2, null, null, null, null]);
assert.ok(!("locked-vault" in r.value.scores));
assert.ok(!("levels" in r.value), "cyber board ignores levels");
assert.ok(!validate("cybersecurity", null).ok);
assert.ok(!validate("cybersecurity", { lodges: ["a"], scores: {} }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, 1), scores: {} }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, "x".repeat(31)), scores: {} }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, ""), scores: { "Bad Id": fill(6, 1) } }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, ""), scores: { ok: [1, 2] } }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, ""), scores: { ok: fill(6, 1.5) } }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, ""), scores: { ok: fill(6, 101) } }).ok);
assert.ok(!validate("cybersecurity", { lodges: fill(6, ""), scores: { ok: fill(6, "5") } }).ok);

// ---- ai (4 squads, levels, per-row limits)
assert.deepStrictEqual(emptyData("ai"), { lodges: ["", "", "", ""], scores: {}, updated: null, levels: 0 });
r = validate("ai", { lodges: ["Falcons", "", "", ""], scores: { "l7-boss": [100, null, null, null], "l1-boss": [50, 0, null, null], "l3-style": [10, null, null, null], "side-bonus": [15, null, null, null] }, levels: 3 });
assert.ok(r.ok); assert.strictEqual(r.value.levels, 3);
assert.ok(validate("ai", { lodges: fill(4, ""), scores: {} }).ok, "levels default to 0");
assert.strictEqual(validate("ai", { lodges: fill(4, ""), scores: {} }).value.levels, 0);
assert.ok(!validate("ai", { lodges: fill(6, ""), scores: {} }).ok, "needs 4 slots");
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "l1-boss": [51, null, null, null] } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "l7-boss": [101, null, null, null] } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "l2-style": [11, null, null, null] } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "l1-boss": [-1, null, null, null] } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "l9-boss": fill(4, 1) } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: { "line-of-oaths": fill(4, 1) } }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: {}, levels: 9 }).ok);
assert.ok(!validate("ai", { lodges: fill(4, ""), scores: {}, levels: 2.5 }).ok);
assert.ok(!validate("nope", { lodges: [], scores: {} }).ok);
assert.ok(!validate("__proto__", { lodges: [], scores: {} }).ok);

// ---- the client rows.json files must agree with the API rules
for (const id of Object.keys(BOARDS)) {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, "..", id, "scoreboard", "rows.json"), "utf8"));
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const rule = BOARDS[id].rule(row.id);
    assert.ok(rule, id + ": API does not know row " + row.id);
    assert.strictEqual(rule.min, row.min, id + " min " + row.id);
    assert.strictEqual(rule.max, row.max, id + " max " + row.id);
  }
}

// ---- roles
assert.ok(hasRole(principal(["anonymous", "authenticated", "scorekeeper"]), "scorekeeper"));
assert.ok(!hasRole(principal(["authenticated"]), "scorekeeper"));
assert.ok(!hasRole(undefined, "scorekeeper"));
assert.ok(!hasRole("not-base64-json", "scorekeeper"));

console.log("api tests passed");
