/* NutriCheck — ingredient scanner. Pure front-end app for Capacitor/WKWebView. */
(function () {
  "use strict";

  var DATA = window.CB_DATA;
  var OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";
  var ZXING_URL = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
  var TESS_URL = "https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js";

  var WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";

  var state = {
    view: "home", prev: "home",
    product: null, ingDetail: null, ingTab: "what",
    history: [], profile: {}, pending: null,
    searchResults: null, searchQuery: "",
    research: { term: "", loading: false, data: null, error: false },
    busy: false, statusMsg: ""
  };
  var app;
  var researchCache = {};

  /* ------------------------------------------------------------- storage */
  function loadLocal() {
    try { state.history = JSON.parse(localStorage.getItem("cb_history") || "[]"); } catch (e) { state.history = []; }
    try { state.profile = JSON.parse(localStorage.getItem("cb_profile") || "{}"); } catch (e) { state.profile = {}; }
  }
  function saveHistory() { try { localStorage.setItem("cb_history", JSON.stringify(state.history.slice(0, 100))); } catch (e) {} }
  function saveProfile() { try { localStorage.setItem("cb_profile", JSON.stringify(state.profile)); } catch (e) {} }

  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open("nutricheck", 1);
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
        tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); };
      });
    }).catch(function () {});
  }

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) {
    return String(s || "").toLowerCase()
      .replace(/\([^)]*\)/g, " ").replace(/\d+(\.\d+)?\s*%/g, " ")
      .replace(/[^a-z0-9&'\- ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function titleCase(s) { return String(s || "").replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }
  function num(v) { return typeof v === "number" && !isNaN(v) ? v : (v != null && v !== "" && !isNaN(+v) ? +v : null); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
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
      .replace(/[\[\]{}]/g, ",").replace(/\band\b/gi, ",");
    var parts = cleaned.split(/[,;.]+/), out = [];
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
        if (n === a.names[j] || n.indexOf(a.names[j]) !== -1) return a;
      }
    }
    return null;
  }
  function listHit(list, n) {
    for (var i = 0; i < list.length; i++) if (n === list[i] || n.indexOf(list[i]) !== -1) return list[i];
    return null;
  }
  function findENumberByName(n) {
    for (var i = 0; i < DATA.eNumbers.length; i++) {
      var nm = norm(DATA.eNumbers[i][1]);
      if (nm && nm.length >= 4 && (n === nm || n.indexOf(nm) !== -1))
        return { code: DATA.eNumbers[i][0], name: DATA.eNumbers[i][1], risk: DATA.eNumbers[i][2] };
    }
    return null;
  }
  function findENumberByCode(raw) {
    var m = String(raw || "").match(/\be ?(\d{3,4}[a-z]?)\b/);
    if (!m) return null;
    var code = "e" + m[1];
    for (var i = 0; i < DATA.eNumbers.length; i++)
      if (DATA.eNumbers[i][0].toLowerCase() === code)
        return { code: DATA.eNumbers[i][0], name: DATA.eNumbers[i][1], risk: DATA.eNumbers[i][2] };
    return { code: "E" + m[1].toUpperCase(), name: "Additive E" + m[1].toUpperCase(), risk: "caution" };
  }
  function egroup(risk) { return "e" + cap(risk); }

  function classify(n, raw) {
    var a = findAdditive(n);
    if (a) return { status: a.risk, additive: a, name: a.names[0], reason: a.category };
    if (listHit(DATA.artificialSweeteners, n)) return { status: "caution", group: "sweetener", reason: "Artificial sweetener" };
    if (listHit(DATA.seedOils, n)) return { status: "caution", group: "seedOil", reason: "Industrial seed oil" };
    if (listHit(DATA.vagueTerms, n)) return { status: "caution", group: "vague", reason: "Undisclosed ingredient" };
    var en = findENumberByName(n) || findENumberByCode(raw);
    if (en) return { status: en.risk, group: egroup(en.risk), name: en.name, enumber: en.code, reason: "Food additive" + (en.code ? " · " + en.code : "") };
    if (listHit(DATA.addedSugars, n)) return { status: "limit", group: "addedSugar", reason: "Added sugar" };
    if (listHit(DATA.cleanIngredients, n)) return { status: "good", group: "clean", reason: "Whole-food ingredient" };
    if (/\be ?\d{3,4}[a-z]?\b/.test(String(raw || ""))) return { status: "caution", group: "eCaution", reason: "Unrecognized additive" };
    return { status: "unknown", group: "unknown", reason: "Not catalogued yet" };
  }

  var STATUS_RANK = { avoid: 4, caution: 3, limit: 2, unknown: 1, good: 0 };
  var STATUS_LABEL = { avoid: "Avoid", caution: "Caution", limit: "Limit", unknown: "Unknown", good: "Clean" };
  var STATUS_GROUPS = ["avoid", "caution", "limit", "unknown", "good"];

  function ingredientDetail(item) {
    if (item.additive) {
      var a = item.additive;
      return { title: titleCase(a.names[0]), category: a.category, enumber: a.enumber || "", status: a.risk,
        summary: a.summary, whatIs: a.whatIs, whyFlagged: a.whyFlagged, effects: a.healthRisk, studies: a.studies || [] };
    }
    var g = DATA.groups[item.group] || DATA.groups.unknown;
    return { title: titleCase(item.name || item.raw), category: g.category, enumber: item.enumber || "", status: item.status || g.status,
      summary: g.summary, whatIs: g.whatIs, whyFlagged: g.whyFlagged, effects: g.effects, studies: g.studies || [] };
  }

  /* --------------------------------------------------- nutrition scoring */
  function evalNutrition(off) {
    var out = { hasData: false, negatives: [], positives: [] };
    if (!off || !off.nutriments) return out;
    var nu = off.nutriments;
    function row(label, val, unit, sev, note) {
      var v = (val == null) ? "—" : (Math.round(val * 10) / 10 + unit);
      var r = { label: label, value: v, sev: sev, note: note };
      (sev === "good" ? out.positives : out.negatives).push(r);
    }
    var kcal = num(nu["energy-kcal_100g"]);
    if (kcal != null) row("Calories", kcal, " kcal", kcal <= 120 ? "good" : kcal <= 300 ? "mid" : "bad", kcal <= 120 ? "Low-calorie" : kcal <= 300 ? "Moderate" : "Calorie-dense");
    var sat = num(nu["saturated-fat_100g"]);
    if (sat != null) row("Saturated fat", sat, "g", sat <= 1.5 ? "good" : sat <= 5 ? "mid" : "bad", sat <= 1.5 ? "Low" : sat <= 5 ? "A bit high" : "High");
    var sug = num(nu["sugars_100g"]);
    if (sug != null) row("Sugar", sug, "g", sug <= 5 ? "good" : sug <= 22.5 ? "mid" : "bad", sug <= 5 ? "Low" : sug <= 22.5 ? "Moderate" : "Too much sugar");
    var salt = num(nu["salt_100g"]); if (salt == null && num(nu["sodium_100g"]) != null) salt = num(nu["sodium_100g"]) * 2.5;
    if (salt != null) row("Salt", salt, "g", salt <= 0.3 ? "good" : salt <= 1.5 ? "mid" : "bad", salt <= 0.3 ? "Low" : salt <= 1.5 ? "Moderate" : "Too much salt");
    var fib = num(nu["fiber_100g"]);
    if (fib != null) row("Fiber", fib, "g", fib >= 3 ? "good" : "mid", fib >= 6 ? "Excellent source" : fib >= 3 ? "Good source" : "Low");
    var pro = num(nu["proteins_100g"]);
    if (pro != null) row("Protein", pro, "g", pro >= 8 ? "good" : "mid", pro >= 8 ? "Good source" : pro >= 5 ? "Some protein" : "Low");
    out.hasData = (out.negatives.length + out.positives.length) > 0;
    return out;
  }

  function analyze(off, ingredientsText) {
    var items = parseIngredients(ingredientsText);
    var classified = items.map(function (it) {
      var c = classify(it.norm, (it.raw || "").toLowerCase());
      return { raw: it.raw, norm: it.norm, status: c.status, reason: c.reason,
        additive: c.additive || null, group: c.group || null, name: c.name || it.raw, enumber: c.enumber || "" };
    });

    var score = 100;
    classified.forEach(function (c) {
      if (c.status === "avoid") score -= 22;
      else if (c.status === "caution") score -= 10;
      else if (c.status === "limit") score -= 4;
    });

    var nutrition = evalNutrition(off);
    if (off) {
      if (off.nova_group === 4) score -= 8;
      var ns = String(off.nutriscore_grade || "").toLowerCase();
      if (ns === "e") score -= 12; else if (ns === "d") score -= 7; else if (ns === "a") score += 5;
      nutrition.negatives.forEach(function (r) { if (r.sev === "bad") score -= 4; });
    }

    var hasAvoid = classified.some(function (c) { return c.status === "avoid"; });
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (hasAvoid && score >= 40) score = 39;

    var flaggedCount = classified.filter(function (c) { return c.status === "avoid" || c.status === "caution"; }).length;
    if (flaggedCount > 0) nutrition.negatives.unshift({ label: "Additives", value: flaggedCount + " to watch", sev: "bad", note: "Contains additives of concern" });
    else if (classified.length) nutrition.positives.unshift({ label: "Additives", value: "None", sev: "good", note: "No risky additives" });

    return { classified: classified, score: score, badge: bandFor(score, hasAvoid), nutrition: nutrition, flaggedCount: flaggedCount };
  }

  function bandFor(score, hasAvoid) {
    if (hasAvoid) return { label: "Bad", cls: "bad" };
    if (score >= 80) return { label: "Excellent", cls: "exc" };
    if (score >= 60) return { label: "Good", cls: "good" };
    if (score >= 40) return { label: "Poor", cls: "mid" };
    return { label: "Bad", cls: "bad" };
  }

  function personalAlerts(classified) {
    var alerts = [];
    Object.keys(state.profile).forEach(function (key) {
      if (!state.profile[key]) return;
      var kws = DATA.allergenMap[key]; if (!kws) return;
      var hits = [];
      classified.forEach(function (c) {
        for (var i = 0; i < kws.length; i++) if (c.norm.indexOf(kws[i]) !== -1) { hits.push(c.raw); break; }
      });
      if (hits.length) alerts.push({ key: key, hits: hits.slice(0, 4) });
    });
    return alerts;
  }

  /* -------------------------------------------------- Open Food Facts */
  var OFF_FIELDS = "code,product_name,brands,image_front_small_url,image_front_url,ingredients_text,ingredients_text_en,additives_tags,nova_group,nutriscore_grade,nutriments";
  function mapOff(p, code) {
    if (!p) return null;
    return { barcode: code || p.code || "", name: p.product_name || "Unknown product", brand: p.brands || "",
      image: p.image_front_small_url || p.image_front_url || "",
      ingredientsText: p.ingredients_text_en || p.ingredients_text || "",
      nova_group: p.nova_group, nutriscore_grade: p.nutriscore_grade, nutriments: p.nutriments || {} };
  }
  function lookupBarcode(code) {
    var url = OFF_BASE + encodeURIComponent(code) + ".json?fields=" + OFF_FIELDS;
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.status === 1 && j.product) ? mapOff(j.product, code) : null; });
  }
  function searchProducts(query) {
    var url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(query) +
      "&search_simple=1&action=process&json=1&page_size=24&fields=" + OFF_FIELDS;
    return fetch(url, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var arr = (j && j.products) || [];
        return arr.map(function (p) { return mapOff(p); })
          .filter(function (o) { return o && o.name && o.name !== "Unknown product"; });
      });
  }
  function buildProduct(off, ingredientsText, opts) {
    opts = opts || {};
    var text = ingredientsText || (off && off.ingredientsText) || "";
    var r = analyze(off, text);
    return {
      id: (off && off.barcode) || ("p" + Date.now()), barcode: (off && off.barcode) || "",
      name: (off && off.name) || opts.name || "Scanned product", brand: (off && off.brand) || "",
      image: (off && off.image) || "", photoKey: opts.photoKey || "", ingredientsText: text,
      source: opts.source || (off ? "Open Food Facts" : "Photo / OCR"),
      score: r.score, badge: r.badge, classified: r.classified, nutrition: r.nutrition, flaggedCount: r.flaggedCount, ts: Date.now()
    };
  }
  function showProduct(product) {
    state.product = product;
    state.history = state.history.filter(function (h) { return !(h.barcode && h.barcode === product.barcode) && h.id !== product.id; });
    state.history.unshift(product);
    saveHistory();
    go("result");
  }

  /* ------------------------------------------------------- scanner */
  var zxingReader = null;
  function startScanner() {
    setStatus("Loading scanner…");
    var p = window.ZXing ? Promise.resolve() : loadScript(ZXING_URL);
    p.then(function () {
      var video = document.getElementById("cam");
      if (!video || !window.ZXing) throw new Error("scanner unavailable");
      var hints = new Map(), F = ZXing.BarcodeFormat;
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.ITF]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxingReader = new ZXing.BrowserMultiFormatReader(hints, 100);
      var constraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
      setStatus("Center the barcode in the box");
      zxingReader.decodeFromConstraints(constraints, video, function (res, err) {
        if (res) { var code = res.getText(); stopScanner(); handleBarcode(code); }
      });
    }).catch(function () {
      setStatus("");
      alert("Camera/scanner unavailable. Enter the barcode manually.");
      go("manual");
    });
  }
  function stopScanner() { try { if (zxingReader) zxingReader.reset(); } catch (e) {} zxingReader = null; }

  function runSearch(query) {
    query = String(query || "").trim();
    if (query.length < 2) return;
    state.searchQuery = query; state.searchResults = null;
    go("search");
    busy(true, "Searching…");
    searchProducts(query).then(function (results) {
      busy(false, ""); state.searchResults = results; render();
    }).catch(function () { busy(false, ""); state.searchResults = []; render(); });
  }
  function openOff(off) {
    if (!off) return;
    if (!off.ingredientsText) { state.pending = { barcode: off.barcode, off: off }; go("addPhoto"); return; }
    showProduct(buildProduct(off));
  }

  function handleBarcode(code) {
    code = String(code || "").replace(/\D/g, "");
    if (!code) return;
    busy(true, "Looking up product…");
    lookupBarcode(code).then(function (off) {
      busy(false, "");
      if (!off || !off.ingredientsText) { state.pending = { barcode: code, off: off }; go("addPhoto"); return; }
      showProduct(buildProduct(off));
    }).catch(function () { busy(false, ""); alert("Network error reaching the food database. Check your connection."); });
  }

  /* ------------------------------------------------------------ OCR */
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file); });
  }
  function runOCR(dataUrl) {
    setStatus("Reading label…");
    var p = window.Tesseract ? Promise.resolve() : loadScript(TESS_URL);
    return p.then(function () { return Tesseract.recognize(dataUrl, "eng"); })
      .then(function (r) { return { text: (r.data && r.data.text) || "", confidence: (r.data && r.data.confidence) || 0 }; });
  }

  /* ---------------------------------------- research unknown ingredients */
  function researchIngredient(term) {
    var bad = /^(and|or|contains|less than|of|the|other|color added|natural|artificial)$/i;
    var clean = String(term || "").trim();
    if (!clean || clean.length < 3 || bad.test(clean)) return Promise.resolve(null);
    var t = encodeURIComponent(clean.replace(/\s+/g, "_"));
    return fetch(WIKI + t, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.type === "disambiguation" || !j.extract) return null;
        return { extract: j.extract, description: j.description || "",
          url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || "" };
      })
      .catch(function () { return null; });
  }
  function doResearch(term) {
    if (researchCache.hasOwnProperty(term)) {
      var cached = researchCache[term];
      state.research = { term: term, loading: false, data: cached, error: !cached };
      render(); return;
    }
    state.research = { term: term, loading: true, data: null, error: false };
    render();
    researchIngredient(term).then(function (d) {
      researchCache[term] = d || null;
      state.research = { term: term, loading: false, data: d, error: !d };
      render();
    });
  }
  function researchBlock(d) {
    var r = state.research;
    if (!r || r.term !== d.title) return "";
    if (r.loading) return '<div class="research glass"><div class="spinner small"></div><div class="rh">Researching “' + esc(d.title) + '” online…</div></div>';
    if (r.error || !r.data) return '<div class="research glass"><div class="rh">🔎 No public summary found for “' + esc(d.title) + '” yet.</div></div>';
    return '<div class="research glass"><div class="rh">🔎 Researched · Wikipedia</div>' +
      (r.data.description ? '<div class="rdesc">' + esc(r.data.description) + '</div>' : "") +
      '<p>' + esc(r.data.extract) + '</p>' +
      (r.data.url ? '<a class="rlink" href="' + esc(r.data.url) + '" target="_blank" rel="noopener">Read more on Wikipedia ›</a>' : "") +
      '</div>';
  }

  /* ------------------------------------------------------------ UI */
  function setStatus(msg) { state.statusMsg = msg; var el = document.getElementById("status"); if (el) el.textContent = msg; }
  function busy(on, msg) { state.busy = on; setStatus(msg || ""); render(); }
  function sevColor(s) { return s === "good" ? "var(--good)" : s === "mid" ? "var(--mid)" : s === "bad" ? "var(--bad)" : "var(--mut)"; }
  function scoreColor(cls) { return cls === "exc" ? "#1fae54" : cls === "good" ? "#7ac943" : cls === "mid" ? "#ff9f1c" : "#ff3b30"; }
  function statusColor(st) { return st === "avoid" ? "#ff3b30" : st === "caution" ? "#ff7a45" : st === "limit" ? "#ff9f1c" : st === "good" ? "#2fd07a" : "#8a8a99"; }
  function dot(color) { return '<span class="dot" style="background:' + color + '"></span>'; }

  function go(view) {
    if (view !== "scanner") stopScanner();
    state.prev = state.view; state.view = view; render();
    if (view === "scanner") setTimeout(startScanner, 60);
  }

  function viewHome() {
    var recent = state.history.slice(0, 6);
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">🥗 NutriCheck</div><div class="sub">Scan food. See what\'s really inside.</div></header>' +
      '<div class="searchbar"><input id="q" class="text-input search-input" placeholder="Search a product or brand…" />' +
      '<button class="search-go" data-act="searchGo">Search</button></div>' +
      '<button class="big-btn" data-act="scan">📷 Scan a barcode</button>' +
      '<div class="dual"><button class="ghost-btn" data-act="addPhoto">🏷️ Add by photo</button>' +
      '<button class="ghost-btn" data-act="manual">⌨️ Enter code</button></div>' +
      (recent.length ? ('<div class="section-title">Recent scans</div>' + recent.map(historyRow).join("")) :
        '<div class="empty">No scans yet.<br>Scan your first product above 👆</div>') +
      '</div>';
  }
  function historyRow(p) {
    return '<div class="row card tappable" data-open="' + esc(p.id) + '">' +
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
      '<div class="scan-actions"><button class="link-btn" data-act="manual">Enter code manually</button>' +
      '<button class="cancel-btn" data-act="home">Cancel</button></div>' +
      '</div>';
  }
  function viewSearch() {
    var rows = "";
    if (state.searchResults == null) rows = '<div class="empty small">Searching…</div>';
    else if (!state.searchResults.length) rows = '<div class="empty">No products found for “' + esc(state.searchQuery) + '”.<br>Try a different name or scan the barcode.</div>';
    else rows = state.searchResults.map(function (o, i) {
      return '<div class="row card tappable" data-search-idx="' + i + '">' +
        (o.image ? '<img class="srch-img" src="' + esc(o.image) + '" alt="">' : '<div class="srch-img ph">🥫</div>') +
        '<div class="row-main"><div class="row-title">' + esc(o.name) + '</div>' +
        '<div class="row-sub">' + esc(o.brand || (o.ingredientsText ? "" : "No ingredient data")) + '</div></div>' +
        '<div class="chev">›</div></div>';
    }).join("");
    return '<div class="screen">' + backBar("Search") +
      '<div class="searchbar"><input id="q" class="text-input search-input" value="' + esc(state.searchQuery) + '" placeholder="Search a product or brand…" />' +
      '<button class="search-go" data-act="searchGo">Search</button></div>' + rows + '</div>';
  }

  function viewManual() {
    return '<div class="screen">' + backBar("Enter barcode") +
      '<input id="bc" class="text-input" inputmode="numeric" placeholder="e.g. 049000028911" />' +
      '<button class="big-btn" data-act="manualGo">Look up</button>' +
      '<div class="hint">The UPC/EAN number printed under the barcode.</div></div>';
  }

  function viewResult() {
    var p = state.product; if (!p) return viewHome();
    var alerts = personalAlerts(p.classified);
    var n = p.nutrition || { negatives: [], positives: [] };

    var groupsHtml = "";
    STATUS_GROUPS.forEach(function (st) {
      var rows = [];
      p.classified.forEach(function (c, i) { if (c.status === st) rows.push(ingredientRow(c, i)); });
      if (!rows.length) return;
      groupsHtml += '<div class="ing-group-h"><span class="dot" style="background:' + statusColor(st) + '"></span>' +
        STATUS_LABEL[st] + ' <span class="cnt">' + rows.length + '</span></div>' + rows.join("");
    });

    var c = scoreColor(p.badge.cls);
    return '<div class="screen result">' + backBar("") +
      '<div class="hero glass" style="--c:' + c + '">' +
        '<div class="product-head">' +
          (p.image ? '<img class="phead-img" src="' + esc(p.image) + '" alt="">' : '<div class="phead-img ph">🥫</div>') +
          '<div class="phead-txt"><div class="phead-name">' + esc(p.name) + '</div>' +
          '<div class="phead-brand">' + esc(p.brand || "") + '</div>' +
          '<div class="phead-src">via ' + esc(p.source) + '</div></div>' +
        '</div>' +
        '<div class="score-wrap">' +
          '<div class="score-glow"></div>' +
          '<div class="score-ring" style="--c:' + c + ';--p:' + p.score + '">' +
          '<div class="score-num">' + p.score + '</div><div class="score-of">out of 100</div></div>' +
          '<div class="badge ' + p.badge.cls + '">' + esc(p.badge.label) + '</div>' +
        '</div>' +
      '</div>' +
      (alerts.length ? ('<div class="alerts">' + alerts.map(function (a) {
        return '<div class="alert">⚠️ <b>' + esc(cap(a.key)) + '</b>: contains ' + esc(a.hits.join(", ")) + '</div>';
      }).join("") + '</div>') : "") +
      (n.negatives && n.negatives.length ? '<div class="panel glass"><div class="panel-h neg"><span>⚠</span> Negatives</div>' + n.negatives.map(brkRow).join("") + '</div>' : "") +
      (n.positives && n.positives.length ? '<div class="panel glass"><div class="panel-h pos"><span>✓</span> Positives</div>' + n.positives.map(brkRow).join("") + '</div>' : "") +
      '<div class="panel glass"><div class="panel-h">Ingredients <span class="cnt">' + p.classified.length + '</span></div>' +
      '<div class="legend">Tap any ingredient for details</div>' +
      (p.classified.length ? groupsHtml : '<div class="empty small">No ingredient list available for this product.</div>') +
      '</div></div>';
  }
  function brkRow(r) {
    return '<div class="lrow brk">' + dot(sevColor(r.sev)) +
      '<div class="row-main"><div class="row-title">' + esc(r.label) + '</div>' +
      '<div class="row-sub">' + esc(r.note || "") + '</div></div>' +
      '<div class="brk-val ' + r.sev + '">' + esc(r.value) + '</div></div>';
  }
  function ingredientRow(c, idx) {
    return '<div class="lrow ing-row tappable" data-ingidx="' + idx + '">' + dot(statusColor(c.status)) +
      '<div class="row-main"><div class="row-title">' + esc(c.raw) + '</div>' +
      '<div class="row-sub">' + esc(c.reason) + '</div></div>' +
      '<div class="status-tag ' + c.status + '">' + STATUS_LABEL[c.status] + ' ›</div></div>';
  }

  function viewIngredient() {
    var d = state.ingDetail; if (!d) return viewResult();
    var tabs = [["what", "What it is"], ["why", "Why flagged"], ["risk", "Health effects"], ["studies", "Studies"]];
    var body;
    if (state.ingTab === "what") body = '<p>' + esc(d.whatIs) + '</p>';
    else if (state.ingTab === "why") body = '<p>' + esc(d.whyFlagged) + '</p>';
    else if (state.ingTab === "risk") body = '<p>' + esc(d.effects) + '</p>';
    else body = (d.studies && d.studies.length) ? d.studies.map(function (s) {
      return '<div class="study glass"><div class="study-title">' + esc(s.title) + '</div>' +
        '<div class="study-src">' + esc(s.source) + (s.year ? " · " + s.year : "") + '</div></div>';
    }).join("") : '<div class="empty small">No specific studies catalogued for this one yet.</div>';

    return '<div class="screen">' + backBar(d.title) +
      '<div class="ing-head glass" style="--sc:' + statusColor(d.status) + '">' + dot(statusColor(d.status)) +
        '<div class="row-main"><div class="ing-cat">' + esc(d.category) + (d.enumber ? " · " + esc(d.enumber) : "") + '</div>' +
        '<div class="ing-summary">' + esc(d.summary) + '</div></div>' +
        '<div class="status-tag ' + d.status + '">' + STATUS_LABEL[d.status] + '</div></div>' +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (state.ingTab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="tab-body">' + body + '</div>' +
      '<button class="ghost-btn research-btn" data-research="' + esc(d.title) + '">🔎 Research this ingredient online</button>' +
      researchBlock(d) +
      '<div class="disclaimer">Educational summary, not medical advice.</div></div>';
  }

  function viewHistory() {
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">History</div></header>' +
      (state.history.length ? state.history.map(historyRow).join("") +
        '<button class="ghost-btn danger" data-act="clearHist">Clear history</button>' :
        '<div class="empty">Nothing scanned yet.</div>') + '</div>';
  }

  function viewProfile() {
    var opts = [["gluten", "Gluten-free"], ["dairy", "Dairy-free"], ["egg", "Egg-free"], ["soy", "Soy-free"],
      ["peanut", "Peanut-free"], ["treenut", "Tree-nut-free"], ["shellfish", "Shellfish-free"], ["fish", "Fish-free"],
      ["sesame", "Sesame-free"], ["vegan", "Vegan"], ["vegetarian", "Vegetarian"], ["keto", "Low-carb / Keto"]];
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">My profile</div><div class="sub">Get a personal ⚠️ alert when a product conflicts</div></header>' +
      opts.map(function (o) {
        var on = !!state.profile[o[0]];
        return '<div class="row card toggle-row tappable" data-toggle="' + o[0] + '"><div class="row-title">' + o[1] + '</div>' +
          '<div class="switch ' + (on ? "on" : "") + '"><span></span></div></div>';
      }).join("") + '<div class="disclaimer">Stored only on this device.</div></div>';
  }

  function viewAddPhoto() {
    var pend = state.pending || {};
    var note = pend.barcode ?
      "We couldn't read the ingredients for this barcode. Take a clear photo of the <b>ingredients list</b> and we'll read it." :
      "Take a clear, well-lit photo of the <b>ingredients list</b> on the package.";
    return '<div class="screen">' + backBar("Add by photo") +
      '<div class="photo-card glass"><div class="photo-illu">🏷️</div><p>' + note + '</p>' +
      '<label class="big-btn"><input id="photo" type="file" accept="image/*" capture="environment" hidden> 📸 Take / choose photo</label>' +
      '<div class="hint">Fill the frame with just the ingredients text for the best read.</div></div>' +
      '<div id="ocrPreview"></div></div>';
  }

  function backBar(title) {
    return '<div class="backbar"><button class="back" data-act="back">‹</button>' +
      (title ? '<div class="bb-title">' + esc(title) + '</div>' : '') + '</div>';
  }
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
    if (v === "scanner") html = viewScanner();
    else if (v === "search") html = viewSearch();
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

  /* --------------------------------------------------------- events */
  function onClick(e) {
    var t = e.target.closest("[data-act],[data-nav],[data-open],[data-ingidx],[data-tab],[data-toggle],[data-research],[data-search-idx]");
    if (!t) return;
    if (t.dataset.research != null) { doResearch(t.dataset.research); return; }
    if (t.dataset.searchIdx != null) {
      var o = state.searchResults && state.searchResults[+t.dataset.searchIdx];
      if (o) openOff(o); return;
    }
    if (t.dataset.nav) { go(t.dataset.nav); return; }
    if (t.dataset.open) {
      var p = state.history.filter(function (h) { return h.id === t.dataset.open; })[0];
      if (p) { state.product = p; go("result"); } return;
    }
    if (t.dataset.ingidx != null) {
      var item = state.product && state.product.classified[+t.dataset.ingidx];
      if (item) {
        state.ingDetail = ingredientDetail(item);
        state.ingTab = "what";
        state.research = { term: "", loading: false, data: null, error: false };
        go("ingredient");
        if (item.status === "unknown") doResearch(state.ingDetail.title);
      }
      return;
    }
    if (t.dataset.tab) { state.ingTab = t.dataset.tab; render(); return; }
    if (t.dataset.toggle) { var k = t.dataset.toggle; state.profile[k] = !state.profile[k]; saveProfile(); render(); return; }

    var act = t.dataset.act;
    if (act === "scan") go("scanner");
    else if (act === "home") go("home");
    else if (act === "addPhoto") go("addPhoto");
    else if (act === "manual") go("manual");
    else if (act === "back") go(state.view === "ingredient" ? "result" : "home");
    else if (act === "manualGo") { var el = document.getElementById("bc"); if (el && el.value.trim()) handleBarcode(el.value.trim()); }
    else if (act === "searchGo") { var qe = document.getElementById("q"); if (qe && qe.value.trim()) runSearch(qe.value.trim()); }
    else if (act === "clearHist") { if (confirm("Clear all scan history?")) { state.history = []; saveHistory(); render(); } }
  }

  function onChange(e) {
    if (e.target && e.target.id === "photo" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      busy(true, "Reading label…");
      fileToDataUrl(file).then(function (durl) {
        var key = "ph" + Date.now(); savePhoto(key, durl);
        return runOCR(durl).then(function (ocr) {
          busy(false, "");
          if (!ocr.text || ocr.text.replace(/\s/g, "").length < 12 || ocr.confidence < 35) {
            var prev = document.getElementById("ocrPreview");
            if (prev) prev.innerHTML = '<div class="empty small">Couldn\'t read that clearly (confidence ' +
              Math.round(ocr.confidence) + '%). Please retake a <b>closer, well-lit</b> photo of just the ingredients list.</div>';
            return;
          }
          var off = state.pending && state.pending.off ? state.pending.off : null;
          var product = buildProduct(off, ocr.text, { photoKey: key, source: "Photo / OCR", name: off && off.name ? off.name : "Scanned product" });
          if (state.pending && state.pending.barcode) product.barcode = state.pending.barcode;
          state.pending = null; showProduct(product);
        });
      }).catch(function () { busy(false, ""); alert("Couldn't process that image. Try again."); });
    }
  }

  function onKey(e) {
    if (e.key !== "Enter" || !e.target) return;
    if (e.target.id === "q" && e.target.value.trim()) { e.preventDefault(); runSearch(e.target.value.trim()); }
    else if (e.target.id === "bc" && e.target.value.trim()) { e.preventDefault(); handleBarcode(e.target.value.trim()); }
  }
  function init() {
    app = document.getElementById("app");
    loadLocal();
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
