"use strict";

// Passphrase Forge: shared round state.
//
// The passphrase itself NEVER reaches this code. Each device scores locally
// (zxcvbn) and sends only: lodge number, guesses_log10, length, pattern count
// and a masked preview (first character plus asterisks).
//
// `store` is a small adapter so this logic can be tested without Azure:
//   get(rowKey) -> object | null     put(rowKey, object)
//   list()      -> [{ rowKey, data }]  remove(rowKey)

const LODGES = 6;
const MAX_LEN = 128;
const MAX_PREVIEW = 25; // code points: first char + up to 24 asterisks
const MAX_BANNED = 20;
const MAX_BANNED_LEN = 40;
const ROUND_KEY = "round";
const CTRL = /[\u0000-\u001f\u007f]/;

function newRoundId() {
  return require("crypto").randomUUID();
}

function defaultRound() {
  return { roundId: "initial", open: true, mode: "standard", starter: null, banned: [] };
}

// Same cut-offs zxcvbn uses to turn guesses into a 0-4 score.
function scoreFromLog10(l) {
  const g = Math.pow(10, l);
  if (g < 1e3 + 5) return 0;
  if (g < 1e6 + 5) return 1;
  if (g < 1e8 + 5) return 2;
  if (g < 1e10 + 5) return 3;
  return 4;
}

const round1 = (x) => Math.round(x * 10) / 10;
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

function validPreview(preview, length) {
  if (typeof preview !== "string" || CTRL.test(preview)) return false;
  const chars = Array.from(preview);
  const want = Math.min(length, MAX_PREVIEW);
  if (chars.length !== want) return false;
  return chars.slice(1).every((c) => c === "*");
}

// Shared by lodge submissions and the round's starter.
function cleanStats(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send a JSON object." };
  const { log10, length, preview } = body;
  if (typeof log10 !== "number" || !isFinite(log10) || log10 < 0 || log10 > 400) return { error: "log10 must be a number from 0 to 400." };
  if (!isInt(length, 1, MAX_LEN)) return { error: "length must be a whole number from 1 to " + MAX_LEN + "." };
  if (!validPreview(preview, length)) return { error: "preview must be the first character followed by asterisks." };
  return { value: { score: scoreFromLog10(log10), log10: round1(log10), length, preview } };
}

function cleanBanned(list) {
  if (!Array.isArray(list) || list.length > MAX_BANNED) return { error: "banned must be a list of at most " + MAX_BANNED + " words." };
  const out = [];
  for (const w of list) {
    if (typeof w !== "string") return { error: "Each banned word must be text." };
    const t = w.trim().toLowerCase();
    if (!t) continue;
    if (t.length > MAX_BANNED_LEN || CTRL.test(t)) return { error: "Banned words can be at most " + MAX_BANNED_LEN + " characters." };
    if (!out.includes(t)) out.push(t);
  }
  return { value: out };
}

const AWARD_ROW = "passphrase-forge-placing";
const AWARD_POINTS = [2, 1];

// Standard: higher guesses_log10 wins, then longer, then fewer patterns, then lower lodge.
// Break mode: biggest improvement over the starter wins (same tie-breaks).
function rank(entries, round) {
  const base = round && round.mode === "break" && round.starter ? round.starter.log10 : 0;
  return entries.slice().sort((a, b) =>
    (b.log10 - base) - (a.log10 - base) || b.length - a.length || a.patterns - b.patterns || a.lodge - b.lodge);
}

function createForge(store) {
  async function getRound() {
    return Object.assign(defaultRound(), (await store.get(ROUND_KEY)) || {});
  }

  async function getState() {
    const round = await getRound();
    const rows = await store.list();
    const entries = [];
    for (const r of rows) {
      if (!/^lodge[1-6]$/.test(r.rowKey)) continue;
      const e = r.data;
      if (e && e.roundId === round.roundId) entries.push(e);
    }
    entries.sort((a, b) => a.lodge - b.lodge);
    return { status: 200, body: { round, entries: entries.map(({ roundId, ...rest }) => rest) } };
  }

  // Anyone may submit while the round is open.
  async function submit(body) {
    const round = await getRound();
    if (!body || typeof body !== "object") return { status: 400, body: { error: "Send a JSON object." } };
    if (body.roundId !== round.roundId) return { status: 409, body: { error: "A new round has started. Reload the page and forge again." } };
    if (!round.open) return { status: 409, body: { error: "Submissions are closed for now." } };
    if (round.mode === "break" && !round.starter) return { status: 409, body: { error: "Waiting for the facilitator to set the starter." } };
    if (!isInt(body.lodge, 1, LODGES)) return { status: 400, body: { error: "lodge must be 1 to " + LODGES + "." } };
    if (!isInt(body.patterns, 0, MAX_LEN)) return { status: 400, body: { error: "patterns must be a whole number from 0 to " + MAX_LEN + "." } };
    const s = cleanStats(body);
    if (s.error) return { status: 400, body: { error: s.error } };
    const entry = Object.assign({ lodge: body.lodge, patterns: body.patterns, at: new Date().toISOString() }, s.value);
    await store.put("lodge" + body.lodge, Object.assign({ roundId: round.roundId }, entry));
    return { status: 200, body: { entry } };
  }

  // Scorekeepers only (the caller checks the role).
  async function setRound(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    const round = await getRound();
    if ("open" in body) {
      if (typeof body.open !== "boolean") return { status: 400, body: { error: "open must be true or false." } };
      round.open = body.open;
    }
    if ("mode" in body) {
      if (body.mode !== "standard" && body.mode !== "break") return { status: 400, body: { error: "mode must be standard or break." } };
      round.mode = body.mode;
      if (body.mode === "standard") round.starter = null;
    }
    if ("banned" in body) {
      const b = cleanBanned(body.banned);
      if (b.error) return { status: 400, body: { error: b.error } };
      round.banned = b.value;
    }
    if ("starter" in body) {
      if (body.starter === null) round.starter = null;
      else {
        const s = cleanStats(body.starter);
        if (s.error) return { status: 400, body: { error: "starter: " + s.error } };
        round.starter = s.value;
        round.mode = "break";
      }
    }
    await store.put(ROUND_KEY, round);
    return { status: 200, body: { round } };
  }

  // Scorekeepers only. New round id means stale devices cannot write into the new round.
  async function reset() {
    const round = await getRound();
    for (const r of await store.list()) if (/^lodge[1-6]$/.test(r.rowKey)) await store.remove(r.rowKey);
    round.roundId = newRoundId();
    round.starter = null;
    await store.put(ROUND_KEY, round);
    return { status: 200, body: { round } };
  }

  // Scorekeepers only. Writes 2 / 1 points for 1st / 2nd into the Cybersecurity
  // scoreboard row "passphrase-forge-placing". Safe to press again: it replaces the row.
  // `sb` is { load() -> scoreboard data, save(data) }.
  async function award(sb) {
    const { body } = await getState();
    const ranked = rank(body.entries, body.round);
    if (!ranked.length) return { status: 409, body: { error: "No submissions to award yet." } };
    const data = await sb.load();
    const row = Array(data.lodges.length).fill(null);
    const given = [];
    ranked.slice(0, 2).forEach((e, i) => {
      const pts = AWARD_POINTS[i];
      row[e.lodge - 1] = pts;
      given.push({ lodge: e.lodge, place: i + 1, points: pts });
    });
    data.scores[AWARD_ROW] = row;
    const saved = await sb.save(data);
    return { status: 200, body: { awarded: given, updated: saved.updated } };
  }

  return { getState, submit, setRound, reset, award };
}

module.exports = { createForge, scoreFromLog10, defaultRound, rank, LODGES, AWARD_ROW };
