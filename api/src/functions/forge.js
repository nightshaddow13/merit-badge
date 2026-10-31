"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createForge } = require("../lib/forge");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");

const TABLE = "cup";
const PARTITION = "forge";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const MAX_BODY = 4096;

function tableStore(client) {
  return {
    async get(rowKey) {
      try {
        const e = await client.getEntity(PARTITION, rowKey);
        return JSON.parse(e.data);
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    async put(rowKey, obj) {
      await client.createTable(); // no-op if it already exists
      await client.upsertEntity({ partitionKey: PARTITION, rowKey, data: JSON.stringify(obj) }, "Replace");
    },
    async list() {
      const rows = [];
      try {
        for await (const e of client.listEntities({ queryOptions: { filter: "PartitionKey eq '" + PARTITION + "'" } })) {
          rows.push({ rowKey: e.rowKey, data: JSON.parse(e.data) });
        }
      } catch (e) {
        if (e.statusCode !== 404) throw e; // table not created yet
      }
      return rows;
    },
    async remove(rowKey) {
      try { await client.deleteEntity(PARTITION, rowKey); } catch (e) { if (e.statusCode !== 404) throw e; }
    },
  };
}

// The Cybersecurity scoreboard lives in the same table (partition "cup").
function scoreboardAdapter(client) {
  const board = BOARDS.cybersecurity;
  return {
    async load() {
      try {
        const e = await client.getEntity("cup", board.rowKey);
        const d = JSON.parse(e.data);
        d.scores = d.scores || {};
        return d;
      } catch (e) {
        if (e.statusCode === 404) return emptyData("cybersecurity");
        throw e;
      }
    },
    async save(data) {
      const saved = Object.assign({}, data, { updated: new Date().toISOString() });
      await client.createTable();
      await client.upsertEntity({ partitionKey: "cup", rowKey: board.rowKey, data: JSON.stringify(saved) }, "Replace");
      return saved;
    },
  };
}

// GET  /api/forge          anyone: current round + entries
// POST /api/forge          anyone: submit stats for a lodge (never a password)
// POST /api/forge/round    scorekeepers: open/close, mode, starter, banned words
// POST /api/forge/award    scorekeepers: 1st = 2 pts, 2nd = 1 pt onto the Cybersecurity scoreboard
// POST /api/forge/reset    scorekeepers: clear all entries and start a new round
app.http("forge", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "forge/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Shared scoreboard is not set up yet." } };
    const forge = createForge(tableStore(TableClient.fromConnectionString(conn, TABLE)));
    const action = request.params.action || "";

    try {
      let result;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        result = await forge.getState();
      } else {
        const text = await request.text();
        if (text.length > MAX_BODY) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }

        if (action === "") result = await forge.submit(body);
        else if (action === "round" || action === "reset" || action === "award") {
          if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
            return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
          }
          if (action === "round") result = await forge.setRound(body);
          else if (action === "reset") result = await forge.reset();
          else result = await forge.award(scoreboardAdapter(TableClient.fromConnectionString(conn, TABLE)));
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: result.status, headers: HEADERS, jsonBody: result.body };
    } catch (e) {
      context.error("forge failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
