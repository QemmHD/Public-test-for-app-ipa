/*
 * NutriCheck cosmetic / personal-care / household ingredient knowledge base.
 *
 * Same object shape as data-additives.js so the engine can merge both into one
 * word-boundary index. These are INCI-style names found on shampoo, toothpaste,
 * lotion, makeup, sunscreen, deodorant and cleaning-product labels.
 *
 * risk:  "avoid"   - strong evidence or regulatory restriction
 *        "caution" - meaningful concern / mixed evidence
 *        "limit"   - fine occasionally, not great in excess / heavy exposure
 *        "ok"      - generally recognized as fine
 *
 * Tiered: the `additives` array carries rich, individually-researched entries
 * for the most common/important ingredients; `concernLists` provides broad
 * keyword coverage (the long tail of INCI names) classified by concern bucket.
 *
 * Citations summarize real sources (EU SCCS, IARC, FDA, EWG, peer-reviewed
 * studies). They are starting points, not medical advice.
 */
window.CB_DATA_COSMETICS = (function () {
  const additives = [
    /* ---------------------------------------------------- preservatives */
    {
      id: "methylparaben", names: ["methylparaben", "methyl paraben", "methyl 4-hydroxybenzoate"],
      category: "Paraben preservative", risk: "caution",
      summary: "Common preservative that weakly mimics estrogen; widely used and debated.",
      whatIs: "Methylparaben is one of the most-used cosmetic preservatives, stopping mold and bacteria in lotions, shampoos and makeup.",
      whyFlagged: "Parabens can penetrate skin and exhibit weak estrogen-like activity. The shorter-chain ones (methyl, ethyl) are considered the safest of the family but remain controversial.",
      healthRisk: "Possible endocrine (hormone) activity; rare skin sensitization. Regulators consider methylparaben safe at limited concentrations.",
      studies: [
        { title: "Opinion on parabens", source: "EU Scientific Committee on Consumer Safety (SCCS)", year: 2013 },
        { title: "Parabens and estrogenic activity (review)", source: "Journal of Applied Toxicology", year: 2004 }
      ]
    },
    {
      id: "propylparaben", names: ["propylparaben", "propyl paraben", "propyl 4-hydroxybenzoate"],
      category: "Paraben preservative", risk: "caution",
      summary: "Longer-chain paraben with stronger estrogenic activity than methylparaben.",
      whatIs: "Propylparaben preserves cosmetics and some foods against microbial growth.",
      whyFlagged: "Longer-chain parabens (propyl, butyl) show more potent estrogen-mimicking activity and were restricted in the EU.",
      healthRisk: "Endocrine concern; the EU lowered the permitted concentration and banned it from leave-on products for the nappy area of young children.",
      studies: [
        { title: "Opinion on propyl- and butylparaben", source: "EU SCCS", year: 2011 }
      ]
    },
    {
      id: "butylparaben", names: ["butylparaben", "butyl paraben", "isobutylparaben", "isopropylparaben"],
      category: "Paraben preservative", risk: "avoid",
      summary: "Long-chain paraben restricted in the EU over endocrine concern.",
      whatIs: "Butylparaben and its branched relatives are stronger, longer-chain preservatives.",
      whyFlagged: "These have the most potent estrogenic activity of the parabens. Iso-forms were banned in the EU for lack of safety data.",
      healthRisk: "Endocrine-disruption concern; isobutyl/isopropylparaben are banned in EU cosmetics.",
      studies: [
        { title: "Regulation (EU) 2014/358 banning certain parabens", source: "European Commission", year: 2014 }
      ]
    },
    {
      id: "formaldehyde", names: ["formaldehyde", "formalin", "methanal", "methylene glycol"],
      category: "Preservative / contaminant", risk: "avoid",
      summary: "Known human carcinogen sometimes present in or released by cosmetics.",
      whatIs: "Formaldehyde is a gas used as a preservative and disinfectant; in cosmetics it appears in some hair-straightening treatments and nail products.",
      whyFlagged: "Classified as a human carcinogen by IARC. Banned or capped as a cosmetic ingredient in many regions.",
      healthRisk: "Carcinogenic; causes skin sensitization, eye/respiratory irritation. Avoid, especially in salon hair-smoothing products.",
      studies: [
        { title: "Formaldehyde — IARC Monograph (Group 1 carcinogen)", source: "IARC / WHO", year: 2006 }
      ]
    },
    {
      id: "dmdmhydantoin", names: ["dmdm hydantoin", "dmdm-hydantoin"],
      category: "Formaldehyde-releasing preservative", risk: "caution",
      summary: "Preservative that slowly releases formaldehyde to kill microbes.",
      whatIs: "DMDM hydantoin is a formaldehyde donor used to preserve shampoos, conditioners and lotions.",
      whyFlagged: "It works by continuously releasing small amounts of formaldehyde, a known carcinogen and sensitizer.",
      healthRisk: "Contact allergy and scalp/skin irritation; formaldehyde exposure. A common cause of cosmetic allergic dermatitis.",
      studies: [
        { title: "Formaldehyde-releasers in cosmetics (contact-allergy review)", source: "Contact Dermatitis", year: 2010 }
      ]
    },
    {
      id: "quaternium15", names: ["quaternium-15", "quaternium 15"],
      category: "Formaldehyde-releasing preservative", risk: "caution",
      summary: "Strong formaldehyde-releasing preservative and frequent allergen.",
      whatIs: "Quaternium-15 preserves cosmetics by releasing formaldehyde over time.",
      whyFlagged: "Among the most sensitizing formaldehyde releasers and a leading cause of preservative allergy.",
      healthRisk: "Allergic contact dermatitis; formaldehyde exposure.",
      studies: [
        { title: "Quaternium-15 contact allergy (NACDG data)", source: "Dermatitis", year: 2015 }
      ]
    },
    {
      id: "methylisothiazolinone", names: ["methylisothiazolinone", "methylchloroisothiazolinone", "mci/mi", "kathon cg"],
      category: "Isothiazolinone preservative", risk: "caution",
      summary: "Potent preservative behind a wave of cosmetic allergy cases.",
      whatIs: "Methylisothiazolinone (MIT) and its chloro- partner preserve rinse-off and leave-on cosmetics.",
      whyFlagged: "A major contact allergen; the EU banned MIT from leave-on products and limited it in rinse-off.",
      healthRisk: "Allergic contact dermatitis, sometimes severe. Restricted across the EU.",
      studies: [
        { title: "Opinion on methylisothiazolinone (sensitization)", source: "EU SCCS", year: 2014 }
      ]
    },
    {
      id: "triclosan", names: ["triclosan", "triclocarban"],
      category: "Antibacterial agent", risk: "avoid",
      summary: "Antibacterial banned from US soaps over safety and resistance concerns.",
      whatIs: "Triclosan was added to antibacterial soaps, toothpaste and deodorants to kill bacteria.",
      whyFlagged: "Endocrine effects in animal studies and a role in antibiotic resistance led the FDA to ban it from consumer antiseptic wash products in 2016.",
      healthRisk: "Possible thyroid/hormone disruption; antimicrobial resistance; environmental persistence.",
      studies: [
        { title: "FDA rule banning triclosan in consumer antiseptic washes", source: "U.S. FDA", year: 2016 }
      ]
    },
    {
      id: "phenoxyethanol", names: ["phenoxyethanol", "2-phenoxyethanol"],
      category: "Preservative", risk: "limit",
      summary: "Widely-used paraben alternative; low risk but capped in concentration.",
      whatIs: "Phenoxyethanol is a glycol-ether preservative used as a paraben/formaldehyde-releaser alternative.",
      whyFlagged: "Generally well tolerated, but high exposure can irritate, and it is capped at 1% in the EU.",
      healthRisk: "Skin/eye irritation at higher levels; rare allergy. Considered safe within limits.",
      studies: [
        { title: "Opinion on phenoxyethanol", source: "EU SCCS", year: 2016 }
      ]
    },

    /* ----------------------------------------------------- surfactants */
    {
      id: "sls", names: ["sodium lauryl sulfate", "sls", "sodium dodecyl sulfate"],
      category: "Sulfate surfactant", risk: "caution",
      summary: "Strong foaming cleanser that can strip and irritate skin and scalp.",
      whatIs: "Sodium lauryl sulfate is a powerful detergent that creates lather in shampoo, body wash, toothpaste and cleaners.",
      whyFlagged: "Effective but harsh — it can strip natural oils and irritate skin, eyes and the mouth (linked to canker sores in toothpaste).",
      healthRisk: "Skin/scalp dryness and irritation; eye irritation; aphthous ulcers in sensitive people. Not a carcinogen.",
      studies: [
        { title: "Final report on the safety of sodium lauryl sulfate", source: "Cosmetic Ingredient Review (CIR)", year: 1983 }
      ]
    },
    {
      id: "sles", names: ["sodium laureth sulfate", "sles", "sodium lauryl ether sulfate"],
      category: "Sulfate surfactant", risk: "limit",
      summary: "Milder than SLS but may carry trace 1,4-dioxane from processing.",
      whatIs: "Sodium laureth sulfate is an ethoxylated, gentler version of SLS used in most foaming washes.",
      whyFlagged: "Less stripping than SLS, but the ethoxylation step can leave traces of 1,4-dioxane, a probable carcinogen, unless purified.",
      healthRisk: "Mild irritation; concern is the 1,4-dioxane byproduct rather than the surfactant itself.",
      studies: [
        { title: "1,4-Dioxane as a contaminant in cosmetics", source: "U.S. FDA", year: 2019 }
      ]
    },
    {
      id: "cocamidedea", names: ["cocamide dea", "cocamide mea", "lauramide dea"],
      category: "Foam booster", risk: "caution",
      summary: "Coconut-derived foam booster flagged as a possible carcinogen in California.",
      whatIs: "Cocamide DEA thickens and stabilizes foam in shampoos and washes.",
      whyFlagged: "Can form carcinogenic nitrosamines and is listed under California Prop 65 as a carcinogen.",
      healthRisk: "Possible carcinogen (nitrosamine formation); skin sensitizer.",
      studies: [
        { title: "Cocamide diethanolamine — California Prop 65 listing", source: "California OEHHA", year: 2012 }
      ]
    },

    /* ------------------------------------------------- fragrance & UV */
    {
      id: "fragrance", names: ["fragrance", "parfum", "perfume", "aroma", "flavor", "flavour"],
      category: "Undisclosed fragrance", risk: "caution",
      summary: "Umbrella term that can hide dozens of undisclosed scent chemicals.",
      whatIs: "'Fragrance'/'parfum' on a label is a trade-secret blend that can contain dozens to hundreds of individual compounds, including allergens and phthalates.",
      whyFlagged: "Manufacturers aren't required to disclose what's inside, so allergens and hormone-active chemicals can hide here.",
      healthRisk: "A leading cause of cosmetic allergy and skin sensitization; may conceal phthalates. A real problem for sensitive people.",
      studies: [
        { title: "Fragrance contact allergy (review)", source: "Contact Dermatitis", year: 2018 }
      ]
    },
    {
      id: "oxybenzone", names: ["oxybenzone", "benzophenone-3", "bp-3"],
      category: "Chemical UV filter", risk: "caution",
      summary: "Sunscreen filter absorbed into the body with hormone-activity concern.",
      whatIs: "Oxybenzone is a chemical UV filter in many sunscreens and SPF products.",
      whyFlagged: "It is readily absorbed through skin, detected in blood and urine, shows hormone activity in studies, and harms coral reefs (banned in Hawaii).",
      healthRisk: "Possible endocrine activity; skin allergy; environmental (reef) harm.",
      studies: [
        { title: "Absorption of sunscreen active ingredients into systemic circulation", source: "JAMA", year: 2019 }
      ]
    },
    {
      id: "octinoxate", names: ["octinoxate", "octyl methoxycinnamate", "ethylhexyl methoxycinnamate"],
      category: "Chemical UV filter", risk: "caution",
      summary: "Common UV filter with endocrine and reef-toxicity concerns.",
      whatIs: "Octinoxate is a widely used UVB chemical filter in sunscreens and daily SPF cosmetics.",
      whyFlagged: "Shows hormone-like activity in lab studies and contributes to coral-reef damage; banned alongside oxybenzone in some regions.",
      healthRisk: "Possible endocrine activity; environmental harm.",
      studies: [
        { title: "Hawaii Act 104 banning oxybenzone and octinoxate", source: "State of Hawaii", year: 2018 }
      ]
    },

    /* ------------------------------------------------ phthalates / PEG */
    {
      id: "phthalates", names: ["phthalate", "diethyl phthalate", "dbp", "dehp", "dibutyl phthalate", "dep"],
      category: "Plasticizer", risk: "avoid",
      summary: "Plasticizers used in fragrance and nail products; endocrine disruptors.",
      whatIs: "Phthalates make plastics flexible and help fragrance linger; diethyl phthalate (DEP) is common in scented cosmetics.",
      whyFlagged: "Several phthalates are established endocrine disruptors linked to reproductive harm; multiple are restricted in the EU and in children's products.",
      healthRisk: "Reproductive/developmental toxicity, hormone disruption. Often hidden inside 'fragrance'.",
      studies: [
        { title: "Phthalates and human health (review)", source: "Environmental Health Perspectives", year: 2008 }
      ]
    },
    {
      id: "peg", names: ["peg", "polyethylene glycol", "peg-100 stearate", "peg-40", "ceteareth", "laureth", "steareth"],
      category: "PEG / ethoxylated compound", risk: "limit",
      summary: "Common emulsifiers that may carry trace 1,4-dioxane contamination.",
      whatIs: "PEGs and '-eth' ingredients (ceteareth, laureth, steareth) are ethoxylated emulsifiers and thickeners used throughout skincare.",
      whyFlagged: "The compounds themselves are generally low-hazard, but the ethoxylation process can leave 1,4-dioxane, a probable human carcinogen, unless purified.",
      healthRisk: "Concern is the 1,4-dioxane and ethylene-oxide byproducts; the PEGs may also enhance penetration of other ingredients.",
      studies: [
        { title: "Safety assessment of PEGs in cosmetics", source: "Cosmetic Ingredient Review", year: 2017 }
      ]
    },

    /* ----------------------------------------------- antioxidants/dyes */
    {
      id: "bha_cosmetic", names: ["bha", "butylated hydroxyanisole"],
      category: "Synthetic antioxidant", risk: "caution",
      summary: "Preservative antioxidant flagged as a possible human carcinogen.",
      whatIs: "Butylated hydroxyanisole stops oils in cosmetics (and foods) from going rancid.",
      whyFlagged: "IARC classifies it as possibly carcinogenic to humans, and the EU flags it as a suspected endocrine disruptor in cosmetics.",
      healthRisk: "Possible carcinogen; possible endocrine activity; skin sensitization.",
      studies: [
        { title: "BHA — IARC Monograph (Group 2B)", source: "IARC / WHO", year: 1986 }
      ]
    },
    {
      id: "coaltardye", names: ["p-phenylenediamine", "ppd", "coal tar", "ci 75000", "fd&c", "d&c", "ci "],
      category: "Coal-tar / synthetic dye", risk: "caution",
      summary: "Petroleum-derived colorants; hair-dye PPD is a strong allergen.",
      whatIs: "Coal-tar and synthetic 'CI' / 'FD&C' / 'D&C' colorants tint makeup, hair dye and personal-care products. PPD is the classic permanent-hair-dye chemical.",
      whyFlagged: "Some are contaminated with heavy metals; p-phenylenediamine is a potent skin sensitizer that can cause severe reactions.",
      healthRisk: "Allergic reactions (sometimes severe with hair dye); some colorants carry contamination concerns.",
      studies: [
        { title: "p-Phenylenediamine allergy in hair dye (review)", source: "Contact Dermatitis", year: 2013 }
      ]
    },

    /* ----------------------------------------------- mineral / physical */
    {
      id: "talc", names: ["talc", "talcum", "cosmetic talc"],
      category: "Mineral powder", risk: "caution",
      summary: "Powder mineral that can be contaminated with asbestos.",
      whatIs: "Talc gives powders and some makeup a soft, slip feel.",
      whyFlagged: "Mined talc can be contaminated with asbestos, a known carcinogen, and inhalation/genital-use concerns have driven major lawsuits and recalls.",
      healthRisk: "Asbestos-contamination risk (carcinogen); respiratory concern when inhaled as loose powder.",
      studies: [
        { title: "Asbestos in talc-based cosmetics (testing report)", source: "U.S. FDA", year: 2019 }
      ]
    },
    {
      id: "aluminum", names: ["aluminum", "aluminium chlorohydrate", "aluminum zirconium", "aluminium"],
      category: "Antiperspirant salt", risk: "limit",
      summary: "Active that plugs sweat glands in antiperspirants; debated, not proven harmful.",
      whatIs: "Aluminum salts block sweat ducts and are the active ingredient in antiperspirants.",
      whyFlagged: "Long-debated links to breast cancer and Alzheimer's have NOT been established by evidence, but some prefer to limit exposure.",
      healthRisk: "No proven serious harm; skin irritation possible. Concerns remain unconfirmed.",
      studies: [
        { title: "Antiperspirants and breast cancer risk (review, no established link)", source: "Journal of the National Cancer Institute / NCI", year: 2014 }
      ]
    },
    {
      id: "mineraloil", names: ["mineral oil", "paraffinum liquidum", "petrolatum", "petroleum jelly", "paraffin"],
      category: "Petroleum occlusive", risk: "limit",
      summary: "Petroleum-derived moisturizer; safe when refined, concern if not.",
      whatIs: "Mineral oil and petrolatum are petroleum-derived occlusives that lock in moisture.",
      whyFlagged: "Cosmetic-grade, fully-refined material is considered safe; the concern is potential PAH contamination in poorly-refined grades.",
      healthRisk: "Refined grades: low risk. Unrefined/contaminated grades: PAH (carcinogen) concern. Can be comedogenic for some.",
      studies: [
        { title: "Mineral oil hydrocarbons in cosmetics (refinement and safety)", source: "EU SCCS", year: 2020 }
      ]
    },
    {
      id: "silicone", names: ["dimethicone", "cyclopentasiloxane", "cyclotetrasiloxane", "d4", "d5", "siloxane", "cyclomethicone"],
      category: "Silicone", risk: "limit",
      summary: "Smoothing silicones; mostly inert but some cyclic ones are restricted.",
      whatIs: "Silicones like dimethicone give that silky slip in conditioners, primers and lotions.",
      whyFlagged: "Most silicones are inert and well tolerated, but cyclic siloxanes D4/D5 are persistent, bioaccumulative and restricted in the EU in rinse-off products.",
      healthRisk: "Low direct health risk; D4/D5 are environmental-persistence and reproductive concerns. Mainly an eco/feel issue.",
      studies: [
        { title: "Restriction of D4, D5, D6 cyclic siloxanes", source: "EU REACH / ECHA", year: 2018 }
      ]
    },

    /* ------------------------------------------------------ toothpaste */
    {
      id: "fluoride", names: ["sodium fluoride", "stannous fluoride", "sodium monofluorophosphate", "fluoride"],
      category: "Cavity-prevention active", risk: "ok",
      summary: "Proven cavity fighter in toothpaste; safe at toothpaste levels (don't swallow).",
      whatIs: "Fluoride strengthens enamel and prevents tooth decay; it's the key active in most toothpaste.",
      whyFlagged: "Not flagged for topical dental use — it's effective and recommended. The only caution is swallowing large amounts (fluorosis in young children).",
      healthRisk: "Safe as directed; supervise young children to avoid swallowing toothpaste. Effective and dentist-recommended.",
      studies: [
        { title: "Fluoride toothpaste for preventing dental caries", source: "Cochrane Review", year: 2019 }
      ]
    },
    {
      id: "triclosantoothpaste", names: ["sodium lauroyl sarcosinate"],
      category: "Mild surfactant", risk: "ok",
      summary: "Gentle foaming agent used as an SLS alternative in toothpaste.",
      whatIs: "Sodium lauroyl sarcosinate is a milder amino-acid-derived surfactant.",
      whyFlagged: "Not flagged — used as a gentler foaming alternative to SLS.",
      healthRisk: "Low risk; gentler on oral tissue than SLS.",
      studies: []
    },

    /* ------------------------------------------------------ household */
    {
      id: "ammonia", names: ["ammonia", "ammonium hydroxide"],
      category: "Household cleaning agent", risk: "caution",
      summary: "Strong cleaner; corrosive fumes, dangerous if mixed with bleach.",
      whatIs: "Ammonia is a powerful cleaning agent in glass and surface cleaners.",
      whyFlagged: "Releases irritating fumes and forms toxic chloramine gas if mixed with bleach.",
      healthRisk: "Respiratory and eye irritation; toxic gas if combined with bleach. Use with ventilation.",
      studies: [
        { title: "Ammonia toxicological profile", source: "U.S. ATSDR", year: 2004 }
      ]
    },
    {
      id: "bleach", names: ["sodium hypochlorite", "bleach"],
      category: "Household disinfectant", risk: "caution",
      summary: "Effective disinfectant; corrosive and hazardous if mixed with acids/ammonia.",
      whatIs: "Sodium hypochlorite is the active ingredient in chlorine bleach.",
      whyFlagged: "Corrosive to skin, eyes and lungs; produces toxic gases when mixed with ammonia or acids.",
      healthRisk: "Burns and respiratory irritation; dangerous gas reactions. Never mix with other cleaners.",
      studies: [
        { title: "Sodium hypochlorite safety", source: "U.S. CDC / NIOSH", year: 2016 }
      ]
    },
    {
      id: "quats", names: ["benzalkonium chloride", "didecyldimonium chloride", "quaternary ammonium"],
      category: "Disinfectant / preservative", risk: "caution",
      summary: "Antimicrobial 'quat' — irritant and asthma trigger with heavy exposure.",
      whatIs: "Quaternary ammonium compounds ('quats') disinfect surfaces and preserve some cosmetics.",
      whyFlagged: "Linked to skin and respiratory irritation and occupational asthma; possible role in antimicrobial resistance.",
      healthRisk: "Skin sensitization; asthma/respiratory irritation with frequent exposure.",
      studies: [
        { title: "Quaternary ammonium compounds and asthma (review)", source: "Occupational & Environmental Medicine", year: 2017 }
      ]
    },
    {
      id: "edta", names: ["edta", "disodium edta", "tetrasodium edta"],
      category: "Chelating agent", risk: "ok",
      summary: "Binds metal ions to stabilize products; low hazard.",
      whatIs: "EDTA chelates trace metals so cosmetics and cleaners stay stable and effective.",
      whyFlagged: "Low direct hazard; the main note is poor environmental biodegradability and mild penetration enhancement.",
      healthRisk: "Low risk at cosmetic levels; rare irritation.",
      studies: []
    },

    /* --------------------------------------------------- gentle/clean */
    {
      id: "glycerin", names: ["glycerin", "glycerol", "glycerine"],
      category: "Humectant", risk: "ok",
      summary: "Well-tolerated moisture-binding ingredient.",
      whatIs: "Glycerin draws water into the skin and is one of the most common, gentle moisturizers.",
      whyFlagged: "Not flagged — safe, effective and broadly recommended.",
      healthRisk: "No known concerns at normal use.",
      studies: []
    },
    {
      id: "hyaluronic", names: ["hyaluronic acid", "sodium hyaluronate"],
      category: "Humectant", risk: "ok",
      summary: "Skin-friendly hydrating molecule with no notable concerns.",
      whatIs: "Hyaluronic acid is a naturally occurring molecule that holds water in the skin.",
      whyFlagged: "Not flagged — gentle and widely used in moisturizers and serums.",
      healthRisk: "No known concerns.",
      studies: []
    },
    {
      id: "niacinamide", names: ["niacinamide", "nicotinamide"],
      category: "Skin-conditioning vitamin", risk: "ok",
      summary: "Vitamin B3 derivative; well tolerated skincare active.",
      whatIs: "Niacinamide is a form of vitamin B3 used to improve skin barrier and tone.",
      whyFlagged: "Not flagged — a well-studied, gentle active.",
      healthRisk: "No known concerns at typical levels.",
      studies: []
    },
    {
      id: "sheabutter", names: ["shea butter", "butyrospermum parkii", "aloe", "aloe barbadensis", "tocopherol", "vitamin e"],
      category: "Natural emollient / antioxidant", risk: "ok",
      summary: "Plant-derived moisturizers and antioxidants with no notable concerns.",
      whatIs: "Shea butter, aloe and tocopherol (vitamin E) are plant-derived emollients and antioxidants.",
      whyFlagged: "Not flagged — generally gentle and beneficial; rare allergy possible.",
      healthRisk: "No known concerns; occasional sensitivity.",
      studies: []
    }
  ];

  /* ---------------------------------------------------- concern buckets
   * Keyword fallback for the long tail of INCI names not in `additives`.
   * Each bucket key must also appear in `groups` below.                */
  const concernLists = {
    endocrine: [
      "resorcinol", "benzophenone", "homosalate", "octocrylene", "avobenzone",
      "butylphenyl methylpropional", "lilial", "cyclomethicone", "bpa", "bisphenol"
    ],
    formaldehydeReleaser: [
      "imidazolidinyl urea", "diazolidinyl urea", "sodium hydroxymethylglycinate",
      "bronopol", "2-bromo-2-nitropropane-1,3-diol", "polyoxymethylene urea"
    ],
    sulfate: [
      "ammonium lauryl sulfate", "ammonium laureth sulfate", "sodium myreth sulfate",
      "tea-lauryl sulfate", "sodium coco sulfate"
    ],
    fragranceAllergen: [
      "limonene", "linalool", "citronellol", "geraniol", "eugenol", "coumarin",
      "cinnamal", "benzyl benzoate", "benzyl salicylate", "hexyl cinnamal", "amyl cinnamal", "farnesol"
    ],
    sensitizer: [
      "methyldibromo glutaronitrile", "iodopropynyl butylcarbamate", "chlorphenesin",
      "propolis", "colophonium", "balsam of peru"
    ],
    alcoholDrying: [
      "alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "ethanol"
    ],
    dye: [
      "lead acetate", "carbon black", "ci 77266"
    ]
  };

  const concernMeta = {
    endocrine: { status: "caution", reason: "Possible hormone (endocrine) activity" },
    formaldehydeReleaser: { status: "caution", reason: "Releases formaldehyde over time" },
    sulfate: { status: "limit", reason: "Stripping sulfate surfactant" },
    fragranceAllergen: { status: "caution", reason: "Known fragrance allergen" },
    sensitizer: { status: "caution", reason: "Skin sensitizer / allergen" },
    alcoholDrying: { status: "limit", reason: "Drying alcohol" },
    dye: { status: "caution", reason: "Colorant of concern" }
  };

  const groups = {
    endocrine: {
      category: "Endocrine concern", status: "caution",
      summary: "An ingredient with possible hormone-disrupting activity.",
      whatIs: "This ingredient has shown hormone-like (endocrine) activity in laboratory or animal studies.",
      whyFlagged: "Endocrine-active chemicals can interfere with the body's hormone signaling; evidence varies by compound and dose.",
      effects: "Possible hormonal effects; strength of evidence varies. Limiting cumulative exposure is reasonable.",
      studies: []
    },
    formaldehydeReleaser: {
      category: "Formaldehyde-releasing preservative", status: "caution",
      summary: "A preservative that slowly releases formaldehyde, a known carcinogen and allergen.",
      whatIs: "Formaldehyde-releasing preservatives keep products from spoiling by emitting tiny amounts of formaldehyde over time.",
      whyFlagged: "Formaldehyde is a known human carcinogen and a common skin sensitizer.",
      effects: "Contact allergy and irritation; cumulative formaldehyde exposure.",
      studies: []
    },
    sulfate: {
      category: "Sulfate surfactant", status: "limit",
      summary: "A strong foaming detergent that can strip and irritate skin.",
      whatIs: "Sulfate surfactants create lather and cut grease in cleansers and shampoos.",
      whyFlagged: "Effective but can be stripping and irritating, especially for sensitive or dry skin and scalp.",
      effects: "Dryness and irritation; not a serious health hazard.",
      studies: []
    },
    fragranceAllergen: {
      category: "Fragrance allergen", status: "caution",
      summary: "A declared fragrance component that the EU lists as a known allergen.",
      whatIs: "These are individual scent molecules the EU requires to be listed because they commonly trigger allergies.",
      whyFlagged: "They are among the most frequent causes of cosmetic allergic contact dermatitis.",
      effects: "Skin sensitization and allergic reactions in susceptible people.",
      studies: []
    },
    sensitizer: {
      category: "Skin sensitizer", status: "caution",
      summary: "An ingredient associated with allergic skin reactions.",
      whatIs: "This ingredient is a documented contact allergen or sensitizer.",
      whyFlagged: "Repeated exposure can trigger allergic contact dermatitis in some people.",
      effects: "Itching, rash and allergic skin reactions in sensitive individuals.",
      studies: []
    },
    alcoholDrying: {
      category: "Drying alcohol", status: "limit",
      summary: "A volatile alcohol that can dry out skin with frequent use.",
      whatIs: "Denatured/SD/isopropyl alcohols are quick-evaporating solvents used for a light feel.",
      whyFlagged: "Fine in small amounts, but high concentrations can dry and irritate skin over time.",
      effects: "Dryness and barrier disruption with heavy use; not a serious hazard.",
      studies: []
    },
    dye: {
      category: "Colorant of concern", status: "caution",
      summary: "A colorant with contamination or toxicity concerns.",
      whatIs: "A pigment or dye used to color a personal-care product.",
      whyFlagged: "Some colorants carry heavy-metal contamination or other toxicity concerns.",
      effects: "Varies by colorant; possible irritation or contamination exposure.",
      studies: []
    }
  };

  const bannedMap = {
    butylparaben: "Isobutyl/isopropylparaben banned in EU cosmetics; concentration of others restricted",
    formaldehyde: "Restricted/banned as a cosmetic ingredient in the EU and many regions; IARC Group 1 carcinogen",
    triclosan: "Banned by the U.S. FDA in consumer antiseptic washes (2016); restricted in the EU",
    methylisothiazolinone: "Banned from leave-on cosmetics in the EU; limited in rinse-off",
    oxybenzone: "Banned in Hawaii, Key West and several regions over reef and health concerns",
    octinoxate: "Banned in Hawaii and other regions alongside oxybenzone",
    phthalates: "Several phthalates restricted in EU cosmetics and banned in children's products",
    silicone: "Cyclic siloxanes D4/D5/D6 restricted in the EU under REACH",
    bha_cosmetic: "Flagged as a suspected endocrine disruptor in the EU; IARC Group 2B"
  };

  return {
    additives: additives,
    concernLists: concernLists,
    concernMeta: concernMeta,
    groups: groups,
    bannedMap: bannedMap
  };
})();
