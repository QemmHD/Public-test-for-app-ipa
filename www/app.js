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
    busy: false, statusMsg: ""
  };
  var app;
  var researchCache = {};

  /* ------------------------------------------------------------- storage */
  function loadLocal() {
    try { state.history = JSON.parse(localStorage.getItem("cb_history") || "[]"); } catch (e) { state.history = []; }
    try { state.favorites = JSON.parse(localStorage.getItem("cb_favs") || "[]"); } catch (e) { state.favorites = []; }
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

  var STATUS_RANK = { avoid: 4, caution: 3, limit: 2, unknown: 1, good: 0 };
  var STATUS_LABEL = { avoid: "Avoid", caution: "Caution", limit: "Limit", unknown: "Unknown", good: "Clean" };
  var STATUS_GROUPS = ["avoid", "caution", "limit", "unknown", "good"];
  // Human label + emoji per product family for the result-screen type badge.
  var PROD_TYPE_LABEL = {
    food: ["🍽", "Food"], petfood: ["🐾", "Pet food"],
    beauty: ["🧴", "Beauty / personal care"], household: ["🧽", "Household / other"]
  };
  function prodTypeBadge(t) {
    var m = PROD_TYPE_LABEL[t] || PROD_TYPE_LABEL.household;
    return '<div class="ptype-badge" data-ptype="' + esc(t || "food") + '">' + m[0] + ' ' + m[1] + '</div>';
  }
  // Certified-only kosher chip (shown only when Open*Facts carries a kosher label).
  function kosherBadge() {
    return '<div class="kosher-badge" title="Certified kosher per product label data">\u2721 Certified Kosher</div>';
  }

  // Ingredient-detail / nutrition / scoring all live in the engine now.
  function ingredientDetail(item) { return ENG.ingredientDetail(item); }
  function evalNutrition(off) { return ENG.evalNutrition(off); }
  function analyze(off, ingredientsText, productType) { return ENG.analyze(off, ingredientsText, productType); }
  function bandFor(score, hasAvoid) { return ENG.bandFor(score, hasAvoid); }

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

  /* ----------------------------------------- network: timeout + retry */
  // Wrap fetch with an AbortController timeout and a small retry so a slow or
  // dead network surfaces an error instead of hanging the UI forever.
  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || FETCH_TIMEOUT;
    var retries = opts.retries == null ? FETCH_RETRIES : opts.retries;
    function attempt(left) {
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs) : null;
      return fetch(url, { headers: { "Accept": "application/json" }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (timer) clearTimeout(timer); return r; })
        .catch(function (err) {
          if (timer) clearTimeout(timer);
          if (left > 0) return new Promise(function (res) { setTimeout(res, 400); }).then(function () { return attempt(left - 1); });
          throw err;
        });
    }
    return attempt(retries);
  }
  function fetchJson(url, opts) { return fetchWithTimeout(url, opts).then(function (r) { return r.ok ? r.json() : null; }); }

  /* -------------------------------------------------- Open*Facts family */
  var OFF_FIELDS = "code,product_name,brands,image_front_small_url,image_front_url,ingredients_text,ingredients_text_en,ingredients_text_with_allergens,ingredients,additives_tags,categories_tags,labels_tags,serving_quantity,nova_group,nutriscore_grade,nutriments";
  // Certified-only kosher detection: trust an official Open*Facts kosher label
  // (e.g. "en:kosher", "en:ou-kosher"). We never guess kosher status from
  // ingredients — only report a certification the product data actually carries.
  function detectKosher(p) {
    var labels = (p && p.labels_tags) || [];
    for (var i = 0; i < labels.length; i++) {
      if (/kosher/i.test(labels[i])) return true;
    }
    return false;
  }
  // Best-available ingredient text: prefer English, then default text, then
  // reconstruct from Open Food Facts' structured `ingredients` array so a
  // product with no free-text list still resolves automatically (no photo).
  function offIngredientsText(p) {
    var txt = p.ingredients_text_en || p.ingredients_text || p.ingredients_text_with_allergens || "";
    var structured = "";
    if (Array.isArray(p.ingredients) && p.ingredients.length) {
      structured = p.ingredients.map(function (x) {
        return (x && x.text) || (x && x.id && String(x.id).replace(/^[a-z]{2}:/, "").replace(/-/g, " ")) || "";
      }).filter(Boolean).join(", ");
    }
    // Crowd-sourced free text can contain descriptions or AI commentary.
    // Prefer the structured list whenever the free-text field is suspicious.
    var quality = ENG.ingredientTextQuality(txt);
    if ((!quality.usable || !txt || txt.replace(/\s/g, "").length < 3) && structured) txt = structured;
    if (!ENG.ingredientTextQuality(txt).usable) txt = "";
    return txt;
  }
  // Additive E-numbers Open Food Facts detected for this product (e.g. "en:e102").
  // These are available even when the ingredient text is incomplete, so we use
  // them to fill gaps and flag additives the text alone would miss.
  function offAdditiveCodes(p) {
    var tags = (p && p.additives_tags) || [], out = [];
    tags.forEach(function (t) {
      var code = String(t).split(":").pop().toLowerCase().replace(/\s/g, "");
      if (/^e\d{3,4}[a-z]?$/.test(code)) out.push(code);
    });
    return out;
  }
  function mapOff(p, code, src) {
    if (!p) return null;
    var cats = p.categories_tags || [], catTag = "";
    for (var i = cats.length - 1; i >= 0; i--) { if (/^en:/.test(cats[i]) && cats[i].length > 5) { catTag = cats[i].slice(3); break; } }
    if (!catTag && cats.length) catTag = String(cats[cats.length - 1]).replace(/^[a-z]{2}:/, "");
    return { barcode: code || p.code || "", name: p.product_name || "Unknown product", brand: p.brands || "",
      image: p.image_front_small_url || p.image_front_url || "", category: catTag, serving_quantity: p.serving_quantity,
      ingredientsText: offIngredientsText(p), additiveCodes: offAdditiveCodes(p),
      productType: (src && src.type) || "food", source: (src && src.label) || "Open Food Facts",
      kosher: detectKosher(p),
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
      if (!rec || (Date.now() - (rec.ts || 0)) > PROD_TTL) return null;
      return rec.off || null;
    } catch (e) { return null; }
  }
  function cacheProduct(code, off) {
    try { localStorage.setItem("cb_prod_" + code, JSON.stringify({ ts: Date.now(), off: off })); } catch (e) {}
  }
  // Query each Open*Facts source in order; first product with data wins. The
  // detected source sets productType (food / beauty / household / petfood).
  // ---- USDA FoodData Central (public-domain UPC + ingredient source) ----
  // Used to gap-fill when Open Food Facts has no ingredient list. A free
  // data.gov key (Settings) raises limits; the shared DEMO_KEY works otherwise.
  function usdaKey() { var s = state.settings || {}; return (s.usdaKey && s.usdaKey.trim()) || "DEMO_KEY"; }
  function mapUsdaFood(f, code) {
    if (!f) return null;
    var nu = {};
    (f.foodNutrients || []).forEach(function (n) {
      var num = String(n.nutrientNumber || n.number || (n.nutrient && n.nutrient.number) || "");
      var val = n.value != null ? n.value : (n.amount != null ? n.amount : null);
      if (val == null) return;
      if (num === "208") nu["energy-kcal_100g"] = val;
      else if (num === "203") nu["proteins_100g"] = val;
      else if (num === "269" || num === "2000") nu["sugars_100g"] = val;
      else if (num === "606") nu["saturated-fat_100g"] = val;
      else if (num === "291") nu["fiber_100g"] = val;
      else if (num === "307") nu["sodium_100g"] = val / 1000; // mg -> g
      else if (num === "205") nu["carbohydrates_100g"] = val;
      else if (num === "204") nu["fat_100g"] = val;
    });
    return { barcode: code || f.gtinUpc || "", name: f.description || "Unknown product",
      brand: f.brandName || f.brandOwner || "", image: "", category: (f.brandedFoodCategory || "").toLowerCase(),
      ingredientsText: f.ingredients || "", additiveCodes: [], productType: "food",
      source: "USDA FoodData Central", kosher: false, nutriments: nu };
  }
  function lookupUsda(code) {
    var url = "https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + encodeURIComponent(usdaKey()) +
      "&query=" + encodeURIComponent(code) + "&dataType=Branded&pageSize=5";
    return fetchJson(url).then(function (j) {
      var foods = (j && j.foods) || [];
      var norm0 = function (x) { return String(x || "").replace(/^0+/, ""); };
      // FoodData Central search is relevance-ranked and can return unrelated
      // products for an unknown UPC. Never attach the first fuzzy result to a
      // scanned barcode; only an exact GTIN/UPC match is trustworthy.
      var hit = foods.filter(function (f) { return norm0(f.gtinUpc) === norm0(code); })[0];
      return hit ? mapUsdaFood(hit, code) : null;
    }).catch(function () { return null; });
  }
  // Merge a USDA result into an Open Food Facts result, filling only the gaps.
  function mergeSources(off, u) {
    if (!off) return u || null;
    if (!u) return off;
    if (!off.ingredientsText && u.ingredientsText) {
      off.ingredientsText = u.ingredientsText;
      off.source = (off.source && off.source.indexOf("USDA") === -1) ? (off.source + " + USDA") : "USDA FoodData Central";
    }
    if ((!off.nutriments || !Object.keys(off.nutriments).length) && u.nutriments) off.nutriments = u.nutriments;
    if (!off.name || off.name === "Unknown product") off.name = u.name;
    if (!off.brand) off.brand = u.brand;
    return off;
  }
  function lookupBarcode(code) {
    var cached = cachedProduct(code);
    if (cached) return Promise.resolve(cached);
    function tryAt(i) {
      if (i >= OFF_SOURCES.length) return Promise.resolve(null);
      var src = OFF_SOURCES[i];
      var url = src.base + encodeURIComponent(code) + ".json?fields=" + OFF_FIELDS;
      return fetchJson(url).then(function (j) {
        if (j && j.status === 1 && j.product) return mapOff(j.product, code, src);
        return tryAt(i + 1);
      }).catch(function () { return tryAt(i + 1); });
    }
    return tryAt(0).then(function (off) {
      if (offHasIngredients(off)) { cacheProduct(code, off); return off; }
      // Gap-fill from USDA when Open*Facts had nothing useful.
      return lookupUsda(code).then(function (u) {
        var merged = mergeSources(off, u);
        if (merged) cacheProduct(code, merged);
        return merged;
      });
    });
  }
  // ---- openFDA CAERS: count of consumer-reported reaction events mentioning a term ----
  function fetchFdaReports(term) {
    var s = state.settings || {};
    if (s.openfda === false) return;
    var key = norm(term);
    state.fdaReports = state.fdaReports || {};
    if (state.fdaReports[key] !== undefined) return; // already fetched/fetching
    state.fdaReports[key] = null; // mark in-flight
    var q = '"' + String(term).replace(/"/g, "") + '"';
    var url = "https://api.fda.gov/food/event.json?search=" + encodeURIComponent(q) + "&limit=1";
    fetchJson(url).then(function (j) {
      var total = (j && j.meta && j.meta.results && j.meta.results.total) || 0;
      state.fdaReports[key] = total;
      if (state.view === "ingredient") render();
    }).catch(function () { state.fdaReports[key] = 0; });
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
  // Fold in any additives Open Food Facts detected (by E-number) that our own
  // parse of the ingredient text didn't already catch — so flagged additives
  // are found even when the printed ingredient list is incomplete.
  function enrichWithAdditives(text, off, ptype) {
    var codes = (off && off.additiveCodes) || [];
    if (!codes.length) return text;
    var have = {};
    analyze(off, text, ptype).classified.forEach(function (c) {
      if (c.enumber) have[String(c.enumber).toLowerCase().replace(/\s/g, "")] = 1;
      if (c.additive && c.additive.enumber) have[String(c.additive.enumber).toLowerCase()] = 1;
    });
    var add = codes.filter(function (code) { return !have[code]; });
    if (!add.length) return text;
    return text ? (text + ", " + add.join(", ")) : add.join(", ");
  }
  function buildProduct(off, ingredientsText, opts) {
    opts = opts || {};
    var text = ingredientsText || (off && off.ingredientsText) || "";
    var ptype = opts.productType || (off && off.productType) || "food";
    var food = ENG.isFoodType(ptype);
    var r = analyze(off, enrichWithAdditives(text, off, ptype), ptype);
    return {
      id: (off && off.barcode) || ("p" + Date.now()), barcode: (off && off.barcode) || "",
      name: (off && off.name) || opts.name || "Scanned product", brand: (off && off.brand) || "",
      image: (off && off.image) || "", category: (off && off.category) || "", photoKey: opts.photoKey || "", ingredientsText: text,
      source: opts.source || (off && off.source) || (off ? "Open Food Facts" : "Photo / OCR"),
      productType: ptype, isFood: food, kosher: !!(off && off.kosher),
      nutriments: food ? ((off && off.nutriments) || null) : null,
      kcal: food ? computeKcal(off) : null,
      macros: food ? ENG.computeMacros(off) : null,
      score: r.score, badge: r.badge, classified: r.classified, nutrition: r.nutrition,
      flaggedCount: r.flaggedCount, scoreReasons: r.scoreReasons,
      strictVerdict: r.strictVerdict, ingredientConfidence: r.ingredientConfidence,
      logged: "checked", ateAt: 0, portion: 1, ts: Date.now()
    };
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
  var camTrack = null, torchOn = false, scanTick = 0;
  function zbarReady() { return !!(window.zbarWasm && window.zbarWasm.scanImageData); }
  // Tactile feedback: native Capacitor Haptics when available (real taps on the
  // phone), with a navigator.vibrate fallback. Silent no-op if neither exists.
  function haptic(kind) {
    try {
      var C = window.Capacitor, H = C && C.Plugins && C.Plugins.Haptics;
      if (H) {
        if (kind === "success" && H.notification) { H.notification({ type: "SUCCESS" }); return; }
        if (kind === "error" && H.notification) { H.notification({ type: "ERROR" }); return; }
        if (H.impact) { H.impact({ style: kind === "heavy" ? "HEAVY" : kind === "light" ? "LIGHT" : "MEDIUM" }); return; }
      }
    } catch (e) {}
    try {
      if (navigator.vibrate) navigator.vibrate(kind === "success" ? [10, 40, 14] : kind === "error" ? [28, 30, 28] : 9);
    } catch (e) {}
  }
  // Quick white pulse over the camera to confirm a capture, like a shutter flash.
  function scanFlash() {
    var f = document.getElementById("scanFlash");
    if (!f) return;
    f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  }
  // Show/wire the torch button only on devices that actually support it
  // (Android Chrome). iOS WebViews don't expose torch, so the button stays hidden.
  function setupTorch() {
    torchOn = false; camTrack = null;
    var btn = document.getElementById("torchBtn"); if (btn) btn.hidden = true;
    try {
      var tracks = camStream && camStream.getVideoTracks && camStream.getVideoTracks();
      var track = tracks && tracks[0]; if (!track || !track.getCapabilities) return;
      var caps = track.getCapabilities();
      if (caps && caps.torch) { camTrack = track; if (btn) { btn.hidden = false; btn.classList.remove("on"); } }
    } catch (e) {}
  }
  function toggleTorch() {
    if (!camTrack) return;
    torchOn = !torchOn;
    try { camTrack.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) {}
    var btn = document.getElementById("torchBtn"); if (btn) btn.classList.toggle("on", torchOn);
    haptic("light");
  }
  // Decode any barcode ZBar finds in a canvas; return the first decoded text.
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
        if (t) return t;
      }
      return null;
    }).catch(function () { return null; });
  }
  function startScanner() {
    if (state.view !== "scanner") return;
    if (camStream || scanRAF) stopScanner(); // never open a second camera on a double entry
    setStatus("Starting camera…");
    // facingMode:{ideal} is only a soft hint — iOS may hand back the FRONT
    // camera, so try an exact environment lock first and fall back progressively.
    // Request the sharpest feasible back-camera frame (1080p) so dense UPC bars
    // resolve; iOS hands back what it can and we fall back progressively.
    var tries = [
      { video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
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
      var pl = video.play();
      if (pl && pl.catch) pl.catch(function () {});
      setupTorch();
      scanCanvas = document.createElement("canvas");
      scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
      if (!zbarReady()) return startScannerZXing(video);
      setStatus("Point the back camera at the barcode");
      loopScan(video);
    }).catch(function (e) {
      setStatus("");
      var msg = "Camera unavailable. Enter the barcode manually.";
      if (e && e.name === "NotAllowedError") msg = "Camera access is blocked. Allow camera for this site in Settings, then retry — or enter the barcode manually.";
      else if (e && e.name === "NotFoundError") msg = "No camera was found. Enter the barcode manually.";
      alert(msg);
      go("manual");
    });
  }
  // Grab frames and decode with ZBar. We scan a centred horizontal band (where the
  // on-screen guide sits and a UPC is usually held) downscaled to ~960px so each
  // pass is fast; scanBusy serialises passes so we never queue frames faster than
  // ZBar can clear them.
  function loopScan(video) {
    if (state.view !== "scanner" || !camStream) return;
    if (!scanBusy && video.readyState >= 2 && video.videoWidth) {
      scanBusy = true;
      var vw = video.videoWidth, vh = video.videoHeight;
      // Alternate between a tight centred band (fast, where the guide sits) and
      // the full frame every few passes, so an off-centre or angled code is still
      // caught without slowing the common case. Downscale to ~1100px for sharpness.
      scanTick++;
      var fullPass = (scanTick % 4 === 0);
      var cropH = fullPass ? vh : Math.round(vh * 0.55), sy = Math.round((vh - cropH) / 2);
      var scale = Math.min(1, 1100 / vw);
      var dw = Math.max(1, Math.round(vw * scale)), dh = Math.max(1, Math.round(cropH * scale));
      scanCanvas.width = dw; scanCanvas.height = dh;
      scanCtx.drawImage(video, 0, sy, vw, cropH, 0, 0, dw, dh);
      zbarDecodeCanvas(scanCanvas).then(function (code) {
        scanBusy = false;
        if (!code || state.view !== "scanner") return;
        // Ignore noise / partial reads — a real EAN/UPC is 8+ digits.
        if (String(code).replace(/\D/g, "").length < 8) return;
        scanFlash(); haptic("success");
        stopScanner();
        handleBarcode(code);
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
        [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.ITF]);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxingReader = new ZXing.BrowserMultiFormatReader(hints, 120);
      setStatus("Point the back camera at the barcode");
      var onDecode = function (res) { if (res && state.view === "scanner") { stopScanner(); handleBarcode(res.getText()); } };
      return zxingReader.decodeFromStream(camStream, video, onDecode);
    });
  }
  function stopScanner() {
    if (scanRAF) { try { cancelAnimationFrame(scanRAF); } catch (e) {} scanRAF = null; }
    scanBusy = false;
    try { if (zxingReader) zxingReader.reset(); } catch (e) {}
    zxingReader = null;
    if (torchOn && camTrack) { try { camTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {} }
    torchOn = false; camTrack = null;
    if (camStream) { try { camStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} camStream = null; }
    var v = document.getElementById("cam");
    if (v) { try { v.srcObject = null; } catch (e) {} }
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
      var crops = [1, 0.7, 0.5, 0.35], i = 0;
      function next() {
        if (i >= crops.length) return null;
        var url = renderVariant(img, 1600, 0, crops[i++]);
        if (!url) return next();
        return loadImage(url).then(function (vimg) {
          var c = document.createElement("canvas");
          c.width = vimg.naturalWidth || vimg.width;
          c.height = vimg.naturalHeight || vimg.height;
          c.getContext("2d", { willReadFrequently: true }).drawImage(vimg, 0, 0);
          return zbarDecodeCanvas(c);
        }).then(function (code) { return code || next(); }).catch(function () { return next(); });
      }
      return next();
    }).then(function (code) {
      // If ZBar found nothing, give the slower ZXing rotate/zoom pass a chance.
      return code || decodeBarcodeFromImageZXing(dataUrl);
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
          [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.ITF]);
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
        var i = 0;
        function next() {
          if (i >= attempts.length) return null;
          var a = attempts[i++];
          var url = renderVariant(img, 1600, a.rot, a.crop);
          if (!url) return next();
          return loadImage(url).then(function (variantImg) {
            return makeReader().decodeFromImageElement(variantImg).then(function (res) {
              return res ? res.getText() : null;
            }).catch(function () { return null; });
          }).catch(function () { return null; }).then(function (code) {
            return code || next();
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
  // Enough to score automatically (no photo) when we have a printed ingredient
  // list OR Open Food Facts already detected the product's additives.
  function offHasIngredients(off) {
    return !!(off && (off.ingredientsText || (off.additiveCodes && off.additiveCodes.length)));
  }
  function openOff(off) {
    if (!off) return;
    if (!offHasIngredients(off)) { state.pending = { barcode: off.barcode, off: off }; go("addPhoto"); return; }
    showProduct(buildProduct(off));
  }

  function handleBarcode(code) {
    code = String(code || "").replace(/\D/g, "");
    if (!code) return;
    busy(true, "Looking up product…");
    lookupBarcode(code).then(function (off) {
      busy(false, "");
      if (!offHasIngredients(off)) { state.pending = { barcode: code, off: off }; go("addPhoto"); return; }
      showProduct(buildProduct(off));
    }).catch(function () { busy(false, ""); alert("Network error reaching the food database. Check your connection."); });
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
          var id = ctx.getImageData(0, 0, cw, ch), d = id.data, i, lum, min = 255, max = 0;
          for (i = 0; i < d.length; i += 4) {
            lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
            d[i] = d[i + 1] = d[i + 2] = lum;
            if (lum < min) min = lum;
            if (lum > max) max = lum;
          }
          var range = (max - min) || 1;
          for (i = 0; i < d.length; i += 4) {
            var v = (d[i] - min) * 255 / range;
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
  // Editable OCR result so the user can fix misreads before scoring.
  function ocrReviewBlock(text, conf, low) {
    return '<div class="panel glass ocr-review"><div class="panel-h">Check the scanned text' +
      '<span class="cnt">' + Math.round(conf || 0) + '% read</span></div>' +
      (low ? '<div class="ocr-warn">Hard to read — fix any wrong or missing words below, or retake a closer, well-lit photo of just the ingredients.</div>'
           : '<div class="ocr-tip">Tap to fix anything the scan got wrong, then analyze.</div>') +
      '<textarea id="ocrText" class="text-input ocr-text" rows="7" placeholder="Ingredients…">' + esc(text || "") + '</textarea>' +
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
      return Tesseract.recognize(dataUrl, "eng", hasLocalTess() ? opts : undefined);
    }).then(function (r) { return { text: (r.data && r.data.text) || "", confidence: (r.data && r.data.confidence) || 0 }; });
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
  function researchIngredient(term) {
    var bad = /^(and|or|contains|less than|of|the|other|color added|natural|artificial)$/i;
    var clean = String(term || "").trim();
    if (!clean || clean.length < 3 || bad.test(clean)) return Promise.resolve(null);
    var t = encodeURIComponent(clean.replace(/\s+/g, "_"));
    return fetchJson(WIKI + t)
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
  var ICONS = {
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M5 21V10"/><path d="M12 21V4"/><path d="M19 21v-7"/><path d="M3 21h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    keypad: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/>',
    tag: '<path d="M3 12l9-9 9 9-9 9z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M5 3v4M9 3v4M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-1 2.5-4-1-5-2.5-5zM17 16v5"/>'
  };
  function icon(n, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || "") + '</svg>'; }

  function brandLogo(px) {
    return '<svg class="brandlogo" width="' + px + '" height="' + px + '" viewBox="0 0 48 48" fill="none">' +
      '<defs><linearGradient id="ncg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">' +
      '<stop stop-color="#4f8bff"/><stop offset="1" stop-color="#8a5bff"/></linearGradient></defs>' +
      '<rect width="48" height="48" rx="13" fill="url(#ncg)"/>' +
      '<circle cx="24" cy="24" r="15" stroke="#fff" stroke-opacity="0.28" stroke-width="2.2"/>' +
      '<path d="M15.5 24.5l5.5 6 12-14" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var ILLUS = {
    scan: '<rect x="14" y="22" width="72" height="56" rx="10"/><path d="M30 38v24M40 38v24M50 38v24M60 38v24M70 38v24"/>',
    chart: '<path d="M20 80V52M40 80V30M60 80V44M80 80V22"/><path d="M14 82h72"/>',
    box: '<path d="M50 16l30 16v36L50 84 20 68V32z"/><path d="M20 32l30 16 30-16M50 48v36"/>',
    heart: '<path d="M50 80S22 62 22 40a15 15 0 0 1 28-6 15 15 0 0 1 28 6c0 22-28 40-28 40z"/>'
  };
  function illus(name) { return '<div class="illuswrap"><svg class="illus" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' + (ILLUS[name] || "") + '</svg></div>'; }

  var lastAnimatedId = null;
  var lastRenderedView = null;
  // One-line plain-language verdict so the result is clear at a glance.
  function verdictLine(p) {
    var m = {
      exc: "A clean, well-rated product.",
      good: "A solid choice — little to worry about.",
      mid: "Mixed — a few ingredients worth watching.",
      bad: "Best avoided, or kept occasional."
    };
    var txt = m[p.badge.cls];
    return txt ? '<div class="verdict">' + txt + '</div>' : "";
  }
  function strictBlock(p) {
    var v = p.strictVerdict || ENG.strictVerdict(p.classified || []);
    var conf = p.ingredientConfidence || ENG.ingredientConfidence(p.classified || []);
    var blockers = (v.blockers || []).slice(0, 3).map(function (b) {
      return '<span class="strict-chip">' + esc(titleCase(b.raw || b.name || "Unknown ingredient")) + '</span>';
    }).join("");
    return '<div class="strict-card ' + v.cls + '">' +
      '<div class="strict-top"><div><div class="strict-kicker">Strict scan standard</div>' +
      '<div class="strict-label">' + esc(v.label) + '</div></div>' +
      '<div class="confidence ' + conf.level + '">' + esc(conf.label) + '</div></div>' +
      '<div class="strict-summary">' + esc(v.summary) + ' ' + esc(conf.summary) + '</div>' +
      (blockers ? '<div class="strict-blockers">' + blockers + '</div>' : "") +
      '</div>';
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
      '<button class="ghost-btn" data-act="encyclopedia">📚 Ingredient encyclopedia</button>' +
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
    return '<div class="screen scanner">' +
      '<video id="cam" playsinline autoplay muted></video>' +
      '<div class="scan-frame"><span class="scan-corner tl"></span><span class="scan-corner tr"></span>' +
        '<span class="scan-corner bl"></span><span class="scan-corner br"></span>' +
        '<div class="scan-laser"></div></div>' +
      '<div class="scan-flash" id="scanFlash"></div>' +
      '<button class="torch-btn" id="torchBtn" data-act="torch" aria-label="Toggle flashlight" hidden>🔦</button>' +
      '<div class="scan-status" id="status">' + esc(state.statusMsg) + '</div>' +
      '<div class="scan-hint">Hold steady — the barcode scans automatically. Trouble? Snap a photo below for a sharper read.</div>' +
      '<div class="scan-actions">' +
        '<label class="big-btn photo-cap"><input id="bcphoto" type="file" accept="image/*" capture="environment" hidden> 📷 Take a photo of the barcode</label>' +
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
      var typeTag = tl ? '<span class="srch-type">' + tl[0] + ' ' + esc(tl[1]) + '</span>' : "";
      var sub = esc(o.brand || (o.ingredientsText ? "" : "No ingredient data"));
      return '<div class="row card tappable" data-search-idx="' + i + '">' +
        (o.image ? '<img class="srch-img" src="' + esc(o.image) + '" alt="">' : '<div class="srch-img ph">🥫</div>') +
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
    var fav = isFav(p.id);
    return '<div class="screen result">' + backBar("") +
      strictBlock(p) +
      '<div class="hero glass" style="--c:' + c + '">' +
        '<button class="fav-btn' + (fav ? " on" : "") + '" data-fav="1" aria-label="Favorite">' + (fav ? "★" : "☆") + '</button>' +
        '<div class="product-head">' +
          (p.image ? '<img class="phead-img" src="' + esc(p.image) + '" alt="">' : '<div class="phead-img ph">🥫</div>') +
          '<div class="phead-txt"><div class="phead-name">' + esc(p.name) + '</div>' +
          '<div class="phead-brand">' + esc(p.brand || "") + '</div>' +
          '<div class="phead-src">via ' + esc(p.source) + '</div>' +
          prodTypeBadge(p.productType) + (p.kosher ? kosherBadge() : "") + '</div>' +
        '</div>' +
        '<div class="score-wrap">' +
          '<div class="score-glow"></div>' +
          '<div class="score-ring" style="--c:' + c + ';--p:' + p.score + '">' +
          '<div class="score-num">' + p.score + '</div><div class="score-of">out of 100</div></div>' +
          '<div class="badge ' + p.badge.cls + '">' + esc(p.badge.label) + '</div>' +
          verdictLine(p) +
          '<button class="why-btn" data-act="toggleScore">' + (state.scoreOpen ? "Hide score details" : "How is this scored?") + '</button>' +
        '</div>' +
      '</div>' +
      whyBlock(p) +
      // Yuka-style: the verdict detail (what's bad / what's good) comes FIRST,
      // right under the score — that's the core of the result screen.
      // Bobby-Approved-better: surface the actual flagged INGREDIENT names as
      // tappable red-flag rows at the top of Negatives, then the nutrition
      // negatives (minus the vague aggregate "Additives" row).
      (function () {
        var negHtml = concernRows(p) +
          (n.negatives || []).filter(function (r) { return r.label !== "Additives"; }).map(brkRow).join("");
        return negHtml ? '<div class="panel glass"><div class="panel-h neg"><span>⚠</span> Negatives</div>' + negHtml + '</div>' : "";
      })() +
      (n.positives && n.positives.length ? '<div class="panel glass"><div class="panel-h pos"><span>✓</span> Positives</div>' + n.positives.map(brkRow).join("") + '</div>' : "") +
      (alerts.length ? ('<div class="alerts">' + alerts.map(function (a) {
        return '<div class="alert">⚠️ <b>' + esc(cap(a.key)) + '</b>: contains ' + esc(a.hits.join(", ")) + '</div>';
      }).join("") + '</div>') : "") +
      (p.isFood ?
        '<div class="logseg">' +
          '<button class="seg-btn' + (p.logged === "eaten" ? " on ate" : "") + '" data-log="eaten">' + icon("fork") + ' I ate this</button>' +
          '<button class="seg-btn' + (p.logged !== "eaten" ? " on" : "") + '" data-log="checked">' + icon("search") + ' Just checking</button>' +
        '</div>' : "") +
      (p.isFood ? portionBlock(p) : "") +
      '<button class="ghost-btn cmp-btn" data-act="comparePick">⇄ Compare with another product</button>' +
      altsBlock(p) +
      nutritionTable(p) +
      '<div class="panel glass"><div class="panel-h">Ingredients <span class="cnt">' + p.classified.length + '</span></div>' +
      '<div class="legend">Tap any ingredient for details</div>' +
      (p.classified.length ? groupsHtml : '<div class="empty small">No ingredient list available for this product.</div>') +
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
    if (a.loading) return '<div class="panel glass"><div class="panel-h pos"><span>↑</span> Better choices</div>' +
      '<div class="lrow"><div class="spinner small"></div><div class="row-main"><div class="row-sub">Finding healthier options in this category…</div></div></div></div>';
    if (!a.list || !a.list.length) return "";
    var rows = a.list.map(function (prod, i) {
      return '<div class="lrow tappable" data-alt="' + i + '">' +
        (prod.image ? '<img class="srch-img" src="' + esc(prod.image) + '" alt="">' : '<div class="srch-img ph">🥫</div>') +
        '<div class="row-main"><div class="row-title">' + esc(prod.name) + '</div><div class="row-sub">' + esc(prod.brand || "") + '</div></div>' +
        '<div class="mini-score" style="background:' + scoreColor(prod.badge.cls) + '">' + prod.score + '</div></div>';
    }).join("");
    return '<div class="panel glass"><div class="panel-h pos"><span>↑</span> Better choices in this category</div>' + rows + '</div>';
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
        (o.image ? '<img class="srch-img" src="' + esc(o.image) + '" alt="">' : '<div class="srch-img ph">🥫</div>') +
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
      (p.image ? '<img class="cmp-img" src="' + esc(p.image) + '" alt="">' : '<div class="cmp-img ph">🥫</div>') +
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
        compareCol(a, d.better === "a" ? "♔" : "") +
        '<div class="cmp-vs-badge">VS</div>' +
        compareCol(b, d.better === "b" ? "♔" : "") +
      '</div>' +
      '<div class="panel glass"><div class="panel-h">Verdict</div>' +
        '<div class="cmp-verdict">' + verdict + '</div>' +
        '<div class="lrow"><div class="row-main"><div class="row-title">Flagged additives</div></div>' +
        '<div class="cmp-vals"><span class="' + (d.additiveCount.a < d.additiveCount.b ? "cmp-good" : "") + '">' + d.additiveCount.a + '</span>' +
        '<span class="cmp-vs">vs</span><span class="' + (d.additiveCount.b < d.additiveCount.a ? "cmp-good" : "") + '">' + d.additiveCount.b + '</span></div></div>' +
      '</div>' +
      '<div class="panel glass"><div class="panel-h neg"><span>⚠</span> Negatives</div>' +
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
    (p.classified || []).forEach(function (c, i) { if (order[c.status] != null) flagged.push({ c: c, i: i }); });
    flagged.sort(function (a, b) { return order[a.c.status] - order[b.c.status]; });
    return flagged.map(function (f) {
      var sev = f.c.status === "limit" ? "mid" : "bad";
      return '<div class="lrow brk tappable" data-ingidx="' + f.i + '">' + dot(statusColor(f.c.status)) +
        '<div class="row-main"><div class="row-title">' + esc(titleCase(f.c.raw)) + '</div>' +
        '<div class="row-sub">' + esc(f.c.reason || STATUS_LABEL[f.c.status]) + '</div></div>' +
        '<div class="brk-val ' + sev + '">' + STATUS_LABEL[f.c.status] + ' ›</div></div>';
    }).join("");
  }
  function ingredientRow(c, idx) {
    return '<div class="lrow ing-row tappable" data-ingidx="' + idx + '">' + dot(statusColor(c.status)) +
      '<div class="row-main"><div class="row-title">' + esc(c.raw) + '</div>' +
      '<div class="row-sub">' + esc(c.reason) + '</div></div>' +
      '<div class="status-tag ' + c.status + '">' + STATUS_LABEL[c.status] + ' ›</div></div>';
  }

  // openFDA consumer-report callout for an ingredient (lazy-loaded, optional).
  function fdaNote(term) {
    var s = state.settings || {};
    if (s.openfda === false) return "";
    var v = state.fdaReports && state.fdaReports[norm(term)];
    if (v == null) return ""; // not loaded yet (or in-flight) — stay quiet
    if (v <= 0) return "";
    return '<div class="fda-note"><span class="fn-num">' + (v > 999 ? "999+" : v) + '</span>' +
      '<span class="fn-lbl">consumer-reported reactions mention this in the FDA adverse-event database. ' +
      'Reports aren’t medically verified — context, not proof.</span></div>';
  }
  function viewIngredient() {
    var d = state.ingDetail; if (!d) return viewResult();
    fetchFdaReports(d.title);
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
      (d.banned ? '<div class="banned-note">🌍 <b>Banned / restricted:</b> ' + esc(d.banned) + '</div>' : "") +
      fdaNote(d.title) +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (state.ingTab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join("") + '</div>' +
      '<div class="tab-body">' + body + '</div>' +
      '<button class="ghost-btn research-btn" data-research="' + esc(d.title) + '">🔎 Research this ingredient online</button>' +
      researchBlock(d) +
      '<div class="disclaimer">Educational summary, not medical advice.</div></div>';
  }

  function viewHistory() {
    var fav = state.historyFilter === "fav";
    var list = fav ? state.favorites : state.history;
    var chips = '<div class="chips">' +
      '<button class="chip' + (!fav ? " on" : "") + '" data-hist="all">Recent</button>' +
      '<button class="chip' + (fav ? " on" : "") + '" data-hist="fav">★ Favorites</button></div>';
    var body = list.length ? list.map(historyRow).join("") +
      (!fav ? '<button class="ghost-btn danger" data-act="clearHist">Clear history</button>' : "") :
      '<div class="empty">' + illus("box") + (fav ? "No favorites yet.<br>Tap ☆ on a product to save it." : "Nothing scanned yet.") + '</div>';
    return '<div class="screen"><header class="hd"><div class="logo">History</div></header>' + chips + body + '</div>';
  }

  function viewInsights() {
    var eatenMode = state.insightsFilter === "eaten";
    var eatenCount = state.history.filter(function (p) { return p.logged === "eaten"; }).length;
    var source = eatenMode ? state.history.filter(function (p) { return p.logged === "eaten"; }) : state.history;
    var chips = '<div class="chips">' +
      '<button class="chip' + (!eatenMode ? " on" : "") + '" data-ins="all">All scans</button>' +
      '<button class="chip' + (eatenMode ? " on" : "") + '" data-ins="eaten">🍽 Eaten (' + eatenCount + ')</button></div>';
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
    }).join("") : '<div class="lrow"><div class="row-main"><div class="row-sub">No flagged additives yet 🎉</div></div></div>';
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
      '<div class="sub">Scan any food and instantly see what\'s really inside — every additive rated, explained and researched.</div></div>' +
      '<div class="ob-feats">' +
        '<div class="ob-feat">📷 <span>Scan or search any product</span></div>' +
        '<div class="ob-feat">🚦 <span>0–100 score with a clear verdict</span></div>' +
        '<div class="ob-feat">🧪 <span>Every ingredient explained, with studies</span></div>' +
        '<div class="ob-feat">↑ <span>Better choices when a product scores low</span></div>' +
      '</div>' +
      '<div class="section-title">Any diet needs? (optional)</div>' + toggles +
      '<button class="big-btn" data-act="finishOnboard">Start scanning →</button></div>';
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
      '<div class="lrow"><div class="row-main"><div class="row-title">Strict scan standard</div>' +
        '<div class="row-sub">Always on. Any avoid, caution, or limit ingredient fails approval; unknown ingredients require review.</div></div>' +
        '<div class="status-tag good">On</div></div>' +
      '<div class="lrow"><div class="row-main"><div class="row-title">Theme</div></div><div class="chips sm">' + themeSel + '</div></div>' +
      '<div class="lrow tappable" data-act="exportData"><div class="row-main"><div class="row-title">Export my data</div><div class="row-sub">Download a backup file</div></div><div class="chev">›</div></div>' +
      '<label class="lrow tappable"><div class="row-main"><div class="row-title">Import data</div><div class="row-sub">Restore from a backup</div></div><input id="importfile" type="file" accept="application/json" hidden><div class="chev">›</div></label></div>';

    var dataSrc = '<div class="section-title">Data sources</div><div class="panel glass">' +
      '<div class="lrow"><div class="row-main"><div class="row-title">USDA FoodData Central</div>' +
        '<div class="row-sub">Adds a public-domain UPC + ingredient source to fill gaps. Paste a free data.gov API key for higher limits — leave blank to use the shared demo key.</div></div></div>' +
      '<div class="lrow"><input id="usdaKey" class="text-input" style="margin:0" placeholder="USDA API key (optional)" value="' + esc(s.usdaKey || "") + '">' +
        '<button class="search-go" data-act="saveUsdaKey" style="margin-left:8px" aria-label="Save key">Save</button></div>' +
      '<div class="lrow"><div class="row-main"><div class="row-title">openFDA reports</div>' +
        '<div class="row-sub">Shows consumer-reported reaction counts on ingredient pages. Free, no key.</div></div>' +
        '<div class="switch ' + (s.openfda !== false ? "on" : "") + '" data-act="toggleOpenfda"><span></span></div></div></div>';

    var allergens = '<div class="section-title">Diet & allergens</div>' + PROFILE_OPTS.map(function (o) {
      var on = !!state.profile[o[0]];
      return '<div class="row card toggle-row tappable" data-toggle="' + o[0] + '"><div class="row-title">' + o[1] + '</div>' +
        '<div class="switch ' + (on ? "on" : "") + '"><span></span></div></div>';
    }).join("");

    return '<div class="screen">' +
      '<header class="hd"><div class="logo">My profile</div><div class="sub">Health goal, diet & settings</div></header>' +
      '<div class="section-title">Health & calorie goal</div>' + health +
      settings + dataSrc + allergens +
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
    if (t.dataset.log != null) { haptic("light"); setLogged(t.dataset.log); return; }
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
    if (act === "torch") { toggleTorch(); return; }
    if (act === "scan") { haptic("light"); go("scanner"); }
    else if (act === "home") go("home");
    else if (act === "addPhoto") go("addPhoto");
    else if (act === "analyzeOcr") {
      var ta = document.getElementById("ocrText");
      var txt = ta ? ta.value.trim() : "";
      if (txt.replace(/\s/g, "").length < 6) { alert("Please enter or fix the ingredients text first."); return; }
      var ctx = state.ocrPending || {};
      var product = buildProduct(ctx.off || null, txt, { photoKey: ctx.photoKey, source: "Photo / OCR", name: ctx.name || "Scanned product" });
      if (ctx.barcode) product.barcode = ctx.barcode;
      state.ocrPending = null; state.pending = null; showProduct(product);
    }
    else if (act === "manual") go("manual");
    else if (act === "comparePick") go("comparePick");
    else if (act === "back") go(state.view === "ingredient" ? state.ingFrom : (state.view === "compare" ? "comparePick" : (state.view === "comparePick" ? "result" : "home")));
    else if (act === "manualGo") { var el = document.getElementById("bc"); if (el && el.value.trim()) handleBarcode(el.value.trim()); }
    else if (act === "searchGo") { var qe = document.getElementById("q"); if (qe && qe.value.trim()) runSearch(qe.value.trim()); }
    else if (act === "toggleScore") { state.scoreOpen = !state.scoreOpen; render(); }
    else if (act === "encyclopedia") { state.encQuery = ""; go("encyclopedia"); }
    else if (act === "encGo") { var ec = document.getElementById("encq"); state.encQuery = ec ? ec.value.trim() : ""; render(); }
    else if (act === "editHealth") { state.editHealth = true; render(); }
    else if (act === "exportData") { exportData(); }
    else if (act === "saveUsdaKey") {
      var uk = document.getElementById("usdaKey");
      state.settings.usdaKey = uk ? uk.value.trim() : "";
      saveSettings(); haptic("success"); alert("USDA key saved.");
    }
    else if (act === "toggleOpenfda") {
      state.settings.openfda = state.settings.openfda === false ? true : false;
      saveSettings(); render();
    }
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
      busy(true, "Reading barcode…");
      fileToDataUrl(bfile).then(function (durl) {
        return decodeBarcodeFromImage(durl);
      }).then(function (code) {
        busy(false, "");
        if (code) { stopScanner(); handleBarcode(code); }
        else alert("Couldn't read a barcode in that photo. Fill the frame with the barcode, hold steady so it's sharp, and try again — or enter the code manually.");
      }).catch(function () {
        busy(false, "");
        alert("Couldn't read a barcode in that photo. Try again or enter the code manually.");
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
            name: off && off.name ? off.name : "Scanned product"
          };
          var text = (ocr.text || "").trim();
          var low = ocr.confidence < 60 || text.replace(/\s/g, "").length < 12;
          if (prev) prev.innerHTML = ocrReviewBlock(text, ocr.confidence, low);
          var ta = document.getElementById("ocrText");
          if (ta) { try { ta.focus(); } catch (e) {} }
        });
      }).catch(function () { busy(false, ""); alert("Couldn't process that image. Try again."); });
    }
  }

  function onKey(e) {
    if (e.key !== "Enter" || !e.target) return;
    if (e.target.id === "q" && e.target.value.trim()) { e.preventDefault(); runSearch(e.target.value.trim()); }
    else if (e.target.id === "bc" && e.target.value.trim()) { e.preventDefault(); handleBarcode(e.target.value.trim()); }
    else if (e.target.id === "encq") { e.preventDefault(); state.encQuery = e.target.value.trim(); render(); }
  }
  // Keep the app right-side-up. Info.plist already locks the native shell to
  // portrait; this is a best-effort web-layer lock for any browser context.
  function lockPortrait() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        var pr = screen.orientation.lock("portrait");
        if (pr && pr.catch) pr.catch(function () {});
      }
    } catch (e) {}
  }
  function init() {
    app = document.getElementById("app");
    loadLocal();
    applyTheme();
    lockPortrait();
    if (!state.onboarded) state.view = "onboard";
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKey);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
