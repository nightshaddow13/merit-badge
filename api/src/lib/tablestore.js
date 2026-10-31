"use strict";

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
function scoreboardAdapter(client, board, emptyData) {
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

module.exports = { tableStore, scoreboardAdapter };
