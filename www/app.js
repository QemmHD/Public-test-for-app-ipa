/* NutriCheck — ingredient scanner. Pure front-end app for Capacitor/WKWebView. */
(function () {
  "use strict";

  var DATA = window.CB_DATA;
  var COS = window.CB_DATA_COSMETICS || null;
  // Shared pure engine (parsing/classification/scoring). Initialized with both
  // the food and cosmetic knowledge bases so one scan path handles any product.
  var ENG = window.CB_ENGINE;
  ENG.init({ food: DATA, cosmetics: COS });

  // Open*Facts family — same free API, different product domains. Queried in
  // order so a single barcode resolves to food, beauty, household or pet food.
  var OFF_SOURCES = [
    { base: "https://world.openfoodfacts.org/api/v2/product/", type: "food", label: "Open Food Facts" },
    { base: "https://world.openbeautyfacts.org/api/v2/product/", type: "beauty", label: "Open Beauty Facts" },
    { base: "https://world.openproductsfacts.org/api/v2/product/", type: "household", label: "Open Products Facts" },
    { base: "https://world.openpetfoodfacts.org/api/v2/product/", type: "petfood", label: "Open Pet Food Facts" }
  ];
  var OFF_BASE = OFF_SOURCES[0].base;
  // Local vendored libraries (offline). Fall back to CDN only if a local asset is missing.
  var ZXING_LOCAL = "vendor/zxing/index.min.js";
  var TESS_LOCAL = "vendor/tesseract/tesseract.min.js";
  var ZXING_URL = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
  var TESS_URL = "https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js";

  var WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
  var FETCH_TIMEOUT = 8000, FETCH_RETRIES = 1;
  var PROD_TTL = 1000 * 60 * 60 * 24 * 30; // 30-day barcode cache
  var PROD_CACHE_VERSION = 5;

  var PROFILE_OPTS = [
    ["gluten", "Gluten-free"], ["dairy", "Dairy-free"], ["egg", "Egg-free"], ["soy", "Soy-free"],
    ["peanut", "Peanut-free"], ["treenut", "Tree-nut-free"], ["shellfish", "Shellfish-free"], ["fish", "Fish-free"],
    ["sesame", "Sesame-free"], ["vegan", "Vegan"], ["vegetarian", "Vegetarian"], ["keto", "Low-carb / Keto"]
  ];

  var state = {
    view: "home", prev: "home",
    product: null, ingDetail: null, ingTab: "what",
    history: [], favorites: [], profile: {}, health: {}, settings: { theme: "dark" }, pending: null, ocrPending: null,
    searchResults: null, searchRaw: null, searchQuery: "", searchSort: "rel", historyFilter: "all",
    alts: { forId: "", loading: false, list: null }, scoreOpen: false, onboarded: true,
    compareB: null, compareCands: [],
    insightsFilter: "all", editHealth: false, encQuery: "", ingFrom: "result",
    research: { term: "", loading: false, data: null, error: false },
    busy: false, statusMsg: "", scanError: "", manualCode: ""
  };
  var app;
  var researchCache = {};

  /* ------------------------------------------------------------- storage */
  function loadLocal() {
    try { state.history = JSON.parse(localStorage.getItem("cb_history") || "[]"); } catch (e) { state.history = []; }
    try { state.favorites = JSON.parse(localStorage.getItem("cb_favs") || "[]"); } catch (e) { state.favorites = []; }
    state.history = (Array.isArray(state.history) ? state.history : []).map(rehydrateProduct);
    state.favorites = (Array.isArray(state.favorites) ? state.favorites : []).map(rehydrateProduct);
    try { state.profile = JSON.parse(localStorage.getItem("cb_profile") || "{}"); } catch (e) { state.profile = {}; }
    try { state.health = JSON.parse(localStorage.getItem("cb_health") || "{}"); } catch (e) { state.health = {}; }
    try { state.settings = JSON.parse(localStorage.getItem("cb_settings") || '{"theme":"dark"}'); } catch (e) { state.settings = { theme: "dark" }; }
    state.onboarded = localStorage.getItem("cb_onboarded") === "1";
  }
  function saveHealth() { try { localStorage.setItem("cb_health", JSON.stringify(state.health)); } catch (e) {} }
  function saveSettings() { try { localStorage.setItem("cb_settings", JSON.stringify(state.settings)); } catch (e) {} }

  // Mifflin-St Jeor BMR -> TDEE -> calorie/macro target (engine).
  function computeTargets(h) { return ENG.computeTargets(h); }
  function applyTheme(theme) {
    var t = theme || (state.settings && state.settings.theme) || "dark";
    if (t === "auto") t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    document.body.className = t === "light" ? "theme-light" : "theme-dark";
  }
  function saveHistory() { try { localStorage.setItem("cb_history", JSON.stringify(state.history.slice(0, 100))); } catch (e) {} }
  function saveFavs() { try { localStorage.setItem("cb_favs", JSON.stringify(state.favorites.slice(0, 100))); } catch (e) {} }
  function saveProfile() { try { localStorage.setItem("cb_profile", JSON.stringify(state.profile)); } catch (e) {} }
  function isFav(id) { return state.favorites.some(function (f) { return f.id === id; }); }
  function toggleFav(p) {
    if (!p) return;
    if (isFav(p.id)) state.favorites = state.favorites.filter(function (f) { return f.id !== p.id; });
    else state.favorites.unshift(p);
    saveFavs();
  }

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
  function norm(s) { return ENG.norm(s); }
  function titleCase(s) { return ENG.titleCase(s); }
  function num(v) { return ENG.num(v); }
  function cap(s) { return ENG.cap(s); }
  function loadScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url; s.onload = res; s.onerror = function () { rej(new Error("load " + url)); };
      document.head.appendChild(s);
    });
  }
  // Prefer the local vendored copy (offline); only reach for the CDN if the
  // local asset is missing or fails to load.
  function loadScriptLocalFirst(localUrl, cdnUrl) {
    return loadScript(localUrl).catch(function () { return cdnUrl ? loadScript(cdnUrl) : Promise.reject(new Error("missing " + localUrl)); });
  }

  /* ----------------------- ingredient parsing / classification (engine) */
  // Word-boundary (n-gram) matching lives in engine.js — no more substring
  // false positives (e.g. "egg" inside "eggplant"). Thin wrappers preserve
  // existing call sites here in the UI layer.
  function parseIngredients(text) { return ENG.parseIngredients(text); }
  function classify(n, raw, productType) { return ENG.classify(n, raw, productType); }

  var STATUS_RANK = { avoid: 5, caution: 4, limit: 3, unknown: 2, ok: 1, good: 0 };
  var STATUS_LABEL = { avoid: "Avoid", caution: "Caution", limit: "Limit", unknown: "Unknown", ok: "Low concern", good: "Recognized" };
  var STATUS_GROUPS = ["avoid", "caution", "limit", "unknown", "ok", "good"];
  // Human label + Font Awesome icon per product family for the result-screen type badge.
  var PROD_TYPE_LABEL = {
    food: ["food", "Food"], petfood: ["paw", "Pet food"],
    beauty: ["bottle", "Beauty / personal care"], household: ["home", "Household / other"]
  };
  function prodTypeBadge(t) {
    var m = PROD_TYPE_LABEL[t] || PROD_TYPE_LABEL.household;
    return '<div class="ptype-badge" data-ptype="' + esc(t || "food") + '">' + icon(m[0]) + '<span>' + esc(m[1]) + '</span></div>';
  }
  // Certified-only kosher chip (shown only when Open*Facts carries a kosher label).
  function kosherBadge() {
    return '<div class="kosher-badge" title="Certified kosher per product label data">' + icon("shield") + '<span>Certified kosher</span></div>';
  }

  // Ingredient-detail / nutrition / scoring all live in the engine now.
  function ingredientDetail(item) { return ENG.ingredientDetail(item); }
  function evalNutrition(off) { return ENG.evalNutrition(off); }
  function analyze(off, ingredientsText, productType) { return ENG.analyze(off, ingredientsText, productType); }
  function bandFor(score, hasAvoid) { return ENG.bandFor(score, hasAvoid); }

  function personalAlerts(classified, detected) {
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
    // The engine also understands explicit "contains" and "may contain"
    // statements. Prefer those label-declared alerts when they are available.
    (detected || []).forEach(function (a) {
      if (!state.profile[a.key]) return;
      var current = alerts.filter(function (x) { return x.key === a.key; })[0];
      if (current) {
        (a.hits || []).forEach(function (hit) { if (current.hits.indexOf(hit) === -1) current.hits.push(hit); });
        current.hits = current.hits.slice(0, 6);
        current.note = a.note || "";
      } else alerts.push({ key: a.key, hits: (a.hits || []).slice(0, 6), note: a.note || "" });
    });
    return alerts;
  }

  /* --------------------------------------------- barcode validation */
  // Consumer product barcodes are GTIN-8, UPC-A (GTIN-12), EAN-13 or GTIN-14.
  // Decoders occasionally return a plausible-looking partial row, so digits and
  // length alone are not enough: the GS1 modulo-10 check digit must also match.
  function gtinChecksumValid(code) {
    code = String(code || "");
    if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) || /^(\d)\1+$/.test(code)) return false;
    var sum = 0, weight = 3;
    for (var i = code.length - 2; i >= 0; i--) {
      sum += (+code.charAt(i)) * weight;
      weight = weight === 3 ? 1 : 3;
    }
    return ((10 - (sum % 10)) % 10) === +code.charAt(code.length - 1);
  }
  function asciiDigits(s) {
    return String(s == null ? "" : s).replace(/[\uFF10-\uFF19]/g, function (d) {
      return String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 48);
    });
  }
  function normalizeBarcode(value) {
    var raw = asciiDigits(value).replace(/[\u0000\u200B-\u200D\uFEFF]/g, "").trim();
    if (!raw || raw.length > 80) return null;
    // GS1 DataMatrix / Code 128 may include an AIM prefix plus AI (01), followed
    // by other application identifiers. Only extract a GTIN when AI 01 is clear.
    var gs1 = raw.match(/(?:^\](?:C1|d2)\s*|^\s*)\(01\)\s*(\d{14})(?=\D|$)/i);
    if (!gs1 && /^\](?:C1|d2)/i.test(raw)) gs1 = raw.match(/^\](?:C1|d2)\s*01(\d{14})(?=\D|$)/i);
    if (!gs1) gs1 = raw.match(/^01(\d{14})(?=\x1D|$)/);
    if (gs1) return gtinChecksumValid(gs1[1]) ? gs1[1] : null;
    raw = raw.replace(/^\s*(?:barcode|gtin(?:-?(?:8|12|13|14))?|ean(?:-?(?:8|13))?|upc(?:-?[ae])?)\s*[:#]?\s*/i, "");
    var compact = raw.replace(/[\s\u00A0\u2007\u202F-]+/g, "");
    if (!/^\d+$/.test(compact) || !gtinChecksumValid(compact)) return null;
    return compact;
  }
  function expandUpce(code) {
    if (!/^\d{8}$/.test(code) || !gtinChecksumValid(code) || (code.charAt(0) !== "0" && code.charAt(0) !== "1")) return null;
    var ns = code.charAt(0), d = code.slice(1, 7), check = code.charAt(7), x = d.charAt(5), body;
    if (x === "0" || x === "1" || x === "2") body = ns + d.slice(0, 2) + x + "0000" + d.slice(2, 5);
    else if (x === "3") body = ns + d.slice(0, 3) + "00000" + d.slice(3, 5);
    else if (x === "4") body = ns + d.slice(0, 4) + "00000" + d.charAt(4);
    else body = ns + d.slice(0, 5) + "0000" + x;
    var out = body + check;
    return gtinChecksumValid(out) ? out : null;
  }
  function barcodeLookupVariants(code) {
    var out = [], seen = {};
    function add(v) { if (v && gtinChecksumValid(v) && !seen[v]) { seen[v] = 1; out.push(v); } }
    add(code);
    if (code.length === 8) add(expandUpce(code));
    if (code.length === 12) add("0" + code);
    if (code.length === 13 && code.charAt(0) === "0") add(code.slice(1));
    if (code.length === 14 && code.charAt(0) === "0") {
      add(code.slice(1));
      if (code.slice(0, 2) === "00") add(code.slice(2));
    }
    return out;
  }
  // Pure consensus helper used by both the live scanner and the test hook.
  function selectConsensusCandidate(samples, minHits, windowMs, now) {
    minHits = minHits || 2; windowMs = windowMs || 2200; now = now || Date.now();
    var counts = {}, first = {}, last = {}, best = null;
    (samples || []).forEach(function (s) {
      var code = normalizeBarcode(s && s.code != null ? s.code : s);
      var at = +(s && s.at) || now;
      if (!code || now - at > windowMs || at > now + 1000) return;
      counts[code] = (counts[code] || 0) + 1;
      first[code] = first[code] == null ? at : Math.min(first[code], at);
      last[code] = Math.max(last[code] || 0, at);
      if (!best || counts[code] > counts[best] || (counts[code] === counts[best] && last[code] > last[best])) best = code;
    });
    if (!best || counts[best] < minHits || last[best] - first[best] < 70) return null;
    return { code: best, hits: counts[best], firstAt: first[best], lastAt: last[best] };
  }

  /* ----------------------------------------- network: timeout + retry */
  // Wrap fetch with an AbortController timeout and a small retry so a slow or
  // dead network surfaces an error instead of hanging the UI forever.
  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || FETCH_TIMEOUT;
    var retries = opts.retries == null ? FETCH_RETRIES : opts.retries;
    function attempt(left) {
      var external = opts.signal || null;
      if (external && external.aborted) { var early = new Error("Request cancelled"); early.name = "AbortError"; return Promise.reject(early); }
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timedOut = false, timer = null, onAbort = null;
      var requestOpts = { method: opts.method || "GET", headers: opts.headers || { "Accept": "application/json" } };
      if (ctrl) {
        requestOpts.signal = ctrl.signal;
        if (external && external.addEventListener) {
          onAbort = function () { try { ctrl.abort(); } catch (e) {} };
          external.addEventListener("abort", onAbort, { once: true });
        }
      } else if (external) requestOpts.signal = external;
      var request = fetch(url, requestOpts);
      var timeout = new Promise(function (resolve, reject) {
        timer = setTimeout(function () {
          timedOut = true; try { if (ctrl) ctrl.abort(); } catch (e) {}
          var err = new Error("Request timed out"); err.name = "TimeoutError"; reject(err);
        }, timeoutMs);
      });
      return Promise.race([request, timeout]).then(function (r) {
        if (timer) clearTimeout(timer);
        if (external && onAbort && external.removeEventListener) external.removeEventListener("abort", onAbort);
        if (left > 0 && (r.status === 429 || r.status >= 500)) {
          return new Promise(function (res) { setTimeout(res, 450); }).then(function () { return attempt(left - 1); });
        }
        return r;
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        if (external && onAbort && external.removeEventListener) external.removeEventListener("abort", onAbort);
        if (external && external.aborted) { err = new Error("Request cancelled"); err.name = "AbortError"; }
        else if (timedOut && (!err || err.name === "AbortError")) { err = new Error("Request timed out"); err.name = "TimeoutError"; }
        if (left > 0 && (!err || err.name !== "AbortError")) {
          return new Promise(function (res) { setTimeout(res, 450); }).then(function () { return attempt(left - 1); });
        }
        throw err;
      });
    }
    return attempt(retries);
  }
  function fetchJson(url, opts) {
    return fetchWithTimeout(url, opts).then(function (r) {
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      var err = new Error("Database request failed (" + r.status + ")"); err.name = "HttpError"; err.status = r.status; throw err;
    });
  }

  /* -------------------------------------------------- Open*Facts family */
  var OFF_FIELDS = "code,product_type,product_name,product_name_en,brands,image_front_small_url,image_front_url,ingredients_text,ingredients_text_en,ingredients_text_with_allergens,ingredients_n,known_ingredients_n,unknown_ingredients_n,additives_tags,allergens_tags,traces_tags,categories_tags,labels,labels_tags,ingredients_analysis_tags,tags_sources,serving_quantity,nova_group,nutriscore_grade,nutriments,schema_version";
  var OFF_SCAN_FIELDS = OFF_FIELDS + ",ingredients";
  var OFF_V3_BASE = "https://world.openfoodfacts.org/api/v3/product/";
  function normalizedCertificationTag(tag) {
    return norm(String(tag || "").replace(/^[a-z]{2}:/i, "")).replace(/\s+/g, "-");
  }
  function certificationTagPolarity(tag, certification) {
    var value = normalizedCertificationTag(tag);
    var suffix = "-" + certification;
    if (value !== certification && value.slice(-suffix.length) !== suffix) return 0;
    var negative = new RegExp("(?:^|-)(?:not|non)(?:-[a-z0-9]+)*-" + certification + "$");
    return negative.test(value) ? -1 : 1;
  }
  function scrubCertificationLabel(labels, certification) {
    var pattern = certification === "organic" ?
      /\b(?:(?:not|non)[ -])?(?:(?:usda|eu)[ -])?(?:certified[ -])?organic\b/gi :
      /\b(?:(?:not|non)[ -])?(?:certified[ -])?kosher\b/gi;
    function scrub(value) {
      return String(value || "").replace(pattern, "")
        .replace(/\s+([,;|])/g, "$1").replace(/([,;|])\s*([,;|])/g, "$1")
        .replace(/^[\s,;|]+|[\s,;|]+$/g, "").replace(/\s{2,}/g, " ").trim();
    }
    if (Array.isArray(labels)) return labels.map(scrub).filter(Boolean);
    return scrub(labels);
  }
  // An explicit negative certification tag wins over every positive tag or
  // free-form label for the same certification. This prevents contradictory
  // Open*Facts records from turning an uncertain claim into a trusted badge.
  function resolveCertificationMetadata(labels, tags) {
    var safeTags = (Array.isArray(tags) ? tags : []).slice();
    var safeLabels = labels || "";
    ["organic", "kosher"].forEach(function (certification) {
      var hasNegative = safeTags.some(function (tag) { return certificationTagPolarity(tag, certification) === -1; });
      if (!hasNegative) return;
      safeTags = safeTags.filter(function (tag) { return certificationTagPolarity(tag, certification) !== 1; });
      safeLabels = scrubCertificationLabel(safeLabels, certification);
    });
    return { labels: safeLabels, labels_tags: safeTags };
  }
  // Certified-only kosher detection: trust an official Open*Facts kosher label
  // (e.g. "en:kosher", "en:ou-kosher"). We never guess kosher status from
  // ingredients — only report a certification the product data actually carries.
  function detectKosher(p) {
    var labels = (p && p.labels_tags) || [];
    for (var n = 0; n < labels.length; n++) {
      if (certificationTagPolarity(labels[n], "kosher") === -1) return false;
    }
    for (var i = 0; i < labels.length; i++) {
      if (certificationTagPolarity(labels[i], "kosher") === 1) return true;
    }
    return false;
  }
  function stripAllergenMarkup(s) {
    return String(s || "").replace(/<[^>]*>/g, "").replace(/_([^_]+)_/g, "$1").replace(/\s+/g, " ").trim();
  }
  function ingredientTextScore(text, meta) {
    text = String(text || "").trim(); meta = meta || {};
    if (!text) return 0;
    var alpha = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
    var separators = (text.match(/[,;]/g) || []).length;
    var score = Math.min(text.length, 600) + Math.min(separators, 40) * 14 + Math.min(+meta.ingredients_n || 0, 80) * 5;
    if (alpha < 3 || alpha / Math.max(text.length, 1) < 0.25) score -= 500;
    if (meta.known_ingredients_n != null && meta.ingredients_n && +meta.known_ingredients_n === +meta.ingredients_n) score += 60;
    if (meta.field === "ingredients_text_en") score += 35;
    else if (meta.field === "ingredients_text") score += 20;
    return score;
  }
  function selectIngredientPayload(p) {
    p = p || {};
    var fields = ["ingredients_text_en", "ingredients_text", "ingredients_text_with_allergens"], best = null;
    fields.forEach(function (field) {
      var raw = String(p[field] || "").trim(); if (!raw) return;
      var text = field.indexOf("with_allergens") !== -1 ? stripAllergenMarkup(raw) : raw;
      var candidate = { text: text, raw: raw, field: field, ingredients_n: p.ingredients_n,
        known_ingredients_n: p.known_ingredients_n, unknown_ingredients_n: p.unknown_ingredients_n };
      candidate.score = ingredientTextScore(text, candidate);
      if (!best || candidate.score > best.score) best = candidate;
    });
    return best;
  }
  function ingredientNodeText(node) {
    if (!node) return "";
    var text = String(node.text || "").trim();
    if (!text && node.id) text = String(node.id).replace(/^[a-z]{2}:/i, "").replace(/-/g, " ");
    return text;
  }
  function flattenStructuredIngredients(nodes) {
    var out = [], seen = {};
    function add(text) {
      text = String(text || "").replace(/\s+/g, " ").trim();
      var key = norm(text); if (!key || seen[key]) return;
      seen[key] = 1; out.push(text);
    }
    function walk(list) {
      (Array.isArray(list) ? list : []).forEach(function (node) {
        add(ingredientNodeText(node));
        if (node && node.ingredients) walk(node.ingredients);
      });
    }
    walk(nodes); return out;
  }
  function structuredIngredientsText(nodes) {
    function render(node) {
      var label = ingredientNodeText(node);
      var children = (node && Array.isArray(node.ingredients) ? node.ingredients : []).map(render).filter(Boolean);
      if (!label) return children.join(", ");
      return label + (children.length ? " (" + children.join(", ") + ")" : "");
    }
    return (Array.isArray(nodes) ? nodes : []).map(render).filter(Boolean).join(", ");
  }
  function structuredIngredientIds(nodes) {
    var out = {};
    function walk(list) {
      (Array.isArray(list) ? list : []).forEach(function (node) {
        var id = norm(String(node && node.id || "").replace(/^[a-z]{2}:/i, "").replace(/-/g, " "));
        if (id) out[id] = true;
        if (node && node.ingredients) walk(node.ingredients);
      });
    }
    walk(nodes); return out;
  }
  function buildAnalysisIngredients(rawText, structured, additiveTags, opts) {
    opts = opts || {};
    var raw = String(rawText || "").trim();
    var treeText = structuredIngredientsText(structured);
    var base = opts.preferStructured && treeText ? treeText : (raw || treeText);
    var folded = norm(base), extras = [], seen = {};
    var ids = structuredIngredientIds(structured);
    var enrichment = flattenStructuredIngredients(structured).map(function (text) { return { text: text, source: "tree" }; });
    enrichment = enrichment.concat((additiveTags || []).map(function (tag) {
      return { text: String(tag || "").replace(/^[a-z]{2}:/i, "").replace(/-/g, " "), source: "tag" };
    }));
    enrichment.forEach(function (entry) {
      var item = entry.text;
      var key = norm(item); if (!key || seen[key]) return; seen[key] = 1;
      // A structured node may be displayed by its ingredient name while the
      // additive tag uses its E-number (e.g. phosphoric acid / E338). The node
      // id proves they are the same finding, so do not append a duplicate root.
      if (entry.source === "tag" && ids[key]) return;
      // Append only database-provided nodes not already represented verbatim in
      // the label. This adds analysis coverage without rewriting the label text.
      if (folded.indexOf(key) === -1) extras.push(item);
    });
    return base + (extras.length ? (base ? ", " : "") + extras.join(", ") : "");
  }
  function sourceForType(type, fallback) {
    type = type === "product" ? "household" : type;
    for (var i = 0; i < OFF_SOURCES.length; i++) if (OFF_SOURCES[i].type === type) return OFF_SOURCES[i];
    return fallback || OFF_SOURCES[0];
  }
  function mapOff(p, code, src) {
    if (!p) return null;
    src = sourceForType(p.product_type, src);
    var cats = p.categories_tags || [], catTag = "";
    for (var i = cats.length - 1; i >= 0; i--) { if (/^en:/.test(cats[i]) && cats[i].length > 5) { catTag = cats[i].slice(3); break; } }
    if (!catTag && cats.length) catTag = String(cats[cats.length - 1]).replace(/^[a-z]{2}:/, "");
    var ing = selectIngredientPayload(p);
    var structured = Array.isArray(p.ingredients) ? p.ingredients : [];
    var rawIngredients = ing ? ing.text : "";
    var structuredFlatCount = flattenStructuredIngredients(structured).length;
    var useStructuredAnalysis = !!structured.length && (!rawIngredients || (!!p.ingredients_n && structuredFlatCount >= +p.ingredients_n));
    var ingredientText = rawIngredients || structuredIngredientsText(structured);
    var certificationMetadata = resolveCertificationMetadata(p.labels, p.labels_tags);
    return { barcode: code || p.code || "", name: p.product_name_en || p.product_name || "Unknown product", brand: p.brands || "",
      image: p.image_front_small_url || p.image_front_url || "", category: catTag, serving_quantity: p.serving_quantity,
      ingredientsText: ingredientText, rawIngredientsText: ing ? ing.raw : "",
      analysisIngredientsText: buildAnalysisIngredients(rawIngredients, structured, p.additives_tags, { preferStructured: useStructuredAnalysis }),
      ingredientField: ing ? ing.field : (structured.length ? "ingredients" : ""), ingredientTextGenerated: !ing && !!structured.length,
      ingredients: structured,
      ingredients_n: p.ingredients_n, known_ingredients_n: p.known_ingredients_n, unknown_ingredients_n: p.unknown_ingredients_n,
      additives_tags: p.additives_tags || [], allergens_tags: p.allergens_tags || [], traces_tags: p.traces_tags || [],
      labels: certificationMetadata.labels, labels_tags: certificationMetadata.labels_tags, ingredients_analysis_tags: p.ingredients_analysis_tags || [],
      tags_sources: p.tags_sources || null,
      productType: (src && src.type) || "food", source: (src && src.label) || "Open Food Facts",
      ingredientSource: (src && src.label) || "Open Food Facts", ingredientConfidence: 0,
      ingredientCoverage: !ing && structured.length ? "Structured database list · exact label text unavailable" :
        (p.ingredients_n && p.known_ingredients_n === p.ingredients_n ? "Database list · all parsed" : "Best available database list"),
      ingredientCoveragePct: p.ingredients_n ? Math.max(55, Math.min(100, Math.round((p.known_ingredients_n == null ? p.ingredients_n : p.known_ingredients_n) / p.ingredients_n * 100))) : (ingredientText ? 80 : 0),
      kosher: detectKosher({ labels_tags: certificationMetadata.labels_tags }), schema_version: p.schema_version,
      nova_group: p.nova_group, nutriscore_grade: p.nutriscore_grade, nutriments: p.nutriments || {} };
  }
  // Best-available calories per portion (engine).
  function computeKcal(off) { return ENG.computeKcal(off); }

  // localStorage barcode cache so repeat scans are instant and work offline
  // after the first successful fetch (hybrid mainly-offline).
  function cachedProduct(code) {
    try {
      var raw = localStorage.getItem("cb_prod_" + code); if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || rec.v !== PROD_CACHE_VERSION || (Date.now() - (rec.ts || 0)) > PROD_TTL) return null;
      return rec.off || null;
    } catch (e) { return null; }
  }
  function cacheProduct(codes, off) {
    (Array.isArray(codes) ? codes : [codes]).forEach(function (code) {
      try { localStorage.setItem("cb_prod_" + code, JSON.stringify({ v: PROD_CACHE_VERSION, ts: Date.now(), off: off })); } catch (e) {}
    });
  }
  function mergeOffRecords(records, code) {
    records = (records || []).filter(Boolean); if (!records.length) return null;
    function recordScore(o) {
      return ingredientTextScore(o.ingredientsText, o) * 3 + (o.name && o.name !== "Unknown product" ? 120 : 0) +
        (o.image ? 50 : 0) + (o.brand ? 20 : 0) + (o.nutriments && Object.keys(o.nutriments).length ? 80 : 0) + (o.schema_version ? 40 : 0);
    }
    var primary = records.slice().sort(function (a, b) { return recordScore(b) - recordScore(a); })[0];
    function ingredientRecordScore(o) {
      return ingredientTextScore(o.ingredientsText, o) + Math.max(0, Math.min(String(o.analysisIngredientsText || "").length - String(o.ingredientsText || "").length, 300)) * 2 +
        Math.min(flattenStructuredIngredients(o.ingredients).length, 80) * 8 + (o.schema_version ? 30 : 0);
    }
    var ingredient = records.slice().sort(function (a, b) { return ingredientRecordScore(b) - ingredientRecordScore(a); })[0];
    var out = {}, fields = ["barcode", "name", "brand", "image", "category", "serving_quantity", "productType", "useContext", "source", "kosher",
      "nova_group", "nutriscore_grade", "nutriments", "schema_version", "additives_tags", "allergens_tags", "traces_tags",
      "labels", "labels_tags", "ingredients_analysis_tags", "tags_sources", "formulaReferenceId", "formulaSourceUrl", "formulaSourceDate", "formulaNote"];
    fields.forEach(function (field) { out[field] = primary[field]; });
    records.forEach(function (o) {
      fields.forEach(function (field) {
        if ((out[field] == null || out[field] === "" || (Array.isArray(out[field]) && !out[field].length)) && o[field] != null) out[field] = o[field];
      });
      out.kosher = out.kosher || o.kosher;
    });
    ["additives_tags", "allergens_tags", "traces_tags", "labels_tags", "ingredients_analysis_tags"].forEach(function (field) {
      var values = [], seenValues = {};
      records.forEach(function (o) {
        (Array.isArray(o[field]) ? o[field] : []).forEach(function (value) {
          var key = norm(value); if (!key || seenValues[key]) return;
          seenValues[key] = true; values.push(value);
        });
      });
      out[field] = values;
    });
    var mergedCertificationMetadata = resolveCertificationMetadata(out.labels, out.labels_tags);
    out.labels = mergedCertificationMetadata.labels;
    out.labels_tags = mergedCertificationMetadata.labels_tags;
    out.kosher = detectKosher(out);
    out.barcode = code || primary.barcode;
    if (ingredient && ingredient.ingredientsText) {
      ["ingredientsText", "rawIngredientsText", "analysisIngredientsText", "ingredientField", "ingredientTextGenerated", "ingredients", "ingredients_n", "known_ingredients_n",
        "unknown_ingredients_n", "ingredientSource", "ingredientConfidence", "ingredientCoverage", "ingredientCoveragePct", "useContext",
        "formulaReferenceId", "formulaSourceUrl", "formulaSourceDate", "formulaNote"].forEach(function (field) { out[field] = ingredient[field]; });
      out.productType = ingredient.productType || out.productType;
      var mergedStructured = Array.isArray(out.ingredients) ? out.ingredients : [];
      var mergedStructuredCount = flattenStructuredIngredients(mergedStructured).length;
      var mergedRawIngredients = out.ingredientTextGenerated ? "" : out.ingredientsText;
      var preferMergedStructure = !!mergedStructured.length && (!mergedRawIngredients ||
        (!!out.ingredients_n && mergedStructuredCount >= +out.ingredients_n));
      // Rebuild after the tag union. Otherwise additive tags contributed by a
      // secondary OFF endpoint exist in metadata but never reach classification.
      out.analysisIngredientsText = ingredient.formulaReferenceId && ingredient.analysisIngredientsText ? ingredient.analysisIngredientsText :
        buildAnalysisIngredients(mergedRawIngredients, mergedStructured,
          out.additives_tags, { preferStructured: preferMergedStructure });
    } else {
      out.ingredientsText = out.rawIngredientsText = out.analysisIngredientsText = "";
      out.ingredientConfidence = 0; out.ingredientCoverage = "No database ingredient list"; out.ingredientCoveragePct = 0;
    }
    var sourceList = [];
    records.forEach(function (o) { if (o.source && sourceList.indexOf(o.source) === -1) sourceList.push(o.source); });
    out.sourceList = sourceList;
    if (ingredient && ingredient.source !== primary.source) out.source = primary.source + "; ingredients: " + ingredient.source;
    return out;
  }
  function productFromResponse(j) {
    if (!j || !j.product) return null;
    if (j.status === 1 || j.status === "success" || (j.result && j.result.id === "product_found")) return j.product;
    return null;
  }
  function referenceProductOff(ref, scannedCode) {
    if (!ref) return null;
    var code = scannedCode || (ref.barcodes && ref.barcodes[0]) || "";
    return {
      barcode: code, name: ref.name, brand: ref.brand || "", category: ref.category || "",
      productType: ref.productType || "beauty", useContext: ref.useContext || "",
      ingredientsText: ref.ingredientsText || "", rawIngredientsText: ref.ingredientsText || "",
      analysisIngredientsText: ref.analysisIngredientsText || ref.ingredientsText || "", ingredients: [], additives_tags: [], allergens_tags: [], traces_tags: [],
      labels: "", labels_tags: [], ingredients_analysis_tags: [], nutriments: {},
      source: ref.source || "Official formula reference", sourceList: [ref.source || "Official formula reference"],
      ingredientSource: ref.source || "Official formula reference", ingredientConfidence: 100,
      ingredientCoverage: "Published complete formula · verify package after reformulation", ingredientCoveragePct: 100,
      formulaReferenceId: ref.id || "", formulaSourceUrl: ref.sourceUrl || "", formulaSourceDate: ref.sourceDate || "",
      formulaNote: "Exact-product reference only. The package label wins if the manufacturer reformulates."
    };
  }
  function referenceForBarcode(code) {
    var variants = barcodeLookupVariants(code || "");
    return ((COS && COS.referenceProducts) || []).filter(function (ref) {
      return (ref.barcodes || []).some(function (barcode) { return variants.indexOf(barcode) !== -1; });
    })[0] || null;
  }
  function referenceSearchResults(query) {
    var q = norm(query), toks = q.split(/\s+/).filter(Boolean);
    if (!q || !toks.length) return [];
    return ((COS && COS.referenceProducts) || []).filter(function (ref) {
      var hay = norm([ref.name, ref.brand, ref.category].concat(ref.aliases || []).join(" "));
      return toks.every(function (tok) { return hay.indexOf(tok) !== -1; });
    }).map(function (ref) { return referenceProductOff(ref); });
  }
  // Read the current v3 all-product endpoint for its rich nested ingredient tree,
  // plus the family v2 endpoints as compatibility/fallback records. We select one
  // complete ingredient payload; lists from different products are never spliced.
  function lookupBarcode(code, opts) {
    opts = opts || {};
    var variants = barcodeLookupVariants(code), cached = null;
    var localReference = referenceForBarcode(code);
    for (var c = 0; c < variants.length && !cached; c++) cached = cachedProduct(variants[c]);
    if (cached) return Promise.resolve(cached);
    function querySource(src, v3) {
      var responded = false, i = 0;
      function next() {
        if (i >= variants.length) return Promise.resolve({ record: null, responded: responded });
        var candidate = variants[i++];
        var url = v3
          ? OFF_V3_BASE + encodeURIComponent(candidate) + "?product_type=all&fields=" + encodeURIComponent(OFF_SCAN_FIELDS)
          : src.base + encodeURIComponent(candidate) + ".json?fields=" + encodeURIComponent(OFF_SCAN_FIELDS);
        return fetchJson(url, { signal: opts.signal }).then(function (j) {
          responded = true;
          var p = productFromResponse(j);
          return p ? { record: mapOff(p, code, src), responded: true } : next();
        });
      }
      return next().catch(function (err) {
        if (err && err.name === "AbortError") throw err;
        return { record: null, responded: responded, error: err };
      });
    }
    var jobs = [querySource(OFF_SOURCES[0], true)].concat(OFF_SOURCES.map(function (src) { return querySource(src, false); }));
    return Promise.all(jobs).then(function (results) {
      var records = results.map(function (r) { return r.record; }).filter(Boolean);
      if (localReference) records.push(referenceProductOff(localReference, code));
      var anyResponse = results.some(function (r) { return r.responded; });
      var merged = mergeOffRecords(records, code);
      if (merged) { cacheProduct(variants, merged); return merged; }
      if (!anyResponse && !localReference) { var err = new Error("Product databases unavailable"); err.name = "NetworkError"; throw err; }
      return null;
    });
  }
  function searchProducts(query) {
    // Search every Open*Facts database (food, beauty, household, pet food) in
    // parallel so ANY product type is findable by name — not just food. Each
    // source tags its results with the right productType via mapOff(src), so
    // opening a result builds it through the correct (food vs cosmetic) path.
    // A single source failing (timeout / down) must not sink the whole search.
    var jobs = OFF_SOURCES.map(function (src) {
      var host = src.base.split("/api/")[0];
      var url = host + "/cgi/search.pl?search_terms=" + encodeURIComponent(query) +
        "&search_simple=1&action=process&json=1&page_size=20&fields=" + OFF_FIELDS;
      return fetchJson(url).then(function (j) {
        return ((j && j.products) || []).map(function (p) { return mapOff(p, "", src); });
      }).catch(function () { return []; });
    });
    return Promise.all(jobs).then(function (lists) {
      lists.unshift(referenceSearchResults(query));
      var seen = {}, out = [];
      lists.forEach(function (arr) {
        arr.forEach(function (o) {
          if (!o || !o.name || o.name === "Unknown product") return;
          var key = o.barcode || (o.name + "|" + o.brand);
          if (seen[key]) return; seen[key] = 1;
          out.push(o);
        });
      });
      return out;
    });
  }
  function buildProduct(off, ingredientsText, opts) {
    opts = opts || {};
    var text = ingredientsText || (off && off.ingredientsText) || "";
    var analysisText = opts.analysisIngredientsText || (off && off.analysisIngredientsText) || text;
    var ptype = opts.productType || (off && off.productType) || "food";
    var food = ENG.isFoodType(ptype);
    var r = analyze(off, analysisText, ptype);
    return {
      id: (off && off.barcode) || ("p" + Date.now()), barcode: (off && off.barcode) || "",
      name: (off && off.name) || opts.name || "Scanned product", brand: (off && off.brand) || "",
      image: (off && off.image) || "", category: (off && off.category) || "", photoKey: opts.photoKey || "", ingredientsText: text,
      rawIngredientsText: opts.rawIngredientsText || (off && off.rawIngredientsText) || text,
      analysisIngredientsText: analysisText, ocrRawText: opts.ocrRawText || "",
      ingredientTextGenerated: !!(off && off.ingredientTextGenerated),
      source: opts.source || (off && off.source) || (off ? "Open Food Facts" : "Photo / OCR"),
      sourceList: (off && off.sourceList) || [],
      ingredientSource: opts.ingredientSource || (off && off.ingredientSource) || (opts.source || "Label photo / OCR"),
      ingredientConfidence: opts.ingredientConfidence != null ? opts.ingredientConfidence : ((off && off.ingredientConfidence) || 0),
      ingredientCoverage: opts.ingredientCoverage || (off && off.ingredientCoverage) || (text ? "Ingredient list available" : "No ingredient list"),
      ingredientCoveragePct: opts.ingredientCoveragePct != null ? opts.ingredientCoveragePct : ((off && off.ingredientCoveragePct) || 0),
      productType: ptype, isFood: food, kosher: !!(off && off.kosher),
      useContext: r.useContext || null,
      formulaReferenceId: (off && off.formulaReferenceId) || "", formulaSourceUrl: (off && off.formulaSourceUrl) || "",
      formulaSourceDate: (off && off.formulaSourceDate) || "", formulaNote: (off && off.formulaNote) || "",
      structuredIngredients: (off && off.ingredients) || [],
      labels: (off && off.labels) || "", labels_tags: (off && off.labels_tags) || [],
      ingredients_analysis_tags: (off && off.ingredients_analysis_tags) || [], tags_sources: (off && off.tags_sources) || null,
      ingredients_n: off && off.ingredients_n, known_ingredients_n: off && off.known_ingredients_n,
      unknown_ingredients_n: off && off.unknown_ingredients_n,
      additives_tags: (off && off.additives_tags) || [], allergens_tags: (off && off.allergens_tags) || [], traces_tags: (off && off.traces_tags) || [],
      nutriments: food ? ((off && off.nutriments) || null) : null,
      kcal: food ? computeKcal(off) : null,
      macros: food ? ENG.computeMacros(off) : null,
      score: r.score, badge: r.badge, classified: r.classified, nutrition: r.nutrition,
      flaggedCount: r.flaggedCount, scoreReasons: r.scoreReasons,
      coverage: r.coverage, ratingConfidence: r.ratingConfidence, scanQuality: r.scanQuality,
      rejectedFragments: r.rejectedFragments || [], allergens: r.allergens || [], methodology: r.methodology || null,
      ingredientHierarchy: r.ingredientHierarchy || [], categorySummaries: r.categorySummaries || [],
      ingredientStats: r.ingredientStats || null, productAttributes: r.productAttributes || null,
      logged: "checked", ateAt: 0, portion: 1, ts: Date.now()
    };
  }
  function rehydrateProduct(product) {
    if (!product || (product.ingredientHierarchy && product.categorySummaries && product.productAttributes)) return product;
    var text = product.analysisIngredientsText || product.ingredientsText || "";
    if (!text) return product;
    try {
      var rebuilt = buildProduct(product, product.ingredientsText || text, {
        analysisIngredientsText: text, rawIngredientsText: product.rawIngredientsText || product.ingredientsText || "",
        productType: product.productType, name: product.name, source: product.source,
        ingredientSource: product.ingredientSource, ingredientConfidence: product.ingredientConfidence,
        ingredientCoverage: product.ingredientCoverage, ingredientCoveragePct: product.ingredientCoveragePct,
        photoKey: product.photoKey, ocrRawText: product.ocrRawText
      });
      var hydrated = {};
      Object.keys(product).forEach(function (key) { hydrated[key] = product[key]; });
      Object.keys(rebuilt).forEach(function (key) { hydrated[key] = rebuilt[key]; });
      ["id", "barcode", "ts", "logged", "ateAt", "portion", "photoKey", "image"].forEach(function (key) {
        if (product[key] != null) hydrated[key] = product[key];
      });
      return hydrated;
    } catch (e) { return product; }
  }
  // Adjust the serving multiplier on the current product (food only), keep
  // the history/favorites copies in sync, and re-render scaled kcal + macros.
  function setPortion(delta) {
    var p = state.product; if (!p) return;
    var next = Math.round(((p.portion || 1) + delta) * 4) / 4;
    next = Math.max(0.25, Math.min(10, next));
    p.portion = next;
    var h = state.history.filter(function (x) { return x.id === p.id; })[0]; if (h) h.portion = next;
    var f = state.favorites.filter(function (x) { return x.id === p.id; })[0]; if (f) f.portion = next;
    saveHistory(); saveFavs(); render();
  }
  function scaledKcal(p) { var k = num(p.kcal); return k == null ? null : Math.round(k * (p.portion || 1)); }
  function scaledMacro(p, key) {
    var m = p.macros; if (!m || m[key] == null) return null;
    return Math.round(m[key] * (p.portion || 1));
  }
  function setLogged(lg) {
    if (!state.product) return;
    var at = lg === "eaten" ? Date.now() : 0;
    state.product.logged = lg; state.product.ateAt = at;
    var h = state.history.filter(function (x) { return x.id === state.product.id; })[0];
    if (h) { h.logged = lg; h.ateAt = at; }
    var f = state.favorites.filter(function (x) { return x.id === state.product.id; })[0];
    if (f) { f.logged = lg; f.ateAt = at; }
    saveHistory(); saveFavs(); render();
  }
  function searchByCategory(cat) {
    var url = "https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&page_size=40" +
      "&tagtype_0=categories&tag_contains_0=contains&tag_0=" + encodeURIComponent(cat) + "&fields=" + OFF_FIELDS;
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.json(); })
      .then(function (j) {
        return ((j && j.products) || []).map(function (p) { return mapOff(p); })
          .filter(function (o) { return o && o.ingredientsText && o.name !== "Unknown product"; });
      });
  }
  function findAlternatives(p) {
    if (!p.category) return Promise.resolve([]);
    return searchByCategory(p.category).then(function (offs) {
      var seen = {}, alts = [];
      offs.forEach(function (o) {
        var key = o.barcode || o.name;
        if ((o.barcode && o.barcode === p.barcode) || seen[key]) return;
        seen[key] = 1;
        var prod = buildProduct(o);
        if (prod.score < p.score + 8) return;
        // Blend the raw health score with how well the product fits the user's
        // diet/allergen profile: every personal alert (e.g. contains an allergen
        // the user flagged) docks the fit so cleaner-for-this-user options rank up.
        var alerts = personalAlerts(prod.classified || []);
        prod.fitBonus = -12 * alerts.length;
        prod.fitScore = prod.score + prod.fitBonus;
        alts.push(prod);
      });
      alts.sort(function (a, b) {
        if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
        return b.score - a.score;
      });
      return alts.slice(0, 4);
    }).catch(function () { return []; });
  }
  function maybeLoadAlternatives(p) {
    if (!p || !p.category || p.score >= 75) { state.alts = { forId: p ? p.id : "", loading: false, list: [] }; return; }
    state.alts = { forId: p.id, loading: true, list: null }; render();
    findAlternatives(p).then(function (list) {
      if (state.product && state.product.id === p.id) { state.alts = { forId: p.id, loading: false, list: list }; render(); }
    });
  }
  function openResult(product) {
    product = rehydrateProduct(product);
    state.product = product; state.scoreOpen = false;
    state.alts = { forId: product.id, loading: false, list: null };
    go("result");
    maybeLoadAlternatives(product);
  }
  function showProduct(product) {
    state.history = state.history.filter(function (h) { return !(h.barcode && h.barcode === product.barcode) && h.id !== product.id; });
    state.history.unshift(product);
    saveHistory();
    openResult(product);
  }
  function computeInsights(h) {
    var sum = 0, dist = { exc: 0, good: 0, mid: 0, bad: 0 }, flags = {}, best = null, worst = null;
    h.forEach(function (p) {
      sum += p.score || 0;
      if (dist[p.badge.cls] != null) dist[p.badge.cls]++;
      if (!best || p.score > best.score) best = p;
      if (!worst || p.score < worst.score) worst = p;
      var local = {};
      (p.classified || []).forEach(function (c) {
        if (c.status === "avoid" || c.status === "caution") {
          var nm = c.additive ? titleCase(c.additive.names[0]) : titleCase(c.name || c.raw);
          if (!local[nm]) { local[nm] = 1; flags[nm] = (flags[nm] || 0) + 1; }
        }
      });
    });
    var top = Object.keys(flags).map(function (k) { return { name: k, count: flags[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
    return { n: h.length, avg: h.length ? Math.round(sum / h.length) : 0, dist: dist, top: top, best: best, worst: worst };
  }
  function sameDay(a, b) {
    if (!a) return false;
    var d1 = new Date(a), d2 = new Date(b);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  }
  function todayCard() {
    var tgt = computeTargets(state.health);
    if (!tgt) return '<div class="panel glass today"><div class="lrow"><div class="row-main"><div class="row-title">Set your calorie goal</div>' +
      '<div class="row-sub">Add your details in Profile to track today\'s intake</div></div><button class="chip on" data-nav="profile">Set up</button></div></div>';
    var items = state.history.filter(function (p) { return p.logged === "eaten" && sameDay(p.ateAt, Date.now()); });
    var eaten = Math.round(items.reduce(function (s, p) { return s + (scaledKcal(p) || 0); }, 0));
    var pct = Math.min(100, Math.round(eaten / tgt.target * 100));
    var remaining = tgt.target - eaten;
    // Sum consumed macros (per-portion) for the macros-vs-target row.
    var mac = { protein: 0, carbs: 0, fat: 0 };
    items.forEach(function (p) { ['protein', 'carbs', 'fat'].forEach(function (k) { var v = scaledMacro(p, k); if (v != null) mac[k] += v; }); });
    function macCell(key, lbl) {
      var got = Math.round(mac[key]), goal = tgt[key];
      var mpct = goal ? Math.min(100, Math.round(got / goal * 100)) : 0;
      return '<div class="macro"><div class="macro-num">' + got + '<span class="mg">/' + goal + 'g</span></div>' +
        '<div class="mtrack"><div class="mfill ' + key + '" style="width:' + mpct + '%"></div></div>' +
        '<div class="macro-lbl">' + lbl + '</div></div>';
    }
    var macros = '<div class="macros today-macros">' + macCell("protein", "Protein") + macCell("carbs", "Carbs") + macCell("fat", "Fat") + '</div>';
    var rows = items.length ? items.map(function (p) {
      return '<div class="lrow"><div class="row-main"><div class="row-title">' + esc(p.name) +
        ((p.portion && p.portion !== 1) ? ' <span class="por-tag">' + p.portion + '×</span>' : "") + '</div></div>' +
        '<div class="brk-val">' + (scaledKcal(p) != null ? scaledKcal(p) + " kcal" : "—") + '</div></div>';
    }).join("") : '<div class="lrow"><div class="row-main"><div class="row-sub">Nothing logged today — tap “I ate this” on a product.</div></div></div>';
    return '<div class="panel glass today"><div class="panel-h">Today <span class="cnt">' + items.length + ' eaten</span></div>' +
      '<div class="today-cal"><div><span class="te">≈' + eaten + '</span> <span class="tt">/ ' + tgt.target + ' kcal</span></div>' +
      '<div class="trem' + (remaining < 0 ? " over" : "") + '">' + (remaining >= 0 ? remaining + " left" : (-remaining) + " over") + '</div></div>' +
      '<div class="tbar"><div class="tfill" style="width:' + pct + '%' + (remaining < 0 ? ";background:var(--bad)" : "") + '"></div></div>' +
      macros + rows + '</div>';
  }

  // Last-7-day intake trend: a lightweight inline bar per day of eaten kcal
  // vs target. No chart lib — just divs. Returns "" when nothing to show.
  function trendsCard() {
    var tgt = computeTargets(state.health);
    var eaten = state.history.filter(function (p) { return p.logged === "eaten" && p.ateAt; });
    if (!eaten.length) return "";
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      var kcal = eaten.filter(function (p) { return sameDay(p.ateAt, d.getTime()); })
        .reduce(function (s, p) { return s + (scaledKcal(p) || 0); }, 0);
      days.push({ d: d, kcal: Math.round(kcal) });
    }
    var maxK = Math.max(tgt ? tgt.target : 0, days.reduce(function (m, x) { return Math.max(m, x.kcal); }, 0), 1);
    var dow = ["S", "M", "T", "W", "T", "F", "S"];
    var bars = days.map(function (x) {
      var h = Math.round(x.kcal / maxK * 100);
      var over = tgt && x.kcal > tgt.target;
      return '<div class="trend-col"><div class="trend-bar-wrap">' +
        '<div class="trend-bar' + (over ? " over" : "") + '" style="height:' + h + '%"></div></div>' +
        '<div class="trend-day">' + dow[x.d.getDay()] + '</div></div>';
    }).join("");
    var goalLine = tgt ? '<div class="trend-goal" style="bottom:' + Math.round(tgt.target / maxK * 100) + '%"></div>' : "";
    return '<div class="panel glass"><div class="panel-h">Last 7 days' +
      (tgt ? '<span class="cnt">goal ' + tgt.target + ' kcal</span>' : "") + '</div>' +
      '<div class="trend-chart">' + goalLine + bars + '</div></div>';
  }

  /* ------------------------------------------------------- scanner */
  // Barcode decoding uses ZBar (WebAssembly) as the primary engine. Its 1D/UPC
  // locator is far stronger than the old pure-JS ZXing path and it runs at
  // near-native speed, which is what actually makes scanning work inside iOS
  // WKWebView (where the native BarcodeDetector API is unsupported). ZBar reads
  // both horizontal and vertical orientations itself. ZXing is kept only as a
  // fallback for when the vendored ZBar module failed to load.
  var zxingReader = null;
  var camStream = null, scanRAF = null, scanBusy = false, scanCanvas = null, scanCtx = null;
  var scanSamples = [], lastScanAttemptAt = 0, scanHelpTimer = null;
  function zbarReady() { return !!(window.zbarWasm && window.zbarWasm.scanImageData); }
  function resetScanConsensus() { scanSamples = []; lastScanAttemptAt = 0; }
  function registerLiveCandidate(raw) {
    var code = normalizeBarcode(raw), now = Date.now();
    if (!code) return null;
    scanSamples.push({ code: code, at: now });
    scanSamples = scanSamples.filter(function (s) { return now - s.at <= 2200; }).slice(-12);
    var winner = selectConsensusCandidate(scanSamples, 2, 2200, now);
    if (!winner) setStatus("Barcode seen — hold steady…");
    return winner ? winner.code : null;
  }
  // Decode any barcode ZBar finds in a canvas; reject non-GTIN symbols and bad
  // check digits before they can enter consensus.
  function zbarDecodeCanvas(canvas) {
    if (!zbarReady()) return Promise.resolve(null);
    var imgData;
    try {
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) { return Promise.resolve(null); }
    return window.zbarWasm.scanImageData(imgData).then(function (syms) {
      if (!syms || !syms.length) return null;
      for (var i = 0; i < syms.length; i++) {
        var t = "";
        try { t = syms[i].decode(); } catch (e2) {}
        t = normalizeBarcode(t);
        if (t) return t;
      }
      return null;
    }).catch(function () { return null; });
  }
  function startScanner() {
    if (state.view !== "scanner") return;
    if (camStream || scanRAF) stopScanner(); // never open a second camera on a double entry
    resetScanConsensus(); state.scanError = "";
    setStatus("Starting camera…");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.scanError = "Live camera scanning is not available here. Enter the printed digits, or open NutriCheck on a camera-enabled device.";
      go("manual"); return;
    }
    // facingMode:{ideal} is only a soft hint — iOS may hand back the FRONT
    // camera, so try an exact environment lock first and fall back progressively.
    var tries = [
      { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true }
    ];
    function getCam(i) {
      return navigator.mediaDevices.getUserMedia(tries[i]).catch(function (e) {
        if (i + 1 < tries.length) return getCam(i + 1);
        throw e;
      });
    }
    getCam(0).then(function (stream) {
      // A re-render may have navigated us away before the camera opened; release
      // it and bail quietly instead of alerting "camera unavailable".
      if (state.view !== "scanner") { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return; }
      var video = document.getElementById("cam");
      if (!video) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} throw new Error("scanner unavailable"); }
      camStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      try {
        var track = stream.getVideoTracks && stream.getVideoTracks()[0];
        var caps = track && track.getCapabilities ? track.getCapabilities() : null;
        if (track && caps && caps.focusMode && caps.focusMode.indexOf("continuous") !== -1) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(function () {});
        }
      } catch (focusErr) {}
      var pl = video.play();
      if (pl && pl.catch) pl.catch(function () {});
      scanCanvas = document.createElement("canvas");
      scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
      if (!zbarReady()) return startScannerZXing(video);
      setStatus("Point the back camera at the barcode");
      scanHelpTimer = setTimeout(function () {
        if (state.view === "scanner" && camStream && !scanSamples.length) setStatus("Still looking — move closer, reduce glare, or take a photo");
      }, 12000);
      loopScan(video);
    }).catch(function (e) {
      setStatus("");
      var msg = "Camera unavailable. Enter the barcode manually.";
      if (e && e.name === "NotAllowedError") msg = "Camera access is blocked. Allow camera for this site in Settings, then retry — or enter the barcode manually.";
      else if (e && e.name === "NotFoundError") msg = "No camera was found. Enter the barcode manually.";
      state.scanError = msg;
      go("manual");
    });
  }
  // Grab frames and decode with ZBar. We scan a centred horizontal band (where the
  // on-screen guide sits and a UPC is usually held) downscaled to ~960px so each
  // pass is fast; scanBusy serialises passes so we never queue frames faster than
  // ZBar can clear them.
  function loopScan(video) {
    if (state.view !== "scanner" || !camStream) return;
    var now = Date.now();
    if (!scanBusy && now - lastScanAttemptAt >= 120 && video.readyState >= 2 && video.videoWidth) {
      lastScanAttemptAt = now;
      scanBusy = true;
      var vw = video.videoWidth, vh = video.videoHeight;
      var cropH = Math.round(vh * 0.6), sy = Math.round((vh - cropH) / 2);
      var scale = Math.min(1, 960 / vw);
      var dw = Math.max(1, Math.round(vw * scale)), dh = Math.max(1, Math.round(cropH * scale));
      scanCanvas.width = dw; scanCanvas.height = dh;
      scanCtx.drawImage(video, 0, sy, vw, cropH, 0, 0, dw, dh);
      zbarDecodeCanvas(scanCanvas).then(function (code) {
        scanBusy = false;
        if (!code || state.view !== "scanner") return;
        code = registerLiveCandidate(code);
        if (!code) return;
        stopScanner();
        handleBarcode(code, { origin: "live" });
      });
    }
    scanRAF = requestAnimationFrame(function () { loopScan(video); });
  }
  // Legacy ZXing live decoder, used only when ZBar is unavailable. Reuses the
  // already-opened camera stream.
  function startScannerZXing(video) {
    var p = window.ZXing ? Promise.resolve() : loadScriptLocalFirst(ZXING_LOCAL, ZXING_URL);
    return p.then(function () {
      if (state.view !== "scanner") return;
      if (!video || !window.ZXing) throw new Error("scanner unavailable");
      var hints = new Map(), F = ZXing.BarcodeFormat;
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.ITF]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxingReader = new ZXing.BrowserMultiFormatReader(hints, 120);
      setStatus("Point the back camera at the barcode");
      scanHelpTimer = setTimeout(function () {
        if (state.view === "scanner" && camStream && !scanSamples.length) setStatus("Still looking — move closer, reduce glare, or take a photo");
      }, 12000);
      var onDecode = function (res) {
        if (!res || state.view !== "scanner") return;
        var code = registerLiveCandidate(res.getText());
        if (code) { stopScanner(); handleBarcode(code, { origin: "live" }); }
      };
      return zxingReader.decodeFromStream(camStream, video, onDecode);
    });
  }
  function stopScanner() {
    if (scanHelpTimer) { clearTimeout(scanHelpTimer); scanHelpTimer = null; }
    if (scanRAF) { try { cancelAnimationFrame(scanRAF); } catch (e) {} scanRAF = null; }
    scanBusy = false;
    try { if (zxingReader) zxingReader.reset(); } catch (e) {}
    zxingReader = null;
    if (camStream) { try { camStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} camStream = null; }
    var v = document.getElementById("cam");
    if (v) { try { v.srcObject = null; } catch (e) {} }
    resetScanConsensus();
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("img load failed")); };
      im.src = src;
    });
  }
  // Draw a centered crop of the source image to a canvas at a target longest-edge
  // size and rotation, returning a JPEG data URL. A phone photo of a barcode often
  // only decodes at a particular zoom/orientation (the barcode is small or turned),
  // so we generate several variants to try. cropFrac<1 zooms into the centre where
  // the user aims the code.
  function renderVariant(img, maxEdge, rotDeg, cropFrac) {
    try {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      var cf = cropFrac || 1;
      var cw = Math.round(w * cf), ch = Math.round(h * cf);
      var sx = Math.round((w - cw) / 2), sy = Math.round((h - ch) / 2);
      var scale = Math.min(1, maxEdge / Math.max(cw, ch));
      var dw = Math.round(cw * scale), dh = Math.round(ch * scale);
      var c = document.createElement("canvas");
      var ctx = c.getContext("2d");
      if (rotDeg === 90 || rotDeg === 270) { c.width = dh; c.height = dw; } else { c.width = dw; c.height = dh; }
      ctx.save();
      if (rotDeg === 90) { ctx.translate(dh, 0); ctx.rotate(Math.PI / 2); }
      else if (rotDeg === 180) { ctx.translate(dw, dh); ctx.rotate(Math.PI); }
      else if (rotDeg === 270) { ctx.translate(0, dw); ctx.rotate(3 * Math.PI / 2); }
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, dw, dh);
      ctx.restore();
      return c.toDataURL("image/jpeg", 0.95);
    } catch (e) { return null; }
  }
  // Reliable path for iOS: decode a barcode from a single still photo taken with
  // the native camera (full autofocus + resolution), instead of the live stream
  // which often can't focus on dense UPC bars in WKWebView. ZBar makes one pass
  // per image but reads both orientations itself, so we only vary the centre
  // zoom; if ZBar isn't loaded we fall back to the ZXing multi-pass decoder.
  function decodeBarcodeFromImage(dataUrl) {
    if (!zbarReady()) return decodeBarcodeFromImageZXing(dataUrl);
    return loadImage(dataUrl).then(function (img) {
      var crops = [1, 0.78, 0.58, 0.4], i = 0, candidates = [];
      function next() {
        if (i >= crops.length) return candidates;
        var url = renderVariant(img, 1600, 0, crops[i++]);
        if (!url) return next();
        return loadImage(url).then(function (vimg) {
          var c = document.createElement("canvas");
          c.width = vimg.naturalWidth || vimg.width;
          c.height = vimg.naturalHeight || vimg.height;
          c.getContext("2d", { willReadFrequently: true }).drawImage(vimg, 0, 0);
          return zbarDecodeCanvas(c);
        }).then(function (code) { if (code) candidates.push(code); return next(); }).catch(function () { return next(); });
      }
      return next();
    }).then(function (candidates) {
      var counts = {}, winner = null;
      (candidates || []).forEach(function (code) {
        counts[code] = (counts[code] || 0) + 1;
        if (!winner || counts[code] > counts[winner]) winner = code;
      });
      // Conflicting valid codes are safer to reject than to guess. A lone result
      // is acceptable for a still image because it has already passed checksum.
      if (winner && Object.keys(counts).every(function (k) { return k === winner || counts[winner] >= 2; })) return winner;
      return decodeBarcodeFromImageZXing(dataUrl);
    });
  }
  function decodeBarcodeFromImageZXing(dataUrl) {
    var p = window.ZXing ? Promise.resolve() : loadScriptLocalFirst(ZXING_LOCAL, ZXING_URL);
    return p.then(function () {
      if (!window.ZXing) return null;
      var F = ZXing.BarcodeFormat;
      function makeReader() {
        var hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
          [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.ITF]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        return new ZXing.BrowserMultiFormatReader(hints);
      }
      // Full frame first, then progressively zoom into the centre; each at
      // horizontal then vertical orientation. 180°/270° are redundant for a 1D
      // barcode (TRY_HARDER already reads the reversed row).
      var attempts = [];
      [1, 0.7, 0.5, 0.35].forEach(function (crop) {
        [0, 90].forEach(function (rot) { attempts.push({ crop: crop, rot: rot }); });
      });
      return loadImage(dataUrl).then(function (img) {
        var i = 0, candidates = [];
        function next() {
          if (i >= attempts.length) {
            var counts = {}, winner = null;
            candidates.forEach(function (code) { counts[code] = (counts[code] || 0) + 1; if (!winner || counts[code] > counts[winner]) winner = code; });
            if (!winner) return null;
            if (Object.keys(counts).length > 1 && counts[winner] < 2) return null;
            return winner;
          }
          var a = attempts[i++];
          var url = renderVariant(img, 1600, a.rot, a.crop);
          if (!url) return next();
          return loadImage(url).then(function (variantImg) {
            return makeReader().decodeFromImageElement(variantImg).then(function (res) {
              return res ? normalizeBarcode(res.getText()) : null;
            }).catch(function () { return null; });
          }).catch(function () { return null; }).then(function (code) {
            if (code) candidates.push(code);
            return next();
          });
        }
        return next();
      });
    }).catch(function () { return null; });
  }

  function runSearch(query) {
    query = String(query || "").trim();
    if (query.length < 2) return;
    state.searchQuery = query; state.searchRaw = null; state.searchResults = null; state.searchSort = "rel";
    go("search");
    busy(true, "Searching…");
    searchProducts(query).then(function (results) {
      busy(false, ""); state.searchRaw = results; render();
    }).catch(function () { busy(false, ""); state.searchRaw = []; render(); });
  }
  function openOff(off) {
    if (!off) return;
    if (!off.ingredientsText) { state.pending = { barcode: off.barcode, off: off, reason: "missingIngredients" }; go("addPhoto"); return; }
    showProduct(buildProduct(off));
  }

  var activeLookup = null, lookupSequence = 0, lastLookupCode = "", lastLookupAt = 0;
  function handleBarcode(rawCode, opts) {
    opts = opts || {};
    var code = normalizeBarcode(rawCode);
    if (!code) {
      var msg = "That is not a valid UPC/EAN/GTIN. Check every digit, including the final check digit.";
      if (opts.origin === "live") { setStatus("Could not verify that read — hold the barcode steady"); return Promise.resolve(null); }
      state.scanError = msg; state.manualCode = String(rawCode || "").replace(/[^0-9]/g, "").slice(0, 18);
      if (state.view !== "manual") go("manual"); else render();
      return Promise.resolve(null);
    }
    var now = Date.now();
    if (!opts.force && activeLookup && activeLookup.code === code) return activeLookup.promise;
    if (!opts.force && code === lastLookupCode && now - lastLookupAt < 3000) return Promise.resolve(null);
    if (activeLookup && activeLookup.controller) { try { activeLookup.controller.abort(); } catch (e) {} }
    if (opts.origin === "live" || opts.origin === "photo") stopScanner();
    state.scanError = ""; state.manualCode = code; lastLookupCode = code; lastLookupAt = now;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var seq = ++lookupSequence;
    busy(true, "Looking up product…");
    var task = lookupBarcode(code, { signal: controller ? controller.signal : null }).then(function (off) {
      if (seq !== lookupSequence) return null;
      activeLookup = null; state.busy = false; setStatus("");
      if (!off) { state.pending = { barcode: code, off: null, reason: "notFound" }; go("addPhoto"); return null; }
      if (!off.ingredientsText) { state.pending = { barcode: code, off: off, reason: "missingIngredients" }; go("addPhoto"); return null; }
      state.pending = null;
      showProduct(buildProduct(off));
      return off;
    }).catch(function (err) {
      if (seq !== lookupSequence) return null;
      activeLookup = null; state.busy = false; setStatus("");
      if (err && err.name === "AbortError") { render(); return null; }
      state.pending = { barcode: code, off: null, reason: "network", error: err && err.message };
      go("addPhoto"); return null;
    });
    activeLookup = { code: code, controller: controller, promise: task, seq: seq };
    return task;
  }

  /* ------------------------------------------------------------ OCR */
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file); });
  }
  // Boost OCR accuracy on phone photos: upscale small captures so thin
  // lettering survives, convert to grayscale, then stretch contrast. Any
  // failure falls back to the original image so OCR still runs.
  function preprocessImage(dataUrl) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) { resolve(dataUrl); return; }
          var minEdge = Math.min(w, h), scale = 1;
          if (minEdge < 1000) scale = 1000 / minEdge;
          var maxEdge = Math.max(w, h) * scale;
          if (maxEdge > 2200) scale *= 2200 / maxEdge;
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
          var ctx = cv.getContext("2d");
          if (!ctx) { resolve(dataUrl); return; }
          ctx.drawImage(img, 0, 0, cw, ch);
          var id = ctx.getImageData(0, 0, cw, ch), d = id.data, i, lum, hist = [], px = d.length / 4;
          for (i = 0; i < 256; i++) hist[i] = 0;
          for (i = 0; i < d.length; i += 4) {
            lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
            d[i] = d[i + 1] = d[i + 2] = lum;
            hist[lum]++;
          }
          // Percentiles ignore a handful of specular highlights / black package
          // edges that otherwise flatten all of the useful letter contrast.
          var low = 0, high = 255, seen = 0, lowCut = px * 0.02, highCut = px * 0.98;
          for (i = 0; i < 256; i++) { seen += hist[i]; if (seen >= lowCut) { low = i; break; } }
          seen = 0;
          for (i = 0; i < 256; i++) { seen += hist[i]; if (seen >= highCut) { high = i; break; } }
          var range = (high - low) || 1;
          for (i = 0; i < d.length; i += 4) {
            var v = (d[i] - low) * 255 / range;
            v = v < 0 ? 0 : v > 255 ? 255 : v;
            d[i] = d[i + 1] = d[i + 2] = v;
          }
          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL("image/png"));
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }
  function sanitizeOcrRaw(raw) {
    raw = String(raw || "");
    try { if (raw.normalize) raw = raw.normalize("NFKC"); } catch (e) {}
    return raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .split("\n").map(function (line) { return line.replace(/[ \t]+/g, " ").trim(); }).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }
  function extractIngredientText(raw, ocrConfidence) {
    var full = sanitizeOcrRaw(raw), marker = /(?:^|\n)\s*(?:ingredients?|lngredients|ingredlents)\s*(?:list)?\s*[:\-]?\s*/i.exec(full);
    if (!marker) marker = /\b(?:ingredients?|lngredients|ingredlents)\s*(?:list)?\s*[:\-]\s*/i.exec(full);
    var section = marker ? full.slice(marker.index + marker[0].length) : full;
    var boundaryRe = /(?:\n|[.;]\s+)(?:nutrition(?:al)? facts|supplement facts|drug facts|allergen information|allergy advice|may contain|contains\s*:(?!\s*(?:2\s*%|less than))|directions|warning|storage|distributed by|manufactured (?:by|for)|packed (?:by|for)|net (?:wt|weight|contents)|best (?:before|by)|use by|questions|www\.)\b/i;
    var boundary = boundaryRe.exec(section);
    var rawIngredient = (boundary ? section.slice(0, boundary.index) : section).trim();
    var text = rawIngredient
      .replace(/([A-Za-z])-[ \t]*\n[ \t]*(?=[a-z])/g, "$1")
      .replace(/[\u2022\u2023\u25E6\u2043]/g, ",")
      .replace(/\s+\|\s+/g, ", ")
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\S+@\S+\.\S+/g, " ")
      .replace(/\n+/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^[,;:.\-\s]+|[,;:\-\s]+$/g, "");
    var letters = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
    var noise = (text.match(/[^A-Za-z\u00C0-\u024F0-9\s,;:.%()\[\]{}'"&+\/\-]/g) || []).length;
    var separators = (text.match(/[,;]/g) || []).length;
    var opens = (text.match(/\(/g) || []).length, closes = (text.match(/\)/g) || []).length;
    var pct = 10;
    if (marker) pct += 30;
    if (text.length >= 24) pct += 15;
    if (text.length >= 70) pct += 10;
    if (separators >= 1) pct += 15;
    if (separators >= 3) pct += 5;
    if (boundary) pct += 10;
    if (opens === closes) pct += 5;
    if (!marker) pct = Math.min(pct, 70);
    if (noise > Math.max(4, text.length * 0.08)) pct -= 20;
    pct = Math.max(0, Math.min(100, pct));
    var rawConf = Math.max(0, Math.min(100, +ocrConfidence || 0));
    var conf = Math.round(rawConf * Math.max(0.35, Math.min(1, letters / Math.max(text.length * 0.55, 1))));
    var low = letters < 3 || text.length < 4 || letters / Math.max(text.length, 1) < 0.35 || noise > Math.max(5, text.length * 0.1) || /\b\d{8,14}\b/.test(text) || conf < 55;
    return { text: text, rawText: full, rawIngredientText: rawIngredient, confidence: conf, rawConfidence: rawConf,
      coveragePct: pct, coverage: pct >= 85 ? "Likely complete label section" : pct >= 60 ? "Partial · review recommended" : "Low coverage · check carefully",
      markerFound: !!marker, boundaryFound: !!boundary, low: low };
  }
  function plausibleReviewedIngredients(text) {
    var r = extractIngredientText(text, 100), letters = (r.text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
    return letters >= 3 && r.text.length >= 4 && !/\b\d{8,14}\b/.test(r.text) ? r : null;
  }
  // Editable OCR result so the user can fix misreads before scoring.
  function ocrReviewBlock(result) {
    result = result || {};
    return '<div class="panel glass ocr-review"><div class="panel-h">Check the scanned text' +
      '<span class="cnt">' + Math.round(result.confidence || 0) + '% confidence</span></div>' +
      '<div class="ocr-meta">' + esc(result.coverage || "Review required") + ' · Label photo / OCR</div>' +
      (result.low ? '<div class="ocr-warn">Hard to read — fix wrong or missing words below, or retake a closer, well-lit photo of only the ingredients panel.</div>'
           : '<div class="ocr-tip">We isolated the ingredient section. Compare it with the package and fix anything missing before analysis.</div>') +
      (!result.markerFound ? '<div class="ocr-warn">No clear “Ingredients” heading was found, so extra package text may be included.</div>' : '') +
      '<textarea id="ocrText" class="text-input ocr-text" rows="7" placeholder="Ingredients…">' + esc(result.text || "") + '</textarea>' +
      '<button class="big-btn" data-act="analyzeOcr">Analyze ingredients</button></div>';
  }
  function runOCR(dataUrl) {
    setStatus("Reading label…");
    var p = window.Tesseract ? Promise.resolve() : loadScriptLocalFirst(TESS_LOCAL, TESS_URL);
    return p.then(function () {
      // Point Tesseract at the local worker / wasm core / language data when
      // they're vendored, so OCR runs fully offline. If the local files are
      // absent Tesseract falls back to its own CDN defaults.
      var opts = { langPath: "vendor/tesseract/lang", workerPath: "vendor/tesseract/worker.min.js", corePath: "vendor/tesseract" };
      var work = Tesseract.recognize(dataUrl, "eng", hasLocalTess() ? opts : undefined);
      var limit = new Promise(function (resolve, reject) {
        setTimeout(function () { var err = new Error("OCR timed out"); err.name = "TimeoutError"; reject(err); }, 45000);
      });
      return Promise.race([work, limit]);
    }).then(function (r) { return extractIngredientText((r.data && r.data.text) || "", (r.data && r.data.confidence) || 0); });
  }
  // True when Tesseract was served from our vendor folder (so local asset paths apply).
  function hasLocalTess() {
    var s = document.querySelector('script[src="' + TESS_LOCAL + '"]');
    return !!s;
  }

  /* ---------------------------------------- research unknown ingredients */
  // Persisted across sessions so a fetched ingredient summary becomes
  // effectively offline after the first lookup (hybrid mainly-offline).
  var ING_TTL = 1000 * 60 * 60 * 24 * 90;
  function ingredientCacheGet(term) {
    try {
      var raw = localStorage.getItem("cb_ingredient_" + norm(term)); if (!raw) return undefined;
      var rec = JSON.parse(raw);
      if (!rec || (Date.now() - (rec.ts || 0)) > ING_TTL) return undefined;
      return rec.data || null;
    } catch (e) { return undefined; }
  }
  function ingredientCacheSet(term, data) {
    try { localStorage.setItem("cb_ingredient_" + norm(term), JSON.stringify({ ts: Date.now(), data: data || null })); } catch (e) {}
  }
  function ingredientResearchQuery(term) {
    var clean = String(term || "").trim();
    var assessed = classify(norm(clean), clean, "food");
    return assessed && assessed.canonicalName && assessed.canonicalName !== norm(clean) ? assessed.canonicalName : clean;
  }
  function validIngredientResearchResult(result, query) {
    if (!result || result.type === "disambiguation" || !result.extract) return false;
    var description = norm(result.description || ""), title = norm(result.title || ""), needle = norm(query);
    var nonFoodEntity = /\b(band|musical group|album|song|film|television series|footballer|politician|surname|municipality|village|software company)\b/.test(description);
    var foodContext = /\b(food|ingredient|edible|additive|sweetener|sugar|oil|fat|plant|seed|bean|grain|milk|vitamin|mineral|acid|preservative|spice|herb)\b/.test(description + " " + norm(result.extract).slice(0, 240));
    if (nonFoodEntity && !foodContext) return false;
    var important = needle.split(/\s+/).filter(function (token) { return token.length >= 3; });
    if (important.length && !important.some(function (token) { return title.indexOf(token) !== -1 || description.indexOf(token) !== -1; })) return false;
    return true;
  }
  function researchIngredient(term) {
    var bad = /^(and|or|contains|less than|of|the|other|color added|natural|artificial)$/i;
    var clean = String(term || "").trim();
    if (!clean || clean.length < 3 || bad.test(clean)) return Promise.resolve(null);
    var query = ingredientResearchQuery(clean);
    var t = encodeURIComponent(query.replace(/\s+/g, "_"));
    return fetchJson(WIKI + t)
      .then(function (j) {
        if (!validIngredientResearchResult(j, query)) return null;
        return { extract: j.extract, description: j.description || "",
          url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || "", query: query };
      })
      .catch(function () { return null; });
  }
  function doResearch(term) {
    if (researchCache.hasOwnProperty(term)) {
      var cached = researchCache[term];
      state.research = { term: term, loading: false, data: cached, error: !cached };
      render(); return;
    }
    var stored = ingredientCacheGet(term);
    if (stored !== undefined) {
      researchCache[term] = stored;
      state.research = { term: term, loading: false, data: stored, error: !stored };
      render(); return;
    }
    state.research = { term: term, loading: true, data: null, error: false };
    render();
    researchIngredient(term).then(function (d) {
      researchCache[term] = d || null;
      ingredientCacheSet(term, d || null);
      state.research = { term: term, loading: false, data: d, error: !d };
      render();
    });
  }
  function researchBlock(d) {
    var r = state.research;
    if (!r || r.term !== d.title) return "";
    if (r.loading) return '<div class="research glass"><div class="spinner small"></div><div class="rh">Researching “' + esc(d.title) + '” online…</div></div>';
    if (r.error || !r.data) return '<div class="research glass"><div class="rh">' + icon("research") + ' No public summary found for “' + esc(d.title) + '” yet.</div></div>';
    return '<div class="research glass"><div class="rh">' + icon("research") + ' Researched · Wikipedia</div>' +
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
  function statusColor(st) { return st === "avoid" ? "#ff3b30" : st === "caution" ? "#ff7a45" : st === "limit" ? "#ff9f1c" : (st === "good" || st === "ok") ? "#2fd07a" : "#8a8a99"; }
  function dot(color) { return '<span class="dot" style="background:' + color + '"></span>'; }
  var ICONS = {
    scan: "fa-barcode", clock: "fa-clock", chart: "fa-chart-column", user: "fa-user",
    search: "fa-magnifying-glass", research: "fa-magnifying-glass", camera: "fa-camera",
    keypad: "fa-keyboard", tag: "fa-tags", fork: "fa-utensils", book: "fa-book-open",
    warning: "fa-triangle-exclamation", check: "fa-circle-check", compare: "fa-code-compare",
    up: "fa-arrow-trend-up", food: "fa-bowl-food", paw: "fa-paw", bottle: "fa-pump-soap",
    home: "fa-house", shield: "fa-shield-halved", box: "fa-box-open", heart: "fa-heart-pulse",
    sparkle: "fa-wand-magic-sparkles", favorite: "fa-star", globe: "fa-globe",
    leaf: "fa-leaf", info: "fa-circle-info"
  };
  function icon(n, cls, style) {
    var weight = style === "regular" ? "fa-regular" : "fa-solid";
    return '<i aria-hidden="true" class="ic ' + weight + ' ' + (ICONS[n] || "fa-circle") + (cls ? " " + cls : "") + '"></i>';
  }

  function brandLogo(px) {
    return '<span class="brandlogo" style="width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.44) + 'px">' + icon("leaf") + '</span>';
  }
  var ILLUS = { scan: "scan", chart: "chart", box: "box", heart: "heart" };
  function illus(name) { return '<div class="illuswrap">' + icon(ILLUS[name] || "info") + '</div>'; }

  var lastAnimatedId = null;
  var lastRenderedView = null;
  // One-line plain-language verdict so the result is clear at a glance.
  function verdictLine(p) {
    var m = {
      exc: "Few concerns were found in the available label data.",
      good: "A stronger option under NutriCheck's strict screen.",
      mid: "Mixed — review the flagged ingredients before choosing.",
      bad: "Multiple strict-screen concerns were found."
    };
    var txt = m[p.badge.cls];
    return txt ? '<div class="verdict">' + txt + '</div>' : "";
  }
  function confidenceLabel(value) {
    return value === "high" ? "High confidence" : value === "medium" ? "Medium confidence" : value === "low" ? "Low confidence" : "Not enough data";
  }
  function scoreSummary(p) {
    var label = p.badge && p.badge.label === "Not rated" ? "No reliable rating" : "Strict ingredient + nutrition rating";
    var note = p.methodology && p.methodology.note ? p.methodology.note : "Ingredient flags, nutrition and database coverage are screened separately; this is not medical advice.";
    return '<div class="score-summary"><strong>' + esc(label) + '</strong><p>' + esc(note) + '</p></div>';
  }
  function dataQualityBlock(p) {
    var cov = p.coverage || {};
    var pct = cov.percent != null ? cov.percent : (p.ingredientCoveragePct || 0);
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    var total = cov.total != null ? cov.total : (p.classified || []).length;
    var recognized = cov.recognized != null ? cov.recognized : Math.max(0, total - (cov.unknown || 0));
    var level = pct >= 90 && p.ratingConfidence === "high" ? "is-complete" : pct >= 60 ? "is-partial" : "is-limited";
    var stats = p.ingredientStats || null;
    var headline = total ? recognized + " of " + total + " parsed nodes explained" : "No usable ingredient list";
    if (stats && total) headline = stats.topLevel + " label ingredient" + (stats.topLevel === 1 ? "" : "s") +
      (stats.nested ? " · " + stats.nested + " nested" : "") + " · " + recognized + " explained";
    var source = p.ingredientSource || p.source || "Unknown source";
    var rejected = (p.rejectedFragments || []).length;
    var parseConfidence = p.scanQuality && p.scanQuality.confidence ? cap(p.scanQuality.confidence) : "Unknown";
    var detail = (p.ingredientCoverage || "Best available label data");
    if (rejected) detail += " · " + rejected + " label fragment" + (rejected === 1 ? "" : "s") + " ignored as noise";
    return '<section class="data-quality ' + level + '" aria-label="Ingredient data quality">' +
      '<span class="source-chip">' + icon("info") + ' ' + esc(source) + '</span>' +
      '<strong>' + esc(headline) + '</strong>' +
      '<div class="coverage-meter" role="meter" aria-label="Recognized ingredient coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><div class="coverage-fill" style="--coverage:' + pct + '%"></div></div>' +
      '<div class="trust-facets"><div><span>Recognition</span><b>' + pct + '%</b></div>' +
      '<div><span>Structure</span><b>' + esc(parseConfidence) + '</b></div>' +
      '<div><span>Rating</span><b>' + esc(confidenceLabel(p.ratingConfidence).replace(" confidence", "")) + '</b></div></div>' +
      '<p>' + esc(detail) + '</p></section>';
  }
  function ingredientCountsBlock(p) {
    var counts = { avoid: 0, caution: 0, limit: 0, unknown: 0, clean: 0 };
    (p.classified || []).forEach(function (c) {
      if (counts[c.status] != null) counts[c.status]++;
      else if (c.status === "good" || c.status === "ok") counts.clean++;
    });
    if (!p.classified || !p.classified.length) return "";
    return '<div class="ingredient-counts" aria-label="Ingredient classification summary">' +
      (counts.avoid ? '<span class="avoid">' + counts.avoid + ' avoid</span>' : '') +
      (counts.caution ? '<span class="caution">' + counts.caution + ' caution</span>' : '') +
      (counts.limit ? '<span class="limit">' + counts.limit + ' limit</span>' : '') +
      (counts.unknown ? '<span>' + counts.unknown + ' unknown</span>' : '') +
      (counts.clean ? '<span class="clean">' + counts.clean + ' recognized</span>' : '') + '</div>';
  }
  function exactIngredientBlock(p) {
    var raw = p.rawIngredientsText || p.ingredientsText || "";
    if (!raw) return "";
    var title = p.ingredientTextGenerated ? "Database ingredient structure" : "Exact ingredient label";
    var note = p.ingredientTextGenerated ? '<p>Generated from the database tree because exact label wording was unavailable.</p>' : "";
    if (p.formulaSourceUrl) {
      note += '<p class="formula-source"><b>Published formula:</b> <a href="' + esc(p.formulaSourceUrl) + '" target="_blank" rel="noopener">' +
        esc(p.ingredientSource || "Official product source") + '</a>' + (p.formulaSourceDate ? ' · checked ' + esc(p.formulaSourceDate) : '') +
        '. Package label wins if the formula changed.</p>';
    }
    return '<details class="ingredient-raw"><summary>' + title + '</summary>' + note + '<div>' + esc(raw) + '</div></details>';
  }
  var ROLE_LABELS = {
    "formula-group": "Formula group", "added-sweetener": "Added sugar", "non-sugar-sweetener": "Sweetener",
    "oil-or-fat": "Oil or fat", "processing-marker": "Processing marker", "undisclosed-blend": "Undisclosed blend",
    additive: "Additive", "whole-food": "Whole food", "nutrient-or-culture": "Nutrient or culture",
    "carrier-solvent": "Carrier / solvent", "cleanser-surfactant": "Cleansing system", "texture-structurant": "Texture / structure",
    "formula-stabilizer": "Formula support", emollient: "Emollient", "fragrance-or-flavor": "Fragrance / flavor",
    propellant: "Aerosol propellant", absorbent: "Absorbent", abrasive: "Abrasive / exfoliant",
    "deodorant-active": "Odor control", "antiperspirant-active": "Antiperspirant active", "conditioning-agent": "Conditioning agent",
    "oral-care-active": "Oral-care active", "oral-abrasive": "Tooth-cleaning system", "oral-humectant": "Oral humectant",
    "ph-adjuster": "pH control", colorant: "Colorant", preservative: "Preservative", antioxidant: "Antioxidant",
    unknown: "Needs more data", ingredient: "Ingredient"
  };
  function roleLabel(role) {
    return ROLE_LABELS[role] || titleCase(String(role || "ingredient").replace(/-/g, " "));
  }
  function pointsLabel(item) {
    if (!item || item.scoreApplied === false) return item && item.scoreDuplicateOf ? "Already counted" : "Grouped";
    var points = +item.scoreImpact || 0;
    return points < 0 ? ("\u2212" + Math.abs(points) + " pts") : "Score neutral";
  }
  function categorySummariesBlock(p) {
    var summaries = p.categorySummaries || [];
    if (!summaries.length) return "";
    var cards = summaries.map(function (s) {
      var count = s.count + " parsed " + (s.count === 1 ? "node" : "nodes");
      if (s.nestedCount) count += " · " + s.nestedCount + " nested";
      var points = s.scoreImpact < 0 ? ("\u2212" + Math.abs(s.scoreImpact) + " pts") : "Score neutral";
      return '<div class="role-card role-' + esc(s.key) + '">' +
        '<div class="role-card-top"><span>' + esc(s.label || roleLabel(s.key)) + '</span><b>' + esc(points) + '</b></div>' +
        '<div class="role-card-count">' + esc(count) + '</div>' +
        '<p>' + esc(s.summary || "Grouped by ingredient function.") + '</p></div>';
    }).join("");
    return '<section class="ingredient-roles" aria-label="Ingredient roles"><div class="section-kicker">Ingredient roles</div>' +
      '<div class="section-explain">Function, nutrition, and processing are separated so one label word does not decide the whole rating.</div>' +
      '<div class="role-grid">' + cards + '</div></section>';
  }
  function productContextBlock(p) {
    var attrs = p.productAttributes || {};
    var claims = attrs.certifications || [];
    var organicIngredients = +attrs.organicIngredientCount || 0;
    if (!claims.length && !organicIngredients) return "";
    var rows = claims.map(function (claim) {
      var source = claim.source === "product-database" ? "Database label tag" : "Captured label wording";
      var stateLabel = (claim.verifiedBySource || claim.verified) ? "Verified by source record" : "Claim shown with source";
      return '<div class="context-card"><div class="context-icon">' + icon(claim.id === "organic" ? "leaf" : "shield") + '</div>' +
        '<div><div class="context-title">' + esc(claim.label) + '</div><div class="context-meta">' + esc(source + " · " + stateLabel) + '</div>' +
        '<p>' + esc(claim.evidence || "A product attribute reported by the source.") + '</p></div><span class="neutral-chip">0 pts</span></div>';
    }).join("");
    if (organicIngredients) {
      rows += '<div class="context-card"><div class="context-icon">' + icon("leaf") + '</div><div>' +
        '<div class="context-title">Organic ingredient qualifier</div><div class="context-meta">' + organicIngredients +
        (organicIngredients === 1 ? " ingredient" : " ingredients") + ' · Not a whole-product certification</div>' +
        '<p>Organic describes how the named ingredient was produced; its nutrition role is still assessed separately.</p></div><span class="neutral-chip">0 pts</span></div>';
    }
    return '<section class="product-context panel glass"><div class="panel-h">Product context <span class="cnt">score neutral</span></div>' +
      '<div class="context-list">' + rows + '</div><p class="context-note">' + esc(attrs.note || "Certifications and preferences do not erase nutrition or ingredient concerns.") + '</p></section>';
  }
  function useContextBlock(p) {
    var ctx = p.useContext;
    if (!ctx || p.isFood) return "";
    return '<section class="panel glass use-context-panel" aria-label="How this product is used">' +
      '<div class="panel-h">Use context <span class="cnt">changes interpretation</span></div>' +
      '<div class="context-card"><div class="context-icon">' + icon(ctx.id.indexOf("household") === 0 ? "home" : "bottle") + '</div>' +
      '<div><div class="context-title">' + esc(ctx.label) + '</div><div class="context-meta">' + esc(ctx.exposure) + '</div>' +
      '<p>' + esc(ctx.note) + '</p></div></div>' +
      '<p class="context-note">The score considers this exposure pattern. It does not assume every natural ingredient is safer or every synthetic ingredient is worse.</p></section>';
  }
  function ingredientAttributeChips(item, hasChildren) {
    var chips = [];
    var attrs = item.attributes || {};
    var role = item.role === "formula-group" || (hasChildren && item.scoreApplied === false) ? "formula-group" : item.role;
    chips.push('<span class="formula-chip role">' + esc(roleLabel(role)) + '</span>');
    if (attrs.addedSugar) chips.push('<span class="formula-chip nutrition">Nutrition</span>');
    if (attrs.organic) chips.push('<span class="formula-chip certification">Organic ingredient</span>');
    if (attrs.processing) chips.push('<span class="formula-chip processing">' + esc(attrs.processing) + '</span>');
    if (item.recognitionConfidence) chips.push('<span class="formula-chip confidence">' + esc(cap(item.recognitionConfidence)) + ' match</span>');
    return chips.join("");
  }
  function ingredientHierarchyBlock(p) {
    var roots = p.ingredientHierarchy || [];
    if (!roots.length) return '<div class="empty small">No ingredient list available for this product.</div>';
    var byId = {};
    (p.classified || []).forEach(function (item, index) { byId[item.id] = { item: item, index: index }; });
    function renderNodes(nodes) {
      return (nodes || []).map(function (node) {
        var hit = byId[node.id] || { item: node, index: -1 };
        var item = hit.item, children = node.children || [], hasChildren = children.length > 0;
        var path = item.path || node.path || [item.raw || node.name];
        var location = item.depth ? ("Inside " + titleCase(path[path.length - 2] || item.parent || "parent ingredient")) : ("#" + (item.topLevelPosition || item.siblingPosition || 1) + " on label");
        if (hasChildren) location += " · " + children.length + " subingredient" + (children.length === 1 ? "" : "s");
        var status = item.role === "formula-group" || (hasChildren && item.scoreApplied === false) ? "group" : item.status;
        var statusText = status === "group" ? "Group" : (STATUS_LABEL[status] || "Details");
        var title = item.raw || node.name || "Ingredient";
        var button = '<button class="formula-row" style="--depth:' + (+item.depth || 0) + '"' + (hit.index >= 0 ? ' data-ingidx="' + hit.index + '"' : '') + '>' +
          '<span class="formula-rail" aria-hidden="true"></span><span class="formula-dot" style="--node-color:' + statusColor(item.status) + '"></span>' +
          '<span class="formula-main"><span class="formula-title">' + esc(title) + '</span><span class="formula-location">' + esc(location) + '</span>' +
          '<span class="formula-chips">' + ingredientAttributeChips(item, hasChildren) + '</span></span>' +
          '<span class="formula-side"><b class="formula-impact">' + esc(pointsLabel(item)) + '</b><span class="status-tag ' + esc(status) + '">' + esc(statusText) + ' ›</span></span></button>';
        return '<div class="formula-node depth-' + (+item.depth || 0) + '">' + button + (hasChildren ? '<div class="formula-children">' + renderNodes(children) + '</div>' : '') + '</div>';
      }).join("");
    }
    var stats = p.ingredientStats || { topLevel: roots.length, nested: Math.max(0, (p.classified || []).length - roots.length), maxDepth: 0 };
    return '<section class="formula-map" aria-label="Ingredient formula map"><div class="formula-head"><div><div class="section-kicker">Formula map</div>' +
      '<div class="section-explain">Parent blends stay connected to their subingredients. Label order is useful context, not an exact percentage.</div></div>' +
      '<div class="formula-stats"><b>' + stats.topLevel + '</b> label · <b>' + stats.nested + '</b> nested</div></div>' + renderNodes(roots) + '</section>';
  }
  function animateScore() {
    var ring = document.querySelector(".score-ring"), numEl = document.querySelector(".score-num");
    if (!ring || !numEl || !state.product) return;
    var target = state.product.score, start = null, dur = 800;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      ring.style.setProperty("--p", (target * e).toFixed(1));
      numEl.textContent = Math.round(target * e);
      if (t < 1) requestAnimationFrame(step); else { ring.style.setProperty("--p", target); numEl.textContent = target; }
    }
    requestAnimationFrame(step);
  }

  function go(view) {
    if (view !== "scanner") stopScanner();
    state.prev = state.view; state.view = view; render();
    if (view === "scanner") setTimeout(startScanner, 60);
  }

  function viewHome() {
    var recent = state.history.slice(0, 6);
    return '<div class="screen">' +
      '<header class="hd hd-brand">' + brandLogo(42) + '<div><div class="logo">NutriCheck</div>' +
      '<div class="sub">Scan food. See what\'s really inside.</div></div></header>' +
      '<div class="searchbar"><input id="q" class="text-input search-input" placeholder="Search a product or brand…" />' +
      '<button class="search-go" data-act="searchGo" aria-label="Search">' + icon("search") + '</button></div>' +
      '<button class="big-btn" data-act="scan">' + icon("scan") + ' Scan a barcode</button>' +
      '<div class="dual"><button class="ghost-btn" data-act="addPhoto">' + icon("tag") + ' Add by photo</button>' +
      '<button class="ghost-btn" data-act="manual">' + icon("keypad") + ' Enter code</button></div>' +
      '<button class="ghost-btn" data-act="encyclopedia">' + icon("book") + ' Ingredient encyclopedia</button>' +
      (recent.length ? ('<div class="section-title">Recent scans</div>' + recent.map(historyRow).join("")) :
        '<div class="empty">' + illus("scan") + 'No scans yet.<br>Scan or search your first product above.</div>') +
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
    var feedback = state.statusMsg || "Looking for a valid UPC, EAN, or GTIN barcode";
    return '<div class="screen scanner is-detecting" data-scan-state="detecting">' +
      '<video id="cam" playsinline autoplay muted></video>' +
      '<div class="scan-guide-copy">Center the entire barcode inside the frame. Hold steady and avoid glare.</div>' +
      '<div class="scan-frame"></div>' +
      '<div class="scan-status scan-feedback is-detecting" id="status" role="status" aria-live="polite">' + icon("scan") + '<span>' + esc(feedback) + '</span></div>' +
      '<div class="scan-hint">Trouble scanning? Tap below to snap a photo of the barcode — sharper and more reliable.</div>' +
      '<div class="scan-actions">' +
        '<label class="big-btn photo-cap"><input id="bcphoto" type="file" accept="image/*" capture="environment" hidden>' + icon("camera") + ' Take a photo of the barcode</label>' +
        '<button class="link-btn" data-act="manual">Enter code manually</button>' +
        '<button class="cancel-btn" data-act="home">Cancel</button>' +
      '</div>' +
      '</div>';
  }
  function viewSearch() {
    var rows = "", sortChips = "";
    // Build display list from the untouched raw results so toggling sort is reversible.
    var list = state.searchRaw ? state.searchRaw.slice() : null;
    if (list && list.length && state.searchSort === "health") {
      var rank = { a: 0, b: 1, c: 2, d: 3, e: 4 };
      list.sort(function (x, y) {
        var rx = rank[String(x.nutriscore_grade || "").toLowerCase()]; rx = (rx == null ? 9 : rx);
        var ry = rank[String(y.nutriscore_grade || "").toLowerCase()]; ry = (ry == null ? 9 : ry);
        return rx - ry;
      });
    }
    state.searchResults = list; // the click handler indexes into this exact (displayed) array
    if (list && list.length) {
      sortChips = '<div class="chips sm"><button class="chip' + (state.searchSort !== "health" ? " on" : "") + '" data-sort="rel">Relevance</button>' +
        '<button class="chip' + (state.searchSort === "health" ? " on" : "") + '" data-sort="health">Healthiest first</button></div>';
    }
    if (state.searchRaw == null) rows = '<div class="empty small">Searching…</div>';
    else if (!list.length) rows = '<div class="empty">No products found for “' + esc(state.searchQuery) + '”.<br>Try a different name or scan the barcode.</div>';
    else rows = list.map(function (o, i) {
      // Results can now be any product type (food / beauty / household / pet
      // food); show a small type tag on non-food rows so mixed results read clearly.
      var tl = o.productType && o.productType !== "food" && PROD_TYPE_LABEL[o.productType];
      var typeTag = tl ? '<span class="srch-type">' + icon(tl[0]) + ' ' + esc(tl[1]) + '</span>' : "";
      var sub = esc(o.brand || (o.ingredientsText ? "" : "No ingredient data"));
      return '<div class="row card tappable" data-search-idx="' + i + '">' +
        (o.image ? '<img class="srch-img" src="' + esc(o.image) + '" alt="">' : '<div class="srch-img ph" aria-hidden="true">' + icon("food") + '</div>') +
        '<div class="row-main"><div class="row-title">' + esc(o.name) + '</div>' +
        '<div class="row-sub">' + typeTag + (typeTag && sub ? " · " : "") + sub + '</div></div>' +
        '<div class="chev">›</div></div>';
    }).join("");
    return '<div class="screen">' + backBar("Search") +
      '<div class="searchbar"><input id="q" class="text-input search-input" value="' + esc(state.searchQuery) + '" placeholder="Search a product or brand…" />' +
      '<button class="search-go" data-act="searchGo" aria-label="Search">' + icon("search") + '</button></div>' + sortChips + rows + '</div>';
  }

  function viewManual() {
    return '<div class="screen">' + backBar("Enter barcode") +
      '<input id="bc" class="text-input" inputmode="numeric" autocomplete="off" maxlength="18" value="' + esc(state.manualCode || "") + '" placeholder="e.g. 049000028911" aria-describedby="bcHelp" />' +
      (state.scanError ? '<div class="scan-error" role="alert">' + esc(state.scanError) + '</div>' : '') +
      '<button class="big-btn" data-act="manualGo">Look up</button>' +
      '<div class="hint" id="bcHelp">Enter all 8, 12, 13, or 14 digits printed under the barcode. We verify the check digit before searching.</div>' +
      '<button class="ghost-btn" data-act="scan">Use the camera instead</button></div>';
  }

  function viewResult() {
    var p = state.product; if (!p) return viewHome();
    var alerts = personalAlerts(p.classified, p.allergens);
    var n = p.nutrition || { negatives: [], positives: [] };
    var ingredientStats = p.ingredientStats || { topLevel: (p.classified || []).length, nested: 0 };
    var ingredientCount = ingredientStats.topLevel + " label" + (ingredientStats.nested ? " · " + ingredientStats.nested + " nested" : "");

    var c = scoreColor(p.badge.cls);
    var fav = isFav(p.id);
    var provenance = [];
    if (p.ingredientSource) provenance.push(p.ingredientSource);
    if (p.ingredientConfidence && /ocr|photo/i.test(p.ingredientSource || "")) provenance.push(Math.round(p.ingredientConfidence) + "% OCR text confidence");
    if (p.formulaSourceDate) provenance.push("formula checked " + p.formulaSourceDate);
    else if (p.ingredientCoverage) provenance.push(p.ingredientCoverage);
    return '<div class="screen result">' + backBar("") +
      '<div class="hero glass" style="--c:' + c + '">' +
        '<button class="fav-btn' + (fav ? " on" : "") + '" data-fav="1" aria-label="' + (fav ? "Remove from favorites" : "Add to favorites") + '">' + icon("favorite", "", fav ? "solid" : "regular") + '</button>' +
        '<div class="product-head">' +
          (p.image ? '<img class="phead-img" src="' + esc(p.image) + '" alt="">' : '<div class="phead-img ph" aria-hidden="true">' + icon("food") + '</div>') +
          '<div class="phead-txt"><div class="phead-name">' + esc(p.name) + '</div>' +
          '<div class="phead-brand">' + esc(p.brand || "") + '</div>' +
          '<div class="phead-src">via ' + esc(p.source) + '</div>' +
          (provenance.length ? '<div class="phead-src ingredient-provenance">Ingredients: ' + esc(provenance.join(" · ")) + '</div>' : '') +
          prodTypeBadge(p.productType) + (p.kosher ? kosherBadge() : "") + '</div>' +
        '</div>' +
        '<div class="score-wrap">' +
          '<div class="score-glow"></div>' +
          '<div class="score-ring" style="--c:' + c + ';--p:' + p.score + '">' +
          '<div class="score-num">' + p.score + '</div><div class="score-of">out of 100</div></div>' +
          '<div class="badge ' + p.badge.cls + '">' + esc(p.badge.label) + '</div>' +
          verdictLine(p) +
          scoreSummary(p) +
          '<button class="why-btn" data-act="toggleScore">' + (state.scoreOpen ? "Hide score details" : "How is this scored?") + '</button>' +
        '</div>' +
      '</div>' +
      dataQualityBlock(p) +
      useContextBlock(p) +
      productContextBlock(p) +
      whyBlock(p) +
      // Yuka-style: the verdict detail (what's bad / what's good) comes FIRST,
      // right under the score — that's the core of the result screen.
      // Bobby-Approved-better: surface the actual flagged INGREDIENT names as
      // tappable red-flag rows at the top of Negatives, then the nutrition
      // negatives (minus the vague aggregate "Additives" row).
      (function () {
        var negHtml = concernRows(p) +
          (n.negatives || []).filter(function (r) { return r.label !== "Additives"; }).map(brkRow).join("");
        return negHtml ? '<div class="panel glass"><div class="panel-h neg">' + icon("warning") + ' Negatives</div>' + negHtml + '</div>' : "";
      })() +
      (n.positives && n.positives.length ? '<div class="panel glass"><div class="panel-h pos">' + icon("check") + ' Positives</div>' + n.positives.map(brkRow).join("") + '</div>' : "") +
      (alerts.length ? ('<div class="alerts">' + alerts.map(function (a) {
        return '<div class="alert">' + icon("warning") + ' <b>' + esc(cap(a.key)) + '</b>: contains ' + esc(a.hits.join(", ")) + (a.note ? '<div class="row-sub">' + esc(a.note) + '</div>' : '') + '</div>';
      }).join("") + '</div>') : "") +
      (p.isFood ?
        '<div class="logseg">' +
          '<button class="seg-btn' + (p.logged === "eaten" ? " on ate" : "") + '" data-log="eaten">' + icon("fork") + ' I ate this</button>' +
          '<button class="seg-btn' + (p.logged !== "eaten" ? " on" : "") + '" data-log="checked">' + icon("search") + ' Just checking</button>' +
        '</div>' : "") +
      (p.isFood ? portionBlock(p) : "") +
      '<button class="ghost-btn cmp-btn" data-act="comparePick">' + icon("compare") + ' Compare with another product</button>' +
      altsBlock(p) +
      nutritionTable(p) +
      '<div class="panel glass ingredient-explorer"><div class="panel-h">Ingredients <span class="cnt">' + esc(ingredientCount) + '</span></div>' +
      '<div class="legend">Read in label order. Tap a parent or subingredient for its exact role, evidence, and score effect.</div>' +
      exactIngredientBlock(p) +
      categorySummariesBlock(p) +
      ingredientHierarchyBlock(p) +
      '</div></div>';
  }
  // Serving stepper + per-portion kcal/macros. Only meaningful for food where
  // OFF gave us nutriments; otherwise show nothing.
  function portionBlock(p) {
    var k = scaledKcal(p);
    if (k == null && !p.macros) return "";
    var por = p.portion || 1;
    var pretty = (por === Math.round(por)) ? String(por) : por.toFixed(2).replace(/0$/, "");
    var macros = p.macros ? '<div class="macros">' +
      ['protein', 'carbs', 'fat'].map(function (key) {
        var v = scaledMacro(p, key);
        return '<div class="macro"><div class="macro-num">' + (v == null ? "—" : v + "g") + '</div>' +
          '<div class="macro-lbl">' + (key === "carbs" ? "Carbs" : cap(key)) + '</div></div>';
      }).join("") + '</div>' : "";
    return '<div class="panel glass portion"><div class="panel-h">Serving' +
      '<span class="cnt">' + (k == null ? "" : "≈" + k + " kcal") + '</span></div>' +
      '<div class="portion-row">' +
        '<button class="step-btn" data-portion="-0.25" aria-label="Decrease serving">−</button>' +
        '<div class="portion-val"><span class="pv-num">' + pretty + '×</span><span class="pv-lbl">serving</span></div>' +
        '<button class="step-btn" data-portion="0.25" aria-label="Increase serving">+</button>' +
      '</div>' + macros + '</div>';
  }
  function whyBlock(p) {
    if (!state.scoreOpen) return "";
    var rows = '<div class="lrow"><div class="row-main"><div class="row-title">Base score</div></div><div class="brk-val">100</div></div>';
    (p.scoreReasons || []).forEach(function (r) {
      var cls = r.d < 0 ? "bad" : r.d > 0 ? "good" : "";
      var val = r.d > 0 ? "+" + r.d : (r.d < 0 ? "" + r.d : "—");
      rows += '<div class="lrow"><div class="row-main"><div class="row-title">' + esc(r.t) + '</div></div><div class="brk-val ' + cls + '">' + val + '</div></div>';
    });
    rows += '<div class="lrow"><div class="row-main"><div class="row-title"><b>Final score</b></div></div><div class="brk-val"><b>' + p.score + '</b></div></div>';
    return '<div class="panel glass"><div class="panel-h">How this score is calculated</div>' + rows + '</div>';
  }
  function altsBlock(p) {
    var a = state.alts;
    if (!a || a.forId !== p.id) return "";
    if (a.loading) return '<div class="panel glass"><div class="panel-h pos">' + icon("up") + ' Better choices</div>' +
      '<div class="lrow"><div class="spinner small"></div><div class="row-main"><div class="row-sub">Finding healthier options in this category…</div></div></div></div>';
    if (!a.list || !a.list.length) return "";
    var rows = a.list.map(function (prod, i) {
      return '<div class="lrow tappable" data-alt="' + i + '">' +
        (prod.image ? '<img class="srch-img" src="' + esc(prod.image) + '" alt="">' : '<div class="srch-img ph" aria-hidden="true">' + icon("food") + '</div>') +
        '<div class="row-main"><div class="row-title">' + esc(prod.name) + '</div><div class="row-sub">' + esc(prod.brand || "") + '</div></div>' +
        '<div class="mini-score" style="background:' + scoreColor(prod.badge.cls) + '">' + prod.score + '</div></div>';
    }).join("");
    return '<div class="panel glass"><div class="panel-h pos">' + icon("up") + ' Better choices in this category</div>' + rows + '</div>';
  }
  // Candidates to compare the current product against: everything the user has
  // seen (history + favorites) plus any loaded alternatives, minus the product
  // itself. De-duped by id/barcode. Stored on state so clicks resolve by index.
  function compareCandidates(p) {
    var pool = state.history.concat(state.favorites);
    if (state.alts && state.alts.list) pool = pool.concat(state.alts.list);
    var seen = {}, out = [];
    pool.forEach(function (o) {
      if (!o || !o.badge) return;
      if (o.id === p.id || (o.barcode && p.barcode && o.barcode === p.barcode)) return;
      var key = o.barcode || o.id || o.name;
      if (seen[key]) return; seen[key] = 1;
      out.push(o);
    });
    return out;
  }
  function viewComparePick() {
    var p = state.product; if (!p) return viewHome();
    var cands = compareCandidates(p); state.compareCands = cands;
    var rows = cands.length ? cands.map(function (o, i) {
      return '<div class="lrow tappable" data-cmp="' + i + '">' +
        (o.image ? '<img class="srch-img" src="' + esc(o.image) + '" alt="">' : '<div class="srch-img ph" aria-hidden="true">' + icon("food") + '</div>') +
        '<div class="row-main"><div class="row-title">' + esc(o.name) + '</div><div class="row-sub">' + esc(o.brand || "") + '</div></div>' +
        '<div class="mini-score" style="background:' + scoreColor(o.badge.cls) + '">' + o.score + '</div></div>';
    }).join("") : '<div class="empty small">Scan or save another product first, then come back to compare it here.</div>';
    return '<div class="screen">' + backBar("Compare") +
      '<div class="panel glass"><div class="panel-h">Compare <b>' + esc(p.name) + '</b> with…</div>' + rows + '</div></div>';
  }
  function compareCol(p, mark) {
    var c = scoreColor(p.badge.cls);
    return '<div class="cmp-col' + (mark ? " win" : "") + '">' +
      (mark ? '<div class="cmp-crown">' + mark + '</div>' : '') +
      (p.image ? '<img class="cmp-img" src="' + esc(p.image) + '" alt="">' : '<div class="cmp-img ph" aria-hidden="true">' + icon("food") + '</div>') +
      '<div class="cmp-name">' + esc(p.name) + '</div>' +
      '<div class="score-ring cmp-ring" style="--c:' + c + ';--p:' + p.score + '"><div class="score-num">' + p.score + '</div></div>' +
      '<div class="badge ' + p.badge.cls + '">' + esc(p.badge.label) + '</div>' +
      prodTypeBadge(p.productType) + '</div>';
  }
  function chipList(labels, cls) {
    if (!labels || !labels.length) return '<span class="cmp-none">—</span>';
    return labels.map(function (l) { return '<span class="cmp-chip ' + (cls || "") + '">' + esc(l) + '</span>'; }).join("");
  }
  function viewCompare() {
    var a = state.product, b = state.compareB;
    if (!a || !b) return viewResult();
    var d = ENG.diffProducts(a, b);
    var verdict = d.better === "tie"
      ? "Both score the same (" + a.score + ")."
      : '<b>' + esc((d.better === "a" ? a : b).name) + '</b> is the better pick — ' +
        Math.abs(d.scoreDelta) + ' point' + (Math.abs(d.scoreDelta) === 1 ? "" : "s") + ' higher.';

    // Per-nutrient winner direction (lower-is-better vs higher-is-better).
    var lowerBetter = { Calories: 1, Sugar: 1, Salt: 1, "Saturated fat": 1 };
    var nutRows = Object.keys(d.nutrition).map(function (k) {
      var v = d.nutrition[k], better;
      if (v.a === v.b) better = "tie";
      else if (lowerBetter[k]) better = v.a < v.b ? "a" : "b";
      else better = v.a > v.b ? "a" : "b";
      return '<div class="lrow"><div class="row-main"><div class="row-title">' + esc(k) + '</div></div>' +
        '<div class="cmp-vals"><span class="' + (better === "a" ? "cmp-good" : "") + '">' + v.a + '</span>' +
        '<span class="cmp-vs">vs</span><span class="' + (better === "b" ? "cmp-good" : "") + '">' + v.b + '</span></div></div>';
    }).join("");

    return '<div class="screen result">' + backBar("Comparison") +
      '<div class="cmp-cols">' +
        compareCol(a, d.better === "a" ? icon("sparkle") : "") +
        '<div class="cmp-vs-badge">VS</div>' +
        compareCol(b, d.better === "b" ? icon("sparkle") : "") +
      '</div>' +
      '<div class="panel glass"><div class="panel-h">Verdict</div>' +
        '<div class="cmp-verdict">' + verdict + '</div>' +
        '<div class="lrow"><div class="row-main"><div class="row-title">Flagged additives</div></div>' +
        '<div class="cmp-vals"><span class="' + (d.additiveCount.a < d.additiveCount.b ? "cmp-good" : "") + '">' + d.additiveCount.a + '</span>' +
        '<span class="cmp-vs">vs</span><span class="' + (d.additiveCount.b < d.additiveCount.a ? "cmp-good" : "") + '">' + d.additiveCount.b + '</span></div></div>' +
      '</div>' +
      '<div class="panel glass"><div class="panel-h neg">' + icon("warning") + ' Negatives</div>' +
        '<div class="lrow"><div class="row-main"><div class="row-title">Only ' + esc(a.name) + '</div></div><div class="cmp-chips">' + chipList(d.negatives.aOnly, "neg") + '</div></div>' +
        '<div class="lrow"><div class="row-main"><div class="row-title">Only ' + esc(b.name) + '</div></div><div class="cmp-chips">' + chipList(d.negatives.bOnly, "neg") + '</div></div>' +
        '<div class="lrow"><div class="row-main"><div class="row-title">In both</div></div><div class="cmp-chips">' + chipList(d.negatives.shared, "neg") + '</div></div>' +
      '</div>' +
      (nutRows ? '<div class="panel glass"><div class="panel-h">Nutrition (per 100g)</div>' + nutRows + '</div>' : "") +
    '</div>';
  }
  function nutritionTable(p) {
    var nu = p.nutriments; if (!nu) return "";
    var rows = [["Energy", nu["energy-kcal_100g"], " kcal"], ["Fat", nu["fat_100g"], " g"],
      [" of which saturates", nu["saturated-fat_100g"], " g"], ["Carbohydrate", nu["carbohydrates_100g"], " g"],
      [" of which sugars", nu["sugars_100g"], " g"], ["Fiber", nu["fiber_100g"], " g"],
      ["Protein", nu["proteins_100g"], " g"], ["Salt", nu["salt_100g"], " g"]];
    var html = rows.map(function (r) {
      var v = num(r[1]); if (v == null) return "";
      var sub = /^ /.test(r[0]);
      return '<div class="lrow nutri' + (sub ? " sub" : "") + '"><div class="row-main"><div class="row-title">' + esc(r[0].trim()) +
        '</div></div><div class="brk-val">' + (Math.round(v * 10) / 10) + r[2] + '</div></div>';
    }).join("");
    if (!html) return "";
    return '<div class="panel glass"><div class="panel-h">Nutrition facts <span class="cnt">per 100g</span></div>' + html + '</div>';
  }
  function brkRow(r) {
    return '<div class="lrow brk">' + dot(sevColor(r.sev)) +
      '<div class="row-main"><div class="row-title">' + esc(r.label) + '</div>' +
      '<div class="row-sub">' + esc(r.note || "") + '</div></div>' +
      '<div class="brk-val ' + r.sev + '">' + esc(r.value) + '</div></div>';
  }
  // Bobby-Approved-style: each flagged ingredient is its own tappable red-flag
  // row in Negatives, so the user sees exactly WHAT is concerning, not a count.
  function concernRows(p) {
    var order = { avoid: 0, caution: 1, limit: 2 };
    var flagged = [];
    (p.classified || []).forEach(function (c, i) {
      if (order[c.status] != null && c.displayDuplicate !== false && c.scoreApplied !== false) flagged.push({ c: c, i: i });
    });
    flagged.sort(function (a, b) { return order[a.c.status] - order[b.c.status]; });
    return flagged.map(function (f) {
      var sev = f.c.status === "limit" ? "mid" : "bad";
      var path = f.c.path || [];
      var location = f.c.depth ? ("Inside " + titleCase(path[path.length - 2] || f.c.parent || "parent ingredient")) : ("#" + (f.c.topLevelPosition || "?") + " on label");
      var note = [f.c.reason || STATUS_LABEL[f.c.status], location, pointsLabel(f.c)].join(" · ");
      return '<button class="lrow brk tappable concern-row" data-ingidx="' + f.i + '">' + dot(statusColor(f.c.status)) +
        '<div class="row-main"><div class="row-title">' + esc(titleCase(f.c.raw)) + '</div>' +
        '<div class="row-sub">' + esc(note) + '</div></div>' +
        '<div class="brk-val ' + sev + '">' + STATUS_LABEL[f.c.status] + ' ›</div></button>';
    }).join("");
  }
  function ingredientRow(c, idx) {
    return '<div class="lrow ing-row tappable" data-ingidx="' + idx + '">' + dot(statusColor(c.status)) +
      '<div class="row-main"><div class="row-title">' + esc(c.raw) + '</div>' +
      '<div class="row-sub">' + esc(c.reason) + '</div></div>' +
      '<div class="status-tag ' + c.status + '">' + STATUS_LABEL[c.status] + ' ›</div></div>';
  }

  function ingredientProductContext(d) {
    var path = d.path || [];
    var location = d.depth ? ("Nested under " + titleCase(path[path.length - 2] || d.parent || "parent ingredient")) :
      (d.topLevelPosition ? "#" + d.topLevelPosition + " in label order" : "Ingredient encyclopedia entry");
    var confidence = d.recognitionConfidence ? cap(d.recognitionConfidence) + " match" : "Reference entry";
    var breadcrumb = path.length > 1 ? '<div class="ingredient-path" aria-label="Ingredient path">' + path.map(function (part, index) {
      return '<span>' + esc(titleCase(part)) + '</span>' + (index < path.length - 1 ? '<i aria-hidden="true">›</i>' : '');
    }).join("") + '</div>' : "";
    var attrs = d.attributes || {}, attrChips = [];
    var contextMeta = d.useContext && COS && COS.useContexts && COS.useContexts[d.useContext];
    if (attrs.addedSugar) attrChips.push('<span class="detail-chip nutrition">Added sugar</span>');
    if (attrs.organic) attrChips.push('<span class="detail-chip certification">Organic ingredient</span>');
    if (attrs.processing) attrChips.push('<span class="detail-chip processing">' + esc(attrs.processing) + '</span>');
    if (attrs.kosherSalt) attrChips.push('<span class="detail-chip neutral">Name only · not a kosher certification</span>');
    var sugar = d.sugarProfile ? '<div class="ingredient-nuance sugar"><b>Added sugar — amount matters</b><p>' +
      esc(d.sugarProfile.explanation || "This is still an added sugar.") + '</p><p>' +
      esc(d.sugarProfile.relativeNote || "Current evidence does not support treating this as uniquely harmful or automatically healthier than other added sugars.") + '</p></div>' : "";
    var organic = attrs.organic ? '<div class="ingredient-nuance organic"><b>Organic is a production attribute</b><p>This qualifier applies to this ingredient only unless the product has a separate sourced certification. It adds no automatic health points.</p></div>' : "";
    if (!path.length && !d.topLevelPosition && !attrChips.length && !sugar && !organic) return "";
    return '<section class="ingredient-context"><div class="section-kicker">In this product</div>' + breadcrumb +
      '<div class="ingredient-facts"><div><span>Position</span><b>' + esc(location) + '</b></div>' +
      '<div><span>Function</span><b>' + esc(roleLabel(d.role)) + '</b></div>' +
      '<div><span>Score effect</span><b>' + esc(pointsLabel(d)) + '</b></div>' +
      '<div><span>Recognition</span><b>' + esc(confidence) + '</b></div>' +
      (contextMeta ? '<div><span>Exposure</span><b>' + esc(contextMeta.label) + '</b></div>' : '') + '</div>' +
      (contextMeta ? '<div class="ingredient-nuance"><b>Why context matters</b><p>' + esc(d.exposureNote || contextMeta.exposure) + '</p></div>' : '') +
      (attrChips.length ? '<div class="detail-chips">' + attrChips.join("") + '</div>' : '') + sugar + organic + '</section>';
  }

  function viewIngredient() {
    var d = state.ingDetail; if (!d) return viewResult();
    var tabs = [["what", "Overview"], ["why", "Why it matters"], ["risk", "Evidence"], ["studies", "Studies"]];
    var body;
    if (state.ingTab === "what") body = '<p>' + esc(d.whatIs) + '</p>';
    else if (state.ingTab === "why") body = '<p>' + esc(d.whyFlagged) + '</p>';
    else if (state.ingTab === "risk") body = '<p>' + esc(d.effects) + '</p>' +
      (d.assessmentNote ? '<div class="assessment-note">' + esc(d.assessmentNote) + '</div>' : '') +
      (d.evidence ? '<div class="evidence-box"><div><span>Basis</span><b>' + esc(d.evidence.basis || "Screening category") + '</b></div>' +
        '<div><span>References</span><b>' + (+d.evidence.referenceCount || 0) + '</b></div><p>' + esc(d.evidence.scope || "Dose and individual exposure are not measured here.") + '</p></div>' : '');
    else body = (d.studies && d.studies.length) ? d.studies.map(function (s) {
      return '<div class="study glass"><div class="study-title">' + esc(s.title) + '</div>' +
        '<div class="study-src">' + esc(s.source) + (s.year ? " · " + s.year : "") + '</div></div>';
    }).join("") : '<div class="empty small">No specific studies catalogued for this one yet.</div>';

    return '<div class="screen">' + backBar(d.title) +
      '<div class="ing-head glass" style="--sc:' + statusColor(d.status) + '">' + dot(statusColor(d.status)) +
        '<div class="row-main"><div class="ing-cat">' + esc(d.category) + (d.enumber ? " · " + esc(d.enumber) : "") + '</div>' +
        '<div class="ing-summary">' + esc(d.summary) + '</div></div>' +
        '<div class="status-tag ' + d.status + '">' + STATUS_LABEL[d.status] + '</div></div>' +
      ingredientProductContext(d) +
      (d.banned ? '<div class="banned-note">' + icon("globe") + ' <b>Banned / restricted:</b> ' + esc(d.banned) + '</div>' : "") +
      '<div class="tabs" aria-label="Ingredient detail sections">' + tabs.map(function (t) {
        return '<button class="tab' + (state.ingTab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '" aria-pressed="' + (state.ingTab === t[0] ? "true" : "false") + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="tab-body" aria-live="polite">' + body + '</div>' +
      '<button class="ghost-btn research-btn" data-research="' + esc(d.title) + '">' + icon("research") + ' Research this ingredient online</button>' +
      researchBlock(d) +
      '<div class="disclaimer">Educational summary, not medical advice.</div></div>';
  }

  function viewHistory() {
    var fav = state.historyFilter === "fav";
    var list = fav ? state.favorites : state.history;
    var chips = '<div class="chips">' +
      '<button class="chip' + (!fav ? " on" : "") + '" data-hist="all">Recent</button>' +
      '<button class="chip' + (fav ? " on" : "") + '" data-hist="fav">' + icon("favorite") + ' Favorites</button></div>';
    var body = list.length ? list.map(historyRow).join("") +
      (!fav ? '<button class="ghost-btn danger" data-act="clearHist">Clear history</button>' : "") :
      '<div class="empty">' + illus("box") + (fav ? "No favorites yet.<br>Use the star button on a product to save it." : "Nothing scanned yet.") + '</div>';
    return '<div class="screen"><header class="hd"><div class="logo">History</div></header>' + chips + body + '</div>';
  }

  function viewInsights() {
    var eatenMode = state.insightsFilter === "eaten";
    var eatenCount = state.history.filter(function (p) { return p.logged === "eaten"; }).length;
    var source = eatenMode ? state.history.filter(function (p) { return p.logged === "eaten"; }) : state.history;
    var chips = '<div class="chips">' +
      '<button class="chip' + (!eatenMode ? " on" : "") + '" data-ins="all">All scans</button>' +
      '<button class="chip' + (eatenMode ? " on" : "") + '" data-ins="eaten">' + icon("fork") + ' Eaten (' + eatenCount + ')</button></div>';
    var s = computeInsights(source);
    var today = todayCard();
    var trends = trendsCard();
    if (!s.n) return '<div class="screen"><header class="hd"><div class="logo">Insights</div>' +
      '<div class="sub">Your diet & scanning habits</div></header>' + today + chips +
      '<div class="empty">' + illus(eatenMode ? "heart" : "chart") + (eatenMode ? "Mark products as “I ate this” on the result screen to track your diet here." : "Scan a few products and your stats show up here.") + '</div></div>';
    function seg(cls, v) { return v ? '<div class="seg ' + cls + '" style="flex:' + v + '"></div>' : ""; }
    var bar = '<div class="distbar">' + seg("exc", s.dist.exc) + seg("good", s.dist.good) + seg("mid", s.dist.mid) + seg("bad", s.dist.bad) + '</div>';
    var topHtml = s.top.length ? s.top.map(function (f) {
      return '<div class="lrow"><div class="row-main"><div class="row-title">' + esc(f.name) + '</div></div><div class="status-tag caution">' + f.count + '×</div></div>';
    }).join("") : '<div class="lrow"><div class="row-main"><div class="row-sub">No flagged additives yet.</div></div></div>';
    return '<div class="screen">' +
      '<header class="hd"><div class="logo">Insights</div><div class="sub">Your diet & scanning habits</div></header>' + today + trends + chips +
      '<div class="stat-grid">' +
        '<div class="stat card"><div class="stat-num">' + s.n + '</div><div class="stat-lbl">' + (eatenMode ? "Foods eaten" : "Products scanned") + '</div></div>' +
        '<div class="stat card"><div class="stat-num" style="color:' + scoreColor(bandFor(s.avg, false).cls) + '">' + s.avg + '</div><div class="stat-lbl">Average score</div></div>' +
      '</div>' +
      '<div class="panel glass"><div class="panel-h">Verdict mix</div><div class="lrow" style="display:block">' + bar +
        '<div class="distlegend"><b class="exc">●</b> ' + s.dist.exc + ' Excellent &nbsp; <b class="good">●</b> ' + s.dist.good + ' Good &nbsp; <b class="mid">●</b> ' + s.dist.mid + ' Poor &nbsp; <b class="bad">●</b> ' + s.dist.bad + ' Bad</div></div></div>' +
      '<div class="panel glass"><div class="panel-h neg">Most-seen flagged ingredients</div>' + topHtml + '</div>' +
      (s.best ? '<div class="section-title">Your healthiest scan</div>' + historyRow(s.best) : "") +
      (s.worst && s.worst !== s.best ? '<div class="section-title">Worst offender</div>' + historyRow(s.worst) : "") +
      '</div>';
  }

  function viewOnboard() {
    var toggles = PROFILE_OPTS.map(function (o) {
      var on = !!state.profile[o[0]];
      return '<div class="row card toggle-row tappable" data-toggle="' + o[0] + '"><div class="row-title">' + o[1] + '</div>' +
        '<div class="switch ' + (on ? "on" : "") + '"><span></span></div></div>';
    }).join("");
    return '<div class="screen onboard">' +
      '<div class="ob-hero"><div class="ob-logo">' + brandLogo(88) + '</div><div class="logo">NutriCheck</div>' +
      '<div class="sub">Scan a product, verify the label data, and see every recognized ingredient with a strict, transparent rating.</div></div>' +
      '<div class="ob-feats">' +
        '<div class="ob-feat">' + icon("camera") + '<span>Scan or search any product</span></div>' +
        '<div class="ob-feat">' + icon("chart") + '<span>0–100 score with a clear verdict</span></div>' +
        '<div class="ob-feat">' + icon("book") + '<span>Every recognized ingredient explained; gaps shown clearly</span></div>' +
        '<div class="ob-feat">' + icon("up") + '<span>Better choices when a product scores low</span></div>' +
      '</div>' +
      '<button class="big-btn" data-act="finishOnboard">Start scanning</button>' +
      '<div class="section-title">Any diet needs? (optional)</div>' + toggles + '</div>';
  }

  function macroChip(label, val, unit) {
    return '<div class="macro"><div class="macro-num">' + val + unit + '</div><div class="macro-lbl">' + label + '</div></div>';
  }
  function healthForm() {
    var h = state.health || {};
    function opt(v, label, cur) { return '<option value="' + v + '"' + (String(cur) === String(v) ? " selected" : "") + '>' + label + '</option>'; }
    return '<div class="panel glass hform">' +
      '<div class="frow"><label>Sex</label><select id="h_sex">' + opt("male", "Male", h.sex) + opt("female", "Female", h.sex) + '</select></div>' +
      '<div class="frow"><label>Age</label><input id="h_age" type="number" inputmode="numeric" value="' + esc(h.age || "") + '" placeholder="years"></div>' +
      '<div class="frow"><label>Height</label><div class="ftin"><input id="h_ft" type="number" inputmode="numeric" value="' + esc(h.ft || "") + '" placeholder="ft"><input id="h_in" type="number" inputmode="numeric" value="' + esc(h.in || "") + '" placeholder="in"></div></div>' +
      '<div class="frow"><label>Weight</label><input id="h_lb" type="number" inputmode="decimal" value="' + esc(h.lb || "") + '" placeholder="lb"></div>' +
      '<div class="frow"><label>Activity</label><select id="h_act">' +
        opt("1.2", "Sedentary", h.activity) + opt("1.375", "Lightly active", h.activity) + opt("1.55", "Moderately active", h.activity) +
        opt("1.725", "Very active", h.activity) + opt("1.9", "Athlete", h.activity) + '</select></div>' +
      '<div class="frow"><label>Goal</label><select id="h_goal">' + opt("lose", "Lose weight", h.goal) + opt("maintain", "Maintain", h.goal) + opt("gain", "Gain muscle", h.goal) + '</select></div>' +
      '<button class="big-btn" data-act="saveHealth">Calculate my goal</button></div>';
  }
  function viewProfile() {
    var t = computeTargets(state.health);
    var showForm = state.editHealth || !t;
    var health = showForm ? healthForm() :
      '<div class="panel glass goal-card">' +
        '<div class="goal-cal"><div class="goal-num">' + t.target + '</div><div class="goal-lbl">kcal / day target</div></div>' +
        '<div class="macros">' + macroChip("Protein", t.protein, "g") + macroChip("Carbs", t.carbs, "g") + macroChip("Fat", t.fat, "g") + '</div>' +
        '<div class="lrow"><div class="row-main"><div class="row-sub">BMR ' + t.bmr + ' · maintenance ' + t.tdee + ' kcal · goal: ' + esc(state.health.goal || "maintain") + '</div></div></div>' +
        '<button class="ghost-btn" data-act="editHealth">Edit my details</button></div>';

    var s = state.settings || {};
    var themeSel = ["dark", "light", "auto"].map(function (o) {
      return '<button class="chip' + ((s.theme || "dark") === o ? " on" : "") + '" data-theme="' + o + '">' + cap(o) + '</button>';
    }).join("");
    var settings = '<div class="section-title">Settings</div><div class="panel glass">' +
      '<div class="lrow"><div class="row-main"><div class="row-title">Theme</div></div><div class="chips sm">' + themeSel + '</div></div>' +
      '<div class="lrow tappable" data-act="exportData"><div class="row-main"><div class="row-title">Export my data</div><div class="row-sub">Download a backup file</div></div><div class="chev">›</div></div>' +
      '<label class="lrow tappable"><div class="row-main"><div class="row-title">Import data</div><div class="row-sub">Restore from a backup</div></div><input id="importfile" type="file" accept="application/json" hidden><div class="chev">›</div></label></div>';

    var allergens = '<div class="section-title">Diet & allergens</div>' + PROFILE_OPTS.map(function (o) {
      var on = !!state.profile[o[0]];
      return '<div class="row card toggle-row tappable" data-toggle="' + o[0] + '"><div class="row-title">' + o[1] + '</div>' +
        '<div class="switch ' + (on ? "on" : "") + '"><span></span></div></div>';
    }).join("");

    return '<div class="screen">' +
      '<header class="hd"><div class="logo">My profile</div><div class="sub">Health goal, diet & settings</div></header>' +
      '<div class="section-title">Health & calorie goal</div>' + health +
      settings + allergens +
      '<div class="disclaimer">Stored only on this device. Calorie targets are estimates, not medical advice.</div></div>';
  }

  function viewEncyclopedia() {
    var q = norm(state.encQuery);
    var list = DATA.additives.slice().sort(function (a, b) {
      return (STATUS_RANK[b.risk] - STATUS_RANK[a.risk]) || a.names[0].localeCompare(b.names[0]);
    });
    if (q) list = list.filter(function (a) {
      return a.names.some(function (n) { return norm(n).indexOf(q) !== -1; }) || norm(a.category).indexOf(q) !== -1;
    });
    var rows = list.map(function (a) {
      return '<div class="lrow tappable" data-enc="' + a.id + '">' + dot(statusColor(a.risk)) +
        '<div class="row-main"><div class="row-title">' + esc(titleCase(a.names[0])) + (a.enumber ? " · " + esc(a.enumber) : "") + '</div>' +
        '<div class="row-sub">' + esc(a.category) + '</div></div>' +
        '<div class="status-tag ' + a.risk + '">' + STATUS_LABEL[a.risk] + ' ›</div></div>';
    }).join("");
    return '<div class="screen">' + backBar("Ingredient encyclopedia") +
      '<div class="searchbar"><input id="encq" class="text-input search-input" value="' + esc(state.encQuery) + '" placeholder="Search ' + DATA.additives.length + ' additives…" />' +
      '<button class="search-go" data-act="encGo" aria-label="Search ingredients">' + icon("search") + '</button></div>' +
      '<div class="panel glass">' + (rows || '<div class="lrow"><div class="row-main"><div class="row-sub">No matches.</div></div></div>') + '</div></div>';
  }
  function exportData() {
    try {
      var data = { app: "NutriCheck", version: 4, exportedAt: new Date().toISOString(),
        history: state.history, favorites: state.favorites, profile: state.profile, health: state.health, settings: state.settings };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "nutricheck-backup.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (e) { alert("Couldn't export on this device."); }
  }

  function viewAddPhoto() {
    var pend = state.pending || {};
    var note;
    if (pend.reason === "network") note = "The product databases did not respond. You can retry, or photograph the <b>ingredients list</b> and continue offline.";
    else if (pend.reason === "notFound") note = "No database match was found for <b>" + esc(pend.barcode) + "</b>. Photograph the <b>ingredients list</b> so nothing is guessed.";
    else if (pend.reason === "missingIngredients") note = "We found the product, but its database record has no ingredient list. Photograph the <b>ingredients panel</b> and review the text before analysis.";
    else note = "Take a clear, well-lit photo of the <b>ingredients list</b> on the package.";
    return '<div class="screen">' + backBar("Add by photo") +
      '<div class="photo-card glass"><div class="photo-illu">' + icon("tag") + '</div><p>' + note + '</p>' +
      '<label class="big-btn"><input id="photo" type="file" accept="image/*" capture="environment" hidden>' + icon("camera") + ' Take / choose photo</label>' +
      '<div class="hint">Fill the frame with only the full ingredients panel, in focus and without glare.</div>' +
      (pend.barcode ? '<div class="fallback-actions"><button class="ghost-btn" data-act="retryLookup">Retry database lookup</button>' +
        '<button class="link-btn" data-act="manual">Enter a different barcode</button></div>' : '') + '</div>' +
      '<div id="ocrPreview"></div></div>';
  }

  function backBar(title) {
    return '<div class="backbar"><button class="back" data-act="back" aria-label="Go back">‹</button>' +
      (title ? '<div class="bb-title">' + esc(title) + '</div>' : '') + '</div>';
  }
  function tabBar() {
    var items = [["home", "Scan", "scan"], ["history", "History", "clock"], ["insights", "Insights", "chart"], ["profile", "Profile", "user"]];
    var active = state.view === "history" ? "history" : state.view === "insights" ? "insights" : state.view === "profile" ? "profile" : "home";
    return '<nav class="tabbar">' + items.map(function (i) {
      return '<button class="tabitem' + (active === i[0] ? " on" : "") + '" data-nav="' + i[0] + '">' +
        '<div class="ti-ico">' + icon(i[2]) + '</div><div class="ti-lbl">' + i[1] + '</div></button>';
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
    else if (v === "insights") html = viewInsights();
    else if (v === "profile") html = viewProfile();
    else if (v === "addPhoto") html = viewAddPhoto();
    else if (v === "encyclopedia") html = viewEncyclopedia();
    else if (v === "comparePick") html = viewComparePick();
    else if (v === "compare") html = viewCompare();
    else if (v === "onboard") html = viewOnboard();
    else html = viewHome();

    // Preserve scroll position when re-rendering the SAME view in place (a fav
    // toggle, portion step, filter, etc.) so the page doesn't jump to the top
    // and feel broken. Reset to the top only when actually changing screens.
    var sameView = (v === lastRenderedView);
    var keepY = sameView ? (window.scrollY || window.pageYOffset || 0) : 0;

    var showTabs = (v === "home" || v === "history" || v === "insights" || v === "profile");
    app.innerHTML = '<div class="app-body">' + html + '</div>' + (showTabs ? tabBar() : "");
    if (state.busy) app.insertAdjacentHTML("beforeend",
      '<div class="overlay"><div class="spinner"></div><div class="ov-msg">' + esc(state.statusMsg || "Working…") + '</div></div>');

    window.scrollTo(0, keepY);
    lastRenderedView = v;
    if (v === "result" && state.product && state.product.id !== lastAnimatedId) { lastAnimatedId = state.product.id; animateScore(); }
  }

  /* --------------------------------------------------------- events */
  function onClick(e) {
    var t = e.target.closest("[data-act],[data-nav],[data-open],[data-ingidx],[data-tab],[data-toggle],[data-research],[data-search-idx],[data-alt],[data-cmp],[data-fav],[data-hist],[data-log],[data-portion],[data-ins],[data-theme],[data-enc],[data-sort]");
    if (!t) return;
    if (t.dataset.fav != null) { toggleFav(state.product); render(); return; }
    if (t.dataset.log != null) { setLogged(t.dataset.log); return; }
    if (t.dataset.portion != null) { setPortion(+t.dataset.portion); return; }
    if (t.dataset.ins != null) { state.insightsFilter = t.dataset.ins; render(); return; }
    if (t.dataset.hist != null) { state.historyFilter = t.dataset.hist; render(); return; }
    if (t.dataset.theme != null) { state.settings.theme = t.dataset.theme; saveSettings(); applyTheme(); render(); return; }
    if (t.dataset.sort != null) { state.searchSort = t.dataset.sort; render(); return; }
    if (t.dataset.enc != null) {
      var ea = DATA.additives.filter(function (x) { return x.id === t.dataset.enc; })[0];
      if (ea) { state.ingDetail = ingredientDetail({ additive: ea }); state.ingTab = "what"; state.ingFrom = "encyclopedia";
        state.research = { term: "", loading: false, data: null, error: false }; go("ingredient"); }
      return;
    }
    if (t.dataset.alt != null) { var ap = state.alts.list && state.alts.list[+t.dataset.alt]; if (ap) openResult(ap); return; }
    if (t.dataset.cmp != null) { var cb = state.compareCands && state.compareCands[+t.dataset.cmp]; if (cb) { state.compareB = cb; go("compare"); } return; }
    if (t.dataset.research != null) { doResearch(t.dataset.research); return; }
    if (t.dataset.searchIdx != null) {
      var o = state.searchResults && state.searchResults[+t.dataset.searchIdx];
      if (o) openOff(o); return;
    }
    if (t.dataset.nav) { go(t.dataset.nav); return; }
    if (t.dataset.open) {
      var p = state.history.concat(state.favorites).filter(function (h) { return h.id === t.dataset.open; })[0];
      if (p) openResult(p); return;
    }
    if (t.dataset.ingidx != null) {
      var item = state.product && state.product.classified[+t.dataset.ingidx];
      if (item) {
        state.ingDetail = ingredientDetail(item);
        ["id", "parentId", "raw", "parent", "path", "canonicalPath", "depth", "position", "siblingPosition",
          "topLevelPosition", "scoreImpact", "scoreApplied", "role", "category", "attributes", "sugarProfile",
          "matchType", "matchedTerm", "matchConfidence", "recognitionConfidence", "evidence", "useContext",
          "exposureNote", "contextWhy", "contextEffects"].forEach(function (key) {
          if (item[key] != null) state.ingDetail[key] = item[key];
        });
        state.ingTab = "what"; state.ingFrom = "result";
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
    else if (act === "addPhoto") { state.pending = null; go("addPhoto"); }
    else if (act === "analyzeOcr") {
      var ta = document.getElementById("ocrText");
      var txt = ta ? ta.value.trim() : "";
      var reviewed = plausibleReviewedIngredients(txt);
      if (!reviewed) { alert("That text does not look like a usable ingredient list. Retake the photo or enter the label text carefully."); return; }
      var ctx = state.ocrPending || {};
      var product = buildProduct(ctx.off || null, reviewed.text, { photoKey: ctx.photoKey,
        source: ctx.off && ctx.off.source ? ctx.off.source : "Label photo / OCR", name: ctx.name || "Scanned product",
        rawIngredientsText: reviewed.rawIngredientText || reviewed.text, analysisIngredientsText: reviewed.text,
        ocrRawText: ctx.rawText || "", ingredientSource: "Label photo · reviewed OCR",
        ingredientConfidence: ctx.confidence || 0, ingredientCoverage: ctx.coverage || reviewed.coverage,
        ingredientCoveragePct: ctx.coveragePct != null ? ctx.coveragePct : reviewed.coveragePct });
      if (ctx.barcode) product.barcode = ctx.barcode;
      state.ocrPending = null; state.pending = null; showProduct(product);
    }
    else if (act === "manual") go("manual");
    else if (act === "comparePick") go("comparePick");
    else if (act === "back") go(state.view === "ingredient" ? state.ingFrom : (state.view === "compare" ? "comparePick" : (state.view === "comparePick" ? "result" : "home")));
    else if (act === "manualGo") { var el = document.getElementById("bc"); if (el && el.value.trim()) handleBarcode(el.value.trim(), { origin: "manual" }); }
    else if (act === "retryLookup") { var pendingCode = state.pending && state.pending.barcode; if (pendingCode) handleBarcode(pendingCode, { origin: "retry", force: true }); }
    else if (act === "searchGo") { var qe = document.getElementById("q"); if (qe && qe.value.trim()) runSearch(qe.value.trim()); }
    else if (act === "toggleScore") { state.scoreOpen = !state.scoreOpen; render(); }
    else if (act === "encyclopedia") { state.encQuery = ""; go("encyclopedia"); }
    else if (act === "encGo") { var ec = document.getElementById("encq"); state.encQuery = ec ? ec.value.trim() : ""; render(); }
    else if (act === "editHealth") { state.editHealth = true; render(); }
    else if (act === "exportData") { exportData(); }
    else if (act === "saveHealth") {
      var g = function (id) { var el = document.getElementById(id); return el ? el.value : ""; };
      var age = +g("h_age"), ft = +g("h_ft"), inch = +g("h_in"), lb = +g("h_lb");
      if (!age || (!ft && !inch) || !lb) { alert("Please fill in age, height and weight."); return; }
      var cm = Math.round((ft * 12 + inch) * 2.54), kg = Math.round(lb * 0.45359 * 10) / 10;
      state.health = { sex: g("h_sex"), age: age, ft: ft, in: inch, lb: lb, activity: g("h_act"), goal: g("h_goal"), cm: cm, kg: kg };
      saveHealth(); state.editHealth = false; render();
    }
    else if (act === "finishOnboard") { try { localStorage.setItem("cb_onboarded", "1"); } catch (e) {} state.onboarded = true; go("home"); }
    else if (act === "clearHist") { if (confirm("Clear all scan history?")) { state.history = []; saveHistory(); render(); } }
  }

  function onChange(e) {
    if (e.target && e.target.id === "importfile" && e.target.files && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (d.history) state.history = d.history;
          if (d.favorites) state.favorites = d.favorites;
          if (d.profile) state.profile = d.profile;
          if (d.health) state.health = d.health;
          if (d.settings) state.settings = d.settings;
          saveHistory(); saveFavs(); saveProfile(); saveHealth(); saveSettings(); applyTheme(); render();
          alert("Data imported successfully.");
        } catch (err) { alert("That backup file couldn't be read."); }
      };
      fr.readAsText(e.target.files[0]); return;
    }
    if (e.target && e.target.id === "bcphoto" && e.target.files && e.target.files[0]) {
      var bfile = e.target.files[0];
      stopScanner();
      busy(true, "Reading barcode…");
      fileToDataUrl(bfile).then(function (durl) {
        return decodeBarcodeFromImage(durl);
      }).then(function (code) {
        if (code) { state.busy = false; setStatus(""); handleBarcode(code, { origin: "photo" }); }
        else {
          busy(false, "");
          alert("No valid UPC/EAN/GTIN was found in that photo. Fill the frame with the whole barcode, avoid glare, and try again — or enter the printed digits.");
          if (state.view === "scanner") setTimeout(startScanner, 60);
        }
      }).catch(function () {
        busy(false, "");
        alert("Couldn't process that barcode photo. Try another photo or enter the printed digits.");
        if (state.view === "scanner") setTimeout(startScanner, 60);
      });
      return;
    }
    if (e.target && e.target.id === "photo" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      busy(true, "Reading label…");
      fileToDataUrl(file).then(function (durl) {
        var key = "ph" + Date.now(); savePhoto(key, durl);
        // Preprocess (grayscale + upscale + contrast) only for the OCR pass;
        // the original photo is what we keep for display.
        return preprocessImage(durl).then(runOCR).then(function (ocr) {
          busy(false, "");
          var prev = document.getElementById("ocrPreview");
          var off = state.pending && state.pending.off ? state.pending.off : null;
          // OCR on curved, glossy labels is never perfect — always let the user
          // review and fix the text before we analyze it.
          state.ocrPending = {
            off: off, photoKey: key,
            barcode: state.pending && state.pending.barcode ? state.pending.barcode : null,
            name: off && off.name ? off.name : "Scanned product",
            rawText: ocr.rawText || "", confidence: ocr.confidence || 0,
            coverage: ocr.coverage, coveragePct: ocr.coveragePct
          };
          if (prev) prev.innerHTML = ocrReviewBlock(ocr);
          var ta = document.getElementById("ocrText");
          if (ta) { try { ta.focus(); } catch (e) {} }
        });
      }).catch(function (err) {
        busy(false, "");
        alert(err && err.name === "TimeoutError" ? "Reading that image took too long. Crop closer to the ingredients and try again." : "Couldn't process that image. Try a closer, sharper photo.");
      });
    }
  }

  function onKey(e) {
    if (e.key !== "Enter" || !e.target) return;
    if (e.target.id === "q" && e.target.value.trim()) { e.preventDefault(); runSearch(e.target.value.trim()); }
    else if (e.target.id === "bc" && e.target.value.trim()) { e.preventDefault(); handleBarcode(e.target.value.trim(), { origin: "manual" }); }
    else if (e.target.id === "encq") { e.preventDefault(); state.encQuery = e.target.value.trim(); render(); }
  }
  // Read-only pure-helper seam for scanner regression tests. The production app
  // does not read this object; exposing it avoids duplicating validation logic in
  // a separate test-only implementation.
  window.NUTRICHECK_SCANNER_TEST = {
    gtinChecksumValid: gtinChecksumValid,
    normalizeBarcode: normalizeBarcode,
    barcodeLookupVariants: barcodeLookupVariants,
    selectConsensusCandidate: selectConsensusCandidate,
    ingredientTextScore: ingredientTextScore,
    selectIngredientPayload: selectIngredientPayload,
    flattenStructuredIngredients: flattenStructuredIngredients,
    structuredIngredientsText: structuredIngredientsText,
    structuredIngredientIds: structuredIngredientIds,
    buildAnalysisIngredients: buildAnalysisIngredients,
    mapOff: mapOff,
    buildProduct: buildProduct,
    rehydrateProduct: rehydrateProduct,
    ingredientResearchQuery: ingredientResearchQuery,
    validIngredientResearchResult: validIngredientResearchResult,
    mergeOffRecords: mergeOffRecords,
    referenceProductOff: referenceProductOff,
    referenceForBarcode: referenceForBarcode,
    referenceSearchResults: referenceSearchResults,
    sanitizeOcrRaw: sanitizeOcrRaw,
    extractIngredientText: extractIngredientText,
    plausibleReviewedIngredients: plausibleReviewedIngredients
  };
  function init() {
    app = document.getElementById("app");
    loadLocal();
    applyTheme();
    if (!state.onboarded) state.view = "onboard";
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
