"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { emptyData, hasRole, validate } = require("../lib/scores");

const TABLE = "cup";
const PARTITION = "cup";
const ROW = "current";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function table() {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  return TableClient.fromConnectionString(conn, TABLE);
}

app.http("scores", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "scores",
  handler: async (request, context) => {
    const client = table();
    if (!client) {
      return { status: 503, headers: HEADERS, jsonBody: { error: "Score storage is not set up yet." } };
    }

    try {
      if (request.method === "GET") {
        try {
          const entity = await client.getEntity(PARTITION, ROW);
          return { status: 200, headers: HEADERS, body: entity.data };
        } catch (e) {
          if (e.statusCode === 404) return { status: 200, headers: HEADERS, jsonBody: emptyData() };
          throw e;
        }
      }

      // POST: only scorekeepers. The route rule in staticwebapp.config.json
      // enforces this too; this check keeps the API safe if that rule changes.
      if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
        return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can save scores." } };
      }
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } };
      }
      const result = validate(body);
      if (!result.ok) return { status: 400, headers: HEADERS, jsonBody: { error: result.error } };

      const saved = Object.assign({}, result.value, { updated: new Date().toISOString() });
      await client.createTable(); // no-op if it already exists
      await client.upsertEntity({ partitionKey: PARTITION, rowKey: ROW, data: JSON.stringify(saved) }, "Replace");
      return { status: 200, headers: HEADERS, jsonBody: saved };
    } catch (e) {
      context.error("scores failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
