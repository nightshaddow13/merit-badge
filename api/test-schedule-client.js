"use strict";
// assets/schedule.js: open windows, class phases, Eastern time conversion, and the same defaults as the API.
const assert = require("assert");
const S = require("../assets/schedule.js");
const API = require("./src/lib/schedule");
assert.deepStrictEqual(S.DEFAULTS, API.DEFAULTS);

const T = (iso) => Date.parse(iso);
const cfg = (o) => Object.assign({ active: true, start: "2026-12-05T14:00:00.000Z", minutes: 180, showFrom: "", showUntil: "" }, o);
// no window: open whenever active
assert.strictEqual(S.status(cfg(), T("2026-01-01")).open, true);
assert.deepStrictEqual([S.status(cfg({ active: false }), T("2026-12-05T15:00:00Z")).open, S.status(cfg({ active: false }), T("2026-12-05T15:00:00Z")).reason], [false, "off"]);
// window
const w = cfg({ showFrom: "2026-12-01T05:00:00.000Z", showUntil: "2026-12-06T05:00:00.000Z" });
assert.strictEqual(S.status(w, T("2026-12-01T04:59:59Z")).reason, "before");
assert.strictEqual(S.status(w, T("2026-12-01T05:00:00Z")).open, true);
assert.strictEqual(S.status(w, T("2026-12-06T04:59:59Z")).open, true);
assert.strictEqual(S.status(w, T("2026-12-06T05:00:00Z")).reason, "after");
// "off" wins over the window
assert.strictEqual(S.status(Object.assign({}, w, { active: false }), T("2026-12-03")).reason, "off");
// class phases follow the class time, not the window
assert.strictEqual(S.status(cfg(), T("2026-12-05T13:59:59Z")).phase, "before");
assert.strictEqual(S.status(cfg(), T("2026-12-05T14:00:00Z")).phase, "live");
assert.strictEqual(S.status(cfg(), T("2026-12-05T16:59:59Z")).phase, "live");
assert.strictEqual(S.status(cfg(), T("2026-12-05T17:00:00Z")).phase, "done");

// Eastern conversion, including daylight saving (EST in Nov/Dec, EDT in Jun)
assert.strictEqual(S.etToIso(2026, 11, 14, 9, 0), "2026-11-14T14:00:00.000Z");
assert.strictEqual(S.etToIso(2026, 6, 20, 9, 0), "2026-06-20T13:00:00.000Z");
assert.strictEqual(S.etToIso(2026, 3, 8, 12, 30), "2026-03-08T16:30:00.000Z");
assert.deepStrictEqual(S.isoToEt("2026-11-14T18:00:00.000Z"), { date: "2026-11-14", time: "13:00" });
assert.deepStrictEqual(S.isoToEt("2026-06-20T13:00:00.000Z"), { date: "2026-06-20", time: "09:00" });
assert.deepStrictEqual(S.isoToEt(""), { date: "", time: "" });
for (const [y, m, d, h, mi] of [[2026, 11, 1, 0, 30], [2026, 11, 1, 23, 59], [2027, 3, 14, 3, 0], [2026, 12, 31, 23, 45]]) {
  const back = S.isoToEt(S.etToIso(y, m, d, h, mi));
  assert.strictEqual(back.date + " " + back.time, y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") + " " + String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0"));
}
// labels match what the home page showed before
assert.strictEqual(S.label(S.DEFAULTS.cy), "Sat Nov 14 · 9:00 AM–12:00 PM ET");
assert.strictEqual(S.label(S.DEFAULTS.ai), "Sat Nov 14 · 1:00 PM–4:00 PM ET");
console.log("schedule client tests passed");
