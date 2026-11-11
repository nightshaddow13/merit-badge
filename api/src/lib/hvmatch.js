"use strict";

// Human vs. Machine head-to-head: two Scouts on two devices play the same shuffled deck at the same time.
// A match is a short code. Nothing but a first name + last initial, a role and the run numbers is stored,
// and matches expire after 3 hours. `store` is the usual adapter: get/put/list/remove.

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_RE = /^[a-f0-9]{16,32}$/;
const NAME_RE = /^[A-Za-z][A-Za-z'.\- ]{0,22}[A-Za-z.]$/;
const TTL = 3 * 60 * 60 * 1000;
const MAX_MATCHES = 100;
const COUNTDOWN = 5000;
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const num = (v, hi) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(hi, v)) : 0);

function createHvMatch(store, opts) {
  const now = (opts && opts.now) || (() => Date.now());
  const rand = (opts && opts.rand) || Math.random;

  const cleanName = (n) => {
    const t = typeof n === "string" ? n.trim().replace(/\s+/g, " ") : "";
    return NAME_RE.test(t) ? t : "Agent";
  };
  const other = (r) => (r === "machine" ? "human" : "machine");

  function view(m, id) {
    const you = m.host.id === id ? m.host : m.guest && m.guest.id === id ? m.guest : null;
    if (!you) return null;
    const opp = you === m.host ? m.guest : m.host;
    let status = "waiting";
    if (m.guest) status = "lobby";
    if (m.startAt) status = "go";
    if (m.results[m.host.id] && m.guest && m.results[m.guest.id]) status = "done";
    return {
      code: m.code, seed: m.seed, status, now: now(), startAt: m.startAt,
      you: { name: you.name, role: you.role, ready: !!m.ready[you.id] },
      opponent: opp ? { name: opp.name, role: opp.role, ready: !!m.ready[opp.id] } : null,
      yourResult: m.results[you.id] || null,
      opponentResult: opp ? m.results[opp.id] || null : null,
    };
  }

  async function create(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (body.role !== "machine" && body.role !== "human") return { status: 400, body: { error: "Choose Machine or Human." } };
    const t = now(), rows = await store.list();
    let live = 0;
    for (const r of rows) { if (t - r.data.created > TTL) await store.remove(r.rowKey); else live++; }
    if (live >= MAX_MATCHES) return { status: 429, body: { error: "Too many matches right now. Try again in a few minutes." } };
    let code = "";
    for (let tries = 0; tries < 20; tries++) {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join("");
      if (!(await store.get("m-" + code))) break;
      code = "";
    }
    if (!code) return { status: 503, body: { error: "Could not make a code. Try again." } };
    const m = { code, seed: Math.floor(rand() * 1e9), created: t, host: { id: body.id, name: cleanName(body.name), role: body.role }, guest: null, ready: {}, startAt: null, results: {} };
    await store.put("m-" + code, m);
    return { status: 200, body: view(m, body.id) };
  }

  async function load(code) {
    if (typeof code !== "string" || !/^[A-Z0-9]{4}$/.test(code.toUpperCase())) return null;
    const m = await store.get("m-" + code.toUpperCase());
    if (!m || now() - m.created > TTL) return null;
    return m;
  }

  async function join(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    const m = await load(body.code);
    if (!m) return { status: 404, body: { error: "No match with that code. Check it and try again." } };
    if (m.host.id !== body.id && !(m.guest && m.guest.id === body.id)) {
      if (m.guest) return { status: 409, body: { error: "That match already has two players." } };
      m.guest = { id: body.id, name: cleanName(body.name), role: other(m.host.role) };
      await store.put("m-" + m.code, m);
    }
    return { status: 200, body: view(m, body.id) };
  }

  async function get(code, id) {
    const m = await load(code);
    const v = m && typeof id === "string" ? view(m, id) : null;
    return v ? { status: 200, body: v } : { status: 404, body: { error: "No match with that code." } };
  }

  async function ready(body) {
    const m = body && (await load(body.code));
    if (!m || !view(m, body.id)) return { status: 404, body: { error: "No match with that code." } };
    if (!m.guest) return { status: 409, body: { error: "Waiting for your competitor to join." } };
    m.ready[body.id] = true;
    if (m.ready[m.host.id] && m.ready[m.guest.id] && !m.startAt) m.startAt = now() + COUNTDOWN;
    await store.put("m-" + m.code, m);
    return { status: 200, body: view(m, body.id) };
  }

  async function result(body) {
    const m = body && (await load(body.code));
    if (!m || !view(m, body.id)) return { status: 404, body: { error: "No match with that code." } };
    if (!m.startAt) return { status: 409, body: { error: "The match has not started." } };
    const r = body.result || {};
    if (!m.results[body.id]) {
      m.results[body.id] = {
        sec: Math.round(num(r.sec, 3600) * 10) / 10, wrong: Math.round(num(r.wrong, 24)), count: Math.round(num(r.count, 99)),
        trivia: Math.round(num(r.trivia, 24)), pink: typeof r.pink === "string" ? r.pink.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 60) : "",
      };
      await store.put("m-" + m.code, m);
    }
    return { status: 200, body: view(m, body.id) };
  }

  return { create, join, get, ready, result };
}

module.exports = { createHvMatch, TTL, COUNTDOWN };
