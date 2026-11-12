"use strict";

// Warden Log (Cybersecurity merit badge): online worksheets, backup, counselor sign-off and waivers.
//
// Each Warden's device saves a copy of its log keyed by a random device id (the private recovery
// code). Only staff (counselor or scorekeeper) can list or open logs and sign requirements off.
// Sign-offs and waivers live in their own rows so a Warden's autosave can never undo or forge them.
//
// stores: { logs: big store ({meta,state}), ovr: small store }

// Same file as assets/warden-rules.js (the Azure API deploys on its own, so it keeps a copy; test-wardenlog.js checks they match).
const rules = require("./wardenrules");
const ID_RE = /^[a-f0-9]{16,32}$/;
const MAX_STATE = 150000;
const MAX_LOGS = 80;
const MAX_TEXT = 1000;
// Every Cybersecurity requirement code (kept in step with assets/requirements.js; test-wardenlog.js checks).
const REQS = ["1a", "1b", "1c", "2a", "2b", "3a", "3b", "4a", "4b", "4c", "4d", "4e", "4f", "5a", "5b", "5c1", "5c2", "5c3", "6a", "6b", "6c", "7", "8", "9"];
const SECTIONS = ["career", "surface", "breach", "seal", "objects", "forgery", "reflect"];
// Worksheet sections that check a requirement by themselves once the Warden finishes them.
const SECTION_REQ = { career: "9", surface: "4f", breach: "4e", seal: "6c", objects: "7" };
const txt = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

// Keep the shape a Warden sent but clamp it: strings to 1,000 characters (newlines allowed), small arrays, shallow depth.
function clean(v, depth) {
  if (typeof v === "string") return v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").slice(0, MAX_TEXT);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean" || v === null) return v;
  if (depth > 5) return null;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => clean(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).slice(0, 60).forEach((k) => { if (/^[A-Za-z0-9_-]{1,40}$/.test(k)) o[k] = clean(v[k], depth + 1); });
    return o;
  }
  return null;
}

function cleanSummary(s) {
  const out = {};
  SECTIONS.forEach((k) => { const n = s && typeof s === "object" ? s[k] : 0; out[k] = n === 1 || n === 2 ? n : 0; });
  return out;
}

function createWardenLog(stores) {
  const logs = stores.logs, ovr = stores.ovr;
  const row = async (id) => {
    const r = (await ovr.get("o-" + id)) || {};
    return { signed: r.signed || {}, waive: r.waive || {} };
  };
  const badId = (id) => typeof id !== "string" || !ID_RE.test(id);

  // Public. body: { id, name, lodge, summary, state }
  async function save(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (badId(body.id)) return { status: 400, body: { error: "Missing recovery code." } };
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) return { status: 400, body: { error: "Missing log." } };
    if (JSON.stringify(body.state).length > MAX_STATE) return { status: 413, body: { error: "That log is too large." } };
    const state = clean(body.state, 0);
    const key = "log-" + body.id;
    const old = await logs.get(key);
    if (!old && (await logs.list()).length >= MAX_LOGS) return { status: 409, body: { error: "The class backup is full. Ask your counselor." } };
    // A counselor edit is newer than anything this device has seen: do not overwrite it; the device pulls it first.
    if (old && old.meta.editedAt && body.seenEdit !== old.meta.editedAt) return { status: 409, body: { error: "Your counselor updated your log.", edited: true, editedAt: old.meta.editedAt } };
    const meta = { id: body.id, name: txt(body.name, 40), lodge: txt(body.lodge, 40), memberId: typeof body.memberId === "string" ? body.memberId.replace(/\D/g, "").slice(0, 12) : "", updated: new Date().toISOString(), summary: cleanSummary(body.summary) };
    if (old && old.meta.editedAt) { meta.editedAt = old.meta.editedAt; meta.editedBy = old.meta.editedBy; }
    await logs.put(key, { meta, state });
    return { status: 200, body: { saved: true, updated: meta.updated } };
  }

  // Public (the id is the Warden's secret): sign-offs and waivers for their own log.
  async function status(id) {
    if (badId(id)) return { status: 400, body: { error: "Missing recovery code." } };
    const r = await row(id), waive = {};
    Object.keys(r.waive).forEach((k) => (waive[k] = r.waive[k].status));
    const rec = await logs.get("log-" + id);
    return { status: 200, body: { signed: r.signed, waive, editedAt: (rec && rec.meta.editedAt) || "" } };
  }

  // Public. A Warden who is blocked asks staff to waive one requirement.
  async function requestWaive(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    if (badId(body.id)) return { status: 400, body: { error: "Missing recovery code." } };
    if (!REQS.includes(body.req)) return { status: 400, body: { error: "Unknown requirement." } };
    if (!(await logs.get("log-" + body.id))) return { status: 409, body: { error: "Your log has not been backed up yet. Wait a few seconds and try again." } };
    const r = await row(body.id), cur = r.waive[body.req];
    if (!cur || cur.status !== "granted") r.waive[body.req] = { status: "pending", reason: txt(body.reason, 100), requestedAt: new Date().toISOString() };
    await ovr.put("o-" + body.id, r);
    return status(body.id);
  }

  // Public (recovery code): the Warden's own backup.
  async function restore(id) {
    if (badId(id)) return { status: 400, body: { error: "Missing recovery code." } };
    const rec = await logs.get("log-" + id);
    if (!rec || !rec.state) return { status: 404, body: { error: "No backup found." } };
    return { status: 200, body: { state: rec.state, name: rec.meta.name || "", lodge: rec.meta.lodge || "", memberId: rec.meta.memberId || "", editedAt: rec.meta.editedAt || "" } };
  }

  // ---- staff only (the caller checks the role) ----
  async function list() {
    const ovrs = new Map((await ovr.list()).map((r) => [r.rowKey.slice(2), r.data]));
    const out = (await logs.list()).map((r) => {
      const m = r.data.meta, o = ovrs.get(m.id) || {};
      return Object.assign({}, m, { signed: o.signed || {}, waive: o.waive || {} });
    });
    out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
    return { status: 200, body: { logs: out } };
  }
  async function get(id) {
    if (badId(id)) return { status: 400, body: { error: "Missing id." } };
    const rec = await logs.get("log-" + id);
    if (!rec) return { status: 404, body: { error: "No such log." } };
    const r = await row(id);
    return { status: 200, body: { meta: rec.meta, state: rec.state, signed: r.signed, waive: r.waive } };
  }
  // body: { id, req, signed: boolean }; `by` is the staff member's sign-in name
  async function signoff(body, by) {
    if (!body || badId(body.id)) return { status: 400, body: { error: "Missing id." } };
    if (!REQS.includes(body.req) || typeof body.signed !== "boolean") return { status: 400, body: { error: "req and signed (true/false) are required." } };
    if (!(await logs.get("log-" + body.id))) return { status: 404, body: { error: "No such log." } };
    const r = await row(body.id);
    if (body.signed) r.signed[body.req] = { by: txt(by, 60) || "counselor", at: new Date().toISOString() };
    else delete r.signed[body.req];
    await ovr.put("o-" + body.id, r);
    return { status: 200, body: { signed: r.signed } };
  }
  async function grant(body) {
    if (!body || badId(body.id)) return { status: 400, body: { error: "Missing id." } };
    if (!REQS.includes(body.req) || typeof body.granted !== "boolean") return { status: 400, body: { error: "req and granted (true/false) are required." } };
    if (!(await logs.get("log-" + body.id))) return { status: 404, body: { error: "No such log." } };
    const r = await row(body.id);
    if (body.granted) r.waive[body.req] = Object.assign(r.waive[body.req] || {}, { status: "granted", grantedAt: new Date().toISOString() });
    else delete r.waive[body.req];
    await ovr.put("o-" + body.id, r);
    return { status: 200, body: { waive: r.waive } };
  }
  // Staff: fix identity or written answers. body: { id, name?, lodge?, memberId?, data?: { section: {...} } }
  // Only known sections are replaced (each cleaned like a normal save); the summary is recomputed from the answers.
  async function edit(body, by) {
    if (!body || badId(body.id)) return { status: 400, body: { error: "Missing id." } };
    const rec = await logs.get("log-" + body.id);
    if (!rec) return { status: 404, body: { error: "No such log." } };
    const meta = rec.meta, state = rec.state && typeof rec.state === "object" ? rec.state : {};
    if (typeof body.name === "string") meta.name = txt(body.name, 40);
    if (typeof body.lodge === "string") meta.lodge = txt(body.lodge, 40);
    if (typeof body.memberId === "string") meta.memberId = body.memberId.replace(/\D/g, "").slice(0, 12);
    if (body.data !== undefined) {
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return { status: 400, body: { error: "data must be an object of sections." } };
      Object.keys(body.data).forEach((k) => { if (SECTIONS.includes(k) && body.data[k] && typeof body.data[k] === "object" && !Array.isArray(body.data[k])) state[k] = clean(body.data[k], 1); });
    }
    if (JSON.stringify(state).length > MAX_STATE) return { status: 413, body: { error: "That log is too large." } };
    meta.summary = cleanSummary(rules.states(state));
    meta.updated = new Date().toISOString(); meta.editedAt = meta.updated; meta.editedBy = txt(by, 60) || "counselor";
    await logs.put("log-" + body.id, { meta, state });
    return { status: 200, body: { meta, state } };
  }
  async function remove(body) {
    if (!body || badId(body.id)) return { status: 400, body: { error: "Missing id." } };
    await logs.remove("log-" + body.id); await ovr.remove("o-" + body.id);
    return { status: 200, body: { removed: true } };
  }
  async function resetAll(body) {
    if (!body || body.confirm !== "RESET") return { status: 400, body: { error: "Type RESET to confirm." } };
    let n = 0;
    for (const r of await logs.list()) { await logs.remove(r.rowKey); n++; }
    for (const r of await ovr.list()) await ovr.remove(r.rowKey);
    return { status: 200, body: { removed: n } };
  }

  return { save, status, requestWaive, restore, list, get, signoff, grant, edit, remove, resetAll };
}

module.exports = { createWardenLog, MAX_STATE, MAX_LOGS, REQS, SECTIONS, SECTION_REQ };
