"use strict";

// Instructor-led class flow for the A.I.R.A. Field Log.
//
// One small record says what every Scout's Warden Log should show:
//   free   Scouts move through the tabs themselves (the normal behaviour).
//   page   every Field Log shows the page the instructor picked and the navigation is hidden.
//   hold   every Field Log shows a themed holding page with the instructor's message.
//   board  every Field Log shows the live scoreboard over the whole screen.
// Nothing a Scout has typed is ever touched: this only says which screen to show.
//
// `store` is the usual { get, put } adapter.

const KEY = "flow";
const MODES = ["free", "page", "hold", "board"];
// Field Log pages, in class order. "L3.hist" is the "hist" in-page tab on Level 3; "L3" alone would be a whole level.
// Discussion pages (see DISCUSSION below) are listed here too so they can be led. "L1" and "V1" are Level 1's Terms and Vocab Vault pages, "send" is Send & save. "unlock" is the access-code tab at the end of a level.
// There is no scoreboard tab in the AI Field Log; the "board" mode covers the whole screen instead.
const PAGES = [
  "L1", "V1",
  "L2.ex", "L2.aion", "L2.tl", "L2.unlock",
  "L3.hvm", "L3.home", "L3.hist", "L3.boss", "L3.unlock",
  "L4.wwyd", "L4.lawnote", "L4.big", "L4.unlock",
  "L5.sf", "L5.what", "L5.act", "L5.unlock",
  "L6.hnote", "L6.nnote", "L6.dnote", "L6.meth", "L6.why", "L6.pr", "L6.unlock",
  "L7.plan", "L7.tm", "L7.share", "L7.unlock",
  "L8.who", "L8.unlock",
  "send",
];
// Pages the Field Log has no tab for (nothing for a Scout to enter). The instructor can still lead and sign off here;
// Scouts see "My requirements" (the "send" page) while the instructor is on one.
const DISCUSSION = ["L2.ex", "L3.home", "L3.boss", "L4.big", "L5.what", "L5.act", "L6.meth", "L6.why", "L7.share", "L8.who"];
const MAX_MESSAGE = 200;

function cleanMessage(v) {
  if (typeof v !== "string") return null;
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
}

function createAiflow(store) {
  async function record() {
    return Object.assign({ mode: "free", page: PAGES[0], message: "", rev: 0, updated: null }, await store.get(KEY));
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

module.exports = { createAiflow, PAGES, DISCUSSION, MODES, MAX_MESSAGE };
