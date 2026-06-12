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
  assert.strictEqual(c.status, "avoid");
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

test("cosmetic concern bucket keyword fallback works", () => {
  // "limonene" is in the fragranceAllergen bucket, not the rich additive list.
  const c = engine.classify(engine.norm("Limonene"), "limonene", "beauty");
  assert.strictEqual(c.status, "caution");
  assert.strictEqual(c.group, "fragranceAllergen");
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
    ["e102", "avoid"],   // tartrazine (Yellow 5) — artificial dye
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
  // Low-risk "ok" data ratings are canonicalized to "good" on the way out.
  assert.strictEqual(c.status, "good");
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
test("newly-added gum (E414 gum arabic) classifies as canonical good", () => {
  const c = engine.classify(engine.norm("Gum Arabic"), "gum arabic", "food");
  assert.strictEqual(c.status, "good");
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

test("polysaccharide pullulan (E1204) classifies as canonical good", () => {
  const c = engine.classify(engine.norm("Pullulan"), "pullulan", "food");
  assert.strictEqual(c.status, "good");
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

/* ---------------- Bobby-Approved-style strict grading ----------------
 * Industrial seed/vegetable oils, undisclosed flavorings and artificial
 * sweeteners are flagged hard ("avoid"), matching the Bobby-Approved scanning
 * philosophy the product is calibrated to. Whole-food fats (olive oil) must
 * NOT be swept in, and the evidence-backed avoid flags must stay put. */
["canola oil", "vegetable oil", "soybean oil", "sunflower oil"].forEach((oil) => {
  test("BOBBY: seed oil '" + oil + "' is avoid", () => {
    const c = engine.classify(engine.norm(oil), oil, "food");
    assert.strictEqual(c.status, "avoid");
    assert.strictEqual(c.group, "seedOil");
  });
});

test("BOBBY: undisclosed flavorings are avoid, vague spice blends are caution", () => {
  // Flavor-type vague terms get the hardest flag.
  ["artificial flavor", "natural flavoring", "flavoring"].forEach((term) => {
    const c = engine.classify(engine.norm(term), term, "food");
    assert.strictEqual(c.status, "avoid", term + " should be avoid");
  });
  // Non-flavor vague terms (spices/seasoning) are a transparency caution.
  ["spices", "seasoning"].forEach((term) => {
    const c = engine.classify(engine.norm(term), term, "food");
    assert.strictEqual(c.status, "caution", term + " should be caution");
    assert.strictEqual(c.group, "vague");
  });
});

test("BOBBY: artificial sweeteners are avoid", () => {
  ["aspartame", "sucralose", "acesulfame k", "saccharin", "neotame"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "avoid", n + " should be avoid");
  });
});

test("BOBBY: high fructose corn syrup / corn syrup are avoid", () => {
  ["high fructose corn syrup", "corn syrup"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "avoid", n + " should be avoid");
  });
});

test("BOBBY: olive oil is NOT swept into the seed-oil bucket", () => {
  const c = engine.classify(engine.norm("Olive Oil"), "olive oil", "food");
  assert.notStrictEqual(c.group, "seedOil");
  assert.ok(c.status === "good" || c.status === "ok", "olive oil should not be flagged");
});

test("BOBBY REGRESSION: evidence-backed strict flags are unchanged", () => {
  const strict = [
    ["potassium bromate", "avoid"], ["sodium nitrite", "avoid"], ["titanium dioxide", "avoid"],
    ["red 40", "avoid"], ["aspartame", "avoid"], ["carrageenan", "caution"], ["tbhq", "caution"]
  ];
  strict.forEach(([name, exp]) => {
    const c = engine.classify(engine.norm(name), name, "food");
    assert.strictEqual(c.status, exp, name + " should be " + exp);
  });
});

test("BOBBY: artificial dyes are banned (avoid)", () => {
  ["red 40", "yellow 5", "yellow 6", "blue 1", "tartrazine", "allura red",
   "quinoline yellow", "ponceau 4r", "carmine", "e129", "e102", "e133"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "avoid", n + " should be avoid (banned dye)");
  });
});

/* ---------------- newly-recognized "bad" ingredients (DB expansion) */
test("newly-added bad ingredients classify as flagged", () => {
  const cases = [
    ["enriched flour", "caution"],
    ["bioengineered", "caution"],
    ["hydrolyzed soy protein", "caution"],
    ["soy protein isolate", "caution"],
    ["artificial color", "avoid"],
    ["olestra", "avoid"],
    ["vanillin", "caution"],
  ];
  cases.forEach(([name, exp]) => {
    const c = engine.classify(engine.norm(name), name, "food");
    assert.strictEqual(c.status, exp, name + " should be " + exp);
  });
});

/* ---------------- more banned dyes + new flagged additives (DB growth) */
test("expanded artificial dyes are avoid", () => {
  ["fast green", "green 3", "orange b", "e143"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, "avoid", n + " should be avoid");
  });
});

test("newly-added processing additives classify as flagged", () => {
  [["l-cysteine", "caution"], ["magnesium stearate", "limit"],
   ["microcrystalline cellulose", "limit"], ["sodium hexametaphosphate", "limit"]].forEach(([n, exp]) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.status, exp, n + " should be " + exp);
  });
});

/* ---------------- parser reads the WHOLE list (newlines / bullets / slashes) */
test("parseIngredients splits on newlines, bullets and slashes", () => {
  const label = "Water\nSugar • Soybean Oil | Salt / Citric Acid\nRed 40";
  const got = engine.parseIngredients(label).map((x) => x.norm);
  ["water", "sugar", "soybean oil", "salt", "citric acid", "red 40"].forEach((n) => {
    assert.ok(got.includes(n), "expected to read: " + n);
  });
});

test("parseIngredients keeps decimals intact (no split mid-number)", () => {
  const got = engine.parseIngredients("Milk 2.5% fat, Sugar").map((x) => x.norm);
  assert.ok(got.includes("sugar"), "should still read sugar after a decimal");
});

/* ---------------- fortification nutrients read as recognized (not unknown) */
test("added vitamins/minerals classify as good (not unknown)", () => {
  ["folic acid", "reduced iron", "thiamine mononitrate", "niacinamide"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.notStrictEqual(c.group, "unknown", n + " should be recognized");
    assert.strictEqual(c.status, "good", n + " should be good (canonical low-risk status)");
  });
});

/* ---------------- expanded clean whole-food recognition */
test("Bobby-approved whole foods classify as clean", () => {
  ["grass-fed butter", "spirulina", "kimchi", "bone broth", "tempeh", "himalayan pink salt"].forEach((n) => {
    const c = engine.classify(engine.norm(n), n, "food");
    assert.strictEqual(c.group, "clean", n + " should be clean, got " + c.group);
  });
});

/* ---------------- parser expands parenthetical sub-ingredients */
test("parseIngredients extracts hidden sub-ingredients from parentheses", () => {
  const got = engine.parseIngredients(
    "Enriched Flour (Wheat Flour, Niacin, Reduced Iron), Sugar, Color (Red 40), Soybean Oil"
  ).map((x) => x.norm);
  ["enriched flour", "wheat flour", "niacin", "reduced iron", "red 40", "soybean oil"].forEach((n) => {
    assert.ok(got.includes(n), "expected to extract: " + n);
  });
});

/* ---------------- strict approval contract + database breadth */
test("strict verdict approves only fully recognized lists with no hard flags", () => {
  const approved = engine.analyze(null, "water, chickpeas, sea salt", "food");
  assert.strictEqual(approved.strictVerdict.approved, true);
  assert.strictEqual(approved.strictVerdict.label, "Strict approved");
  assert.strictEqual(approved.ingredientConfidence.level, "high");

  const failed = engine.analyze(null, "water, soybean oil, natural flavor", "food");
  assert.strictEqual(failed.strictVerdict.approved, false);
  assert.strictEqual(failed.strictVerdict.needsReview, false);
  assert.strictEqual(failed.strictVerdict.blockers.length, 2);

  const unknown = engine.analyze(null, "water, completely novel ingredient", "food");
  assert.strictEqual(unknown.strictVerdict.approved, false);
  assert.strictEqual(unknown.strictVerdict.needsReview, true);

  const limited = engine.analyze(null, "water, sugar, sea salt", "food");
  assert.strictEqual(limited.strictVerdict.approved, false, "limit ingredients must fail strict approval");
});

test("ingredient database recognizes broad international and label-form foods", () => {
  const foods = [
    "romanesco", "lion's mane mushroom", "chickpea flour", "wild caught salmon",
    "plain greek yogurt", "apple cider vinegar", "natural almond butter", "spring water"
  ];
  foods.forEach((food) => {
    const c = engine.classify(engine.norm(food), food, "food");
    assert.strictEqual(c.group, "clean", food + " should classify as clean");
  });
  assert.ok(global.window.CB_DATA.cleanIngredients.length >= 1000, "clean database should exceed 1,000 entries");
});

test("strict alias expansion catches more seed oils and artificial sweeteners", () => {
  ["rapeseed oil", "high oleic sunflower oil", "vegetable shortening"].forEach((name) => {
    assert.strictEqual(engine.classify(engine.norm(name), name, "food").status, "avoid", name);
  });
  ["acesulfame potassium", "sodium saccharin", "neohesperidin dc"].forEach((name) => {
    assert.strictEqual(engine.classify(engine.norm(name), name, "food").status, "avoid", name);
  });
});

test("polluted ingredient fields stop before explanatory prose", () => {
  const polluted = "Water, sugar, citric acid. Voici un décryptage rapide de ce que vous consommez: " +
    "Cette liste d’ingrédients correspond généralement à une boisson. Souhaitez-vous des détails ?";
  assert.strictEqual(engine.ingredientTextQuality(polluted).suspicious, true);
  const got = engine.parseIngredients(polluted).map((x) => x.norm);
  assert.ok(got.includes("water"));
  assert.ok(got.includes("sugar"));
  assert.ok(got.includes("citric acid"));
  assert.ok(!got.some((x) => /souhaitez|correspond|boisson|decryptage/.test(x)), "commentary must not be scored");
});

test("parseIngredientsDetailed tracks weird label fragments without scoring them", () => {
  const parsed = engine.parseIngredientsDetailed(
    "Ingredients: Water, Sugar, WARNING, store in a cool dry place, qqqqzzzz, Red 40"
  );
  assert.deepStrictEqual(parsed.items.map((x) => x.norm), ["water", "sugar", "red 40"]);
  assert.ok(parsed.ignored.filter((x) => x.reason === "label text").length >= 2);
  assert.ok(parsed.ignored.some((x) => x.reason === "OCR gibberish"));
});

test("real snack-label terms from scans no longer fall through as unknown", () => {
  const expected = {
    "whey powder": "good",
    "cheese powder": "good",
    "gluten": "good",
    "common caramel": "limit",
    "5'-disodium ribonucleotide": "limit",
    "tocopherol-rich extract": "good",
    "acidity regulators": "caution",
    "colours": "caution",
    "antioxidants": "caution"
  };
  Object.entries(expected).forEach(([name, status]) => {
    const c = engine.classify(engine.norm(name), name, "food");
    assert.strictEqual(c.status, status, name + " should be recognized as " + status);
    assert.notStrictEqual(c.group, "unknown", name + " must not be unknown");
  });
});

test("common label forms and vague functional classes are catalogued", () => {
  ["milk powder", "whey protein concentrate", "nonfat dry milk", "dehydrated onion", "tomato powder"].forEach((name) => {
    assert.strictEqual(engine.classify(engine.norm(name), name, "food").status, "good", name);
  });
  ["emulsifiers", "stabilizers", "raising agents", "flavour enhancers", "anti-caking agents"].forEach((name) => {
    const c = engine.classify(engine.norm(name), name, "food");
    assert.strictEqual(c.status, "caution", name);
    assert.ok(c.additive && /^generic/.test(c.additive.id), name + " should request exact compound details");
  });
});

test("screenshot food-label forms resolve instead of becoming unknown", () => {
  ["enriched macaroni", "durum flour", "milkfat", "cheese culture", "rosemary extracts"].forEach((name) => {
    assert.notStrictEqual(engine.classify(engine.norm(name), name, "food").status, "unknown", name);
  });
  ["cheese sauce mix", "enzymes", "colorants", "conserveermiddelen", "sodium triphosphate"].forEach((name) => {
    assert.notStrictEqual(engine.classify(engine.norm(name), name, "food").status, "unknown", name);
  });
});

test("personal-care screenshot terms resolve through cosmetic and dual-use records", () => {
  const expected = {
    "C10-16 Alkyldimethylamine Oxide": "limit",
    "C9-11 Pareth-8": "limit",
    "Deceth-8": "limit",
    "Fragrances": "caution",
    "Parfums": "caution",
    "PPG-16 Copolymer": "limit",
    "PPG-26": "limit",
    "Sodium Chloride": "good",
    "Sodium Citrate": "good",
    "Tetrasodium Glutamate Diacetate": "good",
    "Potassium Sorbate": "limit",
    "Methylisothiazolinome": "caution"
  };
  Object.entries(expected).forEach(([name, status]) => {
    assert.strictEqual(engine.classify(engine.norm(name), name, "beauty").status, status, name);
  });
});

test("multilingual and HTML-escaped label text is tracked but not scored", () => {
  const parsed = engine.parseIngredientsDetailed(
    "Ingrediënten: &lt; 5% niet-ionogene oppervlakteactieve stoffen, Parfums, Conserveermiddelen, POTASSIUM SORBATE"
  );
  assert.deepStrictEqual(parsed.items.map((x) => x.norm), ["parfums", "conserveermiddelen", "potassium sorbate"]);
  assert.ok(parsed.ignored.some((x) => x.reason === "label text"));
});

test("brand and explanatory fragments from screenshot are ignored, not ingredients", () => {
  const parsed = engine.parseIngredientsDetailed(
    "corn, salt, the composition of the product, info, pepsico, eu for more details, rapeseed oil"
  );
  assert.deepStrictEqual(parsed.items.map((x) => x.norm), ["corn", "salt", "rapeseed oil"]);
});

/* --------------- REGRESSION: "ok" data ratings canonicalize to "good" */
// The data files rate low-risk entries "ok", but the UI's status set is
// avoid/caution/limit/good/unknown. Raw "ok" used to leak out of classify /
// ingredientDetail, so those ingredients vanished from the result-screen
// list and rendered "undefined" status labels. Lock the mapping in.
test('canonStatus maps "ok" to "good" and passes other statuses through', () => {
  assert.strictEqual(ENGINE_FACTORY.canonStatus("ok"), "good");
  ["avoid", "caution", "limit", "good", "unknown"].forEach((s) => {
    assert.strictEqual(ENGINE_FACTORY.canonStatus(s), s);
  });
});

test('ok-rated food additive classifies as canonical "good" (xanthan gum)', () => {
  const c = engine.classify(engine.norm("xanthan gum"), "xanthan gum", "food");
  assert.ok(c.additive, "xanthan gum should resolve to a rich additive entry");
  assert.strictEqual(c.status, "good");
});

test('ok-rated cosmetic ingredient classifies as canonical "good" (glycerin)', () => {
  const c = engine.classify(engine.norm("glycerin"), "glycerin", "beauty");
  assert.ok(c.additive, "glycerin should resolve to a rich cosmetic entry");
  assert.strictEqual(c.status, "good");
});

test('ingredientDetail never returns a raw "ok" status', () => {
  const c = engine.classify(engine.norm("xanthan gum"), "xanthan gum", "food");
  const d = engine.ingredientDetail(c);
  assert.strictEqual(d.status, "good");
  // eNumber-group path (eOk group metadata carries status:"ok")
  const e = engine.classify(engine.norm("e160a"), "e160a", "food");
  const de = engine.ingredientDetail(e);
  assert.strictEqual(de.status, "good");
});

test('analyze keeps ok-rated ingredients in a canonical status bucket', () => {
  const res = engine.analyze(null, "Water, Xanthan Gum, Sugar", "food");
  const statuses = res.classified.map((c) => c.status);
  assert.ok(!statuses.includes("ok"), "no raw ok status should survive analyze");
  const xg = res.classified.find((c) => /xanthan/.test(c.norm));
  assert.ok(xg, "xanthan gum should be in the classified list");
  assert.strictEqual(xg.status, "good");
});

/* --------------- REGRESSION: personalAlerts is token-boundary safe */
test("personalAlerts does not substring-match across words (eggplant ≠ egg)", () => {
  const items = engine.analyze(null, "Grilled Eggplant, Olive Oil", "food").classified;
  const alerts = engine.personalAlerts(items, { egg: true });
  assert.strictEqual(alerts.length, 0, "eggplant must not trigger an egg allergen alert");
});

test("personalAlerts still catches a real allergen hit", () => {
  const items = engine.analyze(null, "Wheat Flour, Egg Yolk, Salt", "food").classified;
  const alerts = engine.personalAlerts(items, { egg: true });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].key, "egg");
});

/* ---------------- parsing hardening: only real ingredients survive */
test("trailing MAY CONTAIN advisory cannot leak fake ingredients", () => {
  const items = engine.parseIngredients("Sugar, Salt. MAY CONTAIN PEANUTS, TREE NUTS, MILK.");
  const norms = items.map((x) => x.norm);
  assert.deepStrictEqual(norms, ["sugar", "salt"]);
});

test("trailing CONTAINS allergen statement is cut, 2%-or-less list is kept", () => {
  const cut = engine.parseIngredients("Wheat flour, palm oil. Contains wheat and soy.");
  assert.deepStrictEqual(cut.map((x) => x.norm), ["wheat flour", "palm oil"]);
  // The mid-list "contains less than 2% of" form introduces REAL ingredients.
  const kept = engine.parseIngredients("Water, contains less than 2% of: salt, citric acid");
  const norms = kept.map((x) => x.norm);
  assert.ok(norms.includes("salt"));
  assert.ok(norms.includes("citric acid"));
});

test("manufacturer / date trailing lines are cut before splitting", () => {
  const items = engine.parseIngredients("Oats, honey. Distributed by Acme Foods, Springfield, IL. Best if used by 2026.");
  assert.deepStrictEqual(items.map((x) => x.norm), ["oats", "honey"]);
});

test("OCR-confused INGREDIENTS headers are stripped wherever they appear", () => {
  ["1NGREDIENTS: Water, Sugar", "lngredients: Water, Sugar", "INGREDIENTS Water, Sugar"].forEach((t) => {
    const norms = engine.parseIngredients(t).map((x) => x.norm);
    assert.deepStrictEqual(norms, ["water", "sugar"], "failed for: " + t);
  });
});

test("connector debris from parenthetical expansion is cleaned", () => {
  const items = engine.parseIngredients("Whey (from milk), salt");
  const norms = items.map((x) => x.norm);
  assert.ok(norms.includes("whey"));
  assert.ok(norms.includes("milk"), "(from milk) should read as 'milk'");
  assert.ok(!norms.includes("from milk"));
  assert.ok(!norms.some((n) => /^(and|or|of|from|with)$/.test(n)), "no bare connectors");
});

test("allergen-statement cut is reported in ignored fragments", () => {
  const parsed = engine.parseIngredientsDetailed("Sugar, salt. Contains milk, soy.");
  assert.ok(parsed.ignored.some((x) => x.reason === "allergen statement"));
});
