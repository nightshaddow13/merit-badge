"use strict";

const SLOTS = 6;
const MAX_ACTIVITIES = 40;
const MAX_NAME = 30;
const MIN_POINTS = -50;
const MAX_POINTS = 100;

function emptyData() {
  return { lodges: Array(SLOTS).fill(""), scores: {}, updated: null };
}

// Azure Static Web Apps passes the signed-in user in this header (base64 JSON).
function hasRole(header, role) {
  if (!header) return false;
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    return Array.isArray(principal.userRoles) && principal.userRoles.includes(role);
  } catch (e) {
    return false;
  }
}

// Returns { ok: true, value } or { ok: false, error }.
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object with lodges and scores." };
  }
  const { lodges, scores } = body;
  if (!Array.isArray(lodges) || lodges.length !== SLOTS) {
    return { ok: false, error: "lodges must be a list of exactly " + SLOTS + " names (use empty text for unused lodges)." };
  }
  const cleanLodges = [];
  for (const name of lodges) {
    if (typeof name !== "string") return { ok: false, error: "Each lodge name must be text." };
    const trimmed = name.trim();
    if (trimmed.length > MAX_NAME) return { ok: false, error: "Lodge names can be at most " + MAX_NAME + " characters." };
    cleanLodges.push(trimmed);
  }
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    return { ok: false, error: "scores must be an object keyed by activity." };
  }
  const ids = Object.keys(scores);
  if (ids.length > MAX_ACTIVITIES) return { ok: false, error: "Too many activities." };
  const cleanScores = {};
  for (const id of ids) {
    if (!/^[a-z0-9-]{1,50}$/.test(id)) return { ok: false, error: "Unknown activity id: " + id.slice(0, 20) };
    const row = scores[id];
    if (!Array.isArray(row) || row.length !== SLOTS) return { ok: false, error: "Each activity needs " + SLOTS + " score slots." };
    const cleanRow = [];
    for (const v of row) {
      if (v === null || v === "") { cleanRow.push(null); continue; }
      if (typeof v !== "number" || !Number.isInteger(v) || v < MIN_POINTS || v > MAX_POINTS) {
        return { ok: false, error: "Points must be whole numbers from " + MIN_POINTS + " to " + MAX_POINTS + "." };
      }
      cleanRow.push(v);
    }
    if (cleanRow.some((v) => v !== null)) cleanScores[id] = cleanRow;
  }
  return { ok: true, value: { lodges: cleanLodges, scores: cleanScores } };
}

module.exports = { SLOTS, emptyData, hasRole, validate };
