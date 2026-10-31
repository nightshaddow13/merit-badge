(function () {
  var C = window.Cup, B = C.B, el = C.el;
  var rows = [];
  var board = document.getElementById("board");
  var detail = document.getElementById("detail");
  var status = document.getElementById("status");
  var code = document.getElementById("code");

  function render(data) {
    var list = C.standings(data, rows);
    board.textContent = "";
    detail.textContent = "";

    if (code) {
      code.textContent = "";
      code.appendChild(el("p", { "class": "code-line", "aria-label": "Access code: " + data.levels + " of 8 letters unlocked", text: "Access code  " + C.accessCode(data.levels) }));
      code.appendChild(el("p", { "class": "code-sub", text: "Mission " + data.levels + " of 8 complete" }));
    }

    if (!list.length) {
      board.appendChild(el("p", { "class": "empty", text: "No scores yet. Standings appear here when class starts." }));
    } else {
      var top = Math.max(1, list[0].total);
      var ol = el("ol", { "class": "standings" });
      list.forEach(function (r, i) {
        var bar = el("span", { "class": "bar", "aria-hidden": "true" });
        bar.style.width = Math.max(0, Math.round((r.total / top) * 100)) + "%";
        ol.appendChild(el("li", { "class": "stand" + (i === 0 ? " lead-row" : "") }, [
          el("span", { "class": "place", text: C.ORD[i] || (i + 1) + "th" }),
          el("span", { "class": "lname", text: r.name }),
          el("span", { "class": "pts", text: String(r.total) }),
          bar
        ]));
      });
      board.appendChild(ol);

      var named = list.slice().sort(function (a, b) { return a.idx - b.idx; });
      var thead = el("tr", {}, [el("th", { scope: "col", text: "Activity" })].concat(
        named.map(function (r) { return el("th", { scope: "col", text: r.name }); })));
      var tbody = el("tbody");
      rows.forEach(function (a) {
        var any = named.some(function (r) { return C.cellValue(data, a.id, r.idx) !== null; });
        if (!any) return;
        tbody.appendChild(el("tr", {}, [el("th", { scope: "row", text: a.name })].concat(
          named.map(function (r) {
            var v = C.cellValue(data, a.id, r.idx);
            return el("td", { text: v === null ? "–" : String(v) });
          }))));
      });
      if (tbody.children.length) {
        tbody.appendChild(el("tr", { "class": "total-row" }, [el("th", { scope: "row", text: "Total" })].concat(
          named.map(function (r) { return el("td", { text: String(r.total) }); }))));
        detail.appendChild(el("h2", { text: B.unit === "XP" ? "XP by activity" : "Points by activity" }));
        detail.appendChild(el("div", { "class": "tablewrap", tabindex: "0", role: "region", "aria-label": "Scores by activity" }, [
          el("table", { "class": "grid" }, [el("thead", {}, [thead]), tbody])
        ]));
      }
    }

    var when = C.timeText(data.updated);
    status.textContent = data.source === "live"
      ? "Live. " + (when ? "Last updated " + when + "." : "Waiting for the first score.") + " This page refreshes on its own."
      : "Showing the saved snapshot. Live scores are not connected yet.";
  }

  function tick() {
    C.loadScores().then(render).catch(function () {
      status.textContent = "Can't load scores right now. Trying again.";
    });
  }

  // The Edit button only appears for signed-in scorekeepers.
  C.isScorekeeper().then(function (yes) {
    var link = document.getElementById("editlink");
    if (yes && link) link.hidden = false;
  });

  C.loadRows().then(function (r) {
    rows = r;
    tick();
    setInterval(function () { if (!document.hidden) tick(); }, 10000);
  }).catch(function () {
    status.textContent = "Can't load the scoreboard. Check your connection and reload.";
  });
})();
