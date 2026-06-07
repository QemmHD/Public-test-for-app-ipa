/*
 * NutriCheck pure analysis engine.
 *
 * All scoring / classification logic lives here as pure functions so it can be
 * unit-tested in Node (no DOM) and reused by the UI in the browser.
 *
 * UMD-ish: in the browser it self-initialises from window.CB_DATA (+ optional
 * window.CB_DATA_COSMETICS) and publishes window.CB_ENGINE. In Node it exports
 * { buildEngine } so tests can inject data explicitly.
 *
 * Key correctness change vs. the old inline logic: ingredient names are matched
 * on whole-word / whole-phrase token boundaries instead of raw substring, which
 * removes false positives like "salt" matching inside "unsalted".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CB_ENGINE_FACTORY = api;
    // Publish the singleton facade; app.js calls CB_ENGINE.init({food,cosmetics}).
    root.CB_ENGINE = api.makeSingleton();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ----------------------------------------------------------- text utils */
  function norm(s) {
    return String(s || "").toLowerCase()
      .replace(/\([^)]*\)/g, " ").replace(/\d+(\.\d+)?\s*%/g, " ")
      .replace(/[^a-z0-9&'\- ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function titleCase(s) { return String(s || "").replace(/\b\w/g, function (m) { return m.toUpperCase(); }); }
  function num(v) { return typeof v === "number" && !isNaN(v) ? v : (v != null && v !== "" && !isNaN(+v) ? +v : null); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Split a normalized string into comparable tokens (letters/digits only).
  function tokenize(n) {
    return String(n || "").split(/[^a-z0-9]+/).filter(Boolean);
  }
  // Food-family product types reuse the food nutrition/scoring path.
  function isFoodType(t) { return !t || t === "food" || t === "petfood"; }
  // True when the sequence `phrase` appears as consecutive whole tokens in `toks`.
  function phraseInTokens(toks, phrase) {
    var pl = phrase.length;
    if (!pl || pl > toks.length) return false;
    for (var i = 0; i + pl <= toks.length; i++) {
      var ok = true;
      for (var j = 0; j < pl; j++) { if (toks[i + j] !== phrase[j]) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }

  /* ----------------------------------------------------- ingredient parsing */
  // High-confidence markers for text that is NOT an ingredient: nutrition-facts
  // panel rows, net-weight / contact / storage lines, marketing claims and URLs.
  // These phrases never appear inside a real ingredient name, so dropping a
  // fragment that contains one (or exactly equals a nutrition-panel word) keeps
  // OCR noise out of the result without discarding genuine ingredients such as
  // salt, water, sugar, iron or sodium benzoate.
  var NON_INGREDIENT_RE = /\b(daily value|per serving|per container|serving size|servings|amount per|nutrition facts|calories|total fat|saturated fat|trans fat|polyunsaturated fat|monounsaturated fat|total carbohydrate|dietary fiber|total sugars|added sugars|cholesterol|distributed by|manufactured|net wt|net weight|fl oz|best before|best by|use by|sell by|exp date|questions|comments|satisfaction|refrigerat|produced in|made in|product of|packaged|facility|contains less than|may contain|www|http)\b/;
  // A standalone number followed by a measurement unit (e.g. "200mg", "2 g",
  // "120 kcal") is a nutrition value, not an ingredient.
  var NUTRITION_VALUE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|g|kg|kcal|iu|ml|oz)\b/;
  function isNonIngredient(n) {
    return NON_INGREDIENT_RE.test(n) || NUTRITION_VALUE_RE.test(n);
  }
  function parseIngredients(text) {
    if (!text) return [];
    var cleaned = text
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\S+@\S+\.\S+/g, " ")
      .replace(/\b[\w.-]+\.(?:com|net|org|co|us)\b/gi, " ")
      .replace(/ingredients?:?/i, " ")
      .replace(/contains( 2% or less of| less than 2% of)?:?/ig, ",")
      // Expand parenthetical / bracketed sub-ingredients into their own items so
      // hidden flags inside a parent (e.g. "enriched flour (niacin, reduced iron)",
      // "color (red 40)") are detected instead of being thrown away.
      .replace(/[\[\]{}()]/g, ",").replace(/\band\b/gi, ",");
    var parts = cleaned.split(/[,;.]+/), out = [];
    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].replace(/\([^)]*\)/g, "").trim();
      if (!raw) continue;
      var n = norm(raw);
      if (!n || n.length < 2) continue;
      if (isNonIngredient(n)) continue;
      if (out.length && out[out.length - 1].norm === n) continue;
      out.push({ raw: raw.replace(/\s+/g, " ").trim(), norm: n });
      if (out.length > 80) break;
    }
    return out;
  }

  /* ------------------------------------------------------------- engine */
  function buildEngine(DATA, COSMETICS) {
    // Merge the cosmetic/household knowledge base (if provided) into the data set.
    var foodAdditives = DATA.additives || [];
    var cosmeticAdditives = (COSMETICS && COSMETICS.additives) || [];
    var allAdditives = foodAdditives.concat(cosmeticAdditives);

    // Merge group explanations + banned map from both sources.
    var groups = {};
    Object.keys(DATA.groups || {}).forEach(function (k) { groups[k] = DATA.groups[k]; });
    if (COSMETICS && COSMETICS.groups) Object.keys(COSMETICS.groups).forEach(function (k) { groups[k] = COSMETICS.groups[k]; });
    var bannedMap = {};
    Object.keys(DATA.bannedMap || {}).forEach(function (k) { bannedMap[k] = DATA.bannedMap[k]; });
    if (COSMETICS && COSMETICS.bannedMap) Object.keys(COSMETICS.bannedMap).forEach(function (k) { bannedMap[k] = COSMETICS.bannedMap[k]; });

    // Pre-tokenize every additive name once -> [{toks, additive, scope}] index.
    function buildAdditiveIndex(list, scope) {
      var idx = [];
      list.forEach(function (a) {
        (a.names || []).forEach(function (nm) {
          var toks = tokenize(norm(nm));
          if (toks.length) idx.push({ toks: toks, additive: a, scope: scope });
        });
      });
      // Longer phrases first so the most specific name wins.
      idx.sort(function (x, y) { return y.toks.length - x.toks.length; });
      return idx;
    }
    var foodIndex = buildAdditiveIndex(foodAdditives, "food");
    var cosmeticIndex = buildAdditiveIndex(cosmeticAdditives, "cosmetic");

    // Pre-tokenize the keyword lists.
    function tokList(list) {
      return (list || []).map(function (s) { return { raw: s, toks: tokenize(norm(s)) }; })
        .filter(function (o) { return o.toks.length; });
    }
    var seedOilsT = tokList(DATA.seedOils);
    var addedSugarsT = tokList(DATA.addedSugars);
    var sweetenersT = tokList(DATA.artificialSweeteners);
    var vagueT = tokList(DATA.vagueTerms);
    var fortifiedT = tokList(DATA.fortifiedVitamins);
    var cleanT = tokList(DATA.cleanIngredients);
    // Cosmetic concern keyword buckets (optional).
    var cosmeticListsT = {};
    if (COSMETICS && COSMETICS.concernLists) {
      Object.keys(COSMETICS.concernLists).forEach(function (k) { cosmeticListsT[k] = tokList(COSMETICS.concernLists[k]); });
    }

    // Word-boundary lookups.
    function findInIndex(idx, toks) {
      for (var i = 0; i < idx.length; i++) if (phraseInTokens(toks, idx[i].toks)) return idx[i].additive;
      return null;
    }
    function listHitTok(listT, toks) {
      for (var i = 0; i < listT.length; i++) if (phraseInTokens(toks, listT[i].toks)) return listT[i].raw;
      return null;
    }

    function findENumberByName(toks) {
      var arr = DATA.eNumbers || [];
      for (var i = 0; i < arr.length; i++) {
        var nmToks = tokenize(norm(arr[i][1]));
        // Only match reasonably specific names (avoid 1-letter noise).
        if (nmToks.length && (nmToks.length > 1 || (nmToks[0] && nmToks[0].length >= 4)) && phraseInTokens(toks, nmToks))
          return { code: arr[i][0], name: arr[i][1], risk: arr[i][2] };
      }
      return null;
    }
    function findENumberByCode(raw) {
      var m = String(raw || "").match(/\be ?(\d{3,4}[a-z]?)\b/);
      if (!m) return null;
      var code = "e" + m[1];
      var arr = DATA.eNumbers || [];
      for (var i = 0; i < arr.length; i++)
        if (arr[i][0].toLowerCase() === code) return { code: arr[i][0], name: arr[i][1], risk: arr[i][2] };
      return { code: "E" + m[1].toUpperCase(), name: "Additive E" + m[1].toUpperCase(), risk: "caution" };
    }
    function egroup(risk) { return "e" + cap(risk); }

    // Classify a single ingredient. productType: "food" (default) | "beauty" | "household" | "petfood".
    function classify(n, raw, productType) {
      var toks = tokenize(n);
      var isFood = isFoodType(productType);

      if (!isFood) {
        // Non-food (cosmetic / household): cosmetic DB first.
        var ca = findInIndex(cosmeticIndex, toks);
        if (ca) return { status: ca.risk, additive: ca, name: ca.names[0], reason: ca.category };
        // Cosmetic concern keyword buckets.
        var ck = Object.keys(cosmeticListsT);
        for (var ci = 0; ci < ck.length; ci++) {
          var hit = listHitTok(cosmeticListsT[ck[ci]], toks);
          if (hit) {
            var meta = (COSMETICS.concernMeta && COSMETICS.concernMeta[ck[ci]]) || { status: "caution", reason: cap(ck[ci]) };
            return { status: meta.status, group: ck[ci], reason: meta.reason };
          }
        }
        if (listHitTok(vagueT, toks)) return { status: "limit", group: "vague", reason: "Undisclosed ingredient" };
        if (listHitTok(cleanT, toks)) return { status: "good", group: "clean", reason: "Recognized ingredient" };
        return { status: "unknown", group: "unknown", reason: "Not catalogued yet" };
      }

      // Food path (Bobby-Approved-style strictness: industrial seed oils,
      // undisclosed flavors and artificial sweeteners are flagged hard).
      var a = findInIndex(foodIndex, toks);
      if (a) return { status: a.risk, additive: a, name: a.names[0], reason: a.category };
      if (listHitTok(sweetenersT, toks)) return { status: "avoid", group: "sweetener", reason: "Artificial sweetener" };
      if (listHitTok(seedOilsT, toks)) return { status: "avoid", group: "seedOil", reason: "Industrial seed oil" };
      var vh = listHitTok(vagueT, toks);
      if (vh) {
        // Undisclosed flavorings are flagged hardest; vague spice/seasoning blends are a caution.
        var isFlavor = /flavo/.test(vh);
        return { status: isFlavor ? "avoid" : "caution", group: "vague",
          reason: isFlavor ? "Undisclosed flavoring" : "Undisclosed ingredient" };
      }
      var en = findENumberByName(toks) || findENumberByCode(raw);
      if (en) return { status: en.risk, group: egroup(en.risk), name: en.name, enumber: en.code, reason: "Food additive" + (en.code ? " · " + en.code : "") };
      if (listHitTok(fortifiedT, toks)) return { status: "ok", group: "fortified", reason: "Added vitamin/mineral" };
      if (listHitTok(addedSugarsT, toks)) return { status: "limit", group: "addedSugar", reason: "Added sugar" };
      if (listHitTok(cleanT, toks)) return { status: "good", group: "clean", reason: "Whole-food ingredient" };
      if (/\be ?\d{3,4}[a-z]?\b/.test(String(raw || ""))) return { status: "caution", group: "eCaution", reason: "Unrecognized additive" };
      return { status: "unknown", group: "unknown", reason: "Not catalogued yet" };
    }

    function ingredientDetail(item) {
      if (item.additive) {
        var a = item.additive;
        return { title: titleCase(a.names[0]), category: a.category, enumber: a.enumber || "", status: a.risk,
          summary: a.summary, whatIs: a.whatIs, whyFlagged: a.whyFlagged, effects: a.healthRisk,
          banned: (bannedMap && bannedMap[a.id]) || "", studies: a.studies || [] };
      }
      var g = groups[item.group] || groups.unknown;
      return { title: titleCase(item.name || item.raw), category: g.category, enumber: item.enumber || "", status: item.status || g.status,
        summary: g.summary, whatIs: g.whatIs, whyFlagged: g.whyFlagged, effects: g.effects, banned: "", studies: g.studies || [] };
    }

    /* ----------------------------------------------------- nutrition (food) */
    function evalNutrition(off) {
      var out = { hasData: false, negatives: [], positives: [] };
      if (!off || !off.nutriments) return out;
      var nu = off.nutriments;
      function row(label, val, unit, sev, note) {
        var v = (val == null) ? "—" : (Math.round(val * 10) / 10 + unit);
        (sev === "good" ? out.positives : out.negatives).push({ label: label, value: v, sev: sev, note: note });
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
      if (fib != null && fib >= 3) row("Fiber", fib, "g", "good", fib >= 6 ? "Excellent source" : "Good source");
      var pro = num(nu["proteins_100g"]);
      if (pro != null && pro >= 8) row("Protein", pro, "g", "good", "Good source");
      out.hasData = (out.negatives.length + out.positives.length) > 0;
      return out;
    }

    function bandFor(score, hasAvoid) {
      if (hasAvoid) return { label: "Bad", cls: "bad" };
      if (score >= 80) return { label: "Excellent", cls: "exc" };
      if (score >= 60) return { label: "Good", cls: "good" };
      if (score >= 40) return { label: "Poor", cls: "mid" };
      return { label: "Bad", cls: "bad" };
    }

    function analyze(off, ingredientsText, productType) {
      var isFood = isFoodType(productType);
      var items = parseIngredients(ingredientsText);
      var classified = items.map(function (it) {
        var c = classify(it.norm, (it.raw || "").toLowerCase(), productType);
        return { raw: it.raw, norm: it.norm, status: c.status, reason: c.reason,
          additive: c.additive || null, group: c.group || null, name: c.name || it.raw, enumber: c.enumber || "" };
      });

      var avoidN = 0, cautN = 0, limitN = 0;
      classified.forEach(function (c) {
        if (c.status === "avoid") avoidN++; else if (c.status === "caution") cautN++; else if (c.status === "limit") limitN++;
      });
      var score = 100 - avoidN * 22 - cautN * 10 - limitN * 4;
      var reasons = [];
      if (avoidN) reasons.push({ d: -22 * avoidN, t: avoidN + " ingredient" + (avoidN > 1 ? "s" : "") + " to avoid" });
      if (cautN) reasons.push({ d: -10 * cautN, t: cautN + " ingredient" + (cautN > 1 ? "s" : "") + " of concern" });
      if (limitN) reasons.push({ d: -4 * limitN, t: limitN + " ingredient" + (limitN > 1 ? "s" : "") + " to limit" });

      // Nutrition / processing adjustments apply to food only.
      var nutrition = isFood ? evalNutrition(off) : { hasData: false, negatives: [], positives: [] };
      if (isFood && off) {
        if (off.nova_group === 4) { score -= 8; reasons.push({ d: -8, t: "Ultra-processed (NOVA group 4)" }); }
        var ns = String(off.nutriscore_grade || "").toLowerCase();
        if (ns === "e") { score -= 12; reasons.push({ d: -12, t: "Nutri-Score E" }); }
        else if (ns === "d") { score -= 7; reasons.push({ d: -7, t: "Nutri-Score D" }); }
        else if (ns === "a") { score += 5; reasons.push({ d: 5, t: "Nutri-Score A" }); }
        nutrition.negatives.forEach(function (r) { if (r.sev === "bad") { score -= 4; reasons.push({ d: -4, t: "High " + r.label.toLowerCase() }); } });
      }

      var hasAvoid = avoidN > 0;
      score = Math.max(0, Math.min(100, Math.round(score)));
      if (hasAvoid && score >= 40) { score = 39; reasons.push({ d: 0, t: "Capped: contains an avoid-grade ingredient" }); }

      var flaggedCount = avoidN + cautN;
      if (flaggedCount > 0) nutrition.negatives.unshift({ label: "Additives", value: flaggedCount + " to watch", sev: "bad", note: "Contains ingredients of concern" });
      else if (classified.length) nutrition.positives.unshift({ label: "Additives", value: "None", sev: "good", note: "No risky ingredients" });

      return { classified: classified, score: score, badge: bandFor(score, hasAvoid), nutrition: nutrition,
        flaggedCount: flaggedCount, scoreReasons: reasons, productType: productType || "food" };
    }

    function personalAlerts(classified, profile) {
      var alerts = [];
      var allergenMap = DATA.allergenMap || {};
      Object.keys(profile || {}).forEach(function (key) {
        if (!profile[key]) return;
        var kws = allergenMap[key]; if (!kws) return;
        var kwToks = kws.map(function (k) { return tokenize(norm(k)); });
        var hits = [];
        classified.forEach(function (c) {
          var toks = tokenize(c.norm);
          for (var i = 0; i < kwToks.length; i++) if (phraseInTokens(toks, kwToks[i])) { hits.push(c.raw); break; }
        });
        if (hits.length) alerts.push({ key: key, hits: hits.slice(0, 4) });
      });
      return alerts;
    }

    // Mifflin-St Jeor BMR -> TDEE -> calorie/macro target.
    function computeTargets(h) {
      if (!h || !h.kg || !h.cm || !h.age) return null;
      var bmr = 10 * h.kg + 6.25 * h.cm - 5 * h.age + (h.sex === "female" ? -161 : 5);
      var act = parseFloat(h.activity) || 1.375;
      var tdee = bmr * act;
      var target = h.goal === "lose" ? tdee - 500 : h.goal === "gain" ? tdee + 400 : tdee;
      target = Math.max(1200, Math.round(target));
      return {
        bmr: Math.round(bmr), tdee: Math.round(tdee), target: target,
        protein: Math.round(target * 0.30 / 4), carbs: Math.round(target * 0.40 / 4), fat: Math.round(target * 0.30 / 9)
      };
    }

    // Best-available calories per portion.
    function computeKcal(off) {
      var nu = off && off.nutriments; if (!nu) return null;
      var s = num(nu["energy-kcal_serving"]); if (s != null) return Math.round(s);
      var per100 = num(nu["energy-kcal_100g"]); if (per100 == null) return null;
      var sq = num(off.serving_quantity);
      return Math.round(sq ? per100 * sq / 100 : per100);
    }
    // Per-portion macro grams (protein/carbs/fat) using the same serving logic.
    function computeMacros(off) {
      var nu = off && off.nutriments; if (!nu) return null;
      function per(serv, p100) {
        var s = num(nu[serv]); if (s != null) return s;
        var v = num(nu[p100]); if (v == null) return null;
        var sq = num(off.serving_quantity);
        return sq ? v * sq / 100 : v;
      }
      var p = per("proteins_serving", "proteins_100g");
      var c = per("carbohydrates_serving", "carbohydrates_100g");
      var f = per("fat_serving", "fat_100g");
      if (p == null && c == null && f == null) return null;
      return { protein: p == null ? null : Math.round(p), carbs: c == null ? null : Math.round(c), fat: f == null ? null : Math.round(f) };
    }

    /* --------------------------------------------------- compare two products
     * Pure structural diff over two analyzed product objects. Each product is
     * expected to carry { name, score, classified[], nutrition{negatives,positives},
     * flaggedCount? }. No DOM, fully unit-testable.                            */
    function numFromValue(v) {
      var m = String(v == null ? "" : v).match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    }
    function negLabelSet(p) {
      var set = {};
      var rows = (p && p.nutrition && p.nutrition.negatives) || [];
      rows.forEach(function (r) { if (r.sev === "bad") set[r.label] = true; });
      return set;
    }
    function posLabelSet(p) {
      var set = {};
      var rows = (p && p.nutrition && p.nutrition.positives) || [];
      rows.forEach(function (r) { if (r.sev === "good") set[r.label] = true; });
      return set;
    }
    function splitSets(sa, sb) {
      var aOnly = [], bOnly = [], shared = [];
      Object.keys(sa).forEach(function (k) { (sb[k] ? shared : aOnly).push(k); });
      Object.keys(sb).forEach(function (k) { if (!sa[k]) bOnly.push(k); });
      return { aOnly: aOnly, bOnly: bOnly, shared: shared };
    }
    function additiveCount(p) {
      if (p && typeof p.flaggedCount === "number") return p.flaggedCount;
      var n = 0;
      ((p && p.classified) || []).forEach(function (c) {
        if (c.status === "avoid" || c.status === "caution") n++;
      });
      return n;
    }
    function nutritionDeltas(a, b) {
      function rowMap(p) {
        var m = {};
        var rows = ((p && p.nutrition && p.nutrition.negatives) || [])
          .concat((p && p.nutrition && p.nutrition.positives) || []);
        rows.forEach(function (r) { var n = numFromValue(r.value); if (n != null) m[r.label] = n; });
        return m;
      }
      var ma = rowMap(a), mb = rowMap(b), out = {};
      Object.keys(ma).forEach(function (k) {
        if (mb[k] != null) out[k] = { a: ma[k], b: mb[k], delta: Math.round((ma[k] - mb[k]) * 10) / 10 };
      });
      return out;
    }
    function diffProducts(a, b) {
      a = a || {}; b = b || {};
      var sa = typeof a.score === "number" ? a.score : 0;
      var sb = typeof b.score === "number" ? b.score : 0;
      return {
        better: sa > sb ? "a" : sb > sa ? "b" : "tie",
        scoreDelta: sa - sb,
        negatives: splitSets(negLabelSet(a), negLabelSet(b)),
        positives: splitSets(posLabelSet(a), posLabelSet(b)),
        nutrition: nutritionDeltas(a, b),
        additiveCount: { a: additiveCount(a), b: additiveCount(b) }
      };
    }

    return {
      DATA: {
        additives: foodAdditives, cosmetics: cosmeticAdditives, all: allAdditives,
        groups: groups, bannedMap: bannedMap, eNumbers: DATA.eNumbers || [],
        seedOils: DATA.seedOils || [], addedSugars: DATA.addedSugars || [],
        artificialSweeteners: DATA.artificialSweeteners || [], vagueTerms: DATA.vagueTerms || [],
        cleanIngredients: DATA.cleanIngredients || [], fortifiedVitamins: DATA.fortifiedVitamins || [],
        allergenMap: DATA.allergenMap || {}
      },
      norm: norm, titleCase: titleCase, num: num, cap: cap,
      tokenize: tokenize, phraseInTokens: phraseInTokens, isFoodType: isFoodType,
      parseIngredients: parseIngredients, classify: classify, ingredientDetail: ingredientDetail,
      evalNutrition: evalNutrition, analyze: analyze, bandFor: bandFor, personalAlerts: personalAlerts,
      computeTargets: computeTargets, computeKcal: computeKcal, computeMacros: computeMacros,
      diffProducts: diffProducts
    };
  }

  /*
   * Browser singleton facade. The UI (app.js) holds `window.CB_ENGINE` before
   * any data is ready, then calls `.init({ food, cosmetics })` once the data
   * files have loaded. init() builds the real engine and copies every method
   * onto the facade so existing `ENG.method(...)` call sites just work.
   */
  function makeSingleton() {
    var facade = {
      norm: norm, titleCase: titleCase, num: num, cap: cap,
      tokenize: tokenize, phraseInTokens: phraseInTokens, isFoodType: isFoodType,
      parseIngredients: parseIngredients, _ready: false,
      init: function (data) {
        data = data || {};
        var built = buildEngine(data.food || (typeof window !== "undefined" && window.CB_DATA) || {},
          data.cosmetics || (typeof window !== "undefined" && window.CB_DATA_COSMETICS) || null);
        Object.keys(built).forEach(function (k) { facade[k] = built[k]; });
        facade._ready = true;
        return facade;
      }
    };
    return facade;
  }

  return { buildEngine: buildEngine, makeSingleton: makeSingleton,
    norm: norm, titleCase: titleCase, num: num, cap: cap, isFoodType: isFoodType,
    tokenize: tokenize, phraseInTokens: phraseInTokens, parseIngredients: parseIngredients };
});
