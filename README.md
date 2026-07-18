# NutriCheck

NutriCheck is a mobile-first product scanner for food, personal care, household, and pet-food labels. It validates UPC/EAN/GTIN barcodes, retrieves the fullest available Open Facts record, preserves the exact ingredient label, and applies a strict, transparent ingredient-and-nutrition screen.

The interface takes inspiration from the clarity of modern consumer rating apps, but the design, scoring rules, copy, and implementation are original. NutriCheck is not affiliated with Yuka, Bobby Approved, or Open Food Facts.

## What changed

- Stable live scanning requires two matching detections, validates GS1 check digits, rejects partial/noisy reads, and supports GTIN-8, UPC-A, EAN-13, and GTIN-14 aliases.
- Still photos use multiple crops, sizes, and orientations. Ingredient-label OCR isolates the ingredient section and requires review before analysis.
- Database lookup combines Open Food Facts v3 structured ingredients with fallback records from food, beauty, household, and pet-food databases. Valid labels, allergens, additives, and analysis tags are unioned rather than discarded with a secondary record.
- The raw label stays separate from analysis-only structure. Parent blends and their children retain stable IDs, paths, depth, and label order; named additives and their E-number aliases are deduplicated instead of shown as separate risks.
- Ingredient results now use a label-order formula map, role summaries, score provenance, and an “In this product” detail card. Parent containers are score-neutral and purpose phrases such as “to protect taste” remain context rather than fake ingredients.
- Recognition, structural parse confidence, rating confidence, rejected label noise, and provenance are shown as distinct concepts instead of one ambiguous confidence number.
- The strict score uses explicit rating caps for avoid-grade ingredients, Nutri-Score D/E, high sugar, sugary NOVA-4 products, and incomplete data. Missing ingredients are shown as **Not rated**.
- The ingredient catalog now covers rich additive records, long-tail E-numbers, common pantry ingredients, aliases, processing markers, sugar families, and allergen/source terms. Nested sweeteners do not inherit an unsupported whole-product prominence penalty.
- Coconut sugar is classified as an added sugar whose amount matters, not as an additive hazard or an automatic clean-food bonus. Organic and kosher metadata are sourced product/ingredient attributes with zero direct score impact; “kosher salt” never implies certification.
- Older history/favorite records are rehydrated into the current hierarchy model when opened.
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

Ingredient order is used only as a formulation signal because packaged-food ingredients are generally declared in descending order by weight; it is not displayed as an invented percentage. When exact label wording is missing but a structured database tree is available, the UI labels that fallback explicitly.

Certifications and preferences are intentionally separate from nutrition and ingredient concerns. Organic describes regulated production/labeling categories, while kosher describes compliance with Jewish dietary law; neither automatically cancels a high added-sugar result. Coconut sugar remains in the combined added-sugar family, with no extra hazard penalty for its name or organic qualifier.

The score is an opinionated screening aid, not a medical diagnosis, safety certification, or substitute for reading the package. Allergies and medical decisions must be verified against the physical product label and a qualified professional.

Reference documentation:

- [Open Food Facts product API v3](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)
- [Open Food Facts API tutorial](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorial-off-api/)
- [FDA: Added Sugars on the Nutrition Facts Label](https://www.fda.gov/food/nutrition-facts-label/added-sugars-nutrition-facts-label)
- [USDA: Labeling Organic Products](https://www.ams.usda.gov/rules-regulations/organic/labeling)
- [WHO: Guideline information note on sugar intake](https://www.who.int/publications-detail-redirect/WHO-NMH-NHD-15.3)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Deployment

The Pages workflow publishes `www/`. The IPA workflow creates an unsigned physical-device build for external signing; it does not produce an App Store-signed binary.
