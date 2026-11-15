"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createAiflow } = require("../lib/aiflow");
const { hasRole } = require("../lib/scores");
const { tableStore } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};

// GET  /api/aiflow          anyone: what every Field Log should show right now (Field Logs poll this)
// POST /api/aiflow/control  staff: { mode?: "free"|"page"|"hold"|"board", page?, message? }
app.http("aiflow", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "aiflow/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, "cup");
    const flow = createAiflow(tableStore(client, "aiflow"));
    const action = request.params.action || "";
    try {
      let r;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await flow.state();
      } else {
        if (action !== "control") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        if (!staff(request)) return { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
        const text = await request.text();
        if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        r = await flow.control(body);
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("aiflow failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
