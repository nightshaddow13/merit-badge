"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createHvMatch } = require("../lib/hvmatch");
const { tableStore } = require("../lib/tablestore");

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

// Human vs. Machine head-to-head (public; a match is a short code plus each Scout's private device id).
// GET  /api/hvmatch?code=&id=   current state of a match you are in
// POST /api/hvmatch/create | join | ready | result
app.http("hvmatch", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "hvmatch/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const hv = createHvMatch(tableStore(TableClient.fromConnectionString(conn, "cup"), "hvmatch"));
    const action = request.params.action || "";
    try {
      let r;
      if (request.method === "GET") {
        const q = new URL(request.url).searchParams;
        r = await hv.get(q.get("code") || "", q.get("id") || "");
      } else {
        const text = await request.text();
        if (text.length > 2000) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        if (!["create", "join", "ready", "result"].includes(action)) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await hv[action](body);
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("hvmatch failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
