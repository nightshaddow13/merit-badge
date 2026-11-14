"use strict";

const { padBoard } = require("./scores");

// Azure Table Storage adapter for the small stores in lib/forge.js and lib/twokey.js:
// get(rowKey) / put(rowKey, obj) / list() / remove(rowKey), all within one partition.
function tableStore(client, partition) {
  return {
    async get(rowKey) {
      try {
        const e = await client.getEntity(partition, rowKey);
        return JSON.parse(e.data);
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    async put(rowKey, obj) {
      await client.createTable(); // no-op if it already exists
      await client.upsertEntity({ partitionKey: partition, rowKey, data: JSON.stringify(obj) }, "Replace");
    },
    async list() {
      const rows = [];
      try {
        for await (const e of client.listEntities({ queryOptions: { filter: "PartitionKey eq '" + partition + "'" } })) {
          rows.push({ rowKey: e.rowKey, data: JSON.parse(e.data) });
        }
      } catch (e) {
        if (e.statusCode !== 404) throw e; // table not created yet
      }
      return rows;
    },
    async remove(rowKey) {
      try { await client.deleteEntity(partition, rowKey); } catch (e) { if (e.statusCode !== 404) throw e; }
    },
  };
}

// The Cybersecurity scoreboard lives in the same table (partition "cup").
function scoreboardAdapter(client, board, emptyData, boardId) {
  boardId = boardId || "cybersecurity";
  return {
    async load() {
      try {
        const e = await client.getEntity("cup", board.rowKey);
        const d = JSON.parse(e.data);
        d.scores = d.scores || {};
        return padBoard(boardId, d);
      } catch (e) {
        if (e.statusCode === 404) return emptyData(boardId);
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



// Larger records (a whole Field Log). One entity per record: a small `meta` property that list()
// can read cheaply, plus the full `state` JSON split across data0..dataN properties (each string
// property holds at most 32K characters). get(k) -> { meta, state }, put(k, { meta, state }),
// list() -> [{ rowKey, data: { meta } }] (state is NOT fetched), remove(k).
const CHUNK = 30000;
function bigStore(client, partition) {
  return {
    async get(rowKey) {
      try {
        const e = await client.getEntity(partition, rowKey);
        let json = "";
        for (let i = 0; i < (e.parts || 0); i++) json += e["data" + i] || "";
        return { meta: JSON.parse(e.meta), state: json ? JSON.parse(json) : null };
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    async put(rowKey, obj) {
      const json = JSON.stringify(obj.state);
      const ent = { partitionKey: partition, rowKey, meta: JSON.stringify(obj.meta), parts: Math.ceil(json.length / CHUNK) };
      for (let i = 0; i < ent.parts; i++) ent["data" + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
      await client.createTable();
      await client.upsertEntity(ent, "Replace");
    },
    async list() {
      const rows = [];
      try {
        for await (const e of client.listEntities({ queryOptions: { filter: "PartitionKey eq '" + partition + "'", select: ["RowKey", "meta"] } })) {
          rows.push({ rowKey: e.rowKey, data: { meta: JSON.parse(e.meta) } });
        }
      } catch (e) {
        if (e.statusCode !== 404) throw e;
      }
      return rows;
    },
    async remove(rowKey) {
      try { await client.deleteEntity(partition, rowKey); } catch (e) { if (e.statusCode !== 404) throw e; }
    },
  };
}
module.exports = { tableStore, scoreboardAdapter, bigStore };
