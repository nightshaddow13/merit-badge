"use strict";

// A.I.R.A. Field Log -> squad points.
//
// Each Scout's Field Log reports three numbers: Vocab Vault best score, Level 1 terms done and
// levels cleared. The server clamps every number, stores one record per Scout (first name + last
// initial and squad only), and writes the SQUAD AVERAGE of every joined Scout (zeros included) into
// the "auto" rows of the AI scoreboard. Boss challenges, style points and bonuses are untouched.
//
// `store` is the usual adapter: get(key) / put(key, obj) / list() / remove(key).
// `sb` is { load() -> scoreboard data, save(data) } for the AI board.

const { AUTO_ROWS } = require("./boards");

const SLOTS = 6;
const MAX_PER_SQUAD = 12;
const MAX_TOTAL = 40;
const CAPS = { vault: 10, terms: 16, levels: 8 };
// XP per unit, for one Scout. The squad gets the average. Row maxima in boards.js / rows.json are these x CAPS.
const PER = { vault: 1, terms: 1, levels: 5 };
const ROW = { vault: "vocab-vault-avg", terms: "terms-avg", levels: "levels-avg" };

const ID_RE = /^[a-f0-9]{16,32}$/;
// First name + last initial: letters, spaces, hyphens, apostrophes and periods. No digits or symbols.
const NAME_RE = /^[A-Za-z][A-Za-z'.\- ]{0,22}[A-Za-z.]$/;

const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

function createAiraLog(store) {
  async function all() {
    const out = [];
    for (const r of await store.list()) if (/^scout-/.test(r.rowKey) && r.data) out.push(r.data);
    return out;
  }

  // Squad average of every joined Scout, rounded to whole XP. Squads with no Scouts stay empty.
  // With a roster (`rs`), the team average covers every student on the team, zeros included for those who have not reported yet.
  async function scoutsFor(rs) {
    const saved = new Map((await all()).map((s) => [s.id, s]));
    if (!rs) return [...saved.values()];
    const out = [];
    for (const d of (await rs.directory()).values()) {
      if (d.slot === null) continue;
      const s = saved.get(d.id);
      out.push({ id: d.id, slot: d.slot, name: d.name, vault: s ? s.vault : 0, terms: s ? s.terms : 0, levels: s ? s.levels : 0 });
    }
    return out;
  }
  async function recompute(sb, rs) {
    const data = await sb.load();
    const scouts = await scoutsFor(rs);
    for (const metric of Object.keys(ROW)) {
      const row = Array(SLOTS).fill(null);
      for (let slot = 0; slot < SLOTS; slot++) {
        const mine = scouts.filter((s) => s.slot === slot);
        if (!mine.length) continue;
        const sum = mine.reduce((t, s) => t + s[metric] * PER[metric], 0);
        row[slot] = Math.round(sum / mine.length);
      }
      if (row.some((v) => v !== null)) data.scores[ROW[metric]] = row;
      else delete data.scores[ROW[metric]];
    }
    return sb.save(data);
  }

  // Public. body: { id, slot (1-6), name, vault (0-10), terms (0-16), levels (0-8) }
  async function submit(body, sb, rs) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    // With a roster, only a logged-in student can report, and name and team come from the roster.
    const who = rs ? await rs.find(body.id) : null;
    if (rs && !who) return { status: 403, body: { error: "Log in with your password first.", login: true } };
    if (who && who.slot === null) return { status: 409, body: { error: "Your instructor has not put you on a team yet. Ask them, then try again." } };
    if (!who && !isInt(body.slot, 1, SLOTS)) return { status: 400, body: { error: "Choose your squad." } };
    const name = who ? who.name : typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!who && !NAME_RE.test(name)) return { status: 400, body: { error: "Use your first name and last initial only, letters only (like Sam K)." } };
    const vault = body.vault === null || body.vault === undefined ? 0 : body.vault;
    const terms = body.terms === null || body.terms === undefined ? 0 : body.terms;
    const levels = body.levels === null || body.levels === undefined ? 0 : body.levels;
    if (!isInt(vault, 0, CAPS.vault) || !isInt(terms, 0, CAPS.terms) || !isInt(levels, 0, CAPS.levels)) {
      return { status: 400, body: { error: "Those numbers are out of range." } };
    }

    const board = await sb.load();
    const slot = who ? who.slot : body.slot - 1;
    if (!board.lodges[slot]) return { status: 409, body: { error: "That squad is not set up yet. Ask your counselor." } };

    const key = "scout-" + body.id;
    const old = await store.get(key);
    if (!old && !rs) {
      const scouts = await all();
      if (scouts.length >= MAX_TOTAL) return { status: 409, body: { error: "The class roster is full. Ask your counselor." } };
      if (scouts.filter((s) => s.slot === slot).length >= MAX_PER_SQUAD) return { status: 409, body: { error: "That squad already has " + MAX_PER_SQUAD + " agents. Ask your counselor." } };
    }

    // Levels a Scout can claim are capped by what the counselor has marked complete for the class.
    const levelCap = Math.min(CAPS.levels, board.levels || 0);
    const rec = {
      id: body.id, slot, name,
      // Points only ever go up, so deleting a note or retaking the quiz cannot cost a Scout points.
      vault: Math.max(old ? old.vault : 0, vault),
      terms: Math.max(old ? old.terms : 0, terms),
      levels: Math.max(old ? old.levels : 0, Math.min(levels, levelCap)),
      at: new Date().toISOString(),
    };
    await store.put(key, rec);
    await recompute(sb, rs);
    const members = (await scoutsFor(rs)).filter((s) => s.slot === slot).length;
    return { status: 200, body: { saved: { vault: rec.vault, terms: rec.terms, levels: rec.levels }, members } };
  }

  // Scorekeepers only (the caller checks the role).
  async function roster(rs) {
    const scouts = (await scoutsFor(rs)).sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
    return { status: 200, body: { scouts: scouts.map((s) => ({ id: s.id, slot: s.slot + 1, name: s.name, vault: s.vault, terms: s.terms, levels: s.levels })), per: PER, caps: CAPS, maxPerSquad: MAX_PER_SQUAD } };
  }
  async function remove(body, sb, rs) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    await store.remove("scout-" + body.id);
    await recompute(sb, rs);
    return roster(rs);
  }
  async function reset(sb, rs) {
    for (const r of await store.list()) if (/^scout-/.test(r.rowKey)) await store.remove(r.rowKey);
    await recompute(sb, rs);
    return roster(rs);
  }

  return { submit, roster, remove, reset, recompute };
}

module.exports = { createAiraLog, ROW, PER, CAPS, AUTO_ROWS, MAX_PER_SQUAD };
