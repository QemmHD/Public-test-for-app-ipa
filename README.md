# NutriCheck

NutriCheck is a mobile-first product scanner for food, personal care, household, and pet-food labels. It validates UPC/EAN/GTIN barcodes, retrieves the fullest available Open Facts record, preserves the exact ingredient label, and applies a strict, transparent ingredient-and-nutrition screen.

The interface takes inspiration from the clarity of modern consumer rating apps, but the design, scoring rules, copy, and implementation are original. NutriCheck is not affiliated with Yuka, Bobby Approved, or Open Food Facts.

## What changed

- Stable live scanning requires two matching detections, validates GS1 check digits, rejects partial/noisy reads, and supports GTIN-8, UPC-A, EAN-13, and GTIN-14 aliases.
- Still photos use multiple crops, sizes, and orientations. Ingredient-label OCR isolates the ingredient section and requires review before analysis.
- Database lookup combines Open Food Facts v3 structured ingredients with fallback records from food, beauty, household, and pet-food databases.
- The raw label stays separate from analysis-only structured subingredients, so E-numbers such as E150d and E338 are found without rewriting what the package says.
- Ingredient results expose source, recognition coverage, confidence, rejected label noise, exact raw text, and per-ingredient rationale.
- The strict score uses explicit rating caps for avoid-grade ingredients, Nutri-Score D/E, high sugar, sugary NOVA-4 products, and incomplete data. Missing ingredients are shown as **Not rated**.
- The ingredient catalog now covers rich additive records, long-tail E-numbers, common pantry ingredients, aliases, processing markers, sugar names, and allergen terms.
- The UI is scan-first, mobile-first, safe-area aware, keyboard accessible, and uses local fonts/icons with no runtime Google Fonts dependency.

## Local development

Requirements: Node.js 20+ and any static file server.

```bash
npm ci
npm run verify
python -m http.server 4173 --directory www
```

Then open `http://localhost:4173`.

`npm run verify` performs JavaScript syntax checks and runs the full Node test suite. Scanner helpers are exposed through a read-only test seam at `window.NUTRICHECK_SCANNER_TEST`.

## App structure

- `www/app.js` — UI, scan consensus, barcode normalization, database merging, OCR, and app state.
- `www/engine.js` — pure ingredient parsing, classification, allergen detection, scoring, and coverage reporting.
- `www/data-additives.js` — food ingredient/additive knowledge base.
- `www/data-cosmetics.js` — beauty and household ingredient knowledge base.
- `test/` — engine and scanner regression tests.
- `.github/workflows/pages.yml` — static GitHub Pages deployment.
- `.github/workflows/build-ipa.yml` — unsigned arm64 device IPA build.

## Data and rating notes

Product records come from the Open Facts family of community databases and can be incomplete or outdated. NutriCheck therefore shows the data source, confidence, recognition coverage, and exact label text instead of silently guessing.

The score is an opinionated screening aid, not a medical diagnosis, safety certification, or substitute for reading the package. Allergies and medical decisions must be verified against the physical product label and a qualified professional.

Reference documentation:

- [Open Food Facts product API v3](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)
- [Open Food Facts API tutorial](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorial-off-api/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Deployment

The Pages workflow publishes `www/`. The IPA workflow creates an unsigned physical-device build for external signing; it does not produce an App Store-signed binary.
