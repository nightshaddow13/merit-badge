(function () {
  var C = window.Cup, el = C.el, SLOTS = C.SLOTS;
  var acts = [], data = null, dirty = false, clearArmed = false;
  var lodgeBox = document.getElementById("lodges");
  var gridBox = document.getElementById("grid");
  var msg = document.getElementById("msg");
  var saveBtn = document.getElementById("save");
  var clearBtn = document.getElementById("clear");
  var reloadBtn = document.getElementById("reload");

  function say(text, kind) { msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }
  function markDirty() { dirty = true; say("Unsaved changes. Press Save scores.", ""); }

  function build() {
    lodgeBox.textContent = "";
    for (var i = 0; i < SLOTS; i++) {
      (function (i) {
        var input = el("input", { type: "text", maxlength: "30", id: "lodge" + i, autocomplete: "off", value: data.lodges[i] });
        input.addEventListener("input", function () { data.lodges[i] = input.value; markDirty(); updateTotals(); });
        lodgeBox.appendChild(el("label", { "for": "lodge" + i }, [el("span", { text: "Lodge " + (i + 1) + " name" }), input]));
      })(i);
    }

    gridBox.textContent = "";
    var head = el("tr", {}, [el("th", { scope: "col", text: "Activity" })]);
    for (var h = 0; h < SLOTS; h++) head.appendChild(el("th", { scope: "col", id: "h" + h, text: data.lodges[h] || "Lodge " + (h + 1) }));
    var body = el("tbody");
    acts.forEach(function (a) {
      var th = el("th", { scope: "row" }, [el("span", { "class": "an", text: a.name }), el("span", { "class": "how", text: a.how })]);
      var tr = el("tr", {}, [th]);
      for (var i = 0; i < SLOTS; i++) {
        (function (i) {
          var cur = C.cellValue(data, a.id, i);
          var input = el("input", { type: "number", inputmode: "numeric", step: "1", min: "-50", max: "100",
            "aria-label": a.name + ", lodge " + (i + 1), value: cur === null ? "" : String(cur) });
          input.addEventListener("input", function () {
            var row = data.scores[a.id] || (data.scores[a.id] = [null, null, null, null, null, null]);
            row[i] = input.value === "" ? null : parseInt(input.value, 10);
            markDirty(); updateTotals();
          });
          tr.appendChild(el("td", {}, [input]));
        })(i);
      }
      body.appendChild(tr);
    });
    var totalRow = el("tr", { "class": "total-row" }, [el("th", { scope: "row", text: "Total" })]);
    for (var t = 0; t < SLOTS; t++) totalRow.appendChild(el("td", { id: "t" + t, text: "0" }));
    body.appendChild(totalRow);
    gridBox.appendChild(el("div", { "class": "tablewrap edit", tabindex: "0", role: "region", "aria-label": "Score entry" }, [
      el("table", { "class": "grid" }, [el("thead", {}, [head]), body])
    ]));
    updateTotals();
  }

  function updateTotals() {
    var t = C.totals(data, acts);
    for (var i = 0; i < SLOTS; i++) {
      document.getElementById("t" + i).textContent = String(t[i]);
      document.getElementById("h" + i).textContent = data.lodges[i] || "Lodge " + (i + 1);
    }
  }

  function load() {
    return C.loadScores().then(function (d) {
      data = d; dirty = false; build();
      if (d.source !== "live") say("Live storage is not connected, so scores can't be saved yet. See the setup steps in the README.", "err");
      else say(d.updated ? "Loaded. Last saved " + C.timeText(d.updated) + "." : "Loaded. No scores saved yet.", "ok");
    });
  }

  function save() {
    saveBtn.disabled = true; say("Saving…", "");
    fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lodges: data.lodges, scores: data.scores }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body && res.body.error ? res.body.error : "Save failed (" + res.status + ").");
        dirty = false; say("Saved at " + C.timeText(res.body.updated) + ". The scoreboard updates within 10 seconds.", "ok");
      })
      .catch(function (e) { say(e.message + " Your entries are still on this page. Try Save again.", "err"); })
      .then(function () { saveBtn.disabled = false; });
  }

  saveBtn.addEventListener("click", save);
  reloadBtn.addEventListener("click", function () {
    if (dirty && !reloadBtn.dataset.armed) { reloadBtn.dataset.armed = "1"; reloadBtn.textContent = "Discard changes and reload?"; return; }
    delete reloadBtn.dataset.armed; reloadBtn.textContent = "Reload from server"; load();
  });
  clearBtn.addEventListener("click", function () {
    if (!clearArmed) { clearArmed = true; clearBtn.textContent = "Clear all scores? Press again"; return; }
    clearArmed = false; clearBtn.textContent = "Clear all scores";
    data.scores = {}; build(); markDirty(); say("Scores cleared on this page. Press Save scores to apply.", "");
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  C.loadActivities().then(function (a) { acts = a; return load(); })
    .catch(function () { say("Can't load the scorekeeper. Check your connection and reload.", "err"); });
})();
