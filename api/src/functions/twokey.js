"use strict";

const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { createTwoKey } = require("../lib/twokey");
const { hasRole, emptyData } = require("../lib/scores");
const { BOARDS } = require("../lib/boards");
const { tableStore, scoreboardAdapter } = require("../lib/tablestore");

const TABLE = "cup";
const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

const SECRET_RE = /^[A-Z2-7]{16,64}$/;

// Secrets come from the TWOKEY_SECRETS app setting, or from the table (set by a scorekeeper on the check page).
async function loadSecrets(store) {
  const key = Object.keys(process.env).find((k) => k.trim().toUpperCase() === "TWOKEY_SECRETS");
  const fromEnv = (key ? process.env[key] : "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (fromEnv.length >= 6) return fromEnv;
  const row = await store.get("secrets");
  return row && Array.isArray(row.secrets) ? row.secrets : [];
}

// GET  /api/twokey          anyone: the scorecard
// POST /api/twokey/check    anyone: { lodge, code }  verified here; a valid code is recorded and
//                           a lodge completes at 2 (wrong guesses are rate limited per lodge)
// POST /api/twokey/secrets  scorekeepers: { secrets: [6-7 base32 strings] } stored on the server, never sent back
// POST /api/twokey/apply    scorekeepers: write the current points onto the Cup scoreboard (also automatic)
// POST /api/twokey/reset    scorekeepers: clear the scorecard and its points on the Cup scoreboard
// The lodge secrets live in the TWOKEY_SECRETS app setting (comma separated, Lodge 1 first).
app.http("twokey", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "twokey/{action?}",
  handler: async (request, context) => {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn) return { status: 503, headers: HEADERS, jsonBody: { error: "Shared scoreboard is not set up yet." } };
    const client = TableClient.fromConnectionString(conn, TABLE);
    const store = tableStore(client, "twokey");
    const tk = createTwoKey(store);
    const sb = scoreboardAdapter(client, BOARDS.cybersecurity, emptyData);
    const action = request.params.action || "";
    try {
      let result;
      if (request.method === "GET") {
        if (action) return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
        result = await tk.getState();
        result.body.configured = (await loadSecrets(store)).length >= 6;
      } else if (action === "check") {
        const text = await request.text();
        if (text.length > 1024) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        const secrets = await loadSecrets(store);
        if (secrets.length < 6) return { status: 503, headers: HEADERS, jsonBody: { error: "Code check is not set up yet. A scorekeeper can set it up on this page." } };
        result = await tk.check(body, secrets, sb);
      } else if (action === "secrets") {
        if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
          return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
        }
        const text = await request.text();
        if (text.length > 2048) return { status: 413, headers: HEADERS, jsonBody: { error: "Too large." } };
        let body;
        try { body = JSON.parse(text); } catch (e) { return { status: 400, headers: HEADERS, jsonBody: { error: "Send valid JSON." } }; }
        const list = body && Array.isArray(body.secrets) ? body.secrets.map((x) => String(x).toUpperCase().replace(/\s+/g, "")) : [];
        if (list.length < 6 || list.length > 7 || !list.every((x) => SECRET_RE.test(x))) {
          return { status: 400, headers: HEADERS, jsonBody: { error: "Paste 6 or 7 secrets (letters A-Z and digits 2-7), one per lodge in order." } };
        }
        await store.put("secrets", { secrets: list });
        result = { status: 200, body: { configured: true } };
      } else if (action === "reset" || action === "apply") {
        if (!hasRole(request.headers.get("x-ms-client-principal"), "scorekeeper")) {
          return { status: 403, headers: HEADERS, jsonBody: { error: "Only scorekeepers can do that." } };
        }
        result = action === "reset" ? await tk.reset(sb) : await tk.apply(sb);
      } else return { status: 404, headers: HEADERS, jsonBody: { error: "Not found." } };
      return { status: result.status, headers: HEADERS, jsonBody: result.body };
    } catch (e) {
      context.error("twokey failed", e);
      return { status: 500, headers: HEADERS, jsonBody: { error: "Could not reach score storage." } };
    }
  },
});
