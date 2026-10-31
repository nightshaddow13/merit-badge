"use strict";

// Two-Key Rite scorecard. The scorekeeper's checker page verifies each 6-digit code
// on the device (the practice secrets are in that page) and reports each valid code
// here. A lodge is complete after 2 valid codes from 2 different 30-second windows.
// Points by order of completion: 1st = 3, 2nd = 2, every later lodge = 1.
//
// `store` is the same adapter shape as lib/forge.js. `sb` is { load(), save(data) }
// for the Cybersecurity scoreboard.

const LODGES = 6;
const CODES_NEEDED = 2;
const AWARD_ROW = "two-key-rite-mfa";
const POINTS = [3, 2];
const POINTS_AFTER = 1;

const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const pointsFor = (place) => (place <= POINTS.length ? POINTS[place - 1] : POINTS_AFTER);

function createTwoKey(store) {
  async function rows() {
    const out = [];
    for (const r of await store.list()) {
      const m = /^lodge([1-6])$/.exec(r.rowKey);
      if (m && r.data) out.push(Object.assign({ lodge: +m[1], windows: [], completedAt: null }, r.data));
    }
    return out;
  }

  function summarize(list) {
    const done = list.filter((r) => r.completedAt).sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : a.lodge - b.lodge));
    const entries = [];
    for (let n = 1; n <= LODGES; n++) {
      const r = list.find((x) => x.lodge === n);
      const place = r && r.completedAt ? done.indexOf(r) + 1 : null;
      entries.push({ lodge: n, codes: r ? Math.min(r.windows.length, CODES_NEEDED) : 0, completedAt: r ? r.completedAt : null, place, points: place ? pointsFor(place) : 0 });
    }
    return entries;
  }

  async function getState() {
    return { status: 200, body: { needed: CODES_NEEDED, entries: summarize(await rows()) } };
  }

  async function writeAward(sb, entries) {
    const data = await sb.load();
    const row = Array(data.lodges.length).fill(null);
    let any = false;
    for (const e of entries) if (e.place) { row[e.lodge - 1] = e.points; any = true; }
    if (any) data.scores[AWARD_ROW] = row; else delete data.scores[AWARD_ROW];
    return sb.save(data);
  }

  // body: { lodge, counter } where counter is the 30-second window the valid code came from.
  async function record(body, sb) {
    if (!body || typeof body !== "object") return { status: 400, body: { error: "Send a JSON object." } };
    if (!isInt(body.lodge, 1, LODGES)) return { status: 400, body: { error: "lodge must be 1 to " + LODGES + "." } };
    if (!isInt(body.counter, 1, 1e9)) return { status: 400, body: { error: "counter must be a positive whole number." } };
    const key = "lodge" + body.lodge;
    const row = Object.assign({ windows: [], completedAt: null }, await store.get(key));
    let result = "counted";
    if (row.completedAt) result = "already-complete";
    else if (row.windows.includes(body.counter)) result = "duplicate";
    else {
      row.windows.push(body.counter);
      if (row.windows.length >= CODES_NEEDED) {
        row.completedAt = new Date().toISOString();
        result = "complete";
      }
      await store.put(key, row);
    }
    const entries = summarize(await rows());
    if (result === "complete") await writeAward(sb, entries);
    return { status: 200, body: { result, needed: CODES_NEEDED, entry: entries[body.lodge - 1], entries } };
  }

  // Clears the scorecard and removes the points it put on the Cup scoreboard.
  async function reset(sb) {
    for (const r of await store.list()) if (/^lodge[1-6]$/.test(r.rowKey)) await store.remove(r.rowKey);
    await writeAward(sb, []);
    return { status: 200, body: { needed: CODES_NEEDED, entries: summarize([]) } };
  }

  return { getState, record, reset };
}

module.exports = { createTwoKey, AWARD_ROW, LODGES, CODES_NEEDED };
