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

module.exports = { emptyData, hasRole, validate, getBoard };
