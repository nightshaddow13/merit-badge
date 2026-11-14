"use strict";

// Class Race (Level 3 game): everyone plays the same deck against everyone else.
//
// Every Scout who plays posts a run (seconds, wrong bins). The server keeps each Scout's best run, turns it
// into points (max 10 per Scout), shows the class ranking to anyone who has played, and writes the SQUAD
// AVERAGE of everyone who played into the automatic "hvm-avg" row of the AI scoreboard.
//
// `store` is the usual adapter (get/put/list/remove). `sb` is { load(), save(data) } for the AI board.

const ID_RE = /^[a-f0-9]{16,32}$/;
const NAME_RE = /^[A-Za-z][A-Za-z'.\- ]{0,22}[A-Za-z.]$/;
const SLOTS = 6;
const MAX_PLAYERS = 60;
const ROW = "hvm-avg";
const MIN_SEC = 8; // 24 taps cannot be faster than this; anything quicker is not a real run
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

// 4 points for finishing, up to 6 more for accuracy: 10 per Scout at most.
function runPoints(r) {
  if (!r) return 0;
  const acc = r.wrong === 0 ? 6 : r.wrong <= 2 ? 4 : r.wrong <= 4 ? 3 : r.wrong <= 6 ? 2 : r.wrong <= 9 ? 1 : 0;
  return 4 + acc;
}
const points = (p) => runPoints(p.run);
// Fewest wrong bins, then faster time.
const better = (a, b) => !b || a.wrong < b.wrong || (a.wrong === b.wrong && a.sec < b.sec);
const rankCmp = (x, y) => x.wrong - y.wrong || x.sec - y.sec;

function createHvBoard(store) {
  async function all() {
    return (await store.list()).filter((r) => /^s-/.test(r.rowKey) && r.data && r.data.run !== undefined).map((r) => r.data);
  }

  async function recompute(sb) {
    const data = await sb.load(), players = await all();
    const row = Array(SLOTS).fill(null);
    for (let s = 0; s < SLOTS; s++) {
      const mine = players.filter((p) => p.slot === s);
      if (mine.length) row[s] = Math.round(mine.reduce((t, p) => t + points(p), 0) / mine.length);
    }
    if (row.some((v) => v !== null)) data.scores[ROW] = row; else delete data.scores[ROW];
    return sb.save(data);
  }

  // Public. body: { id, slot 1-6, name, sec, wrong 0-24 }
  async function submit(body, sb) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.slot, 1, SLOTS)) return { status: 400, body: { error: "Choose your squad first." } };
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!NAME_RE.test(name)) return { status: 400, body: { error: "Use your first name and last initial only (like Sam K)." } };
    if (typeof body.sec !== "number" || !isFinite(body.sec) || body.sec < 0 || body.sec > 3600) return { status: 400, body: { error: "Those numbers are out of range." } };
    if (!isInt(body.wrong, 0, 24)) return { status: 400, body: { error: "Those numbers are out of range." } };
    if (body.sec < MIN_SEC) return { status: 400, body: { error: "That run was too fast to count." } };
    const board = await sb.load(), slot = body.slot - 1;
    if (!board.lodges[slot]) return { status: 409, body: { error: "That squad is not set up yet. Ask your counselor." } };
    const key = "s-" + body.id, old = await store.get(key);
    if (!old && (await all()).length >= MAX_PLAYERS) return { status: 409, body: { error: "The class board is full. Ask your counselor." } };
    const run = { sec: Math.round(body.sec * 10) / 10, wrong: body.wrong };
    const rec = old && old.run !== undefined ? old : { id: body.id, run: null };
    rec.name = name; rec.slot = slot; rec.at = new Date().toISOString();
    if (better(run, rec.run)) rec.run = run;
    await store.put(key, rec);
    await recompute(sb);
    return board_(body.id, sb);
  }

  // Anyone who has played can see the class board (the id is the viewer's private device id).
  async function board_(id, sb) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing agent id." } };
    const players = await all(), me = players.find((p) => p.id === id);
    if (!me) return { status: 403, body: { error: "Play a run to see the class board." } };
    const names = (await sb.load()).lodges;
    const racers = players.filter((p) => p.run);
    const top = racers.sort((a, b) => rankCmp(a.run, b.run)).slice(0, 15)
      .map((p, i) => ({ place: i + 1, name: p.name, squad: names[p.slot] || "", sec: p.run.sec, wrong: p.run.wrong, points: runPoints(p.run), you: p.id === id }));
    const squads = [];
    for (let s = 0; s < SLOTS; s++) {
      const mine = players.filter((p) => p.slot === s);
      if (names[s] && mine.length) squads.push({ slot: s + 1, name: names[s], players: mine.length, avg: Math.round((mine.reduce((t, p) => t + points(p), 0) / mine.length) * 10) / 10, you: me.slot === s });
    }
    squads.sort((a, b) => b.avg - a.avg);
    squads.forEach((q, i) => { q.place = i + 1; });
    return { status: 200, body: { racers: top, squads, you: { points: points(me), run: me.run, squad: names[me.slot] || "" }, players: players.length } };
  }

  async function reset(sb) {
    for (const r of await store.list()) if (/^s-/.test(r.rowKey)) await store.remove(r.rowKey);
    await recompute(sb);
    return { status: 200, body: { cleared: true } };
  }

  return { submit, board: board_, reset, recompute };
}

module.exports = { createHvBoard, runPoints, ROW };
