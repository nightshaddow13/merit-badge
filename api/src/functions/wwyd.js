"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createWwyd } = require("../lib/wwyd");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};

// GET  /api/wwyd?id=       anyone: the class game state (scoreboard page, Field Logs); a Scout's id adds names and their own answer
// POST /api/wwyd           anyone: post the answer a Scout locked in for the current scenario
// GET  /api/wwyd/all       staff: every answer and the game state
// POST /api/wwyd/control   staff: { action: start | reveal | hide | next | end }
// POST /api/wwyd/clear     scorekeepers: delete all answers
app.http("wwyd", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "wwyd/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, "cup");
    const w = createWwyd(tableStore(client, "wwyd"));
    const sb = scoreboardAdapter(client, BOARDS.ai, emptyData, "ai");
    const action = request.params.action || "";
    const deny = { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
    try {
      let r;
      const names = async () => (await sb.load()).lodges;
      if (request.method === "GET") {
        if (action === "") r = await w.state(new URL(request.url).searchParams.get("id") || "", await names());
        else if (action === "all") { if (!staff(request)) return deny; r = await w.staffView(await names()); }
        else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      } else {
        const text = await request.text();
        if (text.length > 2048) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        if (action === "") r = await w.submit(body);
        else if (action === "control") { if (!staff(request)) return deny; r = await w.control(body); }
        else if (action === "clear") { if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) return deny; r = await w.clear(); }
        else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("wwyd failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
