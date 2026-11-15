"use strict";

// A.I.R.A. Field Log backup, counselor dashboard and page overrides.
//
// Each Scout's device saves a copy of its Field Log (keyed by a random device id). Only staff
// (counselor or scorekeeper) can list or open logs. A Scout whose Unlock is blocked by unfinished
// items can ask for an override; staff grant or revoke it per level page. Overrides live in their
// own rows so a Scout's autosave can never undo a grant.
//
// stores: { logs: big store (get/put/list/remove of {meta,state}), ovr: small store (get/put/list/remove) }

const ID_RE = /^[a-f0-9]{16,32}$/;
const MAX_STATE = 150000; // characters of JSON
const MAX_LOGS = 80;
// Field Log sections whose written answers staff can read across the class: "L<level>.<section>" in state.lv, or "L2" for the Level 2 worksheet.
const SECTIONS = ["L2", "L3.home", "L3.work", "L3.school", "L3.hist", "L3.boss", "L4.big", "L4.law", "L4.charter", "L4.tur", "L5.what", "L5.act", "L6.hunt", "L6.meth", "L6.why", "L6.pr", "L7.plan", "L7.share", "L8.who"];
const isInt = (n, lo, hi) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

function cleanSummary(s) {
  const out = { unlocked: 1, won: false, vault: null, aiOrNot: null, levels: {} };
  if (!s || typeof s !== "object") return out;
  if (isInt(s.unlocked, 1, 8)) out.unlocked = s.unlocked;
  out.won = s.won === true;
  if (isInt(s.vault, 0, 100)) out.vault = s.vault;
  if (isInt(s.aiOrNot, 0, 100)) out.aiOrNot = s.aiOrNot;
  if (s.levels && typeof s.levels === "object") {
    for (let n = 1; n <= 8; n++) {
      const v = s.levels[n];
      if (Array.isArray(v) && isInt(v[0], 0, 999) && isInt(v[1], 0, 999)) out.levels[n] = [v[0], v[1]];
    }
  }
  return out;
}

function createFieldLog(stores, roster) {
  const logs = stores.logs, ovr = stores.ovr;

  async function ovrRow(id) { const r = (await ovr.get("o-" + id)) || {}; r.levels = r.levels || {}; r.signed = r.signed || {}; return r; }

  // Public. body: { id, name, squad, squadSlot, summary, state }
  async function save(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) return { status: 400, body: { error: "Missing field log." } };
    const json = JSON.stringify(body.state);
    if (json.length > MAX_STATE) return { status: 413, body: { error: "That field log is too large." } };
    // With a roster, only a student who logged in with their password can save, and the name and team come from the roster.
    const who = roster ? await roster.find(body.id) : null;
    if (roster && !who) return { status: 403, body: { error: "Log in with your password to save your field log.", login: true } };
    const key = "log-" + body.id;
    const old = await logs.get(key);
    if (!old && (await logs.list()).length >= MAX_LOGS) return { status: 409, body: { error: "The class backup is full. Ask your counselor." } };
    const meta = { id: body.id, name: who ? who.name : txt(body.name, 40), squad: who ? who.team : txt(body.squad, 40), scoutId: who ? who.scoutId : "", updated: new Date().toISOString(), summary: cleanSummary(body.summary) };
    await logs.put(key, { meta, state: body.state });
    return { status: 200, body: { saved: true, updated: meta.updated } };
  }

  // Public (the id is the Scout's secret). Which pages has staff waived, which are waiting?
  async function overrideStatus(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing agent id." } };
    const row = await ovrRow(id), granted = [], pending = [];
    Object.keys(row.levels).forEach((n) => (row.levels[n].status === "granted" ? granted : pending).push(+n));
    return { status: 200, body: { granted, pending, signed: row.signed } };
  }

  // Public. A Scout asks staff to waive the unfinished items on one level page.
  async function requestOverride(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.level, 1, 8)) return { status: 400, body: { error: "level must be 1 to 8." } };
    if (roster && !(await roster.find(body.id))) return { status: 403, body: { error: "Log in with your password first.", login: true } };
    if (!(await logs.get("log-" + body.id))) return { status: 409, body: { error: "Your field log has not been backed up yet. Wait a few seconds and try again." } };
    const missing = (Array.isArray(body.missing) ? body.missing : []).slice(0, 8).map((m) => txt(m, 100)).filter(Boolean);
    const row = await ovrRow(body.id);
    const cur = row.levels[body.level];
    if (!cur || cur.status !== "granted") row.levels[body.level] = { status: "pending", missing, requestedAt: new Date().toISOString() };
    await ovr.put("o-" + body.id, row);
    return overrideStatus(body.id);
  }

  // Public (the id is the Scout's private recovery code). Returns the Scout's own backup.
  async function restore(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing recovery code." } };
    if (roster && !(await roster.find(id))) return { status: 404, body: { error: "No backup found." } };
    const rec = await logs.get("log-" + id);
    if (!rec || !rec.state) return { status: 404, body: { error: "No backup found." } };
    return { status: 200, body: { state: rec.state } };
  }

  // ---- staff only (the caller checks the role) ----
  // With a roster, the student's current name and team replace what was saved; logs from before the roster are marked legacy (read-only).
  const withWho = (m, dir) => { if (!dir) return m; const d = dir.get(m.id); return d ? Object.assign({}, m, { name: d.name, squad: d.team, scoutId: d.scoutId, legacy: false }) : Object.assign({}, m, { legacy: true }); };
  async function list() {
    const ovrs = new Map((await ovr.list()).map((r) => [r.rowKey.slice(2), r.data]));
    const dir = roster ? await roster.directory() : null;
    const out = (await logs.list()).map((r) => {
      const m = withWho(r.data.meta, dir), o = (ovrs.get(m.id) || { levels: {} }).levels;
      return Object.assign({}, m, { overrides: o, signed: (ovrs.get(m.id) || {}).signed || {} });
    });
    out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    return { status: 200, body: { logs: out } };
  }
  // Staff: what every Scout wrote in one section, for the instructor's live view. Returns [{ id, name, team, data }].
  async function answers(section) {
    if (typeof section !== "string" || !SECTIONS.includes(section)) return { status: 400, body: { error: "Unknown section." } };
    const dir = roster ? await roster.directory() : null, out = [];
    for (const r of await logs.list()) {
      const m = withWho(r.data.meta, dir), rec = await logs.get(r.rowKey);
      const st = rec && rec.state && typeof rec.state === "object" ? rec.state : {};
      let d;
      if (section === "L2") d = st.l2;
      else { const [lv, k] = section.slice(1).split("."); d = st.lv && typeof st.lv === "object" && Object.prototype.hasOwnProperty.call(st.lv, lv) && st.lv[lv] && Object.prototype.hasOwnProperty.call(st.lv[lv], k) ? st.lv[lv][k] : null; }
      out.push({ id: m.id, name: m.name || "", team: m.squad || "", data: d && typeof d === "object" ? d : {} });
    }
    return { status: 200, body: { section, answers: out } };
  }
  async function get(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing agent id." } };
    const rec = await logs.get("log-" + id);
    if (!rec) return { status: 404, body: { error: "No such field log." } };
    const row = await ovrRow(id);
    return { status: 200, body: { meta: withWho(rec.meta, roster ? await roster.directory() : null), state: rec.state, overrides: row.levels, signed: row.signed } };
  }
  async function grant(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.level, 1, 8) || typeof body.granted !== "boolean") return { status: 400, body: { error: "level (1-8) and granted (true/false) are required." } };
    if (!(await logs.get("log-" + body.id))) return { status: 404, body: { error: "No such field log." } };
    const row = await ovrRow(body.id);
    if (body.granted) row.levels[body.level] = Object.assign(row.levels[body.level] || {}, { status: "granted", grantedAt: new Date().toISOString() });
    else delete row.levels[body.level];
    await ovr.put("o-" + body.id, row);
    return { status: 200, body: { overrides: row.levels } };
  }
  // Staff: sign off (or undo) one A.I.R.A. requirement, 1 to 8. `by` is the staff member's sign-in name.
  async function signoff(body, by) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.req, 1, 8) || typeof body.signed !== "boolean") return { status: 400, body: { error: "req (1-8) and signed (true/false) are required." } };
    if (!(await logs.get("log-" + body.id))) return { status: 404, body: { error: "No such field log." } };
    const row = await ovrRow(body.id);
    if (body.signed) row.signed[body.req] = { by: txt(by, 60) || "counselor", at: new Date().toISOString() };
    else delete row.signed[body.req];
    await ovr.put("o-" + body.id, row);
    return { status: 200, body: { signed: row.signed } };
  }
  async function remove(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    await logs.remove("log-" + body.id); await ovr.remove("o-" + body.id);
    return { status: 200, body: { removed: true } };
  }

  return { save, restore, overrideStatus, requestOverride, list, answers, get, grant, signoff, remove };
}

module.exports = { createFieldLog, MAX_STATE, MAX_LOGS, SECTIONS };
