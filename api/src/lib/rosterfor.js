"use strict";

// Builds the roster for one badge ("cy" or "ai") from the shared table client. Used by the roster API and by the log APIs
// so they all agree on who a student is.
const { createRoster } = require("./roster");
const { emptyData } = require("./scores");
const { BOARDS } = require("./boards");
const { tableStore, scoreboardAdapter } = require("./tablestore");

const BADGES = { cy: "cybersecurity", ai: "ai" }; // roster badge -> scoreboard id

function rosterFor(client, badge) {
  const boardId = BADGES[badge];
  if (!boardId) return null;
  return createRoster({
    students: tableStore(client, "students-" + badge),
    tries: tableStore(client, "logintries-" + badge),
    board: scoreboardAdapter(client, BOARDS[boardId], emptyData, boardId),
  });
}

module.exports = { rosterFor, BADGES };
