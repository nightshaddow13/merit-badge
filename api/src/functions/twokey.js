"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createTwoKey } = require("../lib/twokey");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// GET  /api/twokey          anyone: the scorecard
// POST /api/twokey/check    anyone: { lodge, code }  verified here; a valid code is recorded and
//                           a lodge completes at 2 (wrong guesses are rate limited per lodge)
// POST /api/twokey/apply    scorekeepers: write the current points onto the Cup scoreboard (also automatic)
// POST /api/twokey/reset    scorekeepers: clear the scorecard and its points on the Cup scoreboard
// The lodge secrets live in the TWOKEY_SECRETS app setting (comma separated, Lodge 1 first).
app.http("twokey", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "twokey/{action?}",
  handler: async (request, context) => {
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
      } else if (action === "check") {
        const text = await request.text();
        if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        const secrets = (process.env.TWOKEY_SECRETS || "").split(",").map((x) => x.trim()).filter(Boolean);
        result = await tk.check(body, secrets, sb);
      } else if (action === "reset" || action === "apply") {
        if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
          return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
        }
        result = action === "reset" ? await tk.reset(sb) : await tk.apply(sb);
      } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      return { status: result.status, headers: HEADERS, jsonBody: result.body };
    } catch (e) {
      context.error("twokey failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
