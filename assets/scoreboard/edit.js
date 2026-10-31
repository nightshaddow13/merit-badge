(function () {
  var C = window.Cup, B = C.B, el = C.el, SLOTS = B.slots;
  var rows = [], data = null, dirty = false, clearArmed = false;
  var lodgeBox = document.getElementById("lodges");
  var gridBox = document.getElementById("grid");
  var levelsBox = document.getElementById("levels");
  var msg = document.getElementById("msg");
  var saveBtn = document.getElementById("save");
  var clearBtn = document.getElementById("clear");
  var reloadBtn = document.getElementById("reload");

  function say(text, kind) { msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }
  function markDirty() { dirty = true; say("Unsaved changes. Press Save scores.", ""); }
  function label(i) { return data.lodges[i] || B.entity + " " + (i + 1); }

  function build() {
    lodgeBox.textContent = "";
    for (var i = 0; i < SLOTS; i++) {
      (function (i) {
        var input = el("input", { type: "text", maxlength: "30", id: "lodge" + i, autocomplete: "off", value: data.lodges[i] });
        input.addEventListener("input", function () { data.lodges[i] = input.value; markDirty(); updateTotals(); });
        lodgeBox.appendChild(el("label", { "for": "lodge" + i }, [el("span", { text: B.entity + " " + (i + 1) + " name" }), input]));
      })(i);
    }

    if (levelsBox) {
      levelsBox.textContent = "";
      var lv = el("input", { type: "number", inputmode: "numeric", step: "1", min: "0", max: "8", id: "levelsIn", value: String(data.levels) });
      lv.addEventListener("input", function () {
        var n = parseInt(lv.value, 10);
        data.levels = isNaN(n) ? 0 : Math.max(0, Math.min(8, n));
        markDirty();
      });
      levelsBox.appendChild(el("label", { "for": "levelsIn" }, [el("span", { text: "Levels completed (0 to 8)" }), lv]));
    }

    gridBox.textContent = "";
    var head = el("tr", {}, [el("th", { scope: "col", text: "Activity" })]);
    for (var h = 0; h < SLOTS; h++) head.appendChild(el("th", { scope: "col", id: "h" + h, text: label(h) }));
    var body = el("tbody");
    rows.forEach(function (a) {
      var th = el("th", { scope: "row" }, [el("span", { "class": "an", text: a.name }), el("span", { "class": "how", text: a.how })]);
      var tr = el("tr", {}, [th]);
      for (var i = 0; i < SLOTS; i++) {
        (function (i) {
          var cur = C.cellValue(data, a.id, i);
          var input = el("input", { type: "number", inputmode: "numeric", step: "1", min: String(a.min), max: String(a.max),
            "aria-label": a.name + ", " + B.entity.toLowerCase() + " " + (i + 1), value: cur === null ? "" : String(cur) });
          input.addEventListener("input", function () {
            var row = data.scores[a.id] || (data.scores[a.id] = Array(SLOTS).fill(null));
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
    var t = C.totals(data, rows);
    for (var i = 0; i < SLOTS; i++) {
      document.getElementById("t" + i).textContent = String(t[i]);
      document.getElementById("h" + i).textContent = label(i);
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
    var payload = { lodges: data.lodges, scores: data.scores };
    if (levelsBox) payload.levels = data.levels;
    fetch("/api/scores/" + B.id, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
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
    data.scores = {}; data.levels = 0; build(); markDirty(); say("Scores cleared on this page. Press Save scores to apply.", "");
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  C.loadRows().then(function (r) { rows = r; return load(); })
    .catch(function () { say("Can't load the scorekeeper. Check your connection and reload.", "err"); });
})();
