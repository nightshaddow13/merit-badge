"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { emptyData, hasRole, validate, getBoard, mergeChanges, padBoard } = require("../lib/scores");
const { AUTO_ROWS } = require("../lib/boards");

const TABLE = "cup";
const PARTITION = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function table() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  return TableClient.fromConnectionString(conn, TABLE);
}

// GET  /api/scores/{board}  anyone      (board: cybersecurity | ai; defaults to cybersecurity)
// POST /api/scores/{board}  scorekeepers only
app.http("scores", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "scores/{board?}",
  handler: async (request, context) => {
    const boardId = request.params.board || "cybersecurity";
    const board = getBoard(boardId);
    if (!board) return { status: 404, headers: HEADERS, jsonBody: { error: "Unknown scoreboard." } };

    const client = table();
    if (!client) {
      return { status: 503, headers: HEADERS, jsonBody: { error: "Score storage is not set up yet." } };
    }

    try {
      if (request.method === "GET") {
        try {
          const entity = await client.getEntity(PARTITION, board.rowKey);
          return { status: 200, headers: HEADERS, jsonBody: padBoard(boardId, JSON.parse(entity.data)) };
        } catch (e) {
          if (e.statusCode === 404) return { status: 200, headers: HEADERS, jsonBody: emptyData(boardId) };
          throw e;
        }
      }

      // POST: the route rule in staticwebapp.config.json enforces this too;
      // this check keeps the API safe if that rule ever changes.
      if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
        return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can save scores." } };
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } };
      }
      if (body && body.changed) {
        let stored = null;
        try { stored = padBoard(boardId, JSON.parse((await client.getEntity(PARTITION, board.rowKey)).data)); } catch (e) { if (e.statusCode !== 404) throw e; }
        body = mergeChanges(boardId, stored, body);
      }
      const result = validate(boardId, body);
      if (!result.ok) return { status: 400, headers: HEADERS, jsonBody: { error: result.error } };

      // Rows filled in by the server (AI Field Log averages) always keep their stored values.
      if (boardId === "ai") {
        let stored = {};
        try { stored = padBoard("ai", JSON.parse((await client.getEntity(PARTITION, board.rowKey)).data)).scores || {}; } catch (e) { if (e.statusCode !== 404) throw e; }
        for (const id of AUTO_ROWS) { delete result.value.scores[id]; if (stored[id]) result.value.scores[id] = stored[id]; }
      }
      const saved = Object.assign({}, result.value, { updated: new Date().toISOString() });
      await client.createTable(); // no-op if it already exists
      await client.upsertEntity({ partitionKey: PARTITION, rowKey: board.rowKey, data: JSON.stringify(saved) }, "Replace");
      return { status: 200, headers: HEADERS, jsonBody: saved };
    } catch (e) {
      context.error("scores failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
