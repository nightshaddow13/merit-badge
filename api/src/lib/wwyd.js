"use strict";

// Level 4 "What Would You Do?" class answers.
//
// Staff run a class game from the dashboard: Start picks five scenarios, each round Scouts lock in a stance
// and a reason (keyed by a private device id), nobody sees anyone else's answer until staff press Reveal,
// and Scouts can only move on after the reveal when staff press Next. The public scoreboard page shows the
// current scenario (and, once revealed, the answers without names) until staff End the game.
//
// `store` is the usual adapter (get/put/list/remove).

const ID_RE = /^[a-f0-9]{16,32}$/;
const NAME_RE = /^[A-Za-z][A-Za-z'.\- ]{0,22}[A-Za-z.]$/;
const SLOTS = 4, SCENARIOS = 10, STANCES = 3, MAX_ROWS = 900;
const META = "meta";
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

function createWwyd(store, rand) {
  rand = rand || Math.random;
  async function answers() {
    return (await store.list()).filter((r) => /^a-/.test(r.rowKey) && r.data).map((r) => r.data);
  }
  async function game() { return (await store.get(META)) || { active: false, order: [], round: 0, revealed: false, gid: 0 }; }
  const cur = (g) => (g.active ? g.order[g.round] : null);

  // Public. body: { id, slot 1-4, name, scn 0-9, stance 0-2, why }. Only the current scenario, before the reveal.
  async function submit(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.slot, 1, SLOTS)) return { status: 400, body: { error: "Choose your squad first." } };
    const name = txt(body.name, 30);
    if (!NAME_RE.test(name)) return { status: 400, body: { error: "Use your first name and last initial only (like Sam K)." } };
    if (!isInt(body.scn, 0, SCENARIOS - 1) || !isInt(body.stance, 0, STANCES - 1)) return { status: 400, body: { error: "Those numbers are out of range." } };
    const why = txt(body.why, 400) || "(no reason given)";
    const g = await game();
    if (!g.active) return { status: 409, body: { error: "No class game is running right now." } };
    if (body.scn !== cur(g)) return { status: 409, body: { error: "The class has moved to a different scenario." } };
    if (g.revealed) return { status: 409, body: { error: "Answers are already revealed for this scenario." } };
    const key = "a-" + body.id + "-" + body.scn, old = await store.get(key);
    if (!old && (await answers()).length >= MAX_ROWS) return { status: 409, body: { error: "The class answers are full. Ask your counselor." } };
    await store.put(key, { id: body.id, slot: body.slot - 1, name, scn: body.scn, stance: body.stance, why, at: new Date().toISOString() });
    return { status: 200, body: { saved: true } };
  }

  const shape = (a, names, withNames, me) => Object.assign({ squad: names[a.slot] || "", stance: a.stance, why: a.why }, withNames ? { name: a.name, you: a.id === me } : {});

  // Public. Anyone (the scoreboard) gets the state; once revealed, answers without names. A Scout who sent a valid
  // id (and answered this scenario) also gets names, and their own answer back as `mine`.
  async function state(id, names) {
    const g = await game();
    const out = { active: g.active, gid: g.gid || 0, round: g.round, total: g.order.length, scn: cur(g), revealed: !!(g.active && g.revealed) };
    if (!g.active) return { status: 200, body: out };
    const mineRows = (await answers()).filter((a) => a.scn === out.scn);
    out.answered = mineRows.length;
    const me = typeof id === "string" && ID_RE.test(id) ? mineRows.find((a) => a.id === id) : null;
    if (me) out.mine = { stance: me.stance, why: me.why };
    if (out.revealed) out.answers = mineRows.sort((p, q) => p.name.localeCompare(q.name)).map((a) => shape(a, names, !!me, id));
    return { status: 200, body: out };
  }

  // Staff.
  async function staffView(names) {
    const all = await answers(), st = (await state("", names)).body, g = await game();
    const by = {};
    for (const a of all) (by[a.scn] = by[a.scn] || []).push(shape(a, names, true, null));
    return { status: 200, body: { game: st, order: g.order, count: all.length, scouts: new Set(all.map((a) => a.id)).size,
      scenarios: Object.keys(by).map(Number).sort((x, y) => x - y).map((scn) => ({ scn, answers: by[scn].sort((p, q) => p.name.localeCompare(q.name)) })) } };
  }
  // body: { action: "start"|"reveal"|"hide"|"next"|"end", rounds?: 1-10 }
  async function control(body) {
    const act = body && body.action, g = await game();
    const save = (o) => store.put(META, Object.assign(o, { at: new Date().toISOString() }));
    if (act === "start") {
      const n = isInt(body.rounds, 1, SCENARIOS) ? body.rounds : 5;
      const pool = Array.from({ length: SCENARIOS }, (_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      for (const r of await store.list()) if (/^a-/.test(r.rowKey)) await store.remove(r.rowKey);
      await save({ active: true, order: pool.slice(0, n), round: 0, revealed: false, gid: (g.gid || 0) + 1 });
    } else if (!g.active) return { status: 409, body: { error: "No class game is running." } };
    else if (act === "reveal") await save(Object.assign({}, g, { revealed: true }));
    else if (act === "hide") await save(Object.assign({}, g, { revealed: false }));
    else if (act === "next") {
      if (!g.revealed) return { status: 409, body: { error: "Reveal the answers before moving on." } };
      if (g.round + 1 >= g.order.length) return { status: 409, body: { error: "That was the last scenario. End the game." } };
      await save(Object.assign({}, g, { round: g.round + 1, revealed: false }));
    } else if (act === "end") await save(Object.assign({}, g, { active: false, revealed: false }));
    else return { status: 400, body: { error: "Unknown action." } };
    return { status: 200, body: (await state("", [])).body };
  }
  async function clear() {
    for (const r of await store.list()) if (/^a-/.test(r.rowKey)) await store.remove(r.rowKey);
    const g = await game(); await store.put(META, { active: false, order: [], round: 0, revealed: false, gid: g.gid || 0, at: new Date().toISOString() });
    return { status: 200, body: { cleared: true } };
  }
  return { submit, state, staffView, control, clear };
}

module.exports = { createWwyd, SCENARIOS };
