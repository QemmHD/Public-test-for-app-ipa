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
  function foldAscii(s) {
    var out = String(s || "")
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/[\u00A0\u2007\u202F]/g, " ")
      .replace(/\uFB00/g, "ff").replace(/\uFB01/g, "fi").replace(/\uFB02/g, "fl");
    // String#normalize is present in current iOS/Android WebViews, but keep the
    // guard so the pure engine also works in older embedded browsers.
    if (out.normalize) out = out.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return out;
  }
  function norm(s) {
    return foldAscii(s).toLowerCase()
      .replace(/\d+(\.\d+)?\s*%/g, " ")
      .replace(/\be[\s-]+(?=\d{3,4}[a-z]?\b)/g, "e")
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
  // High-confidence markers for text that is NOT an ingredient. Broad label
  // sections are truncated before tokenization; this fragment filter is a
  // second line of defence for OCR that lost punctuation or line breaks.
  var NON_INGREDIENT_RE = /\b(daily value|percent daily|per serving|per container|serving size|servings per|amount per|nutrition facts|supplement facts|calories from|total fat|saturated fat|trans fat|polyunsaturated fat|monounsaturated fat|total carbohydrate|dietary fiber|total sugars|added sugars|cholesterol|protein per|distributed by|manufactured (by|for)|net wt|net weight|fluid ounces|fl oz|best before|best by|use by|sell by|exp date|lot number|questions|comments|satisfaction guaranteed|refrigerate after|produced in|made in|product of|packaged (by|for)|certified organic by|scan for|learn more|visit us|follow us|www|https?)\b/;
  var CLAIM_RE = /\b(non[- ]?gmo project verified|usda organic|gluten free|keto friendly|plant based|no artificial|excellent source|good source|low sodium|fat free|sugar free|recyclable|please recycle)\b/;
  var SECTION_BOUNDARY_RE = /(?:^|[.\n;]\s*)(nutrition facts|supplement facts|drug facts|allergen information|allergy advice|contains\s*:(?!\s*(?:2\s*%|less than))|may contain|distributed by|manufactured (?:by|for)|marketed by|packed (?:by|for)|net (?:wt|weight|contents)|directions|storage|warning|best (?:before|by)|use by|questions(?: or comments)?|www\.)/i;
  // A standalone number followed by a measurement unit (e.g. "200mg", "2 g",
  // "120 kcal") is a nutrition value, not an ingredient.
  var NUTRITION_VALUE_RE = /\b\d+(\.\d+)?\s?(mg|mcg|g|kg|kcal|iu|ml|oz)\b/;
  function isNonIngredient(n) {
    return NON_INGREDIENT_RE.test(n) || CLAIM_RE.test(n) || NUTRITION_VALUE_RE.test(n);
  }

  function extractAllergenStatement(text, marker) {
    var re = marker === "may"
      ? /\bmay contain\s*:?\s*([^.;\n]+)/i
      : /\bcontains\s*:\s*(?!\s*(?:2\s*%|less than))([^.;\n]+)/i;
    var m = String(text || "").match(re);
    if (!m) return [];
    return m[1].split(/,|\s+and\s+|\s*&\s*/i).map(function (s) { return norm(s); })
      .filter(function (s) { return s && s.length > 1 && !isNonIngredient(s); });
  }

  function splitTopLevel(text) {
    var out = [], start = 0, depth = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
      else if (depth === 0 && (ch === "," || ch === ";")) {
        out.push(text.slice(start, i)); start = i + 1;
      }
    }
    out.push(text.slice(start));
    return out;
  }

  function parentheticalParts(text) {
    var base = "", groups = [], depth = 0, groupStart = -1;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === "(") {
        if (depth === 0) groupStart = i + 1;
        else if (groupStart >= 0) { /* keep nested punctuation in the group */ }
        depth++;
      } else if (ch === ")" && depth > 0) {
        depth--;
        if (depth === 0 && groupStart >= 0) {
          groups.push(text.slice(groupStart, i)); groupStart = -1;
        }
      } else if (depth === 0) base += ch;
    }
    // OCR commonly drops a final close-paren. Preserve the recoverable inner
    // list, but report the imbalance through scan quality.
    if (depth > 0 && groupStart >= 0) groups.push(text.slice(groupStart));
    return { base: base, groups: groups };
  }

  function plausibleIngredient(raw) {
    var n = norm(raw);
    if (!n || n.length < 2 || n.length > 120 || isNonIngredient(n)) return false;
    if (/\b\d{7,}\b/.test(n)) return false; // barcode / lot number
    if (/([a-z])\1{4,}/.test(n)) return false;
    if (/^[0-9\s.'-]+$/.test(n)) return false;
    if (n.split(/\s+/).length > 16) return false;
    var alpha = (n.match(/[a-z]/g) || []).length;
    var digits = (n.match(/[0-9]/g) || []).length;
    // Allow short conventional additive abbreviations (BHA, BHT, MSG, TBHQ)
    // and E-numbers, while rejecting number-heavy OCR fragments.
    if (alpha < 2 && !/^e\d{3,4}[a-z]?$/.test(n)) return false;
    if (digits > alpha + 3 && !/^e\d{3,4}[a-z]?$/.test(n)) return false;
    return true;
  }

  function parseIngredientScan(text) {
    var source = foldAscii(text || "");
    var result = {
      items: [], rejected: [], declaredAllergens: extractAllergenStatement(source, "contains"),
      precautionaryAllergens: extractAllergenStatement(source, "may"),
      quality: { confidence: "none", ingredientMarker: false, boundaryFound: false, unbalancedParentheses: false, truncated: false }
    };
    if (!source.trim()) return result;

    // Repair only high-confidence OCR/layout artifacts; do not guess arbitrary
    // letters, because a guessed chemical name is worse than an unknown one.
    var cleaned = source
      .replace(/([A-Za-z])-\s*\n\s*(?=[a-z])/g, "$1")
      .replace(/[\u2022\u2023\u25E6\u2043]/g, ",")
      .replace(/\s+\|\s+/g, ",")
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\S+@\S+\.\S+/g, " ")
      .replace(/\b[\w.-]+\.(?:com|net|org|co|us)\b/gi, " ");

    var marker = /\b(?:ingredients?|lngredients|ingredlents)\s*[:\-]?\s*/i.exec(cleaned);
    if (marker) {
      result.quality.ingredientMarker = true;
      cleaned = cleaned.slice(marker.index + marker[0].length);
    }
    var boundary = SECTION_BOUNDARY_RE.exec(cleaned);
    if (boundary) {
      result.quality.boundaryFound = true;
      cleaned = cleaned.slice(0, boundary.index);
    }
    result.quality.unbalancedParentheses = (cleaned.match(/\(/g) || []).length !== (cleaned.match(/\)/g) || []).length;
    cleaned = cleaned
      .replace(/\r?\n+/g, " ")
      .replace(/\bcontains\s+(?:2\s*%|less than\s+2\s*%)\s+(?:or less\s+)?of\s*:?/gi, ",")
      .replace(/\bless than\s+2\s*%\s+of\s*:?/gi, ",")
      .replace(/[\[\]{}]/g, function (m) { return m === "[" || m === "{" ? "(" : ")"; })
      .replace(/\s+/g, " ").trim();

    var seen = {};
    function reject(raw, reason) {
      var r = String(raw || "").replace(/\s+/g, " ").trim();
      if (r && result.rejected.length < 30) result.rejected.push({ raw: r, reason: reason });
    }
    function add(raw, depth, parent) {
      raw = String(raw || "")
        .replace(/^\s*(?:and|or)\s+/i, "")
        .replace(/^\s*(?:made with|including|with|of)\s+/i, "")
        .replace(/[.\s]+$/, "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      var n = norm(raw);
      if (!plausibleIngredient(raw)) { reject(raw, "label-noise-or-low-confidence"); return; }
      if (seen[n]) return;
      seen[n] = true;
      result.items.push({ raw: raw, norm: n, depth: depth || 0, parent: parent || "" });
      if (result.items.length >= 120) result.quality.truncated = true;
    }
    function expand(raw, depth, parent) {
      if (!raw || result.items.length >= 120) return;
      var parsed = parentheticalParts(raw);
      var base = parsed.base.replace(/\s*:\s*$/, "").trim();
      if (base) add(base, depth, parent);
      var parentName = base ? norm(base) : parent;
      parsed.groups.forEach(function (group) {
        var gn = norm(group);
        // These are label qualifiers, not hidden ingredients. Other single-item
        // groups (e.g. "vitamin C (ascorbic acid)" or "whey (milk)") are kept.
        if (/^(certified )?organic$|^non gmo$|^for (freshness|color)$|^to (preserve|protect) freshness$|^as a preservative$/.test(gn)) return;
        splitTopLevel(group).forEach(function (child) { expand(child, (depth || 0) + 1, parentName); });
      });
    }
    splitTopLevel(cleaned).forEach(function (part) { expand(part, 0, ""); });

    if (!result.items.length) result.quality.confidence = "low";
    else if (result.quality.unbalancedParentheses || result.rejected.length > Math.max(2, result.items.length / 3)) result.quality.confidence = "low";
    else if (result.rejected.length || result.quality.truncated) result.quality.confidence = "medium";
    else result.quality.confidence = "high";
    return result;
  }
  function parseIngredients(text) { return parseIngredientScan(text).items; }

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
        .filter(function (o) { return o.toks.length; })
        .sort(function (a, b) { return b.toks.length - a.toks.length; });
    }
    var seedOilsT = tokList(DATA.seedOils);
    var addedSugarsT = tokList(DATA.addedSugars);
    var sweetenersT = tokList(DATA.artificialSweeteners);
    var vagueT = tokList(DATA.vagueTerms);
    var cleanT = tokList(DATA.cleanIngredients);
    var recognizedT = tokList(DATA.recognizedIngredients);
    var processingT = tokList(DATA.processingMarkers);
    var aliasLookup = {};
    Object.keys(DATA.ingredientAliases || {}).forEach(function (canonical) {
      var cn = norm(canonical);
      aliasLookup[cn] = cn;
      (DATA.ingredientAliases[canonical] || []).forEach(function (alias) { aliasLookup[norm(alias)] = cn; });
    });
    // Cosmetic concern keyword buckets (optional).
    var cosmeticListsT = {};
    if (COSMETICS && COSMETICS.concernLists) {
      Object.keys(COSMETICS.concernLists).forEach(function (k) { cosmeticListsT[k] = tokList(COSMETICS.concernLists[k]); });
    }

    // Word-boundary lookups.
    function findInIndex(idx, toks) {
      for (var i = 0; i < idx.length; i++) if (phraseInTokens(toks, idx[i].toks)) return idx[i];
      return null;
    }
    function listHitTok(listT, toks) {
      for (var i = 0; i < listT.length; i++) if (phraseInTokens(toks, listT[i].toks)) return listT[i];
      return null;
    }

    function findENumberByName(toks) {
      var arr = DATA.eNumbers || [];
      for (var i = 0; i < arr.length; i++) {
        var nmToks = tokenize(norm(arr[i][1]));
        // Only match reasonably specific names (avoid 1-letter noise).
        if (nmToks.length && (nmToks.length > 1 || (nmToks[0] && nmToks[0].length >= 4)) && phraseInTokens(toks, nmToks))
          return { code: arr[i][0], name: arr[i][1], risk: arr[i][2], matchedTerm: arr[i][1] };
      }
      return null;
    }
    function findENumberByCode(raw) {
      var m = String(raw || "").match(/\be[\s-]?(\d{3,4}[a-z]?)\b/i);
      if (!m) return null;
      var code = "e" + m[1].toLowerCase();
      var arr = DATA.eNumbers || [];
      for (var i = 0; i < arr.length; i++)
        if (arr[i][0].toLowerCase() === code) return { code: arr[i][0], name: arr[i][1], risk: arr[i][2], matchedTerm: arr[i][0] };
      return { code: "E" + m[1].toUpperCase(), name: "Uncatalogued additive " + m[1].toUpperCase(), risk: "caution", matchedTerm: m[0], unverified: true };
    }
    function egroup(risk) { return "e" + cap(risk); }

    function sameTokens(a, b) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    function withAssessment(result, matchType, matchedTerm, exact, referenceCount) {
      result.matchType = matchType;
      result.matchedTerm = matchedTerm || "";
      result.matchConfidence = matchType === "none" ? "low" : exact ? "high" : "medium";
      result.evidence = {
        basis: referenceCount ? "ingredient-specific references" : (matchType === "none" ? "no database match" : "category rule"),
        referenceCount: referenceCount || 0,
        scope: "Screening signal only; exposure, dose, formulation and individual needs are not assessed."
      };
      return result;
    }

    // Classify a single ingredient. productType: "food" (default) | "beauty" | "household" | "petfood".
    function classify(n, raw, productType) {
      n = norm(n || raw);
      var canonical = aliasLookup[n] || n;
      var toks = tokenize(canonical);
      var isFood = isFoodType(productType);

      if (!isFood) {
        // Non-food (cosmetic / household): cosmetic DB first.
        var caHit = findInIndex(cosmeticIndex, toks);
        if (caHit) {
          var ca = caHit.additive;
          return withAssessment({ status: ca.risk, additive: ca, name: ca.names[0], canonicalName: canonical, reason: ca.category },
            aliasLookup[n] && aliasLookup[n] !== n ? "alias" : "database-name", caHit.toks.join(" "), sameTokens(toks, caHit.toks), (ca.studies || []).length);
        }
        // Cosmetic concern keyword buckets.
        var ck = Object.keys(cosmeticListsT);
        for (var ci = 0; ci < ck.length; ci++) {
          var hit = listHitTok(cosmeticListsT[ck[ci]], toks);
          if (hit) {
            var meta = (COSMETICS.concernMeta && COSMETICS.concernMeta[ck[ci]]) || { status: "caution", reason: cap(ck[ci]) };
            return withAssessment({ status: meta.status, group: ck[ci], canonicalName: canonical, reason: meta.reason },
              "category-keyword", hit.raw, sameTokens(toks, hit.toks), 0);
          }
        }
        var cv = listHitTok(vagueT, toks);
        if (cv) return withAssessment({ status: "limit", group: "vague", canonicalName: canonical, reason: "Undisclosed ingredient" }, "category-keyword", cv.raw, sameTokens(toks, cv.toks), 0);
        var cc = listHitTok(cleanT, toks);
        if (cc) return withAssessment({ status: "good", group: "clean", canonicalName: canonical, reason: "Recognized ingredient" }, "food-name", cc.raw, sameTokens(toks, cc.toks), 0);
        return withAssessment({ status: "unknown", group: "unknown", canonicalName: canonical, reason: "Not catalogued; no risk conclusion" }, "none", "", false, 0);
      }

      // Ingredient-specific records take precedence over broader category
      // rules, and longer phrases win within each index.
      var aHit = findInIndex(foodIndex, toks);
      if (aHit) {
        var a = aHit.additive;
        return withAssessment({ status: a.risk, additive: a, name: a.names[0], canonicalName: canonical, reason: a.category },
          aliasLookup[n] && aliasLookup[n] !== n ? "alias" : "database-name", aHit.toks.join(" "), sameTokens(toks, aHit.toks), (a.studies || []).length);
      }
      var sw = listHitTok(sweetenersT, toks);
      if (sw) return withAssessment({ status: "caution", group: "sweetener", canonicalName: canonical, reason: "Non-sugar sweetener" }, "category-keyword", sw.raw, sameTokens(toks, sw.toks), 0);
      var so = listHitTok(seedOilsT, toks);
      if (so) return withAssessment({ status: "limit", group: "seedOil", canonicalName: canonical, reason: "Refined seed/vegetable oil" }, "category-keyword", so.raw, sameTokens(toks, so.toks), 0);
      var vg = listHitTok(vagueT, toks);
      if (vg) return withAssessment({ status: "limit", group: "vague", canonicalName: canonical, reason: "Undisclosed ingredient blend" }, "category-keyword", vg.raw, sameTokens(toks, vg.toks), 0);
      var en = findENumberByName(toks) || findENumberByCode(raw);
      if (en) return withAssessment({ status: en.risk, group: egroup(en.risk), name: en.name, canonicalName: canonical, enumber: en.code,
        reason: (en.unverified ? "Uncatalogued E-number" : "Food additive") + (en.code ? " / " + en.code : "") },
        en.unverified ? "e-number-pattern" : "e-number", en.matchedTerm, true, 0);
      var sugar = listHitTok(addedSugarsT, toks);
      if (sugar) return withAssessment({ status: "limit", group: "addedSugar", canonicalName: canonical, reason: "Added sugar" }, "category-keyword", sugar.raw, sameTokens(toks, sugar.toks), 0);
      var processed = listHitTok(processingT, toks);
      if (processed) return withAssessment({ status: "limit", group: "processed", canonicalName: canonical, reason: "Highly processed formulation component" }, "category-keyword", processed.raw, sameTokens(toks, processed.toks), 0);
      var clean = listHitTok(cleanT, toks);
      if (clean) return withAssessment({ status: "good", group: "clean", canonicalName: canonical, reason: "Recognized whole-food or pantry ingredient" }, "food-name", clean.raw, sameTokens(toks, clean.toks), 0);
      var recognized = listHitTok(recognizedT, toks);
      if (recognized) return withAssessment({ status: "good", group: "recognized", canonicalName: canonical, reason: "Recognized low-concern ingredient" }, "ingredient-name", recognized.raw, sameTokens(toks, recognized.toks), 0);
      if (/\be[\s-]?\d{3,4}[a-z]?\b/i.test(String(raw || ""))) return withAssessment({ status: "caution", group: "eCaution", canonicalName: canonical, reason: "Uncatalogued E-number" }, "e-number-pattern", raw, true, 0);
      return withAssessment({ status: "unknown", group: "unknown", canonicalName: canonical, reason: "Not catalogued; no risk conclusion" }, "none", "", false, 0);
    }

    function ingredientDetail(item) {
      if (item.additive) {
        var a = item.additive;
        return { title: titleCase(a.names[0]), category: a.category, enumber: a.enumber || "", status: a.risk,
          summary: a.summary, whatIs: a.whatIs, whyFlagged: a.whyFlagged, effects: a.healthRisk,
          banned: (bannedMap && bannedMap[a.id]) || "", studies: a.studies || [], evidence: item.evidence || null,
          assessmentNote: "Hazard and regulatory context do not measure the dose in this product or predict an individual health outcome." };
      }
      var g = groups[item.group] || groups.unknown || { category: "Not catalogued", status: "unknown", summary: "No assessment available.", whatIs: "No database match.", whyFlagged: "Not scored as harmful.", effects: "Unknown." };
      return { title: titleCase(item.name || item.raw), category: g.category, enumber: item.enumber || "", status: item.status || g.status,
        summary: g.summary, whatIs: g.whatIs, whyFlagged: g.whyFlagged, effects: g.effects, banned: "", studies: g.studies || [],
        evidence: item.evidence || null, assessmentNote: "This is an ingredient-screening category, not a diagnosis or a measurement of dose." };
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
      var scan = parseIngredientScan(ingredientsText);
      var items = scan.items;
      var classified = items.map(function (it) {
        var c = classify(it.norm, (it.raw || "").toLowerCase(), productType);
        return { raw: it.raw, norm: it.norm, status: c.status, reason: c.reason,
          additive: c.additive || null, group: c.group || null, name: c.name || it.raw, canonicalName: c.canonicalName || it.norm,
          enumber: c.enumber || "", depth: it.depth || 0, parent: it.parent || "", matchType: c.matchType,
          matchedTerm: c.matchedTerm, matchConfidence: c.matchConfidence, evidence: c.evidence, scoreImpact: 0 };
      });

      var counts = { avoid: 0, caution: 0, limit: 0, unknown: 0, recognized: 0 };
      var scoredKeys = {};
      var score = classified.length ? 100 : 50;
      var reasons = [];
      classified.forEach(function (c, index) {
        if (c.status === "avoid") counts.avoid++;
        else if (c.status === "caution") counts.caution++;
        else if (c.status === "limit") counts.limit++;
        else if (c.status === "unknown") counts.unknown++;
        else counts.recognized++;

        var key = c.additive ? "additive:" + c.additive.id : (c.group || c.status) + ":" + c.canonicalName;
        if (scoredKeys[key]) return; // nested declarations often repeat the same ingredient
        scoredKeys[key] = true;
        var penalty = c.status === "avoid" ? 30 : c.status === "caution" ? 12 : c.status === "limit" ? 4 : c.status === "unknown" ? 3 : 0;
        // An added sweetener near the front of the declaration is a stronger
        // formulation signal. This is an ingredient-order rule, not a dose claim.
        if (c.group === "addedSugar" && index < 3) penalty = 8;
        c.scoreImpact = -penalty;
        score -= penalty;
      });
      if (counts.avoid) reasons.push({ d: -30 * counts.avoid, code: "avoid-ingredients", t: counts.avoid + " avoid-grade ingredient" + (counts.avoid > 1 ? "s" : "") });
      if (counts.caution) reasons.push({ d: -12 * counts.caution, code: "caution-ingredients", t: counts.caution + " caution-grade ingredient" + (counts.caution > 1 ? "s" : "") });
      if (counts.limit) {
        var limitImpact = classified.reduce(function (sum, c) { return sum + (c.status === "limit" ? c.scoreImpact : 0); }, 0);
        reasons.push({ d: limitImpact, code: "limit-ingredients", t: counts.limit + " ingredient" + (counts.limit > 1 ? "s" : "") + " to limit" });
      }
      if (counts.unknown) reasons.push({ d: -3 * counts.unknown, code: "unknown-ingredients", t: counts.unknown + " unclassified ingredient" + (counts.unknown > 1 ? "s" : "") + "; no safety assumption made" });
      if (!classified.length) reasons.push({ d: 0, code: "missing-ingredients", t: "No usable ingredient list; rating is provisional" });

      var recognizedN = classified.length - counts.unknown;
      var coverage = {
        total: classified.length, recognized: recognizedN, unknown: counts.unknown, rejected: scan.rejected.length,
        percent: classified.length ? Math.round(recognizedN * 100 / classified.length) : 0,
        complete: !!classified.length && counts.unknown === 0 && scan.rejected.length === 0
      };

      // Nutrition / processing adjustments apply to food only.
      var nutrition = isFood ? evalNutrition(off) : { hasData: false, negatives: [], positives: [] };
      var ns = "", nova4 = false, sugar100 = null;
      if (isFood && off) {
        nova4 = off.nova_group === 4;
        if (nova4) { score -= 8; reasons.push({ d: -8, code: "nova-4", t: "Ultra-processed formulation (NOVA group 4)" }); }
        ns = String(off.nutriscore_grade || "").toLowerCase();
        if (ns === "e") { score -= 15; reasons.push({ d: -15, code: "nutriscore-e", t: "Nutri-Score E" }); }
        else if (ns === "d") { score -= 10; reasons.push({ d: -10, code: "nutriscore-d", t: "Nutri-Score D" }); }
        else if (ns === "c") { score -= 4; reasons.push({ d: -4, code: "nutriscore-c", t: "Nutri-Score C" }); }
        else if (ns === "a") { score += 3; reasons.push({ d: 3, code: "nutriscore-a", t: "Nutri-Score A" }); }
        sugar100 = off.nutriments ? num(off.nutriments["sugars_100g"]) : null;
        if (sugar100 != null && sugar100 > 22.5) { score -= 8; reasons.push({ d: -8, code: "high-sugar", t: "High total sugar per 100 g" }); }
        else if (sugar100 != null && sugar100 > 5) { score -= 3; reasons.push({ d: -3, code: "moderate-sugar", t: "Moderate total sugar per 100 g" }); }
        nutrition.negatives.forEach(function (r) {
          if (r.label !== "Sugar" && r.sev === "bad") { score -= 4; reasons.push({ d: -4, code: "high-" + r.label.toLowerCase().replace(/\s+/g, "-"), t: "High " + r.label.toLowerCase() }); }
        });
      }

      score = Math.max(0, Math.min(100, Math.round(score)));
      function applyCap(max, code, label) {
        var before = score;
        if (score > max) score = max;
        reasons.push({ d: score - before, code: code, cap: max, t: "Rating cap: " + label });
      }
      function isAddedSugar(c) { return c.group === "addedSugar" || (c.additive && c.additive.category === "Added sugar"); }
      var hasAddedSugar = classified.some(isAddedSugar);
      var prominentAddedSugar = classified.some(function (c, i) { return isAddedSugar(c) && i < 3; });
      if (counts.avoid) applyCap(29, "avoid-cap", "avoid-grade ingredient present");
      else if (counts.caution >= 2) applyCap(49, "multiple-caution-cap", "multiple caution-grade ingredients");
      else if (counts.caution === 1) applyCap(69, "caution-cap", "caution-grade ingredient present");
      if (ns === "e") applyCap(29, "nutriscore-e-cap", "Nutri-Score E cannot rate Good");
      else if (ns === "d") applyCap(49, "nutriscore-d-cap", "Nutri-Score D cannot rate Good");
      if (sugar100 != null && sugar100 > 22.5) applyCap(39, "high-sugar-cap", "high total sugar");
      else if (hasAddedSugar && sugar100 != null && sugar100 >= 8) applyCap(49, "sugary-product-cap", "added sugar plus at least 8 g total sugar per 100 g");
      else if (hasAddedSugar && sugar100 != null && sugar100 > 5) applyCap(59, "added-sugar-cap", "added sugar plus moderate total sugar");
      if (nova4 && prominentAddedSugar) applyCap(49, "sugary-upf-cap", "ultra-processed product with prominent added sugar");
      if (classified.length && coverage.percent < 60) applyCap(49, "low-coverage-cap", "less than 60% of ingredients recognized");
      else if (classified.length && coverage.percent < 85) applyCap(69, "partial-coverage-cap", "less than 85% of ingredients recognized");
      if (classified.length && scan.quality.confidence === "low") applyCap(59, "scan-quality-cap", "low-confidence ingredient text");

      var hasAvoid = counts.avoid > 0;
      var flaggedCount = counts.avoid + counts.caution;
      if (flaggedCount > 0) nutrition.negatives.unshift({ label: "Additives", value: flaggedCount + " to watch", sev: "bad", note: "Contains ingredients of concern" });
      else if (classified.length && coverage.percent === 100) nutrition.positives.unshift({ label: "Additives", value: "None flagged", sev: "good", note: "No catalogued caution/avoid ingredients found" });

      var confidence = !classified.length ? "none" : coverage.percent >= 90 && scan.quality.confidence === "high" ? "high" : coverage.percent >= 60 && scan.quality.confidence !== "low" ? "medium" : "low";
      var allergens = detectAllergens(classified, scan);
      var badge = classified.length ? bandFor(score, hasAvoid) : { label: "Not rated", cls: "mid" };

      return { classified: classified, score: score, badge: badge, nutrition: nutrition,
        flaggedCount: flaggedCount, scoreReasons: reasons, productType: productType || "food", coverage: coverage,
        ratingConfidence: confidence, scanQuality: scan.quality, rejectedFragments: scan.rejected,
        allergens: allergens, methodology: { version: "2.0", weights: { avoid: -30, caution: -12, limit: -4, unknown: -3 },
          note: "Ingredient order, category flags, nutrition and database coverage are screened separately; this is not medical advice." } };
    }

    function detectAllergens(classified, scan, requestedKeys) {
      var allergenMap = DATA.allergenMap || {}, exclusions = DATA.allergenExclusions || {};
      var declared = (scan && scan.declaredAllergens) || [], precautionary = (scan && scan.precautionaryAllergens) || [];
      var alerts = [];
      var keys = requestedKeys || ["gluten", "dairy", "egg", "soy", "peanut", "treenut", "shellfish", "fish", "sesame"];
      keys.forEach(function (key) {
        if (!allergenMap[key]) return;
        var kwToks = (allergenMap[key] || []).map(function (k) { return tokenize(norm(k)); });
        var exToks = (exclusions[key] || []).map(function (k) { return tokenize(norm(k)); });
        var hits = [], sources = [];
        function excluded(toks) {
          for (var e = 0; e < exToks.length; e++) if (sameTokens(toks, exToks[e])) return true;
          return false;
        }
        function matches(toks, packageDeclared) {
          if (!packageDeclared && excluded(toks)) return false;
          for (var i = 0; i < kwToks.length; i++) if (phraseInTokens(toks, kwToks[i])) return true;
          return false;
        }
        (classified || []).forEach(function (c) {
          if (matches(tokenize(c.norm), false) && hits.indexOf(c.raw) === -1) { hits.push(c.raw); sources.push("ingredient-list"); }
        });
        declared.forEach(function (term) {
          if (matches(tokenize(term), true) && hits.indexOf(term) === -1) { hits.push(term); sources.push("contains-statement"); }
        });
        precautionary.forEach(function (term) {
          if (matches(tokenize(term), true) && hits.indexOf(term) === -1) { hits.push(term); sources.push("may-contain-statement"); }
        });
        if (hits.length) alerts.push({ key: key, hits: hits.slice(0, 8), sources: sources.slice(0, 8),
          confidence: sources.indexOf("contains-statement") !== -1 ? "label-declared" : "name-match",
          note: sources.indexOf("may-contain-statement") !== -1 ? "Includes a precautionary may-contain statement." : "Verify the package allergen declaration for medical decisions." });
      });
      return alerts;
    }

    function personalAlerts(classified, profile) {
      var keys = Object.keys(profile || {}).filter(function (key) { return profile[key]; });
      return detectAllergens(classified, null, keys).filter(function (alert) { return profile && profile[alert.key]; })
        .map(function (alert) { return { key: alert.key, hits: alert.hits, sources: alert.sources, confidence: alert.confidence, note: alert.note }; });
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
        cleanIngredients: DATA.cleanIngredients || [], recognizedIngredients: DATA.recognizedIngredients || [], processingMarkers: DATA.processingMarkers || [],
        ingredientAliases: DATA.ingredientAliases || {}, allergenMap: DATA.allergenMap || {},
        allergenExclusions: DATA.allergenExclusions || {}
      },
      norm: norm, titleCase: titleCase, num: num, cap: cap,
      tokenize: tokenize, phraseInTokens: phraseInTokens, isFoodType: isFoodType,
      parseIngredients: parseIngredients, parseIngredientScan: parseIngredientScan, classify: classify, ingredientDetail: ingredientDetail,
      evalNutrition: evalNutrition, analyze: analyze, bandFor: bandFor, detectAllergens: detectAllergens, personalAlerts: personalAlerts,
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
      parseIngredients: parseIngredients, parseIngredientScan: parseIngredientScan, _ready: false,
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
    tokenize: tokenize, phraseInTokens: phraseInTokens, parseIngredients: parseIngredients, parseIngredientScan: parseIngredientScan };
});
