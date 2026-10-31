"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createTwoKey } = require("../lib/twokey");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// All scorekeepers only (also enforced by the route rules in staticwebapp.config.json).
// GET  /api/twokey          the scorecard
// POST /api/twokey/record   { lodge, counter }  one valid code; completes a lodge at 2
// POST /api/twokey/reset    clear the scorecard and its points on the Cup scoreboard
app.http("twokey", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "twokey/{action?}",
  handler: async (request, context) => {
    if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
      return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can use the code check." } };
    }
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Shared scoreboard is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const tk = createTwoKey(tableStore(client, "twokey"));
    const sb = scoreboardAdapter(client, BOARDS.cybersecurity, emptyData);
    const action = request.params.action || "";
    try {
      let result;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        result = await tk.getState();
      } else if (action === "record" || action === "reset") {
        let body = {};
        if (action === "record") {
          const text = await request.text();
          if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
          try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        }
        result = action === "record" ? await tk.record(body, sb) : await tk.reset(sb);
      } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      return { status: result.status, headers: HEADERS, jsonBody: result.body };
    } catch (e) {
      context.error("twokey failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
