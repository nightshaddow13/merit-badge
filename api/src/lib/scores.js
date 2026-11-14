"use strict";

const { BOARDS } = require("./boards");

const MAX_ROWS = 40;
const MAX_NAME = 30;

function getBoard(id) {
  return Object.prototype.hasOwnProperty.call(BOARDS, id) ? BOARDS[id] : null;
}

function emptyData(boardId) {
  const b = getBoard(boardId);
  const d = { lodges: Array(b.slots).fill(""), scores: {}, updated: null };
  if (b.levels) d.levels = 0;
  return d;
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
function validate(boardId, body) {
  const b = getBoard(boardId);
  if (!b) return { ok: false, error: "Unknown scoreboard." };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object with lodges and scores." };
  }
  const { lodges, scores } = body;
  if (!Array.isArray(lodges) || lodges.length !== b.slots) {
    return { ok: false, error: "names must be a list of exactly " + b.slots + " entries (use empty text for unused ones)." };
  }
  const cleanLodges = [];
  for (const name of lodges) {
    if (typeof name !== "string") return { ok: false, error: "Each name must be text." };
    const trimmed = name.trim();
    if (trimmed.length > MAX_NAME) return { ok: false, error: "Names can be at most " + MAX_NAME + " characters." };
    cleanLodges.push(trimmed);
  }
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    return { ok: false, error: "scores must be an object keyed by row." };
  }
  const ids = Object.keys(scores);
  if (ids.length > MAX_ROWS) return { ok: false, error: "Too many rows." };
  const cleanScores = {};
  for (const id of ids) {
    const range = b.rule(id);
    if (!range) return { ok: false, error: "Unknown row: " + id.slice(0, 20) };
    const row = scores[id];
    if (!Array.isArray(row) || row.length !== b.slots) return { ok: false, error: "Each row needs " + b.slots + " score slots." };
    const cleanRow = [];
    for (const v of row) {
      if (v === null || v === "") { cleanRow.push(null); continue; }
      if (typeof v !== "number" || !Number.isInteger(v) || v < range.min || v > range.max) {
        return { ok: false, error: "Points for " + id + " must be whole numbers from " + range.min + " to " + range.max + "." };
      }
      cleanRow.push(v);
    }
    if (cleanRow.some((v) => v !== null)) cleanScores[id] = cleanRow;
  }
  const value = { lodges: cleanLodges, scores: cleanScores };
  if (b.levels) {
    const lv = body.levels === undefined || body.levels === null ? 0 : body.levels;
    if (typeof lv !== "number" || !Number.isInteger(lv) || lv < 0 || lv > 8) {
      return { ok: false, error: "Levels completed must be a whole number from 0 to 8." };
    }
    value.levels = lv;
  }
  return { ok: true, value };
}

// A scorekeeper page sends its whole table, but a page that was opened earlier (a second tab or device) holds a stale
// copy and would wipe names and scores entered since. When the page says which fields it changed (`body.changed`),
// apply only those onto the stored data. Without `changed` the body is used as sent.
function mergeChanges(boardId, stored, body) {
  const b = getBoard(boardId);
  const ch = body && body.changed;
  if (!b || !ch || typeof ch !== "object" || !body.lodges || !body.scores) return body;
  const base = stored || emptyData(boardId);
  const out = { lodges: Array.from({ length: b.slots }, (_, i) => String((base.lodges || [])[i] || "")), scores: JSON.parse(JSON.stringify(base.scores || {})) };
  if (b.levels) out.levels = typeof base.levels === "number" ? base.levels : 0;
  if (ch.clear === true) { out.scores = {}; if (b.levels) out.levels = 0; }
  (Array.isArray(ch.lodges) ? ch.lodges : []).forEach((i) => { if (Number.isInteger(i) && i >= 0 && i < b.slots && Array.isArray(body.lodges)) out.lodges[i] = body.lodges[i]; });
  (Array.isArray(ch.cells) ? ch.cells : []).forEach((c) => {
    if (!Array.isArray(c) || typeof c[0] !== "string" || !Number.isInteger(c[1]) || c[1] < 0 || c[1] >= b.slots) return;
    const mine = body.scores[c[0]], row = out.scores[c[0]] || (out.scores[c[0]] = Array(b.slots).fill(null));
    row[c[1]] = Array.isArray(mine) && mine[c[1]] !== undefined ? mine[c[1]] : null;
  });
  if (ch.levels === true && b.levels) out.levels = body.levels;
  return out;
}

module.exports = { emptyData, hasRole, validate, getBoard, mergeChanges };
