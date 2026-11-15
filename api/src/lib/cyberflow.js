"use strict";

// Instructor-led class flow for the Cybersecurity Warden Log.
//
// One small record says what every Scout's Warden Log should show:
//   free   Scouts move through the tabs themselves (the normal behaviour).
//   page   every Warden Log shows the page the instructor picked and the tabs are locked.
//   hold   every Warden Log shows a themed holding page with the instructor's message.
//   board  every Warden Log shows the live scoreboard.
// Nothing a Scout has typed is ever touched: this only says which screen to show.
//
// `store` is the usual { get, put } adapter.

const KEY = "flow";
const MODES = ["free", "page", "hold", "board"];
// Warden Log tab keys, in class order.
const PAGES = ["career", "surface", "forge", "rite", "seal", "breach", "objects"];
const MAX_MESSAGE = 200;

function cleanMessage(v) {
  if (typeof v !== "string") return null;
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
}

function createCyberflow(store) {
  async function record() {
    const r = Object.assign({ mode: "free", page: PAGES[0], message: "", rev: 0, updated: null }, await store.get(KEY));
    if (!PAGES.includes(r.page)) r.page = PAGES[0]; // an older saved flow may still point at the removed "req" page
    return r;
  }

  // Public. Scouts' screens poll this.
  async function state() {
    const r = await record();
    return { status: 200, body: { mode: r.mode, page: r.page, message: r.message, rev: r.rev, updated: r.updated } };
  }

  // Staff. body: any of { mode, page, message }. `mode: "page"` needs a page (or reuses the last one).
  async function control(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { error: "Send a JSON object." } };
    const r = await record();
    const next = { mode: r.mode, page: r.page, message: r.message };
    if (body.mode !== undefined) {
      if (!MODES.includes(body.mode)) return { status: 400, body: { error: "mode must be free, page, hold or board." } };
      next.mode = body.mode;
    }
    if (body.page !== undefined) {
      if (!PAGES.includes(body.page)) return { status: 400, body: { error: "Unknown page." } };
      next.page = body.page;
    }
    if (body.message !== undefined) {
      const m = cleanMessage(body.message);
      if (m === null) return { status: 400, body: { error: "message must be text." } };
      next.message = m;
    }
    if (body.mode === undefined && body.page === undefined && body.message === undefined) return { status: 400, body: { error: "Nothing to change." } };
    next.rev = r.rev + 1;
    next.updated = new Date().toISOString();
    await store.put(KEY, next);
    return state();
  }

  return { state, control };
}

module.exports = { createCyberflow, PAGES, MODES, MAX_MESSAGE };
