"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createAiraLog } = require("../lib/airalog");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// POST /api/airalog          anyone: a Scout reports their own Field Log numbers (clamped on the server)
// GET  /api/airalog/roster   scorekeepers: who has joined, with their numbers
// POST /api/airalog/remove   scorekeepers: { id } remove one Scout
// POST /api/airalog/reset    scorekeepers: clear every Scout and the automatic rows
app.http("airalog", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "airalog/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Score storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const log = createAiraLog(tableStore(client, "airalog"));
    const sb = scoreboardAdapter(client, BOARDS.ai, emptyData, "ai");
    const action = request.params.action || "";
    const keeper = hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper");

    try {
      let result;
      if (request.method === "GET") {
        if (action !== "roster") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        if (!keeper) return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can see the roster." } };
        result = await log.roster();
      } else {
        let body = {};
        if (action !== "reset") {
          const text = await request.text();
          if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
          try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        }
        if (action === "") result = await log.submit(body, sb);
        else if (action === "remove" || action === "reset") {
          if (!keeper) return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
          result = action === "remove" ? await log.remove(body, sb) : await log.reset(sb);
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: result.status, headers: HEADERS, jsonBody: result.body };
    } catch (e) {
      context.error("airalog failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
