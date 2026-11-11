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

function createFieldLog(stores) {
  const logs = stores.logs, ovr = stores.ovr;

  async function ovrRow(id) { return (await ovr.get("o-" + id)) || { levels: {} }; }

  // Public. body: { id, name, squad, squadSlot, summary, state }
  async function save(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) return { status: 400, body: { error: "Missing field log." } };
    const json = JSON.stringify(body.state);
    if (json.length > MAX_STATE) return { status: 413, body: { error: "That field log is too large." } };
    const key = "log-" + body.id;
    const old = await logs.get(key);
    if (!old && (await logs.list()).length >= MAX_LOGS) return { status: 409, body: { error: "The class backup is full. Ask your counselor." } };
    const meta = { id: body.id, name: txt(body.name, 40), squad: txt(body.squad, 40), updated: new Date().toISOString(), summary: cleanSummary(body.summary) };
    await logs.put(key, { meta, state: body.state });
    return { status: 200, body: { saved: true, updated: meta.updated } };
  }

  // Public (the id is the Scout's secret). Which pages has staff waived, which are waiting?
  async function overrideStatus(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing agent id." } };
    const row = await ovrRow(id), granted = [], pending = [];
    Object.keys(row.levels).forEach((n) => (row.levels[n].status === "granted" ? granted : pending).push(+n));
    return { status: 200, body: { granted, pending } };
  }

  // Public. A Scout asks staff to waive the unfinished items on one level page.
  async function requestOverride(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    if (!isInt(body.level, 1, 8)) return { status: 400, body: { error: "level must be 1 to 8." } };
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
    const rec = await logs.get("log-" + id);
    if (!rec || !rec.state) return { status: 404, body: { error: "No backup found." } };
    return { status: 200, body: { state: rec.state } };
  }

  // ---- staff only (the caller checks the role) ----
  async function list() {
    const ovrs = new Map((await ovr.list()).map((r) => [r.rowKey.slice(2), r.data]));
    const out = (await logs.list()).map((r) => {
      const m = r.data.meta, o = (ovrs.get(m.id) || { levels: {} }).levels;
      return Object.assign({}, m, { overrides: o });
    });
    out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    return { status: 200, body: { logs: out } };
  }
  async function get(id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { status: 400, body: { error: "Missing agent id." } };
    const rec = await logs.get("log-" + id);
    if (!rec) return { status: 404, body: { error: "No such field log." } };
    return { status: 200, body: { meta: rec.meta, state: rec.state, overrides: (await ovrRow(id)).levels } };
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
  async function remove(body) {
    if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return { status: 400, body: { error: "Missing agent id." } };
    await logs.remove("log-" + body.id); await ovr.remove("o-" + body.id);
    return { status: 200, body: { removed: true } };
  }

  return { save, restore, overrideStatus, requestOverride, list, get, grant, remove };
}

module.exports = { createFieldLog, MAX_STATE, MAX_LOGS };
