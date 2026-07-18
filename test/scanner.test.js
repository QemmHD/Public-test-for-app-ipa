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

test("rejects barcode-like OCR text as an ingredient list", () => {
  assert.equal(scanner.plausibleReviewedIngredients("5449000000996"), null);
});
