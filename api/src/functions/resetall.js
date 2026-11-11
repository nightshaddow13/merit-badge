"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createAiraLog } = require("../lib/airalog");
const { createHvBoard } = require("../lib/hvboard");
const { createWwyd } = require("../lib/wwyd");
const { createHnn } = require("../lib/hnn");
const { createDuel } = require("../lib/duel");
const { createFieldLog } = require("../lib/fieldlog");
const { resetAll } = require("../lib/resetall");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter, bigStore } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// POST /api/resetall   scorekeepers: { confirm: "RESET", logs?: true } clears every AI game and scorecard
app.http("resetall", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "resetall",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
    let body;
    try { body = JSON.parse(await request.text()); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
    if (!body || body.confirm !== "RESET") return { status: 400, headers: HEADERS, jsonBody: { error: "Type RESET to confirm." } };
    try {
      const client = TableClient.fromConnectionString(conn, "cup");
      const r = await resetAll({
        sb: scoreboardAdapter(client, BOARDS.ai, emptyData, "ai"),
        airalog: createAiraLog(tableStore(client, "airalog")),
        hv: createHvBoard(tableStore(client, "hvboard")),
        wwyd: createWwyd(tableStore(client, "wwyd")),
        hnn: createHnn(tableStore(client, "hnn")),
        duel: createDuel(tableStore(client, "duel")),
        fieldlog: createFieldLog({ logs: bigStore(client, "fieldlog"), ovr: tableStore(client, "fieldlog-ovr") }),
      }, { logs: body.logs === true });
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("resetall failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
