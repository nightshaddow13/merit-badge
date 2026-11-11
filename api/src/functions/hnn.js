"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createHnn } = require("../lib/hnn");
const { hasRole } = require("../lib/scores");
const { tableStore } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};

// POST /api/hnn/reveal   anyone: deal a mystery card the first time a Scout reveals it (never dealt twice)
// POST /api/hnn/answer   anyone with the card: what it was
// GET  /api/hnn/all      staff: the answer key, what is used and what is left
// POST /api/hnn/reset    staff: make every card available again
app.http("hnn", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "hnn/{action}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const h = createHnn(tableStore(TableClient.fromConnectionString(conn, "cup"), "hnn"));
    const action = request.params.action || "";
    const deny = { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
    try {
      let r;
      if (request.method === "GET") {
        if (action !== "all") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        if (!staff(request)) return deny;
        r = await h.staffView();
      } else {
        const text = await request.text();
        if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body = {};
        if (text) { try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; } }
        if (action === "reveal") r = await h.reveal(body);
        else if (action === "answer") r = await h.answer(body);
        else if (action === "reset") { if (!staff(request)) return deny; r = await h.reset(); }
        else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("hnn failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
