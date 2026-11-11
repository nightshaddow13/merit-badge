"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createFieldLog } = require("../lib/fieldlog");
const { hasRole } = require("../lib/scores");
const { tableStore, bigStore } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};

// POST /api/fieldlog                 anyone: back up a Scout's Field Log (keyed by a private device id)
// GET  /api/fieldlog/override?id=    anyone with the id: which level pages staff have waived
// POST /api/fieldlog/override        anyone: ask staff to waive a level page
// GET  /api/fieldlog/restore?id=    anyone with the recovery code: get that Scout's own backup
// GET  /api/fieldlog/logs            staff: list every backed-up log with its summary
// GET  /api/fieldlog/log?id=         staff: one full log
// POST /api/fieldlog/grant           staff: { id, level, granted } waive or restore a page's requirements
// POST /api/fieldlog/delete          staff: remove one log
app.http("fieldlog", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "fieldlog/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const fl = createFieldLog({ logs: bigStore(client, "fieldlog"), ovr: tableStore(client, "fieldlog-ovr") });
    const action = request.params.action || "";
    const deny = { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
    try {
      let r;
      if (request.method === "GET") {
        const id = new URL(request.url).searchParams.get("id") || "";
        if (action === "override") r = await fl.overrideStatus(id);
        else if (action === "restore") r = await fl.restore(id);
        else if (action === "logs" || action === "log") {
          if (!staff(request)) return deny;
          r = action === "logs" ? await fl.list() : await fl.get(id);
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      } else {
        const text = await request.text();
        if (text.length > 160000) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        if (action === "") r = await fl.save(body);
        else if (action === "override") r = await fl.requestOverride(body);
        else if (action === "grant" || action === "delete") {
          if (!staff(request)) return deny;
          r = action === "grant" ? await fl.grant(body) : await fl.remove(body);
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("fieldlog failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
