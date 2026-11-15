"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createRoster } = require("../lib/roster");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const BADGES = { cy: "cybersecurity", ai: "ai" }; // roster badge -> scoreboard id

function build(badge) {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  const boardId = BADGES[badge];
  if (!conn || !boardId) return null;
  const client = TableClient.fromConnectionString(conn, TABLE);
  return createRoster({
    students: tableStore(client, "students-" + badge),
    tries: tableStore(client, "logintries-" + badge),
    board: scoreboardAdapter(client, BOARDS[boardId], emptyData, boardId),
  });
}

// GET  /api/roster/{cy|ai}                    staff: teams and students (with their passwords)
// POST /api/roster/{cy|ai}/team-add           staff: { name }
// POST /api/roster/{cy|ai}/team-rename        staff: { slot, name }
// POST /api/roster/{cy|ai}/team-remove        staff: { slot, confirm: true }
// POST /api/roster/{cy|ai}/add                staff: { names, slot }  add students, each gets a password
// POST /api/roster/{cy|ai}/update             staff: { id, name?, slot?, resetPassword? }
// POST /api/roster/{cy|ai}/remove             staff: { id, confirm: true }
app.http("roster", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "roster/{badge}/{action?}",
  handler: async (request, context) => {
    const h = request.headers.get("x-ms-client-principal");
    if (!(hasRole(h, "counselor") || hasRole(h, "scorekeeper"))) return { status: 403, headers: HEADERS, jsonBody: { error: "Only counselors and scorekeepers can manage students." } };
    if (!BADGES[request.params.badge]) return { status: 404, headers: HEADERS, jsonBody: { error: "Unknown badge." } };
    const ro = build(request.params.badge);
    if (!ro) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    const action = request.params.action || "";
    try {
      let r;
      if (request.method === "GET") {
        if (action !== "") return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await ro.list();
      } else {
        const text = await request.text();
        if (text.length > 20000) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        const ops = { "team-add": ro.addTeam, "team-rename": ro.renameTeam, "team-remove": ro.removeTeam, add: ro.addStudents, update: ro.updateStudent, remove: ro.removeStudent };
        if (!ops[action]) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        r = await ops[action](body);
      }
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("roster failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});

// POST /api/login/{cy|ai}   anyone: { password } -> { id, name, slot, team }
app.http("login", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "login/{badge}",
  handler: async (request, context) => {
    if (!BADGES[request.params.badge]) return { status: 404, headers: HEADERS, jsonBody: { error: "Unknown badge." } };
    const ro = build(request.params.badge);
    if (!ro) return { status: 503, headers: HEADERS, jsonBody: { error: "Storage is not set up yet." } };
    try {
      const text = await request.text();
      if (text.length > 200) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
      let body;
      try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
      const r = await ro.login(body);
      return { status: r.status, headers: HEADERS, jsonBody: r.body };
    } catch (e) {
      context.error("login failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach storage." } };
    }
  },
});
