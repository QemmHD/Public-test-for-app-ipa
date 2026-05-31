/* NutriCheck — ingredient scanner. Pure front-end app for Capacitor/WKWebView. */
(function () {
  "use strict";

  var DATA = window.CB_DATA;
  var OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";
  var ZXING_URL = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
  var TESS_URL = "https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js";

  /* ---------------------------------------------------------------- state */
  var state = {
    view: "home",
    prev: "home",
    product: null,     // current graded product
    ingredient: null,  // current ingredient detail
    ingTab: "what",
    history: [],
    profile: {},       // {gluten:true, dairy:true, ...}
    busy: false,
    statusMsg: ""
  };

  var app;

  /* ------------------------------------------------------------- storage */
  function loadLocal() {
    try { state.history = JSON.parse(localStorage.getItem("cb_history") || "[]"); } catch (e) { state.history = []; }
    try { state.profile = JSON.parse(localStorage.getItem("cb_profile") || "{}"); } catch (e) { state.profile = {}; }
  }
  function saveHistory() { try { localStorage.setItem("cb_history", JSON.stringify(state.history.slice(0, 100))); } catch (e) {} }
  function saveProfile() { try { localStorage.setItem("cb_profile", JSON.stringify(state.profile)); } catch (e) {} }

  // IndexedDB for photos (larger than localStorage allows).
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open("cleanbite", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("photos"); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function savePhoto(key, dataUrl) {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction("photos", "readwrite");
        tx.objectStore("photos").put(dataUrl, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { res(); };
      });
    }).catch(function () {});
  }
  function getPhoto(key) {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction("photos", "readonly");
        var rq = tx.objectStore("photos").get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s || "").toLowerCase()
      .replace(/\([^)]*\)/g, " ")          // drop parenthetical notes
      .replace(/\d+(\.\d+)?\s*%/g, " ")     // drop percentages
      .replace(/[^a-z0-9&'\- ]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function loadScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url; s.onload = res; s.onerror = function () { rej(new Error("load " + url)); };
      document.head.appendChild(s);
    });
  }

  /* ------------------------------------------------- ingredient parsing */
  function parseIngredients(text) {
    if (!text) return [];
    var cleaned = text
      .replace(/ingredients?:?/i, " ")
      .replace(/contains( 2% or less of| less than 2% of)?:?/ig, ",")
      .replace(/[\[\]{}]/g, ",")
      .replace(/\band\b/gi, ",");
    var parts = cleaned.split(/[,;.]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].replace(/\([^)]*\)/g, "").trim();
      if (!raw) continue;
      var n = norm(raw);
      if (!n || n.length < 2) continue;
      if (out.length && out[out.length - 1].norm === n) continue;
      out.push({ raw: raw.replace(/\s+/g, " ").trim(), norm: n });
      if (out.length > 80) break;
    }
    return out;
  }

  function findAdditive(n) {
    for (var i = 0; i < DATA.additives.length; i++) {
      var a = DATA.additives[i];
      for (var j = 0; j < a.names.length; j++) {
        var name = a.names[j];
        if (n === name || n.indexOf(name) !== -1) return a;
      }
    }
    return null;
  }
  function listHit(list, n) {
    for (var i = 0; i < list.length; i++) {
      if (n === list[i] || n.indexOf(list[i]) !== -1) return list[i];
    }
    return null;
  }

  function findENumberByName(n) {
    for (var i = 0; i < DATA.eNumbers.length; i++) {
      var nm = norm(DATA.eNumbers[i][1]);
      if (nm && nm.length >= 4 && (n === nm || n.indexOf(nm) !== -1)) {
        return { code: DATA.eNumbers[i][0], name: DATA.eNumbers[i][1], risk: DATA.eNumbers[i][2] };
      }
    }
    return null;
  }
  function findENumberByCode(raw) {
    var m = String(raw || "").match(/\be ?(\d{3,4}[a-z]?)\b/);
    if (!m) return null;
    var code = "e" + m[1];
    for (var i = 0; i < DATA.eNumbers.length; i++) {
      if (DATA.eNumbers[i][0].toLowerCase() === code) {
        return { code: DATA.eNumbers[i][0], name: DATA.eNumbers[i][1], risk: DATA.eNumbers[i][2] };
      }
    }
    return { code: "E" + m[1].toUpperCase(), name: "Additive E" + m[1].toUpperCase(), risk: "caution" };
  }

  // Classify a single ingredient -> {status, reason, additive}
  function classify(n, raw) {
    var a = findAdditive(n);
    if (a) return { status: a.risk, reason: a.summary, additive: a };
    if (listHit(DATA.artificialSweeteners, n)) return { status: "caution", reason: "Artificial sweetener" };
    if (listHit(DATA.seedOils, n)) return { status: "caution", reason: "Industrial seed/vegetable oil" };
    if (listHit(DATA.vagueTerms, n)) return { status: "caution", reason: "Vague / undisclosed ingredient" };
    var en = findENumberByName(n) || findENumberByCode(raw);
    if (en) return { status: en.risk, reason: en.name + (en.code ? " (" + en.code + ")" : "") };
    if (listHit(DATA.addedSugars, n)) return { status: "limit", reason: "Added sugar" };
    if (listHit(DATA.cleanIngredients, n)) return { status: "good", reason: "Recognized whole-food ingredient" };
    if (/\be ?\d{3,4}[a-z]?\b/.test(String(raw || ""))) return { status: "caution", reason: "Unrecognized additive (E-number)" };
    return { status: "unknown", reason: "Not in database yet" };
  }

  var STATUS_RANK = { avoid: 4, caution: 3, limit: 2, unknown: 1, good: 0 };
  var STATUS_LABEL = { avoid: "Avoid", caution: "Caution", limit: "Limit", unknown: "Unknown", good: "Clean" };

  function analyze(off, ingredientsText) {
    var items = parseIngredients(ingredientsText);
    var classified = items.map(function (it) {
      var c = classify(it.norm, (it.raw || "").toLowerCase());
      return { raw: it.raw, norm: it.norm, status: c.status, reason: c.reason, additive: c.additive || null };
    });

    var score = 100, neg = [], good = [];
    classified.forEach(function (c) {
      if (c.status === "avoid") { score -= 22; neg.push(c); }
      else if (c.status === "caution") { score -= 10; neg.push(c); }
      else if (c.status === "limit") { score -= 4; neg.push(c); }
      else if (c.status === "good") { good.push(c); }
    });

    if (off) {
      if (off.nova_group === 4) score -= 8;
      var ns = String(off.nutriscore_grade || "").toLowerCase();
      if (ns === "e") score -= 12; else if (ns === "d") score -= 7; else if (ns === "a") score += 5;
      var sugars = off.nutriments && off.nutriments.sugars_100g;
      if (typeof sugars === "number" && sugars >= 22.5) score -= 5;
      var sodium = off.nutriments && off.nutriments.salt_100g;
      if (typeof sodium === "number" && sodium >= 1.5) score -= 5;
    }

    var hasAvoid = classified.some(function (c) { return c.status === "avoid"; });
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (hasAvoid && score >= 50) score = 49;

    var badge;
    if (hasAvoid || score < 50) badge = { label: "Avoid", cls: "bad" };
    else if (score < 75) badge = { label: "Poor", cls: "mid" };
    else badge = { label: "Approved", cls: "good" };

    neg.sort(function (a, b) { return STATUS_RANK[b.status] - STATUS_RANK[a.status]; });
    return { classified: classified, score: score, badge: badge, negatives: neg, positives: good };
  }

  function personalAlerts(classified) {
    var alerts = [];
    Object.keys(state.profile).forEach(function (key) {
      if (!state.profile[key]) return;
      var kws = DATA.allergenMap[key]; if (!kws) return;
      var hits = [];
      classified.forEach(function (c) {
        for (var i = 0; i < kws.length; i++) {
          if (c.norm.indexOf(kws[i]) !== -1) { hits.push(c.raw); break; }
        }
      });
      if (hits.length) alerts.push({ key: key, hits: hits.slice(0, 4) });
    });
    return alerts;
  }

  /* -------------------------------------------------- Open Food Facts */
  function lookupBarcode(code) {
    var url = OFF_BASE + encodeURIComponent(code) +
      ".json?fields=product_name,brands,image_front_url,ingredients_text,ingredients_text_en,additives_tags,nova_group,nutriscore_grade,nutriments,allergens_tags";
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.status !== 1 || !j.product) return null;
        var p = j.product;
        return {
          barcode: code,
          name: p.product_name || "Unknown product",
          brand: p.brands || "",
          image: p.image_front_url || "",
          ingredientsText: p.ingredients_text_en || p.ingredients_text || "",
          nova_group: p.nova_group,
          nutriscore_grade: p.nutriscore_grade,
          nutriments: p.nutriments || {}
        };
      });
  }

  function buildProduct(off, ingredientsText, opts) {
    opts = opts || {};
    var text = ingredientsText || (off && off.ingredientsText) || "";
    var result = analyze(off, text);
    return {
      id: (off && off.barcode) || ("p" + Date.now()),
      barcode: (off && off.barcode) || "",
      name: (off && off.name) || opts.name || "Scanned product",
      brand: (off && off.brand) || "",
      image: (off && off.image) || "",
      photoKey: opts.photoKey || "",
      ingredientsText: text,
      source: opts.source || (off ? "Open Food Facts" : "Photo / OCR"),
      score: result.score,
      badge: result.badge,
      classified: result.classified,
      negatives: result.negatives,
      positives: result.positives,
      ts: Date.now()
    };
  }

  function showProduct(product) {
    state.product = product;
    // de-dupe history by barcode/name, newest first
    state.history = state.history.filter(function (h) {
      return !(h.barcode && h.barcode === product.barcode) && h.id !== product.id;
    });
    state.history.unshift(product);
    saveHistory();
    go("result");
  }

  /* ------------------------------------------------------- scanner (ZXing) */
  var zxingReader = null;
  function startScanner() {
    setStatus("Loading scanner…");
    var p = window.ZXing ? Promise.resolve() : loadScript(ZXING_URL);
    p.then(function () {
      var video = document.getElementById("cam");
      if (!video || !window.ZXing) throw new Error("scanner unavailable");
      zxingReader = new ZXing.BrowserMultiFormatReader();
      setStatus("Point at a barcode");
      zxingReader.decodeFromVideoDevice(null, video, function (res, err) {
        if (res) {
          var code = res.getText();
          stopScanner();
          handleBarcode(code);
        }
      });
    }).catch(function () {
      setStatus("");
      alert("Camera/scanner unavailable. Enter the barcode manually.");
      go("manual");
    });
  }
  function stopScanner() {
    try { if (zxingReader) zxingReader.reset(); } catch (e) {}
    zxingReader = null;
  }

  function handleBarcode(code) {
    code = String(code || "").replace(/\D/g, "");
    if (!code) return;
    busy(true, "Looking up product…");
    lookupBarcode(code).then(function (off) {
      busy(false, "");
      if (!off || !off.ingredientsText) {
        // not found OR no ingredient data -> ask for a photo of the label
        state.pending = { barcode: code, off: off };
        go("addPhoto");
        return;
      }
      showProduct(buildProduct(off));
    }).catch(function () {
      busy(false, "");
      alert("Network error reaching the food database. Check your connection.");
    });
  }

  /* ------------------------------------------------------------- OCR flow */
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function runOCR(dataUrl) {
    setStatus("Reading label…");
    var p = window.Tesseract ? Promise.resolve() : loadScript(TESS_URL);
    return p.then(function () {
      return Tesseract.recognize(dataUrl, "eng");
    }).then(function (r) {
      return { text: (r.data && r.data.text) || "", confidence: (r.data && r.data.confidence) || 0 };
    });
  }

  /* ---------------------------------------------------------------- UI bits */
  function setStatus(msg) { state.statusMsg = msg; var el = document.getElementById("status"); if (el) el.textContent = msg; }
  function busy(on, msg) { state.busy = on; setStatus(msg || ""); render(); }

  function scoreColor(cls) { return cls === "good" ? "#2fd07a" : cls === "mid" ? "#ffb020" : "#ff4d4f"; }
  function statusDot(status) {
    var c = { avoid: "#ff4d4f", caution: "#ff7a45", limit: "#ffb020", unknown: "#8a8a99", good: "#2fd07a" }[status] || "#8a8a99";
    return '<span class="dot" style="background:' + c + '"></span>';
  }

  function go(view) {
    if (view !== "scanner") stopScanner();
    state.prev = state.view; state.view = view;
    render();
    if (view === "scanner") setTimeout(startScanner, 60);
  }

  /* ------------------------------------------------------------- views */
  function viewHome() {
    var recent = state.history.slice(0, 5);
    return '' +
      '<div class="screen">' +
        '<header class="hd"><div class="logo">🥗 NutriCheck</div><div class="sub">Know what\'s really in your food</div></header>' +
        '<button class="big-btn" data-act="scan">📷 Scan a barcode</button>' +
        '<button class="ghost-btn" data-act="addPhoto">🏷️ Add product by photo</button>' +
        '<button class="ghost-btn" data-act="manual">⌨️ Enter barcode manually</button>' +
        (recent.length ? ('<div class="section-title">Recent scans</div>' + recent.map(historyRow).join("")) :
          '<div class="empty">No scans yet. Scan your first product!</div>') +
      '</div>';
  }

  function historyRow(p) {
    return '<div class="row card" data-open="' + esc(p.id) + '">' +
      '<div class="mini-score" style="background:' + scoreColor(p.badge.cls) + '">' + p.score + '</div>' +
      '<div class="row-main"><div class="row-title">' + esc(p.name) + '</div>' +
      '<div class="row-sub">' + esc(p.brand || p.source) + '</div></div>' +
      '<div class="pill ' + p.badge.cls + '">' + esc(p.badge.label) + '</div></div>';
  }

  function viewScanner() {
    return '<div class="screen scanner">' +
      '<video id="cam" playsinline autoplay muted></video>' +
      '<div class="scan-frame"></div>' +
      '<div class="scan-status" id="status">' + esc(state.statusMsg) + '</div>' +
      '<button class="cancel-btn" data-act="home">Cancel</button>' +
    '</div>';
  }

  function viewManual() {
    return '<div class="screen">' +
      backBar("Enter barcode") +
      '<input id="bc" class="text-input" inputmode="numeric" placeholder="e.g. 009800895007" />' +
      '<button class="big-btn" data-act="manualGo">Look up</button>' +
      '<div class="hint">Tip: the EAN/UPC number printed under the barcode.</div>' +
    '</div>';
  }

  function viewResult() {
    var p = state.product; if (!p) return viewHome();
    var alerts = personalAlerts(p.classified);
    var negHtml = p.negatives.length ? p.negatives.map(function (c) { return ingredientRow(c, true); }).join("") :
      '<div class="empty small">No flagged ingredients found 🎉</div>';
    var allHtml = p.classified.map(function (c) { return ingredientRow(c, false); }).join("");

    return '<div class="screen result">' +
      backBar("Result") +
      '<div class="product-head">' +
        (p.image ? '<img class="phead-img" src="' + esc(p.image) + '" alt="">' : '<div class="phead-img ph">🥫</div>') +
        '<div><div class="phead-name">' + esc(p.name) + '</div><div class="phead-brand">' + esc(p.brand || "") + '</div>' +
        '<div class="phead-src">via ' + esc(p.source) + '</div></div>' +
      '</div>' +
      '<div class="score-wrap">' +
        '<div class="score-ring" style="--c:' + scoreColor(p.badge.cls) + ';--p:' + p.score + '"><div class="score-num">' + p.score + '</div><div class="score-of">/100</div></div>' +
        '<div class="badge ' + p.badge.cls + '">' + esc(p.badge.label) + '</div>' +
      '</div>' +
      (alerts.length ? ('<div class="alerts">' + alerts.map(function (a) {
        return '<div class="alert">⚠️ <b>' + esc(cap(a.key)) + '</b>: contains ' + esc(a.hits.join(", ")) + '</div>';
      }).join("") + '</div>') : "") +
      '<div class="section-title">Flagged ingredients (' + p.negatives.length + ')</div>' + negHtml +
      '<div class="section-title">All ingredients (' + p.classified.length + ')</div>' +
      '<div class="all-ings">' + allHtml + '</div>' +
    '</div>';
  }

  function ingredientRow(c, showReason) {
    var clickable = !!c.additive;
    return '<div class="ing-row card' + (clickable ? ' tappable' : '') + '"' +
      (clickable ? ' data-ing="' + esc(c.additive.id) + '"' : '') + '>' +
      statusDot(c.status) +
      '<div class="row-main"><div class="row-title">' + esc(c.raw) + '</div>' +
      (showReason ? '<div class="row-sub">' + esc(c.reason) + '</div>' : '') + '</div>' +
      '<div class="status-tag ' + c.status + '">' + STATUS_LABEL[c.status] + (clickable ? ' ›' : '') + '</div></div>';
  }

  function viewIngredient() {
    var a = state.ingredient; if (!a) return viewResult();
    var tabs = [["what", "What it is"], ["why", "Why flagged"], ["risk", "Health risk"], ["studies", "Studies"]];
    var body = "";
    if (state.ingTab === "what") body = '<p>' + esc(a.whatIs) + '</p>';
    else if (state.ingTab === "why") body = '<p>' + esc(a.whyFlagged) + '</p>';
    else if (state.ingTab === "risk") body = '<p>' + esc(a.healthRisk) + '</p>';
    else body = a.studies && a.studies.length ?
      a.studies.map(function (s) {
        return '<div class="study"><div class="study-title">' + esc(s.title) + '</div>' +
          '<div class="study-src">' + esc(s.source) + (s.year ? " · " + s.year : "") + '</div></div>';
      }).join("") : '<div class="empty small">No studies catalogued yet.</div>';

    return '<div class="screen">' +
      backBar(a.names[0].replace(/\b\w/g, function (m) { return m.toUpperCase(); })) +
      '<div class="ing-head">' + statusDot(a.risk) +
        '<div><div class="ing-cat">' + esc(a.category) + (a.enumber ? " · " + esc(a.enumber) : "") + '</div>' +
        '<div class="ing-summary">' + esc(a.summary) + '</div></div>' +
        '<div class="status-tag ' + a.risk + '">' + STATUS_LABEL[a.risk] + '</div>' +
      '</div>' +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (state.ingTab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="tab-body">' + body + '</div>' +
      '<div class="disclaimer">Educational summary, not medical advice.</div>' +
    '</div>';
  }

  function viewHistory() {
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">History</div></header>' +
      (state.history.length ? state.history.map(historyRow).join("") +
        '<button class="ghost-btn danger" data-act="clearHist">Clear history</button>'
        : '<div class="empty">Nothing scanned yet.</div>') +
    '</div>';
  }

  function viewProfile() {
    var opts = [
      ["gluten", "Gluten-free"], ["dairy", "Dairy-free"], ["egg", "Egg-free"],
      ["soy", "Soy-free"], ["peanut", "Peanut-free"], ["treenut", "Tree-nut-free"],
      ["shellfish", "Shellfish-free"], ["fish", "Fish-free"], ["sesame", "Sesame-free"],
      ["vegan", "Vegan"], ["vegetarian", "Vegetarian"], ["keto", "Low-carb / Keto"]
    ];
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">My profile</div><div class="sub">Get a personal ⚠️ alert when a product conflicts</div></header>' +
      opts.map(function (o) {
        var on = !!state.profile[o[0]];
        return '<div class="row card toggle-row" data-toggle="' + o[0] + '"><div class="row-title">' + o[1] + '</div>' +
          '<div class="switch ' + (on ? "on" : "") + '"><span></span></div></div>';
      }).join("") +
      '<div class="disclaimer">Stored only on this device.</div>' +
    '</div>';
  }

  function viewAddPhoto() {
    var pend = state.pending || {};
    var note = pend.barcode ?
      "We couldn't read the ingredients for this barcode. Take a clear photo of the <b>ingredients list</b> and we'll read it." :
      "Take a clear, well-lit photo of the <b>ingredients list</b> on the package.";
    return '<div class="screen">' +
      backBar("Add by photo") +
      '<div class="photo-card">' +
        '<div class="photo-illu">🏷️</div>' +
        '<p>' + note + '</p>' +
        '<label class="big-btn"><input id="photo" type="file" accept="image/*" capture="environment" hidden> 📸 Take / choose photo</label>' +
        '<div class="hint">Fill the frame with just the ingredients text for the best read.</div>' +
      '</div>' +
      '<div id="ocrPreview"></div>' +
    '</div>';
  }

  function backBar(title) {
    return '<div class="backbar"><button class="back" data-act="back">‹</button><div class="bb-title">' + esc(title) + '</div></div>';
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function tabBar() {
    var items = [["home", "Scan", "📷"], ["history", "History", "🕘"], ["profile", "Profile", "👤"]];
    var active = state.view === "history" ? "history" : state.view === "profile" ? "profile" : "home";
    return '<nav class="tabbar">' + items.map(function (i) {
      return '<button class="tabitem' + (active === i[0] ? " on" : "") + '" data-nav="' + i[0] + '">' +
        '<div class="ti-ico">' + i[2] + '</div><div class="ti-lbl">' + i[1] + '</div></button>';
    }).join("") + '</nav>';
  }

  function render() {
    var v = state.view, html;
    if (v === "home") html = viewHome();
    else if (v === "scanner") html = viewScanner();
    else if (v === "manual") html = viewManual();
    else if (v === "result") html = viewResult();
    else if (v === "ingredient") html = viewIngredient();
    else if (v === "history") html = viewHistory();
    else if (v === "profile") html = viewProfile();
    else if (v === "addPhoto") html = viewAddPhoto();
    else html = viewHome();

    var showTabs = (v === "home" || v === "history" || v === "profile");
    app.innerHTML = '<div class="app-body">' + html + '</div>' + (showTabs ? tabBar() : "");
    if (state.busy) app.insertAdjacentHTML("beforeend",
      '<div class="overlay"><div class="spinner"></div><div class="ov-msg">' + esc(state.statusMsg || "Working…") + '</div></div>');
  }

  /* ------------------------------------------------------------ events */
  function onClick(e) {
    var t = e.target.closest("[data-act],[data-nav],[data-open],[data-ing],[data-tab],[data-toggle]");
    if (!t) return;

    if (t.dataset.nav) { go(t.dataset.nav); return; }
    if (t.dataset.open) {
      var p = state.history.filter(function (h) { return h.id === t.dataset.open; })[0];
      if (p) { state.product = p; go("result"); } return;
    }
    if (t.dataset.ing) {
      var a = DATA.additives.filter(function (x) { return x.id === t.dataset.ing; })[0];
      if (a) { state.ingredient = a; state.ingTab = "what"; go("ingredient"); } return;
    }
    if (t.dataset.tab) { state.ingTab = t.dataset.tab; render(); return; }
    if (t.dataset.toggle) {
      var k = t.dataset.toggle; state.profile[k] = !state.profile[k]; saveProfile(); render(); return;
    }

    var act = t.dataset.act;
    if (act === "scan") go("scanner");
    else if (act === "home") go("home");
    else if (act === "addPhoto") { go("addPhoto"); }
    else if (act === "manual") go("manual");
    else if (act === "back") go(state.view === "ingredient" ? "result" : "home");
    else if (act === "manualGo") {
      var el = document.getElementById("bc"); if (el && el.value.trim()) handleBarcode(el.value.trim());
    } else if (act === "clearHist") {
      if (confirm("Clear all scan history?")) { state.history = []; saveHistory(); render(); }
    }
  }

  function onChange(e) {
    if (e.target && e.target.id === "photo" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      busy(true, "Reading label…");
      fileToDataUrl(file).then(function (durl) {
        var key = "ph" + Date.now();
        savePhoto(key, durl);
        return runOCR(durl).then(function (ocr) {
          busy(false, "");
          if (!ocr.text || ocr.text.replace(/\s/g, "").length < 12 || ocr.confidence < 35) {
            var prev = document.getElementById("ocrPreview");
            if (prev) prev.innerHTML = '<div class="empty small">Couldn\'t read that clearly (confidence ' +
              Math.round(ocr.confidence) + '%). Please retake a <b>closer, well-lit</b> photo of just the ingredients list.</div>';
            return;
          }
          var off = state.pending && state.pending.off ? state.pending.off : null;
          var product = buildProduct(off, ocr.text, {
            photoKey: key, source: "Photo / OCR",
            name: off && off.name ? off.name : "Scanned product"
          });
          if (state.pending && state.pending.barcode) product.barcode = state.pending.barcode;
          state.pending = null;
          showProduct(product);
        });
      }).catch(function () { busy(false, ""); alert("Couldn't process that image. Try again."); });
    }
  }

  /* -------------------------------------------------------------- boot */
  function init() {
    app = document.getElementById("app");
    loadLocal();
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
