"use strict";

// Live Cybersecurity games that take over the scoreboard, run from the scoring dashboard
// (the same idea as the A.I.R.A. What Would You Do? and Prompt Duel games).
//
// One small record says which game is on. The games themselves keep their own data exactly as before
// (lib/forge.js and lib/twokey.js), so starting or ending a game never changes scores that already exist:
//   forge  start: new round (clears only the Forge submissions, the same as "Reset round"), submissions open.
//          end:   submissions close; optionally the 1st / 2nd points are put on the scoreboard.
//   twokey start: nothing is cleared (use Reset scorecard on the Two-Key page to start a fresh race).
//          end:   the race closes. Points were already added as each lodge finished.
//
// `store` is the usual { get, put } adapter. `forge` and `twokey` are the existing lib instances.
// `sb` is { load(), save(data) } for the Cybersecurity scoreboard.

const { rank } = require("./forge");

const KEY = "game";
const GAMES = ["forge", "twokey"];

function createCybergame(store, forge, twokey) {
  async function record() {
    return Object.assign({ active: null, gid: 0, startedAt: null }, await store.get(KEY));
  }

  async function forgeView() {
    const s = (await forge.getState()).body;
    const ranked = rank(s.entries, s.round);
    const base = s.round.mode === "break" && s.round.starter ? s.round.starter.log10 : 0;
    return { round: s.round, ranked: ranked.map((e, i) => Object.assign({}, e, { place: i + 1, gain: Math.round((e.log10 - base) * 10) / 10 })) };
  }

  // Public. Everything on it is already public on the game's own page.
  async function state() {
    const g = await record();
    const out = { active: g.active, gid: g.gid, startedAt: g.startedAt };
    if (g.active === "forge") out.forge = await forgeView();
    if (g.active === "twokey") out.twokey = (await twokey.getState()).body;
    return { status: 200, body: out };
  }

  // Staff. body: { action: "start", game, mode?, banned? } or { action: "end", award? }
  async function control(body, sb) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    const g = await record();
    if (body.action === "start") {
      if (!GAMES.includes(body.game)) return { status: 400, body: { error: "game must be forge or twokey." } };
      if (g.active) return { status: 409, body: { error: "A game is already running. End it first." } };
      if (body.game === "forge") {
        await forge.reset();
        const opts = { open: true };
        if (body.mode !== undefined) opts.mode = body.mode;
        if (body.banned !== undefined) opts.banned = body.banned;
        const r = await forge.setRound(opts);
        if (r.status !== 200) return r;
      }
      const next = { active: body.game, gid: g.gid + 1, startedAt: new Date().toISOString() };
      await store.put(KEY, next);
      return state();
    }
    if (body.action === "end") {
      if (!g.active) return { status: 409, body: { error: "No game is running." } };
      let awarded = null;
      if (g.active === "forge") {
        if (body.award) {
          const a = await forge.award(sb);
          if (a.status === 200) awarded = a.body.awarded; else if (a.status !== 409) return a;
        }
        await forge.setRound({ open: false });
      }
      await store.put(KEY, { active: null, gid: g.gid, startedAt: null, endedAt: new Date().toISOString(), last: g.active });
      const s = await state();
      s.body.awarded = awarded;
      return s;
    }
    return { status: 400, body: { error: "action must be start or end." } };
  }

  return { state, control };
}

module.exports = { createCybergame, GAMES };
