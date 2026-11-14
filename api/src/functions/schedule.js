"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createSchedule } = require("../lib/schedule");
const { hasRole } = require("../lib/scores");
const { tableStore } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const who = (request) => {
  try { return JSON.parse(Buffer.from(request.headers.get("x-ms-client-principal"), "base64").toString("utf8")).userDetails || ""; } catch (e) { return ""; }
};

// GET  /api/schedule        anyone: which badges are active, class times and open windows (plus the server clock)
// POST /api/schedule        staff: { badges: { cy: {...}, ai: {...} } } save the schedule
// POST /api/schedule/reset  staff: go back to the built-in defaults
app.http("schedule", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "schedule/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    // Not set up yet: the site keeps working on its built-in schedule.
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const sch = createSchedule(tableStore(client, "schedule"));
    const action = request.params.action || "";
    const h = request.headers.get("x-ms-client-principal");
    const staff = hasRole(h, "counselor") || hasRole(h, "scorekeeper");
    try {
      let r;
      if (request.method === "GET") {
        if (action !== "") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await sch.get();
      } else {
        if (!staff) return { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can change the schedule." } };
        if (action === "reset") r = await sch.reset(who(request));
        else if (action === "") {
          const text = await request.text();
          if (text.length > 4096) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
          let body;
          try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
          r = await sch.save(body, who(request));
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("schedule failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
