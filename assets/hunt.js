// Scavenger hunt engine. Answers are never stored in the page: each lock keeps only a salted
// SHA-256 of the right word, and the final reward is encrypted with a key made from all the answers.
(function () {
  "use strict";
  function sha256(msg){var K=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  var H=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
  var l=msg.length,bl=l*8,nl=((l+9+63)>>6)<<6,b=new Uint8Array(nl);b.set(msg);b[l]=128;var dv=new DataView(b.buffer);dv.setUint32(nl-8,Math.floor(bl/4294967296));dv.setUint32(nl-4,bl>>>0);
  var w=new Uint32Array(64);function r(x,n){return(x>>>n)|(x<<(32-n))}
  for(var o=0;o<nl;o+=64){for(var i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(i=16;i<64;i++){var s0=r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3),s1=r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}
  var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
  for(i=0;i<64;i++){var S1=r(e,6)^r(e,11)^r(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])>>>0,S0=r(a,2)^r(a,13)^r(a,22),mj=(a&bb)^(a&c)^(bb&c),t2=(S0+mj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=bb;bb=a;a=(t1+t2)>>>0}
  H[0]=(H[0]+a)>>>0;H[1]=(H[1]+bb)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0}
  return H.map(function(x){return('00000000'+x.toString(16)).slice(-8)}).join('')}
  
  function hx(s) { return sha256(new TextEncoder().encode(s)); }
  var norm = function (s) { return String(s).trim().toLowerCase(); };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function store(id, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem("hunt:" + id) || "{}");
      localStorage.setItem("hunt:" + id, JSON.stringify(val));
    } catch (e) { return val === undefined ? {} : undefined; }
  }

  // cfg: { id, salt, root, locks:[{title, riddle, hint1, hint2, hash}], cipher, rewardId }
  function init(cfg) {
    var root = document.getElementById(cfg.root), open = store(cfg.id), words = [];
    function lockHash(i, w) { return hx(cfg.salt + "|" + (i + 1) + "|" + w); }

    function reward() {
      var w = cfg.locks.map(function (_, i) { return open[i]; });
      if (w.some(function (x) { return !x; })) return;
      var key = hx(cfg.salt + "|final|" + w.join("|")), out = "";
      for (var i = 0; i < cfg.cipher.length; i += 2) {
        var b = parseInt(cfg.cipher.substr(i, 2), 16) ^ parseInt(key.substr(i, 2), 16);
        out += String.fromCharCode(b);
      }
      var box = document.getElementById(cfg.rewardId);
      box.querySelector(".phrase").textContent = out;
      box.hidden = false;
      mailStep(box, out);
    }

    // Last step: the Scout emails the phrase to the leader. The address is not written out in the
    // page source; it is only assembled here once the hunt is finished.
    function mailStep(box, phrase) {
      if (!cfg.mail || box.querySelector(".mailbox")) return;
      var to = atob(cfg.mail);
      var name = el("input", { type: "text", id: cfg.id + "-name", maxlength: "40", autocomplete: "off" });
      var send = el("a", { "class": "btn", href: "#", text: "Email my code" });
      var pre = el("pre", { "class": "mailtext" });
      function build() {
        var who = name.value.trim() || "(your name)";
        var subject = cfg.hunt + " complete: " + who;
        var body = "Hunt: " + cfg.hunt + "\nSecret phrase: " + phrase + "\nScout: " + who + "\n\nSent from the Merit Badge Field Kit.";
        send.href = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        pre.textContent = "To: " + to + "\nSubject: " + subject + "\n\n" + body;
      }
      name.addEventListener("input", build); build();
      var box2 = el("div", { "class": "mailbox" }, [
        el("h3", { text: "Last step: send your code" }),
        el("p", { text: "Email your secret phrase to your leader so he knows you finished. Ask a parent or leader before you send an email." }),
        el("label", { "for": name.id, text: "Your name" }), name,
        el("p", {}, [send]),
        (function () { var d = el("details", {}, [el("summary", { text: "My email app did not open" }), el("p", { text: "Copy this into a new email yourself:" }), pre]); return d; })()
      ]);
      box.appendChild(box2);
    }

    cfg.locks.forEach(function (L, i) {
      var good = open[i] && lockHash(i, open[i]) === L.hash;
      if (!good) delete open[i];
      var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
      var input = el("input", { type: "text", id: cfg.id + "-in" + i, autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      var go = el("button", { type: "submit", "class": "btn", text: "Try it" });
      var h1 = el("p", { "class": "hint", hidden: "" }), h2 = el("p", { "class": "hint", hidden: "" });
      h1.textContent = "Hint: " + L.hint1; h2.textContent = "Bigger hint: " + L.hint2;
      var b1 = el("button", { type: "button", "class": "btn ghost", text: "Give me a hint" });
      var b2 = el("button", { type: "button", "class": "btn ghost", text: "I need a bigger hint", hidden: "" });
      b1.addEventListener("click", function () { h1.hidden = false; b1.hidden = true; b2.hidden = false; });
      b2.addEventListener("click", function () { h2.hidden = false; b2.hidden = true; });
      var form = el("form", { "class": "lock", autocomplete: "off" }, [
        el("h3", { text: "Lock " + (i + 1) + ": " + L.title }),
        el("p", { text: L.riddle }),
        el("label", { "for": input.id, text: "The rune-word" }),
        el("div", { "class": "lockrow" }, [input, go]),
        el("div", { "class": "hintrow" }, [b1, b2]), h1, h2, msg
      ]);
      function unlock(w, quiet) {
        open[i] = w; store(cfg.id, open);
        form.classList.add("is-open"); input.value = w; input.disabled = true; go.disabled = true; b1.hidden = b2.hidden = true;
        msg.className = "msg ok"; msg.textContent = "Lock " + (i + 1) + " is open." + (L.after ? " " + L.after : "");
        reward();
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var w = norm(input.value);
        if (!w) { msg.className = "msg err"; msg.textContent = "Type the rune-word first."; return; }
        if (lockHash(i, w) === L.hash) unlock(w);
        else { msg.className = "msg err"; msg.textContent = "Not that one. Check your spelling, or ask for a hint."; }
      });
      root.appendChild(form);
      if (good) unlock(open[i], true);
    });
    reward();

    // Start over: clears the saved progress on this device (handy on a shared computer).
    var rst = el("button", { type: "button", "class": "btn ghost", text: "Start over" });
    var armed = false, timer = null;
    rst.addEventListener("click", function () {
      if (!armed) {
        armed = true; rst.textContent = "Clear all locks on this device? Press again";
        timer = setTimeout(function () { armed = false; rst.textContent = "Start over"; }, 5000);
        return;
      }
      clearTimeout(timer);
      try { localStorage.removeItem("hunt:" + cfg.id); } catch (e) {}
      location.reload();
    });
    root.parentNode.insertBefore(el("p", { "class": "resetrow" }, [rst]), root.nextSibling);
  }
  window.Hunt = { init: init, hx: hx };
})();
