"use strict";
const assert = require("assert");
const { mergeChanges, validate } = require("./src/lib/scores");
const stored = { lodges: ["Owls", "Hawks", "Wolves", "", "", ""], scores: { "passphrase-forge-placing": [null, 2, 1, null, null, null] } };
// A stale page (opened when lodge 2 was empty and before the award) changes only lodge 1 and one cell.
const stale = { lodges: ["Owls!", "", "", "", "", ""], scores: {}, changed: { lodges: [0], cells: [["two-key-rite", 0]] } };
stale.scores["two-key-rite"] = [3, null, null, null, null, null];
const m = mergeChanges("cybersecurity", stored, stale);
assert.deepStrictEqual(m.lodges, ["Owls!", "Hawks", "Wolves", "", "", ""]);
assert.deepStrictEqual(m.scores["passphrase-forge-placing"], [null, 2, 1, null, null, null]);
assert.strictEqual(m.scores["two-key-rite"][0], 3);
assert.ok(validate("cybersecurity", m).ok, JSON.stringify(validate("cybersecurity", m)));
// clearing a name on purpose still works
const del = mergeChanges("cybersecurity", stored, { lodges: ["Owls", "", "Wolves", "", "", ""], scores: {}, changed: { lodges: [1] } });
assert.strictEqual(del.lodges[1], "");
// clear all scores
const clr = mergeChanges("cybersecurity", stored, { lodges: stored.lodges, scores: {}, changed: { clear: true } });
assert.deepStrictEqual(clr.scores, {});
assert.deepStrictEqual(clr.lodges, stored.lodges);
// no `changed`: used as sent
const raw = { lodges: ["a", "", "", "", "", ""], scores: {} };
assert.strictEqual(mergeChanges("cybersecurity", stored, raw), raw);
console.log("scores merge tests passed");
