"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createWardenLog } = require("../lib/wardenlog");
const { hasRole } = require("../lib/scores");
const { tableStore, bigStore } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const staff = (request) => {
  const h = request.headers.get("x-ms-client-principal");
  return hasRole(h, "counselor") || hasRole(h, "scorekeeper");
};
const who = (request) => {
  try { return JSON.parse(Buffer.from(request.headers.get("x-ms-client-principal"), "base64").toString("utf8")).userDetails || ""; } catch (e) { return ""; }
};

// POST /api/wardenlog                anyone: back up a Warden's log (keyed by a private device id)
// GET  /api/wardenlog/status?id=     anyone with the id: counselor sign-offs and waivers
// POST /api/wardenlog/waive          anyone with the id: ask staff to waive a requirement
// GET  /api/wardenlog/restore?id=    anyone with the recovery code: that Warden's own backup
// GET  /api/wardenlog/logs           staff: every log with its summary, sign-offs and waivers
// GET  /api/wardenlog/log?id=        staff: one full log
// POST /api/wardenlog/signoff        staff: { id, req, signed }
// POST /api/wardenlog/grant          staff: { id, req, granted } approve or revoke a waiver
// POST /api/wardenlog/delete         staff: remove one log
// POST /api/wardenlog/reset          staff: { confirm: "RESET" } remove every log
app.http("wardenlog", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "wardenlog/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const wl = createWardenLog({ logs: bigStore(client, "wardenlog"), ovr: tableStore(client, "wardenlog-ovr") });
    const action = request.params.action || "";
    const deny = { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can do that." } };
    try {
      let r;
      if (request.method === "GET") {
        const id = new URL(request.url).searchParams.get("id") || "";
        if (action === "status") r = await wl.status(id);
        else if (action === "restore") r = await wl.restore(id);
        else if (action === "logs" || action === "log") {
          if (!staff(request)) return deny;
          r = action === "logs" ? await wl.list() : await wl.get(id);
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      } else {
        const text = await request.text();
        if (text.length > 160000) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        if (action === "") r = await wl.save(body);
        else if (action === "waive") r = await wl.requestWaive(body);
        else if (["signoff", "grant", "delete", "reset"].includes(action)) {
          if (!staff(request)) return deny;
          r = action === "signoff" ? await wl.signoff(body, who(request)) : action === "grant" ? await wl.grant(body) : action === "delete" ? await wl.remove(body) : await wl.resetAll(body);
        } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("wardenlog failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
