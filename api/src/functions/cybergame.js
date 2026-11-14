"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createCybergame } = require("../lib/cybergame");
const { createForge } = require("../lib/forge");
const { createTwoKey } = require("../lib/twokey");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};

// GET  /api/cybergame          anyone: which live game is on (the scoreboard and Warden Logs poll this)
// POST /api/cybergame/control  staff: { action: "start", game: "forge"|"twokey", mode?, banned? } or { action: "end", award? }
app.http("cybergame", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "cybergame/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, "cup");
    const game = createCybergame(tableStore(client, "cybergame"), createForge(tableStore(client, "forge")), createTwoKey(tableStore(client, "twokey")));
    const sb = scoreboardAdapter(client, BOARDS.cybersecurity, emptyData);
    const action = request.params.action || "";
    try {
      let r;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await game.state();
      } else {
        if (action !== "control") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        if (!staff(request)) return { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
        const text = await request.text();
        if (text.length > 2048) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        r = await game.control(body, sb);
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("cybergame failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
