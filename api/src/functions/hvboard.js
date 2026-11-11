"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createHvBoard } = require("../lib/hvboard");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// GET  /api/hvboard?id=      anyone who has played: class leaderboard and squad standings
// POST /api/hvboard          anyone: post a finished Human vs. Machine run
// POST /api/hvboard/reset    scorekeepers: clear every score and the automatic scoreboard row
app.http("hvboard", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "hvboard/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, "cup");
    const hb = createHvBoard(tableStore(client, "hvboard"));
    const sb = scoreboardAdapter(client, BOARDS.ai, emptyData, "ai");
    const action = request.params.action || "";
    try {
      let r;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await hb.board(new URL(request.url).searchParams.get("id") || "", sb);
      } else if (action === "reset") {
        if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
        r = await hb.reset(sb);
      } else if (action === "") {
        const text = await request.text();
        if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        r = await hb.submit(body, sb);
      } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("hvboard failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
