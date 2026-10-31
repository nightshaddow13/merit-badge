"use strict";
// Run with: node test.js  (no packages needed)
const assert = require("assert");
const { validate, hasRole, emptyData } = require("./src/lib/scores");

const six = (v) => Array(6).fill(v);
const principal = (roles) => Buffer.from(JSON.stringify({ userRoles: roles })).toString("base64");

assert.strictEqual(emptyData().lodges.length, 6);

// accepts a good payload and trims names, drops all-empty rows
let r = validate({ lodges: [" Red ", "Blue", "", "", "", ""], scores: { "line-of-oaths": [3, 2, null, "", null, null], "locked-vault": six(null) } });
assert.ok(r.ok);
assert.strictEqual(r.value.lodges[0], "Red");
assert.deepStrictEqual(r.value.scores["line-of-oaths"], [3, 2, null, null, null, null]);
assert.ok(!("locked-vault" in r.value.scores));

// rejects bad payloads
assert.ok(!validate(null).ok);
assert.ok(!validate({ lodges: ["a"], scores: {} }).ok);
assert.ok(!validate({ lodges: six(1), scores: {} }).ok);
assert.ok(!validate({ lodges: six("x".repeat(31)), scores: {} }).ok);
assert.ok(!validate({ lodges: six(""), scores: { "Bad Id": six(1) } }).ok);
assert.ok(!validate({ lodges: six(""), scores: { ok: [1, 2] } }).ok);
assert.ok(!validate({ lodges: six(""), scores: { ok: six(1.5) } }).ok);
assert.ok(!validate({ lodges: six(""), scores: { ok: six(101) } }).ok);
assert.ok(!validate({ lodges: six(""), scores: { ok: six("5") } }).ok);

// roles
assert.ok(hasRole(principal(["anonymous", "authenticated", "scorekeeper"]), "scorekeeper"));
assert.ok(!hasRole(principal(["authenticated"]), "scorekeeper"));
assert.ok(!hasRole(undefined, "scorekeeper"));
assert.ok(!hasRole("not-base64-json", "scorekeeper"));

console.log("api tests passed");
