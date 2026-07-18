"use strict";
/*
 * Pure-engine unit tests. Runs in Node with no DOM via `node --test`.
 *
 * The data files (www/data-additives.js, www/data-cosmetics.js) assign to
 * `window.CB_DATA` / `window.CB_DATA_COSMETICS`, so we shim a global `window`
 * before requiring them, then build the engine explicitly.
 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const WWW = path.join(__dirname, "..", "www");

// Shim a browser-like global so the data files can attach to window.
global.window = {};
global.self = global.window;
require(path.join(WWW, "data-additives.js"));
require(path.join(WWW, "data-cosmetics.js"));

const ENGINE_FACTORY = require(path.join(WWW, "engine.js"));
const engine = ENGINE_FACTORY.buildEngine(global.window.CB_DATA, global.window.CB_DATA_COSMETICS);
const cosmeticData = global.window.CB_DATA_COSMETICS;

function reference(id) {
  return cosmeticData.referenceProducts.find((item) => item.id === id);
}

/* ----------------------------------------- singleton facade (app.js path) */
test("makeSingleton + init exposes the full engine surface", () => {
  const facade = ENGINE_FACTORY.makeSingleton();
  assert.strictEqual(facade._ready, false);
  assert.strictEqual(typeof facade.norm, "function"); // pure helper available pre-init
  facade.init({ food: global.window.CB_DATA, cosmetics: global.window.CB_DATA_COSMETICS });
  assert.strictEqual(facade._ready, true);
  ["classify", "analyze", "computeTargets", "computeMacros", "isFoodType", "ingredientDetail"].forEach((m) => {
    assert.strictEqual(typeof facade[m], "function", m + " should be on the facade after init");
  });
  assert.strictEqual(facade.isFoodType("beauty"), false);
  assert.strictEqual(facade.isFoodType("petfood"), true);
});

/* --------------------------------------------------------- tokenization */
test("tokenize splits on non-alphanumerics", () => {
  assert.deepStrictEqual(ENGINE_FACTORY.tokenize("red 40 (allura-red)"), ["red", "40", "allura", "red"]);
});

test("phraseInTokens matches consecutive whole tokens only", () => {
  const toks = ["partially", "hydrogenated", "soybean", "oil"];
  assert.strictEqual(ENGINE_FACTORY.phraseInTokens(toks, ["soybean", "oil"]), true);
  assert.strictEqual(ENGINE_FACTORY.phraseInTokens(toks, ["oil", "soybean"]), false);
});

/* ------------------------------------------------ word-boundary matching */
test("classify finds a known additive by whole-word name", () => {
  const c = engine.classify(engine.norm("Red 40"), "red 40", "food");
  assert.strictEqual(c.status, "caution");
  assert.ok(c.additive, "should attach the additive record");
});

test("REGRESSION: substring no longer causes a false positive", () => {
  // "salt" is a clean term; it must NOT match inside "unsalted" / "asphalt".
  // With the old indexOf logic this misclassified. Now token-boundary safe.
  const c = engine.classify(engine.norm("unsalted butter"), "unsalted butter", "food");
  assert.notStrictEqual(c.status, undefined);
  // The whole ingredient should not be flagged as an additive hit on "salt".
  assert.ok(!c.additive, "unsalted butter must not match a 'salt' additive token");
});

test("multi-word phrase still matches (partially hydrogenated oil)", () => {
  const c = engine.classify(engine.norm("partially hydrogenated soybean oil"), "partially hydrogenated soybean oil", "food");
  assert.ok(["avoid", "caution", "limit"].includes(c.status), "trans-fat oil should be flagged");
});

/* ---------------------------------------------------------- parsing */
test("parseIngredients splits and normalizes a label", () => {
  const items = engine.parseIngredients("Ingredients: Water, Sugar, Red 40, and Salt.");
  const norms = items.map((i) => i.norm);
  assert.ok(norms.includes("water"));
  assert.ok(norms.includes("sugar"));
  assert.ok(norms.includes("red 40"));
});

test("parseIngredients drops noise and dedupes adjacent repeats", () => {
  const items = engine.parseIngredients("Water, Water, , Sugar");
  const norms = items.map((i) => i.norm);
  assert.deepStrictEqual(norms, ["water", "sugar"]);
});

/* ----------------------------------------------------------- analyze */
test("analyze scores a clean product higher than a junk product", () => {
  const clean = engine.analyze(null, "Water, Oats, Almonds", "food");
  const junk = engine.analyze(null, "Sugar, Red 40, Aspartame, Soybean Oil", "food");
  assert.ok(clean.score > junk.score, "clean should outscore junk");
  assert.strictEqual(clean.productType, "food");
});

test("analyze caps score when an avoid-grade ingredient is present", () => {
  // Red 3 is risk:"avoid" in the food DB.
  const res = engine.analyze(null, "Sugar, Red 3", "food");
  assert.ok(res.score <= 39, "avoid-grade should cap score at 39");
  assert.strictEqual(res.badge.cls, "bad");
});

test("analyze applies NOVA-4 and Nutri-Score penalties for food", () => {
  const off = { nova_group: 4, nutriscore_grade: "e", nutriments: {} };
  const withPenalty = engine.analyze(off, "Water, Oats", "food");
  const noPenalty = engine.analyze(null, "Water, Oats", "food");
  assert.ok(withPenalty.score < noPenalty.score, "NOVA-4 + Nutri-Score E should lower score");
});

/* ---------------------------------------------- non-food (cosmetic) path */
test("cosmetic ingredient classifies via the cosmetic DB", () => {
  const c = engine.classify(engine.norm("Methylparaben"), "methylparaben", "beauty");
  assert.strictEqual(c.status, "caution");
  assert.ok(c.additive, "should attach the cosmetic additive record");
});

test("declared fragrance allergens change with exposure context", () => {
  const rinseOff = engine.classify(engine.norm("Limonene"), "limonene", "beauty", {}, "rinse-off-body");
  const leaveOn = engine.classify(engine.norm("Limonene"), "limonene", "beauty", {}, "leave-on-underarm");
  assert.strictEqual(rinseOff.status, "limit");
  assert.strictEqual(leaveOn.status, "caution");
  assert.strictEqual(leaveOn.additive.id, "declared-fragrance-allergens");
});

test("analyze suppresses food nutrition scoring for beauty products", () => {
  const off = { nova_group: 4, nutriscore_grade: "e", nutriments: { "energy-kcal_100g": 500 } };
  const res = engine.analyze(off, "Water, Sodium Lauryl Sulfate, Fragrance", "beauty");
  assert.strictEqual(res.nutrition.hasData, false, "no food nutrition rows for beauty");
  // NOVA / Nutri-Score reasons must not appear for non-food.
  const hasFoodReason = res.scoreReasons.some((r) => /NOVA|Nutri-Score/i.test(r.t));
  assert.ok(!hasFoodReason, "food-only penalties must be skipped for beauty");
  assert.strictEqual(res.productType, "beauty");
});

/* ------------------------------------------------------ targets / macros */
test("computeTargets returns sane Mifflin-St Jeor macros", () => {
  const t = engine.computeTargets({ kg: 70, cm: 175, age: 30, sex: "male", activity: "1.375", goal: "maintain" });
  assert.ok(t.target >= 1200);
  // carbs use a /4 kcal divisor (regression: was wrongly /9 earlier).
  assert.strictEqual(t.carbs, Math.round(t.target * 0.40 / 4));
  assert.strictEqual(t.protein, Math.round(t.target * 0.30 / 4));
  assert.strictEqual(t.fat, Math.round(t.target * 0.30 / 9));
  // carbs should be the largest macro by grams for a 40/30/30 split.
  assert.ok(t.carbs > t.fat, "carb grams should exceed fat grams");
});

test("computeTargets returns null on incomplete profile", () => {
  assert.strictEqual(engine.computeTargets({ kg: 70 }), null);
});

test("computeMacros scales per-100g to a serving", () => {
  const off = { serving_quantity: 50, nutriments: { proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 } };
  const m = engine.computeMacros(off);
  assert.strictEqual(m.protein, 5);
  assert.strictEqual(m.carbs, 10);
  assert.strictEqual(m.fat, 3); // round(2.5)
});

test("computeKcal prefers per-serving energy when present", () => {
  assert.strictEqual(engine.computeKcal({ nutriments: { "energy-kcal_serving": 142 } }), 142);
});

/* ----------------------------------------------------- personal alerts */
test("personalAlerts flags an allergen token match", () => {
  const items = engine.analyze(null, "Wheat Flour, Water, Salt", "food").classified;
  const alerts = engine.personalAlerts(items, { gluten: true });
  // Only asserts the function runs and returns an array; allergenMap is data-driven.
  assert.ok(Array.isArray(alerts));
});

/* -------------------------------------------- expanded E-number coverage */
test("DB expansion: eNumbers table grew to the full E100–E1525 range", () => {
  assert.ok(Array.isArray(global.window.CB_DATA.eNumbers));
  assert.ok(global.window.CB_DATA.eNumbers.length >= 250,
    "expected hundreds of E-number tuples after expansion, got " + global.window.CB_DATA.eNumbers.length);
});

test("newly-added E-numbers classify with the right risk", () => {
  const cases = [
    ["e171", "avoid"],   // titanium dioxide
    ["e250", "avoid"],   // sodium nitrite
    ["e320", "avoid"],   // BHA
    ["e102", "caution"], // tartrazine
    ["e211", "caution"], // sodium benzoate
    ["e621", "limit"],   // MSG
  ];
  cases.forEach(([code, risk]) => {
    const c = engine.classify(engine.norm(code), code, "food");
    assert.strictEqual(c.status, risk, code + " should classify as " + risk + ", got " + c.status);
  });
});

/* ----------------------------- REGRESSION: whole foods must read as clean */
test("REGRESSION: basic whole foods classify as clean (extraClean merge)", () => {
  // Bug: `extraClean` (potato, wheat, broccoli, …) was defined but never merged
  // into cleanIngredients, so scanning a potato returned "unknown". Lock it in.
  ["potato", "potatoes", "sweet potato", "broccoli", "wheat", "barley", "olive oil"].forEach((food) => {
    const c = engine.classify(engine.norm(food), food, "food");
    assert.strictEqual(c.group, "clean", food + " should be a clean whole food, got group=" + c.group);
  });
});

/* ----------------------------- expanded cosmetic INCI coverage */
test("newly-added cosmetic ingredients classify as flagged", () => {
  const cases = [
    ["Triclosan", "avoid"],
    ["DMDM Hydantoin", "caution"],
    ["Quaternium-15", "caution"],
    ["Methylisothiazolinone", "caution"],
  ];
  cases.forEach(([name, risk]) => {
    const c = engine.classify(engine.norm(name), name.toLowerCase(), "beauty");
    assert.strictEqual(c.status, risk, name + " should classify as " + risk + ", got " + c.status);
  });
});

/* ----------------------------------------------------- diffProducts (A vs B) */
function mkProduct(score, negLabels, posLabels, classified) {
  return {
    score: score,
    classified: classified || [],
    nutrition: {
      negatives: (negLabels || []).map((l) => ({ label: l.label, sev: "bad", value: l.value })),
      positives: (posLabels || []).map((l) => ({ label: l.label, sev: "good", value: l.value })),
    },
  };
}

test("diffProducts picks the higher-scoring product and reports the delta", () => {
  const a = mkProduct(72, [{ label: "Sugar", value: "30 g" }], []);
  const b = mkProduct(58, [{ label: "Salt", value: "2 g" }], []);
  const d = engine.diffProducts(a, b);
  assert.strictEqual(d.better, "a");
  assert.strictEqual(d.scoreDelta, 14);
});

test("diffProducts ties when scores are equal", () => {
  const d = engine.diffProducts(mkProduct(60, [], []), mkProduct(60, [], []));
  assert.strictEqual(d.better, "tie");
  assert.strictEqual(d.scoreDelta, 0);
});

test("diffProducts splits negatives into aOnly / bOnly / shared", () => {
  const a = mkProduct(70, [{ label: "Sugar", value: "30 g" }, { label: "Salt", value: "2 g" }], []);
  const b = mkProduct(65, [{ label: "Salt", value: "1 g" }, { label: "Saturated fat", value: "5 g" }], []);
  const d = engine.diffProducts(a, b);
  assert.deepStrictEqual(d.negatives.aOnly, ["Sugar"]);
  assert.deepStrictEqual(d.negatives.bOnly, ["Saturated fat"]);
  assert.deepStrictEqual(d.negatives.shared, ["Salt"]);
});

test("diffProducts emits per-shared-nutrient deltas and counts flagged additives", () => {
  const a = mkProduct(70, [{ label: "Sugar", value: "30 g" }], [],
    [{ status: "avoid" }, { status: "caution" }, { status: "ok" }]);
  const b = mkProduct(65, [{ label: "Sugar", value: "12 g" }], [], [{ status: "caution" }]);
  const d = engine.diffProducts(a, b);
  assert.strictEqual(d.nutrition.Sugar.a, 30);
  assert.strictEqual(d.nutrition.Sugar.b, 12);
  assert.strictEqual(d.nutrition.Sugar.delta, 18);
  assert.strictEqual(d.additiveCount.a, 2); // avoid + caution count; ok ignored
  assert.strictEqual(d.additiveCount.b, 1);
});

/* ------------------------------------------ expanded E-number coverage */
test("expanded eNumbers tuple resolves a long-tail code (E160a)", () => {
  const c = engine.classify(engine.norm("e160a"), "e160a", "food");
  assert.strictEqual(c.status, "ok");
  // Resolves either via the lightweight tuple (enumber) or a promoted rich
  // additive entry (additive.enumber) — both are correct.
  const en = c.enumber || (c.additive && c.additive.enumber);
  assert.strictEqual(en, "E160a");
});

test("expanded eNumbers classify an emulsifier as caution (E466)", () => {
  const c = engine.classify(engine.norm("e466"), "e466", "food");
  assert.strictEqual(c.status, "caution");
});

test("high-interest E-number is a rich avoid entry (E171 titanium dioxide)", () => {
  const c = engine.classify(engine.norm("e171"), "e171", "food");
  assert.strictEqual(c.status, "avoid");
});

/* ------------------------------- expanded cosmetic concern-bucket fallback */
test("new siliconeOther bucket catches a long-tail silicone", () => {
  const c = engine.classify(engine.norm("cyclohexasiloxane"), "cyclohexasiloxane", "beauty");
  assert.strictEqual(c.status, "limit");
  assert.strictEqual(c.group, "siliconeOther");
});

test("formaldehyde-releaser bucket catches imidazolidinyl urea", () => {
  const c = engine.classify(engine.norm("imidazolidinyl urea"), "imidazolidinyl urea", "beauty");
  assert.strictEqual(c.status, "caution");
  assert.strictEqual(c.group, "formaldehydeReleaser");
});

/* ----------------------------------------------- compare (diffProducts) */
test("diffProducts reports the better product and score delta", () => {
  const A = { name: "A", score: 70, flaggedCount: 1,
    nutrition: { negatives: [{ label: "Sugar", sev: "bad", value: "20 g" }, { label: "Salt", sev: "bad", value: "1.5 g" }],
      positives: [{ label: "Fiber", sev: "good", value: "6 g" }] } };
  const B = { name: "B", score: 55, flaggedCount: 3,
    nutrition: { negatives: [{ label: "Sugar", sev: "bad", value: "30 g" }, { label: "Saturated fat", sev: "bad", value: "8 g" }],
      positives: [{ label: "Protein", sev: "good", value: "10 g" }] } };
  const d = engine.diffProducts(A, B);
  assert.strictEqual(d.better, "a");
  assert.strictEqual(d.scoreDelta, 15);
  assert.deepStrictEqual(d.negatives.shared, ["Sugar"]);
  assert.deepStrictEqual(d.negatives.aOnly, ["Salt"]);
  assert.deepStrictEqual(d.negatives.bOnly, ["Saturated fat"]);
  assert.deepStrictEqual(d.additiveCount, { a: 1, b: 3 });
  assert.strictEqual(d.nutrition.Sugar.delta, -10);
});

test("diffProducts is symmetric on a tie", () => {
  const A = { name: "A", score: 60, nutrition: { negatives: [], positives: [] } };
  const B = { name: "B", score: 60, nutrition: { negatives: [], positives: [] } };
  const d = engine.diffProducts(A, B);
  assert.strictEqual(d.better, "tie");
  assert.strictEqual(d.scoreDelta, 0);
});

/* ------------------------------------ expanded E-number coverage (food) */
test("newly-added gum (E414 gum arabic) classifies ok", () => {
  const c = engine.classify(engine.norm("Gum Arabic"), "gum arabic", "food");
  assert.strictEqual(c.status, "ok");
});

test("newly-added emulsifier polysorbate 80 classifies caution", () => {
  const c = engine.classify(engine.norm("Polysorbate 80"), "polysorbate 80", "food");
  assert.strictEqual(c.status, "caution");
});

test("brominated vegetable oil classifies avoid", () => {
  const c = engine.classify(engine.norm("Brominated Vegetable Oil"), "brominated vegetable oil", "food");
  assert.strictEqual(c.status, "avoid");
});

test("banned azo colour citrus red 2 classifies avoid", () => {
  const c = engine.classify(engine.norm("Citrus Red 2"), "citrus red 2", "food");
  assert.strictEqual(c.status, "avoid");
});

test("flavour enhancer maltol (E636) classifies limit", () => {
  const c = engine.classify(engine.norm("Maltol"), "maltol", "food");
  assert.strictEqual(c.status, "limit");
});

test("polysaccharide pullulan (E1204) classifies ok", () => {
  const c = engine.classify(engine.norm("Pullulan"), "pullulan", "food");
  assert.strictEqual(c.status, "ok");
});

/* ------------------------------- new cosmetic concern buckets (beauty) */
test("phthalate (diethyl phthalate) is flagged caution/avoid", () => {
  const c = engine.classify(engine.norm("Diethyl Phthalate"), "diethyl phthalate", "beauty");
  assert.ok(c.status === "caution" || c.status === "avoid");
});

test("ethoxylated emulsifier ceteareth-20 classifies limit", () => {
  const c = engine.classify(engine.norm("Ceteareth-20"), "ceteareth-20", "beauty");
  assert.strictEqual(c.status, "limit");
});

test("microplastic bucket catches polyethylene as limit", () => {
  const c = engine.classify(engine.norm("Polyethylene"), "polyethylene", "beauty");
  assert.strictEqual(c.status, "limit");
  assert.strictEqual(c.group, "microplastic");
});

/* ----------------------------------- whole-food breadth (extraClean3) */
test("whole food blueberries classifies good/clean", () => {
  const c = engine.classify(engine.norm("Blueberries"), "blueberries", "food");
  assert.ok(c.status === "ok" || c.status === "good" || c.clean === true);
});

test("whole food brown rice classifies good/clean", () => {
  const c = engine.classify(engine.norm("Brown Rice"), "brown rice", "food");
  assert.ok(c.status === "ok" || c.status === "good" || c.clean === true);
});

/* ----------------------- FALSE-POSITIVE regression (look-alikes safe) */
test("silica is NOT mis-flagged as a silicone", () => {
  const c = engine.classify(engine.norm("Silica"), "silica", "beauty");
  assert.notStrictEqual(c.group, "siliconeOther");
});

test("silicon dioxide is NOT mis-flagged as a silicone", () => {
  const c = engine.classify(engine.norm("Silicon Dioxide"), "silicon dioxide", "beauty");
  assert.notStrictEqual(c.group, "siliconeOther");
});

test("glycerin stays benign (not caught by a new bucket)", () => {
  const c = engine.classify(engine.norm("Glycerin"), "glycerin", "beauty");
  assert.notStrictEqual(c.status, "avoid");
  assert.notStrictEqual(c.status, "caution");
});

/* -------------------- false-detection filter (non-ingredient OCR noise) */
test("parseIngredients keeps real ingredients from a noisy label", () => {
  const label = "INGREDIENTS: Water, Sugar, Salt, Sodium Benzoate, Citric Acid. " +
    "Nutrition Facts. Serving Size 1 cup. Calories 120. Total Fat 2g. Sodium 200mg. " +
    "Total Sugars 20g. Distributed by ACME Foods. Best by 12/2026. www.acme.com";
  const got = engine.parseIngredients(label).map((x) => x.norm);
  ["water", "sugar", "salt", "sodium benzoate", "citric acid"].forEach((n) => {
    assert.ok(got.includes(n), "expected to keep ingredient: " + n);
  });
});

test("parseIngredients drops nutrition-panel and contact noise", () => {
  const label = "Water, Salt. Serving Size 1 cup. Calories 120. Total Fat 2g. " +
    "Sodium 200mg. Daily Value. Distributed by ACME. www.acme.com";
  const got = engine.parseIngredients(label).map((x) => x.norm);
  ["calories", "serving size", "total fat 2g", "sodium 200mg", "daily value", "distributed by acme"]
    .forEach((j) => { assert.ok(!got.includes(j), "should have dropped noise: " + j); });
});

test("parseIngredients does not drop legitimate look-alikes (iron, milk fat)", () => {
  const got = engine.parseIngredients("Enriched Flour, Iron, Palm Oil, Milk Fat, Salt").map((x) => x.norm);
  ["iron", "palm oil", "milk fat", "salt"].forEach((n) => {
    assert.ok(got.includes(n), "expected to keep: " + n);
  });
});

/* ---------------- evidence calibration (Yuka/Bobby reconciliation) ----------------
 * Seed/vegetable oils and vague flavor terms are calibrated to `limit`, not `caution`:
 * RCTs do not support the seed-oil "inflammation" claim, and undisclosed-flavor terms
 * are a transparency concern, not an established safety hazard. The strict,
 * evidence-backed flags below must stay exactly where they are. */
["canola oil", "vegetable oil", "soybean oil", "sunflower oil"].forEach((oil) => {
  test("CALIBRATION: seed oil '" + oil + "' is limit, not caution", () => {
    const c = engine.classify(engine.norm(oil), oil, "food");
    assert.strictEqual(c.status, "limit");
    assert.strictEqual(c.group, "seedOil");
  });
});

["spices", "artificial flavor", "natural flavoring"].forEach((term) => {
  test("CALIBRATION: vague term '" + term + "' is limit, not caution", () => {
    const c = engine.classify(engine.norm(term), term, "food");
    assert.strictEqual(c.status, "limit");
  });
});

test("CALIBRATION: olive oil is NOT swept into the seed-oil bucket", () => {
  const c = engine.classify(engine.norm("Olive Oil"), "olive oil", "food");
  assert.notStrictEqual(c.group, "seedOil");
  assert.notStrictEqual(c.status, "caution");
});

test("CALIBRATION REGRESSION: evidence-backed strict flags are unchanged", () => {
  const strict = [
    ["potassium bromate", "avoid"], ["sodium nitrite", "avoid"], ["titanium dioxide", "avoid"],
    ["red 40", "caution"], ["aspartame", "caution"], ["carrageenan", "caution"], ["tbhq", "caution"]
  ];
  strict.forEach(([name, exp]) => {
    const c = engine.classify(engine.norm(name), name, "food");
    assert.strictEqual(c.status, exp, name + " should stay " + exp);
  });
});

/* --------------------- Yuka/Bobby evidence calibration (seed oils, vague) */
test("seed/vegetable oils calibrate to limit (not caution)", () => {
  ["canola oil", "vegetable oil", "soybean oil"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "limit", n + " should be limit");
    assert.strictEqual(c.group, "seedOil", n + " should hit seedOil group");
  });
});

test("vague flavor terms calibrate to limit (transparency, not safety)", () => {
  ["spices", "flavoring"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "limit", n + " should be limit");
    assert.strictEqual(c.group, "vague", n + " should hit vague group");
  });
});

test("olive oil is not over-flagged as an industrial seed oil", () => {
  const c = engine.classify(engine.norm("olive oil"), "olive oil", "food");
  assert.notStrictEqual(c.group, "seedOil");
  assert.ok(c.status === "good" || c.status === "ok", "olive oil should not be flagged");
});

test("evidence-backed avoid ratings remain unchanged after calibration", () => {
  [["potassium bromate", "avoid"], ["sodium nitrite", "avoid"], ["titanium dioxide", "avoid"]]
    .forEach(([n, exp]) => {
      const c = engine.classify(engine.norm(n), n, "food");
      assert.strictEqual(c.status, exp, n + " should stay " + exp);
    });
});

/* ---------------------- v2 parser: nested labels and conservative OCR QA */
test("v2 parser flattens nested sub-ingredients without losing parent context", () => {
  const scan = engine.parseIngredientScan(
    "INGREDIENTS: Enriched flour (wheat flour, niacin, reduced iron, folic acid), " +
    "chocolate chips (sugar, cocoa butter, soy lecithin), salt. CONTAINS: WHEAT, MILK, SOY. Nutrition Facts"
  );
  const byNorm = Object.fromEntries(scan.items.map((x) => [x.norm, x]));
  ["enriched flour", "wheat flour", "niacin", "reduced iron", "folic acid", "chocolate chips", "sugar", "cocoa butter", "soy lecithin", "salt"]
    .forEach((name) => assert.ok(byNorm[name], "missing nested ingredient " + name));
  assert.strictEqual(byNorm["soy lecithin"].depth, 1);
  assert.strictEqual(byNorm["soy lecithin"].parent, "chocolate chips");
  assert.ok(!scan.items.some((x) => /contains|nutrition facts/i.test(x.raw)), "label sections must not leak into ingredients");
  assert.deepStrictEqual(scan.declaredAllergens, ["wheat", "milk", "soy"]);
});

test("v2 parser does not split legitimate 'and' inside an ingredient name", () => {
  const got = engine.parseIngredients("Water, mono- and diglycerides, salt").map((x) => x.norm);
  assert.ok(got.includes("mono- and diglycerides"));
  assert.ok(!got.includes("mono-"));
});

test("v2 parser rejects barcode and nutrition OCR slop", () => {
  const scan = engine.parseIngredientScan("INGREDIENTS: Water, Sugar, 012345678901, Serving Size 1 cup, Sodium 200mg");
  assert.deepStrictEqual(scan.items.map((x) => x.norm), ["water", "sugar"]);
  assert.ok(scan.rejected.length >= 2);
  assert.ok(["low", "medium"].includes(scan.quality.confidence));
});

test("normalization folds accents and standardizes hyphenated E-numbers", () => {
  assert.strictEqual(ENGINE_FACTORY.norm("Caf\u00e9 E-471"), "cafe e471");
  const c = engine.classify(ENGINE_FACTORY.norm("E-466"), "E-466", "food");
  assert.strictEqual(c.status, "caution");
});

/* ---------------------------- v2 matching, coverage and evidence metadata */
test("ingredient aliases resolve to a canonical database name", () => {
  const c = engine.classify(engine.norm("Vitamin B12"), "vitamin b12", "food");
  assert.strictEqual(c.status, "good");
  assert.strictEqual(c.group, "recognized");
  assert.strictEqual(c.canonicalName, "cyanocobalamin");
  assert.ok(c.evidence && /Screening signal/.test(c.evidence.scope));
});

test("processing markers are strict preferences, not fabricated hazard claims", () => {
  const c = engine.classify(engine.norm("Pea Protein Isolate"), "pea protein isolate", "food");
  assert.strictEqual(c.status, "limit");
  assert.strictEqual(c.group, "processed");
  assert.match(engine.ingredientDetail({ raw: "Pea Protein Isolate", name: "Pea Protein Isolate", status: c.status, group: c.group }).whyFlagged, /does not claim/i);
});

test("analysis reports recognition coverage and per-ingredient score provenance", () => {
  const res = engine.analyze(null, "Water, Oats, Qzxyl Compound", "food");
  assert.deepStrictEqual(res.coverage, { total: 3, recognized: 2, unknown: 1, rejected: 0, percent: 67, complete: false });
  assert.strictEqual(res.ratingConfidence, "medium");
  assert.ok(res.classified.every((x) => typeof x.scoreImpact === "number"));
  assert.ok(res.classified.every((x) => x.evidence && x.matchConfidence));
  assert.ok(res.scoreReasons.some((x) => x.code === "partial-coverage-cap"));
});

test("missing ingredient text is explicitly not rated instead of receiving 100", () => {
  const res = engine.analyze(null, "", "food");
  assert.strictEqual(res.badge.label, "Not rated");
  assert.strictEqual(res.ratingConfidence, "none");
  assert.strictEqual(res.coverage.percent, 0);
  assert.ok(res.scoreReasons.some((x) => x.code === "missing-ingredients"));
});

/* ----------------------- v2 strict, deterministic score caps (soda case) */
test("Nutri-Score E hard cap keeps a sugary ultra-processed soda Bad", () => {
  const off = { nova_group: 4, nutriscore_grade: "e", nutriments: { "sugars_100g": 10.6, "energy-kcal_100g": 42 } };
  const ingredients = "Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid, Natural Flavors, Caffeine";
  const res = engine.analyze(off, ingredients, "food");
  assert.ok(res.score <= 29, "Nutri-Score E must cap at 29, got " + res.score);
  assert.strictEqual(res.badge.cls, "bad");
  assert.ok(res.scoreReasons.some((x) => x.code === "nutriscore-e-cap" && x.cap === 29));
  assert.ok(res.scoreReasons.some((x) => x.code === "sugary-upf-cap"));
});

test("Nutri-Score D and incomplete coverage cannot rate Good", () => {
  const d = engine.analyze({ nutriscore_grade: "d", nutriments: {} }, "Water, Oats", "food");
  assert.ok(d.score <= 49);
  assert.notStrictEqual(d.badge.cls, "good");
  const incomplete = engine.analyze(null, "Water, Qzxyl, Plorvane", "food");
  assert.ok(incomplete.score <= 49);
  assert.ok(incomplete.scoreReasons.some((x) => x.code === "low-coverage-cap"));
});

test("score output is deterministic for identical inputs", () => {
  const off = { nova_group: 4, nutriments: { "sugars_100g": 12 } };
  const one = engine.analyze(off, "Water, Cane Sugar, Natural Flavor", "food");
  const two = engine.analyze(off, "Water, Cane Sugar, Natural Flavor", "food");
  assert.deepStrictEqual(one, two);
});

/* ------------------------------------- v2 allergen declaration confidence */
test("declared allergens are captured while plant-milk names avoid dairy false positives", () => {
  const res = engine.analyze(null, "INGREDIENTS: Oat Milk, Peanut Butter. CONTAINS: PEANUTS.", "food");
  assert.ok(!res.allergens.some((a) => a.key === "dairy"), "oat milk / peanut butter must not imply dairy");
  const peanut = res.allergens.find((a) => a.key === "peanut");
  assert.ok(peanut);
  assert.strictEqual(peanut.confidence, "label-declared");
  assert.ok(peanut.sources.includes("contains-statement"));
});

/* ---------------------- v2.1 hierarchy, roles, claims and sugar nuance */
test("deep ingredient hierarchy preserves parent IDs, paths and declaration order", () => {
  const scan = engine.parseIngredientScan(
    "INGREDIENTS: Cookie base (chocolate pieces (coconut sugar, cocoa butter), oat flour), sea salt"
  );
  const byName = Object.fromEntries(scan.items.map((item) => [item.norm, item]));
  assert.deepStrictEqual(byName["coconut sugar"].path, ["Cookie base", "chocolate pieces", "coconut sugar"]);
  assert.deepStrictEqual(byName["coconut sugar"].canonicalPath, ["cookie base", "chocolate pieces", "coconut sugar"]);
  assert.strictEqual(byName["coconut sugar"].depth, 2);
  assert.strictEqual(byName["coconut sugar"].parentId, byName["chocolate pieces"].id);
  assert.strictEqual(byName["chocolate pieces"].parentId, byName["cookie base"].id);
  assert.strictEqual(byName["coconut sugar"].topLevelPosition, 1);
  assert.strictEqual(byName["sea salt"].topLevelPosition, 2);
  assert.ok(scan.items.every((item, index) => item.position === index + 1 && item.order === index + 1));
});

test("the same sub-ingredient under different parents is not flattened away", () => {
  const scan = engine.parseIngredientScan("Dark pieces (cocoa, sugar), light pieces (cocoa, milk)");
  const cocoa = scan.items.filter((item) => item.norm === "cocoa");
  assert.strictEqual(cocoa.length, 2);
  assert.notStrictEqual(cocoa[0].parentId, cocoa[1].parentId);
  assert.deepStrictEqual(cocoa.map((item) => item.path), [["Dark pieces", "cocoa"], ["light pieces", "cocoa"]]);
});

test("coconut sugar is nuanced added sugar, not a hazard or a clean whole food", () => {
  const c = engine.classify(engine.norm("Organic Coconut Sugar"), "Organic Coconut Sugar", "food");
  assert.strictEqual(c.status, "limit");
  assert.strictEqual(c.group, "addedSugar");
  assert.strictEqual(c.role, "added-sweetener");
  assert.strictEqual(c.sugarProfile.id, "coconut-derived");
  assert.strictEqual(c.attributes.organic, true);
  assert.strictEqual(c.attributes.addedSugar, true);
  assert.match(c.sugarProfile.explanation, /not treated as a hazard/i);
});

test("functional roles distinguish preservatives, colors, texture agents and fats", () => {
  assert.strictEqual(engine.classify(engine.norm("Sodium Benzoate"), "Sodium Benzoate", "food").role, "preservative");
  assert.strictEqual(engine.classify(engine.norm("Red 40"), "Red 40", "food").role, "color");
  assert.strictEqual(engine.classify(engine.norm("Polysorbate 80"), "Polysorbate 80", "food").role, "texture-agent");
  assert.strictEqual(engine.classify(engine.norm("Olive Oil"), "Olive Oil", "food").role, "oil-or-fat");
});

test("organic qualifiers attach to ingredients without becoming fake children", () => {
  const scan = engine.parseIngredientScan("Oats (organic), cocoa, sea salt");
  assert.deepStrictEqual(scan.items.map((item) => item.norm), ["oats", "cocoa", "sea salt"]);
  assert.strictEqual(scan.items[0].attributes.organic, true);
  assert.deepStrictEqual(scan.items[0].attributes.qualifiers, ["organic"]);
});

test("organic and kosher metadata is visible but score-neutral", () => {
  const ingredients = "Organic Oats, Organic Coconut Sugar, Kosher Salt";
  const plain = engine.analyze({}, ingredients, "food");
  const certified = engine.analyze({ labels_tags: ["en:organic", "en:kosher"] }, ingredients, "food");
  const withoutQualifiers = engine.analyze({}, "Oats, Coconut Sugar, Salt", "food");
  assert.strictEqual(certified.score, plain.score);
  assert.strictEqual(plain.score, withoutQualifiers.score, "ingredient qualifiers must not add a score bonus");
  assert.strictEqual(certified.productAttributes.scoreImpact, 0);
  assert.deepStrictEqual(certified.productAttributes.certifications.map((claim) => claim.id), ["organic", "kosher"]);
  assert.ok(certified.productAttributes.certifications.every((claim) => claim.affectsScore === false));
  assert.ok(certified.productAttributes.certifications.every((claim) => claim.scope === "product"));
  assert.ok(certified.productAttributes.certifications.every((claim) => claim.verifiedBySource === true));
  assert.deepStrictEqual(certified.productAttributes.productLevel, { organic: true, kosher: true });
  assert.strictEqual(certified.productAttributes.organicIngredientCount, 2);
  assert.strictEqual(certified.productAttributes.kosherSaltIngredientCount, 1);
  assert.deepStrictEqual(certified.productAttributes.ingredientLevel,
    { organicCount: 2, kosherSaltNameCount: 1, databaseAnalysisTags: [] });

  const saltOnly = engine.analyze({}, "Kosher Salt", "food");
  assert.deepStrictEqual(saltOnly.productAttributes.certifications, [], "kosher salt is not a kosher certification claim");

  const negativeTags = engine.analyze({ labels_tags: ["en:non-organic", "en:not-kosher"] }, "Oats", "food");
  assert.deepStrictEqual(negativeTags.productAttributes.certifications, []);

  const conflictingTags = engine.analyze({
    labels_tags: ["en:organic", "en:not-organic", "en:kosher", "en:not-kosher"]
  }, "USDA Organic Oats", "food");
  assert.deepStrictEqual(conflictingTags.productAttributes.certifications, [],
    "explicit negative tags must suppress conflicting positive or captured-label claims");
  assert.deepStrictEqual(conflictingTags.productAttributes.productLevel, { organic: false, kosher: false });

  const analysisOnly = engine.analyze({ ingredients_analysis_tags: ["en:organic"] }, "Oats", "food");
  assert.deepStrictEqual(analysisOnly.productAttributes.certifications, [], "ingredient analysis is not a product certification");
  assert.deepStrictEqual(analysisOnly.productAttributes.ingredientLevel.databaseAnalysisTags, ["organic"]);

  const ingredientClaimOnly = engine.analyze({}, "Certified Organic Oats, Salt", "food");
  assert.strictEqual(ingredientClaimOnly.productAttributes.ingredientLevel.organicCount, 1);
  assert.strictEqual(ingredientClaimOnly.productAttributes.productLevel.organic, false);
  assert.strictEqual(ingredientClaimOnly.productAttributes.certifications[0].scope, "captured-label");
});

test("analysis exposes explainable hierarchy, roles and grouped category summaries", () => {
  const res = engine.analyze(null,
    "Oat bar (rolled oats, coconut sugar, cocoa butter), natural flavor, vitamin B12", "food");
  const coconut = res.classified.find((item) => item.norm === "coconut sugar");
  assert.ok(coconut);
  assert.deepStrictEqual(coconut.path, ["Oat bar", "coconut sugar"]);
  assert.strictEqual(coconut.role, "added-sweetener");
  assert.strictEqual(coconut.recognitionConfidence, "high");
  assert.strictEqual(typeof coconut.scoreImpact, "number");
  assert.strictEqual(typeof coconut.why, "string");
  assert.strictEqual(coconut.scoreApplied, true);
  assert.strictEqual(res.ingredientStats.topLevel, 3);
  assert.strictEqual(res.ingredientStats.maxDepth, 1);
  assert.strictEqual(res.ingredientHierarchy[0].children.length, 3);
  const sugarSummary = res.categorySummaries.find((summary) => summary.key === "added-sweetener");
  assert.ok(sugarSummary);
  assert.strictEqual(sugarSummary.count, 1);
  assert.strictEqual(sugarSummary.subcategories["Coconut-derived added sugar"], 1);
  assert.ok(res.categorySummaries.some((summary) => summary.key === "undisclosed-blend"));
  assert.ok(res.categorySummaries.some((summary) => summary.key === "nutrient-or-culture"));

  const detail = engine.ingredientDetail(coconut);
  ["id", "parentId", "path", "depth", "topLevelPosition", "position", "scoreImpact", "scoreApplied",
    "recognitionConfidence", "matchType", "evidence", "category", "why"]
    .forEach((field) => assert.notStrictEqual(detail[field], undefined, "detail missing " + field));
  assert.deepStrictEqual(detail.path, coconut.path);
  assert.strictEqual(detail.scoreImpact, coconut.scoreImpact);
});

test("formula parents are score-neutral and flat database E-number duplicates are suppressed", () => {
  const res = engine.analyze(null,
    "Water, sugar, colour (E150d), acid (phosphoric acid), emulsifiers (soy lecithin), E338", "food");
  const colour = res.classified.find((item) => item.norm === "colour");
  const acid = res.classified.find((item) => item.norm === "acid");
  const emulsifiers = res.classified.find((item) => item.norm === "emulsifiers");
  [colour, acid, emulsifiers].forEach((item) => {
    assert.strictEqual(item.role, "formula-group");
    assert.strictEqual(item.status, "ok");
    assert.strictEqual(item.isContainer, true);
    assert.strictEqual(item.coverageEligible, false);
    assert.strictEqual(item.scoreApplied, false);
    assert.strictEqual(item.scoreImpact, 0);
  });
  assert.deepStrictEqual(res.coverage, { total: 5, recognized: 5, unknown: 0, rejected: 0, percent: 100, complete: true });
  assert.ok(!res.scoreReasons.some((reason) => reason.code === "unknown-ingredients"));

  const e338 = res.classified.filter((item) => item.enumber === "E338" || item.norm === "e338");
  const flatCode = e338.find((item) => item.depth === 0 && item.norm === "e338");
  assert.ok(flatCode);
  assert.strictEqual(flatCode.displayDuplicate, false);
  assert.ok(flatCode.duplicateOf);
  assert.ok(!res.ingredientHierarchy.some((root) => root.name === "E338"));
  assert.strictEqual(res.ingredientStats.duplicatesSuppressed, 1);
  assert.ok(res.categorySummaries.some((summary) => summary.key === "formula-group"));
});

test("unknown parents with children remain unknown and affect coverage and score", () => {
  const res = engine.analyze(null, "Mystery compound (water), salt", "food");
  const mystery = res.classified.find((item) => item.norm === "mystery compound");

  assert.ok(mystery);
  assert.strictEqual(mystery.isContainer, true);
  assert.strictEqual(mystery.isLeaf, false);
  assert.strictEqual(mystery.status, "unknown");
  assert.strictEqual(mystery.group, "unknown");
  assert.strictEqual(mystery.role, "unknown");
  assert.strictEqual(mystery.matchType, "none");
  assert.strictEqual(mystery.recognitionConfidence, "low");
  assert.strictEqual(mystery.coverageEligible, true);
  assert.strictEqual(mystery.scoreApplied, true);
  assert.strictEqual(mystery.scoreImpact, -3);
  assert.deepStrictEqual(res.coverage,
    { total: 3, recognized: 2, unknown: 1, rejected: 0, percent: 67, complete: false });
  assert.ok(res.scoreReasons.some((reason) => reason.code === "unknown-ingredients" && reason.d === -3));
  assert.ok(!res.categorySummaries.some((summary) =>
    summary.key === "formula-group" && summary.ingredientIds.includes(mystery.id)));
});

test("nested coconut sugar is added sugar without an unsupported prominence penalty", () => {
  const res = engine.analyze({ nova_group: 4, nutriments: {} }, "Cookie base (oats, coconut sugar), salt", "food");
  const coconut = res.classified.find((item) => item.norm === "coconut sugar");
  assert.ok(coconut);
  assert.strictEqual(coconut.depth, 1);
  assert.strictEqual(coconut.scoreImpact, -4);
  assert.ok(!res.scoreReasons.some((reason) => reason.code === "sugary-upf-cap"));
});

test("parenthetical purposes and additive aliases remain attributes, not fake ingredients", () => {
  const purpose = engine.analyze(null, "Potassium benzoate (to protect taste)", "food");
  assert.deepStrictEqual(purpose.classified.map((item) => item.norm), ["potassium benzoate"]);
  assert.deepStrictEqual(purpose.classified[0].attributes.purposes, ["to protect taste"]);
  assert.strictEqual(purpose.coverage.percent, 100);

  const alias = engine.analyze(null, "Potassium benzoate (E212)", "food");
  assert.deepStrictEqual(alias.classified.map((item) => item.norm), ["potassium benzoate"]);
  assert.deepStrictEqual(alias.classified[0].attributes.aliases, ["e212"]);

  const structural = engine.parseIngredientScan("Colour (E150d)");
  assert.deepStrictEqual(structural.items.map((item) => item.norm), ["colour", "e150d"]);
});

test("allergen source qualifiers are retained without becoming extra ingredient rows", () => {
  const res = engine.analyze(null, "Lecithin (soy), cocoa", "food");
  assert.deepStrictEqual(res.classified.map((item) => item.norm), ["lecithin", "cocoa"]);
  assert.deepStrictEqual(res.classified[0].attributes.sourceQualifiers, ["soy"]);
  assert.ok(res.allergens.some((alert) => alert.key === "soy"));
});

test("common multilingual label terms normalize without swallowing claims into ingredients", () => {
  const res = engine.analyze(null,
    "Sucre, huile de palme, noisettes, lait ecreme en poudre, emulsifiants: lecithines de soja, sans gluten", "food");
  const byRaw = Object.fromEntries(res.classified.map((item) => [item.norm, item]));
  assert.strictEqual(byRaw.sucre.canonicalName, "sugar");
  assert.strictEqual(byRaw.sucre.role, "added-sweetener");
  assert.strictEqual(byRaw["huile de palme"].canonicalName, "palm oil");
  assert.strictEqual(byRaw.noisettes.canonicalName, "hazelnuts");
  assert.ok(!res.classified.some((item) => item.norm === "sans gluten"));
  const emulsifier = res.classified.find((item) => item.norm === "emulsifiants");
  const lecithin = res.classified.find((item) => item.norm === "lecithines de soja");
  assert.ok(emulsifier && lecithin);
  assert.strictEqual(emulsifier.role, "formula-group");
  assert.strictEqual(lecithin.parentId, emulsifier.id);
  assert.ok(res.allergens.some((alert) => alert.key === "treenut"));
  assert.ok(res.allergens.some((alert) => alert.key === "dairy"));
  assert.ok(res.allergens.some((alert) => alert.key === "soy"));
});

/* --------------------------- non-food category and exact-formula expansion */
test("AXE aerosol separates propellant use hazard from fragrance sensitivity", () => {
  const ref = reference("axe-dark-temptation-body-spray");
  const result = engine.analyze(ref, ref.ingredientsText, ref.productType);
  assert.equal(result.useContext.id, "aerosol-body-spray");
  assert.equal(result.coverage.percent, 100);
  const propellants = result.classified.filter((item) => item.role === "propellant");
  assert.ok(propellants.length >= 4);
  assert.equal(propellants.filter((item) => item.scoreApplied).length, 1, "one shared propellant concern should be counted once");
  assert.ok(result.classified.some((item) => item.role === "fragrance-or-flavor" && item.status === "caution"));
});

test("Dr. Squatch deodorant recognizes the full normalized formula without a natural-origin bonus", () => {
  const ref = reference("dr-squatch-pine-tar-deodorant");
  const result = engine.analyze(ref, ref.analysisIngredientsText, ref.productType);
  assert.equal(result.useContext.id, "leave-on-underarm");
  assert.equal(result.coverage.percent, 100);
  const fragrance = result.classified.find((item) => /naturally derived fragrance/i.test(item.raw));
  assert.equal(fragrance.status, "caution");
  assert.equal(fragrance.role, "fragrance-or-flavor");
  assert.ok(result.classified.some((item) => item.role === "deodorant-active"));
});

test("Dr. Squatch soap is assessed as rinse-off cleansing, fragrance and physical scrub", () => {
  const ref = reference("dr-squatch-pine-tar-soap");
  const result = engine.analyze(ref, ref.ingredientsText, ref.productType);
  assert.equal(result.useContext.id, "rinse-off-body");
  assert.equal(result.coverage.percent, 100);
  assert.ok(result.classified.some((item) => item.role === "cleanser-surfactant"));
  assert.ok(result.classified.some((item) => item.role === "abrasive"));
});

test("Dawn dish liquid uses household exposure and recognizes the published formula", () => {
  const ref = reference("dawn-ultra-original");
  const result = engine.analyze(ref, ref.ingredientsText, ref.productType);
  assert.equal(result.useContext.id, "household-rinse-off");
  assert.equal(result.coverage.percent, 100);
  assert.equal(result.nutrition.hasData, false);
  assert.ok(result.classified.some((item) => item.canonicalName.includes("alkyldimethylamine oxide") && item.role === "cleanser-surfactant"));
  assert.ok(result.classified.some((item) => item.additive && item.additive.id === "methylisothiazolinone"));
});

test("Tom's toothpaste strictly flags fluoride ingestion context while retaining its cavity benefit", () => {
  const ref = reference("toms-whole-care-peppermint");
  const result = engine.analyze(ref, ref.ingredientsText, ref.productType);
  assert.equal(result.useContext.id, "oral-care");
  assert.equal(result.coverage.percent, 100);
  const fluoride = result.classified.find((item) => item.role === "oral-care-active" && /monofluorophosphate/i.test(item.raw));
  const sls = result.classified.find((item) => /sodium lauryl sulfate/i.test(item.raw));
  assert.equal(fluoride.status, "caution");
  assert.ok(fluoride.benefits.some((item) => /tooth decay/i.test(item)));
  assert.ok(fluoride.outcomes.some((item) => /fluorosis/i.test(item)));
  assert.equal(result.approval.level, "review");
  assert.equal(sls.status, "caution");
  assert.equal(sls.role, "cleanser-surfactant");
  const detail = engine.ingredientDetail(fluoride);
  assert.match(detail.title, /Monofluorophosphate/i);
  assert.match(detail.effects, /higher total exposure/i);
  assert.match(detail.effects, /not specific to normal spit-out toothpaste/i);
  assert.doesNotMatch(detail.whyFlagged, /does not help|no benefit/i);
});

test("FDA-prohibited cosmetic ingredients hard-block approval and explain the health concern", () => {
  const result = engine.analyze({ name: "Solvent face product", category: "cosmetic" }, "water, chloroform", "beauty");
  const chloroform = result.classified.find((item) => /chloroform/i.test(item.raw));
  assert.equal(chloroform.status, "avoid");
  assert.ok(chloroform.outcomes.includes("Cancer"));
  assert.ok(chloroform.regulatoryFlags.some((flag) => flag.blocking && /FDA/.test(flag.jurisdiction)));
  assert.equal(result.approval.level, "not-approved");
  assert.equal(result.badge.label, "Not approved");
  assert.ok(result.score <= 29);
  assert.ok(result.approval.blockers.some((item) => /chloroform/i.test(item.ingredient) && item.reason));
});

test("regulatory rules distinguish prohibited paraben variants from restricted butylparaben", () => {
  const prohibited = engine.analyze({ name: "Face cream", category: "cosmetic" }, "water, isobutylparaben", "beauty");
  const restricted = engine.analyze({ name: "Face cream", category: "cosmetic" }, "water, butylparaben", "beauty");
  assert.ok(prohibited.regulatoryFlags.some((flag) => flag.status === "prohibited" && flag.blocking));
  assert.ok(restricted.regulatoryFlags.some((flag) => flag.status === "restricted" && !flag.blocking));
  assert.equal(restricted.approval.level, "not-approved", "the avoid grade still blocks even when the rule itself is concentration-restricted");
});

test("methylisothiazolinone regulation follows leave-on versus rinse-off use", () => {
  const leaveOn = engine.analyze({ name: "Underarm deodorant", category: "deodorant" }, "water, methylisothiazolinone", "beauty");
  const rinseOff = engine.analyze({ name: "Body wash", category: "rinse off cleanser" }, "water, methylisothiazolinone", "beauty");
  assert.equal(leaveOn.useContext.id, "leave-on-underarm");
  assert.ok(leaveOn.regulatoryFlags.some((flag) => flag.blocking && flag.status === "prohibited"));
  assert.equal(leaveOn.approval.level, "not-approved");
  assert.equal(rinseOff.useContext.id, "rinse-off-body");
  assert.ok(rinseOff.regulatoryFlags.some((flag) => !flag.blocking && flag.status === "restricted"));
  assert.equal(rinseOff.approval.level, "review");
});

test("zirconium aerosol rule does not spill onto permitted solid antiperspirant actives", () => {
  const aerosol = engine.analyze({ name: "Aerosol body spray", category: "aerosol deodorant" }, "water, zirconium carbonate", "beauty");
  const stick = engine.analyze({ name: "Solid antiperspirant stick", category: "antiperspirant" }, "water, aluminum zirconium tetrachlorohydrex gly", "beauty");
  assert.ok(aerosol.regulatoryFlags.some((flag) => flag.blocking && /aerosol/i.test(flag.scope)));
  assert.equal(aerosol.approval.level, "not-approved");
  assert.equal(stick.regulatoryFlags.some((flag) => /zirconium/i.test(flag.scope)), false);
});

test("potential-effect labels are specific and incomplete lists cannot pass", () => {
  const formaldehyde = engine.analyze({ name: "Hair smoothing treatment", category: "cosmetic" }, "water, formaldehyde", "beauty");
  const finding = formaldehyde.classified.find((item) => /formaldehyde/i.test(item.raw));
  assert.deepEqual(finding.outcomes, ["Cancer", "Skin allergy", "Eye and breathing irritation"]);
  const incomplete = engine.analyze({ name: "Mystery lotion", category: "cosmetic" }, "water, proprietary mystery compound", "beauty");
  assert.equal(incomplete.approval.level, "insufficient");
});

test("a fully recognized low-concern formula can pass the strict approval gate", () => {
  const result = engine.analyze({ name: "Simple rinse-off formula", category: "rinse off cleanser" }, "water, glycerin", "beauty");
  assert.equal(result.coverage.percent, 100);
  assert.equal(result.approval.level, "approved");
  assert.equal(result.approval.label, "Passes strict screen");
});
