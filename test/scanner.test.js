const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScannerHelpers() {
  const root = path.resolve(__dirname, "..");
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame() {},
    fetch() { throw new Error("network is disabled in scanner unit tests"); },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() { return {}; },
      head: { appendChild() {} },
      body: { className: "" }
    },
    navigator: {},
    location: { href: "http://localhost/" }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ["data-additives.js", "data-cosmetics.js", "engine.js", "app.js"].forEach((file) => {
    const source = fs.readFileSync(path.join(root, "www", file), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  });
  return sandbox.NUTRICHECK_SCANNER_TEST;
}

const scanner = loadScannerHelpers();

test("normalizes valid GTINs and rejects bad check digits", () => {
  assert.equal(scanner.normalizeBarcode("barcode: 5449 0000 0099 6"), "5449000000996");
  assert.equal(scanner.normalizeBarcode("５４４９００００００９９６"), "5449000000996");
  assert.equal(scanner.normalizeBarcode("5449000000997"), null);
  assert.equal(scanner.normalizeBarcode("123456"), null);
});

test("exact-product reference search includes named personal-care and household formulas", () => {
  const squatch = scanner.referenceSearchResults("dr squatch pine tar");
  const dawn = scanner.referenceSearchResults("dawn powerwash");
  const toms = scanner.referenceSearchResults("toms toothpaste");
  assert.ok(squatch.some((item) => item.name === "Pine Tar Deodorant"));
  assert.ok(dawn.some((item) => item.brand === "Dawn" && item.useContext === "household-spray"));
  assert.ok(toms.some((item) => item.brand === "Tom's of Maine"));
  assert.ok(squatch.every((item) => item.formulaSourceUrl && item.formulaNote));
});

test("known barcode fallback is exact and does not guess formulas brand-wide", () => {
  const axe = scanner.referenceForBarcode("079400523365");
  const unknown = scanner.referenceForBarcode("012345678905");
  assert.equal(axe.id, "axe-dark-temptation-body-spray");
  assert.equal(unknown, null);
  const off = scanner.referenceProductOff(axe, "079400523365");
  assert.equal(off.ingredientCoveragePct, 100);
  assert.match(off.formulaNote, /package label wins/i);
});

test("accepts a live scan only after stable repeated detections", () => {
  const oneHit = scanner.selectConsensusCandidate([{ code: "5449000000996", at: 1000 }], 2, 2200, 1200);
  assert.equal(oneHit, null);

  const stable = scanner.selectConsensusCandidate([
    { code: "5449000000996", at: 1000 },
    { code: "5449000000996", at: 1120 },
    { code: "5449000000997", at: 1140 }
  ], 2, 2200, 1200);
  assert.equal(stable.code, "5449000000996");
  assert.equal(stable.hits, 2);
});

test("generates UPC/EAN lookup aliases without invalid variants", () => {
  const variants = Array.from(scanner.barcodeLookupVariants("049000028911"));
  assert.deepEqual(variants, ["049000028911", "0049000028911"]);
});

test("isolates ingredient OCR text and drops package noise", () => {
  const result = scanner.extractIngredientText(
    "INGREDIENTS: Carbonated water, sugar, colour (E150d), phosphoric acid (E338).\nNutrition Facts\nCalories 42\n5449000000996",
    98
  );
  assert.match(result.text, /Carbonated water, sugar/);
  assert.match(result.text, /E150d/);
  assert.doesNotMatch(result.text, /Nutrition Facts|Calories|5449000000996/);
  assert.equal(result.markerFound, true);
  assert.equal(result.boundaryFound, true);
});

test("adds structured subingredients for analysis without rewriting the raw label", () => {
  const raw = "Carbonated water, sugar";
  const analysis = scanner.buildAnalysisIngredients(raw, [
    { text: "colour", ingredients: [{ text: "E150d" }] },
    { text: "acid", ingredients: [{ text: "E338" }] }
  ], ["en:e150d", "en:e338"]);
  assert.equal(raw, "Carbonated water, sugar");
  assert.match(analysis, /E150d/);
  assert.match(analysis, /E338/);
});

test("does not append E-number roots already represented by structured ingredient ids", () => {
  const raw = "Carbonated water, sugar, colour (caramel e150d), acid (phosphoric acid)";
  const analysis = scanner.buildAnalysisIngredients(raw, [
    { id: "en:colour", text: "colour", ingredients: [{ id: "en:e150d", text: "caramel e150d" }] },
    { id: "en:acid", text: "acid", ingredients: [{ id: "en:e338", text: "phosphoric acid" }] }
  ], ["en:e150d", "en:e338"]);
  assert.equal(analysis, raw);
  assert.equal((analysis.match(/e338/gi) || []).length, 0);
  assert.equal((analysis.match(/e150d/gi) || []).length, 1);
});

test("preserves sourced product claims and keeps organic coconut sugar nuanced", () => {
  const mapped = scanner.mapOff({
    code: "012345678905",
    product_type: "food",
    product_name: "Coconut cacao bites",
    ingredients_text: "Organic coconut sugar, cocoa",
    ingredients_n: 2,
    known_ingredients_n: 2,
    labels: "Organic, Kosher",
    labels_tags: ["en:organic", "en:kosher"],
    ingredients_analysis_tags: ["en:palm-oil-free"],
    nutriments: { "sugars_100g": 12 }
  }, "012345678905");
  const product = scanner.buildProduct(mapped);
  assert.deepEqual(Array.from(product.labels_tags), ["en:organic", "en:kosher"]);
  assert.equal(product.productAttributes.scoreImpact, 0);
  assert.deepEqual(Array.from(product.productAttributes.certifications, (claim) => claim.id).sort(), ["kosher", "organic"]);
  const coconutSugar = product.classified.find((item) => /coconut sugar/i.test(item.raw));
  assert.equal(coconutSugar.status, "limit");
  assert.equal(coconutSugar.attributes.organic, true);
  assert.equal(coconutSugar.attributes.addedSugar, true);
  assert.equal(coconutSugar.sugarProfile.id, "coconut-derived");
});

test("builds a nested analysis from a structured-only database record", () => {
  const mapped = scanner.mapOff({
    code: "0012345678905",
    product_type: "food",
    product_name: "Structured cookie",
    ingredients_n: 4,
    known_ingredients_n: 4,
    ingredients: [
      { id: "en:cookie-base", text: "cookie base", ingredients: [
        { id: "en:oats", text: "oats" },
        { id: "en:coconut-sugar", text: "coconut sugar" }
      ] },
      { id: "en:salt", text: "salt" }
    ]
  }, "0012345678905");
  assert.equal(mapped.ingredientTextGenerated, true);
  assert.equal(mapped.analysisIngredientsText, "cookie base (oats, coconut sugar), salt");
  const product = scanner.buildProduct(mapped);
  const coconut = product.classified.find((item) => item.norm === "coconut sugar");
  assert.deepEqual(Array.from(coconut.path), ["cookie base", "coconut sugar"]);
  assert.equal(coconut.depth, 1);
  assert.equal(coconut.scoreImpact, -4);
  assert.equal(product.ingredientHierarchy[0].children.length, 2);
});

test("merges tag arrays without losing secondary claims and rejects not-kosher", () => {
  const first = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Merged product",
    ingredients_text: "Water, sugar", labels_tags: ["en:organic"], additives_tags: ["en:e150d"]
  }, "0012345678905");
  const second = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Merged product",
    ingredients_text: "Water, sugar", labels_tags: ["en:kosher"], additives_tags: ["en:e338"],
    allergens_tags: ["en:milk"], ingredients_analysis_tags: ["en:vegetarian"]
  }, "0012345678905");
  const merged = scanner.mergeOffRecords([first, second], "0012345678905");
  assert.deepEqual(Array.from(merged.labels_tags).sort(), ["en:kosher", "en:organic"]);
  assert.deepEqual(Array.from(merged.additives_tags).sort(), ["en:e150d", "en:e338"]);
  assert.deepEqual(Array.from(merged.allergens_tags), ["en:milk"]);
  assert.deepEqual(Array.from(merged.ingredients_analysis_tags), ["en:vegetarian"]);
  assert.equal(merged.kosher, true);
  assert.match(merged.analysisIngredientsText, /e150d/i);
  assert.match(merged.analysisIngredientsText, /e338/i);
  const mergedProduct = scanner.buildProduct(merged);
  const classifiedIngredients = Array.from(mergedProduct.classified, (item) => item.norm);
  assert.ok(classifiedIngredients.includes("e150d"));
  assert.ok(classifiedIngredients.includes("e338"));

  const negative = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Not kosher",
    ingredients_text: "Water", labels_tags: ["en:not-kosher"]
  }, "0012345678905");
  assert.equal(negative.kosher, false);
});

test("explicit negative certification tags suppress conflicting positive badges", () => {
  const positive = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Conflicting claims",
    ingredients_text: "Water", labels: "Organic, Kosher, Vegan",
    labels_tags: ["en:organic", "en:kosher"]
  }, "0012345678905");
  const negative = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Conflicting claims",
    ingredients_text: "Water", labels_tags: ["en:not-organic", "en:not-kosher"]
  }, "0012345678905");
  const merged = scanner.mergeOffRecords([positive, negative], "0012345678905");
  assert.deepEqual(Array.from(merged.labels_tags).sort(), ["en:not-kosher", "en:not-organic"]);
  assert.equal(merged.labels, "Vegan");
  assert.equal(merged.kosher, false);

  const product = scanner.buildProduct(merged);
  assert.equal(product.kosher, false);
  assert.deepEqual(Array.from(product.productAttributes.certifications), []);
  assert.equal(product.productAttributes.productLevel.kosher, false);
  assert.equal(product.productAttributes.productLevel.organic, false);

  const direct = scanner.mapOff({
    code: "0012345678905", product_type: "food", product_name: "Direct conflict",
    ingredients_text: "Water", labels: "Organic, Kosher",
    labels_tags: ["en:organic", "en:not-organic", "en:kosher", "en:not-kosher"]
  }, "0012345678905");
  assert.deepEqual(Array.from(direct.labels_tags).sort(), ["en:not-kosher", "en:not-organic"]);
  assert.equal(direct.kosher, false);
  assert.deepEqual(Array.from(scanner.buildProduct(direct).productAttributes.certifications), []);
});

test("rehydrates legacy saved products into the hierarchy model", () => {
  const legacy = {
    id: "legacy-1", barcode: "0012345678905", name: "Legacy bar", productType: "food",
    ingredientsText: "Oat base (oats, coconut sugar), salt", rawIngredientsText: "Oat base (oats, coconut sugar), salt",
    classified: [{ raw: "oats", status: "good" }], score: 80, logged: "eaten", ateAt: 42, ts: 21, portion: 2
  };
  const hydrated = scanner.rehydrateProduct(legacy);
  assert.equal(hydrated.id, "legacy-1");
  assert.equal(hydrated.logged, "eaten");
  assert.equal(hydrated.ateAt, 42);
  assert.equal(hydrated.portion, 2);
  assert.ok(hydrated.ingredientHierarchy.length > 0);
  assert.ok(hydrated.categorySummaries.length > 0);
  assert.ok(hydrated.productAttributes);
});

test("normalizes ingredient research queries and rejects wrong entity types", () => {
  assert.equal(scanner.ingredientResearchQuery("SOJA"), "soy");
  assert.equal(scanner.validIngredientResearchResult({
    title: "Soja", description: "American reggae band", extract: "Soja is an American reggae band."
  }, "soy"), false);
  assert.equal(scanner.validIngredientResearchResult({
    title: "Soybean", description: "species of legume", extract: "The soybean is an edible legume used as food."
  }, "soy"), true);
});

test("rejects barcode-like OCR text as an ingredient list", () => {
  assert.equal(scanner.plausibleReviewedIngredients("5449000000996"), null);
});
