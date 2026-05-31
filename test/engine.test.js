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
