"use strict";
const assert = require("assert");
const { mergeChanges, validate, padBoard } = require("./src/lib/scores");
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
// A board saved when the A.I.R.A. scoreboard had 4 squads gains 2 empty squads and keeps everything it had
const old = { lodges: ["Red", "Blue", "Green", "Gold"], scores: { "l1-boss": [10, null, 5, 0], "vocab-vault-avg": [7, 8, null, null] }, levels: 3, updated: "2026-11-14T15:00:00.000Z" };
const p = padBoard("ai", old);
assert.deepStrictEqual(p.lodges, ["Red", "Blue", "Green", "Gold", "", ""]);
assert.deepStrictEqual(p.scores["l1-boss"], [10, null, 5, 0, null, null]);
assert.strictEqual(p.levels, 3); assert.strictEqual(p.updated, old.updated);
assert.deepStrictEqual(old.lodges, ["Red", "Blue", "Green", "Gold"], "input is not changed");
assert.ok(validate("ai", p).ok);
// a stale 4-slot page cannot save; the merge of a 6-slot page keeps the 4 old squads
const m2 = mergeChanges("ai", p, { lodges: ["Red", "Blue", "Green", "Gold", "Owls", ""], scores: {}, levels: 3, changed: { lodges: [4] } });
assert.deepStrictEqual(m2.lodges, ["Red", "Blue", "Green", "Gold", "Owls", ""]);
assert.deepStrictEqual(m2.scores["l1-boss"], [10, null, 5, 0, null, null]);
assert.ok(validate("ai", m2).ok);
assert.strictEqual(validate("ai", { lodges: old.lodges, scores: {} }).ok, false);
console.log("scores merge tests passed");
