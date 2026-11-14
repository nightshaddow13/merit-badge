"use strict";

// Class schedule: which merit badges are active, when each class takes place (drives the countdowns),
// and the window when each badge is open to Scouts on the site.
//
// One small record in the `cup` table (partition "schedule"). Anyone can read it (the home page and the
// Scout pages need it); only staff can change it (the function checks the role). Until a counselor saves
// something, the defaults below apply, which match how the site behaved before this existed.
//
// store: small store (get/put) as in tablestore.js

const BADGES = ["cy", "ai"];
const NAMES = { cy: "Cybersecurity", ai: "Artificial Intelligence" };
// Saturday Nov 14 2026, Eastern time (EST = UTC-5)
const DEFAULTS = {
  cy: { active: true, start: "2026-11-14T14:00:00.000Z", minutes: 180, showFrom: "", showUntil: "" },
  ai: { active: true, start: "2026-11-14T18:00:00.000Z", minutes: 180, showFrom: "", showUntil: "" },
};
const MIN_MS = Date.UTC(2020, 0, 1), MAX_MS = Date.UTC(2100, 0, 1);

// "" (no limit) or an ISO instant between 2020 and 2100, normalized to ISO-UTC. Returns null when invalid.
function instant(v, allowBlank) {
  if (v === "" || v === null || v === undefined) return allowBlank ? "" : null;
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t >= MIN_MS && t <= MAX_MS ? new Date(t).toISOString() : null;
}

function normalize(raw, fallback) {
  const b = raw && typeof raw === "object" ? raw : {};
  return {
    active: typeof b.active === "boolean" ? b.active : fallback.active,
    start: instant(b.start, false) || fallback.start,
    minutes: Number.isInteger(b.minutes) && b.minutes >= 15 && b.minutes <= 720 ? b.minutes : fallback.minutes,
    showFrom: b.showFrom === undefined ? fallback.showFrom : instant(b.showFrom, true) === null ? fallback.showFrom : instant(b.showFrom, true),
    showUntil: b.showUntil === undefined ? fallback.showUntil : instant(b.showUntil, true) === null ? fallback.showUntil : instant(b.showUntil, true),
  };
}

function createSchedule(store) {
  async function read() {
    const rec = (await store.get("config")) || {};
    const badges = {};
    BADGES.forEach((k) => { badges[k] = normalize(rec.badges && rec.badges[k], DEFAULTS[k]); });
    return { badges, updated: rec.updated || "", updatedBy: rec.updatedBy || "" };
  }

  // Public: the schedule plus the server clock, so a Scout's wrong device clock cannot open a closed badge.
  async function get() {
    const s = await read();
    return { status: 200, body: Object.assign({ now: new Date().toISOString() }, s) };
  }

  // Staff. body: { badges: { cy?: {...}, ai?: {...} } }. A badge that is left out is kept as it was.
  // Bad input is refused (not quietly replaced) so the counselor sees the mistake.
  async function save(body, by) {
    if (!body || typeof body !== "object" || Array.isArray(body) || !body.badges || typeof body.badges !== "object") return { status: 400, body: { error: "Send { badges: { cy, ai } }." } };
    const cur = await read();
    const next = {};
    for (const k of BADGES) {
      const r = body.badges[k];
      if (r === undefined) { next[k] = cur.badges[k]; continue; }
      if (!r || typeof r !== "object" || Array.isArray(r)) return { status: 400, body: { error: NAMES[k] + ": send an object." } };
      if (typeof r.active !== "boolean") return { status: 400, body: { error: NAMES[k] + ": active must be true or false." } };
      const start = instant(r.start, false);
      if (!start) return { status: 400, body: { error: NAMES[k] + ": the class start is not a valid date and time." } };
      if (!Number.isInteger(r.minutes) || r.minutes < 15 || r.minutes > 720) return { status: 400, body: { error: NAMES[k] + ": class length must be 15 to 720 minutes." } };
      const showFrom = instant(r.showFrom, true), showUntil = instant(r.showUntil, true);
      if (showFrom === null) return { status: 400, body: { error: NAMES[k] + ": \"show from\" is not a valid date and time." } };
      if (showUntil === null) return { status: 400, body: { error: NAMES[k] + ": \"show until\" is not a valid date and time." } };
      if (showFrom && showUntil && Date.parse(showUntil) <= Date.parse(showFrom)) return { status: 400, body: { error: NAMES[k] + ": \"show until\" must be after \"show from\"." } };
      next[k] = { active: r.active, start, minutes: r.minutes, showFrom, showUntil };
    }
    const rec = { badges: next, updated: new Date().toISOString(), updatedBy: typeof by === "string" ? by.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) : "" };
    await store.put("config", rec);
    return { status: 200, body: Object.assign({ now: rec.updated }, rec) };
  }

  // Staff: go back to the built-in defaults.
  async function reset(by) {
    await store.put("config", { badges: {}, updated: new Date().toISOString(), updatedBy: typeof by === "string" ? by.slice(0, 60) : "" });
    return get();
  }

  return { get, save, reset };
}

module.exports = { createSchedule, DEFAULTS, BADGES };
