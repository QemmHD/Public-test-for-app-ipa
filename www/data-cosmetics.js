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
      category: "Sulfate surfactant", role: "cleanser-surfactant", risk: "limit",
      riskByContext: { "oral-care": "caution", "household-rinse-off": "limit", "rinse-off-body": "limit" },
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
      category: "Sulfate surfactant", role: "cleanser-surfactant", risk: "limit",
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
      category: "Undisclosed fragrance", role: "fragrance-or-flavor", risk: "limit",
      riskByContext: { "leave-on-underarm": "caution", "aerosol-body-spray": "caution", "oral-care": "limit", "rinse-off-body": "limit", "household-rinse-off": "limit" },
      summary: "An incompletely disclosed scent or flavor blend; sensitivity is the main practical concern.",
      whatIs: "Fragrance, parfum and flavor may represent a mixture whose individual components are not all named on the package.",
      whyFlagged: "Incomplete disclosure makes allergen screening harder. This does not prove the blend is toxic, but it matters for people with fragrance sensitivity or contact allergy.",
      healthRisk: "Possible irritation, headache or allergic contact dermatitis in susceptible people; risk depends on the formula, concentration and exposure.",
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
      id: "coaltardye", names: ["p-phenylenediamine", "ppd", "coal tar", "ci 75000"],
      category: "Permanent hair-dye sensitizer", role: "colorant", risk: "caution",
      summary: "PPD hair dye is a strong contact allergen; this entry is not a blanket judgment on every CI color.",
      whatIs: "p-Phenylenediamine (PPD) is a permanent-hair-dye chemical. It is assessed separately from ordinary declared cosmetic colors.",
      whyFlagged: "PPD is a potent skin sensitizer that can cause severe reactions, especially after repeated or black-henna exposure.",
      healthRisk: "Allergic reactions that can be severe; follow hair-dye patch-test and label directions.",
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
      category: "Antiperspirant active", role: "antiperspirant-active", risk: "limit",
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
      category: "Cavity-prevention active", role: "oral-care-active", risk: "ok",
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
      id: "sheabutter", names: ["shea butter", "butyrospermum parkii", "aloe", "aloe barbadensis", "tocopherol", "tocopherols", "vitamin e"],
      category: "Natural emollient / antioxidant", risk: "ok",
      summary: "Plant-derived moisturizers and antioxidants with no notable concerns.",
      whatIs: "Shea butter, aloe and tocopherol (vitamin E) are plant-derived emollients and antioxidants.",
      whyFlagged: "Not flagged — generally gentle and beneficial; rare allergy possible.",
      healthRisk: "No known concerns; occasional sensitivity.",
      studies: []
    }
  ];

  /* High-frequency functional ingredients used by deodorants, soaps,
   * toothpaste and dish-care products. These records deliberately separate an
   * ingredient's job from its exposure caveat: natural origin is not a safety
   * bonus, and a chemical-sounding INCI name is not a penalty by itself. */
  additives.push(
    {
      id: "water-carrier", names: ["water", "aqua", "purified water"],
      category: "Solvent / carrier", role: "carrier-solvent", risk: "ok",
      summary: "The main carrier in many formulas.", whatIs: "Water dissolves and distributes the other ingredients.",
      whyFlagged: "Not flagged; it is score-neutral.", healthRisk: "No ingredient-specific concern in a preserved finished product.", studies: []
    },
    {
      id: "glycol-carrier", names: ["propylene glycol", "dipropylene glycol", "ppg-14 butyl ether", "ppg-26"],
      category: "Carrier / humectant", role: "carrier-solvent", risk: "ok",
      riskByContext: { "leave-on-underarm": "limit" },
      summary: "A common solvent and moisture-control ingredient.", whatIs: "Glycols keep ingredients dissolved and help control texture and moisture.",
      whyFlagged: "Generally low concern; leave-on products can sting or irritate very sensitive or freshly shaved skin.",
      healthRisk: "Usually well tolerated; occasional irritation or contact allergy.", studies: []
    },
    {
      id: "fatty-structurant", names: ["stearyl alcohol", "cetyl alcohol", "cetearyl alcohol", "stearic acid", "sodium stearate"],
      category: "Fatty alcohol / structurant", role: "texture-structurant", risk: "ok",
      summary: "A waxy texture builder, not the drying kind of alcohol.", whatIs: "Fatty alcohols and stearates thicken sticks and creams and help them glide.",
      whyFlagged: "Not flagged; these are different from volatile ethanol or denatured alcohol.", healthRisk: "Low concern; rare irritation is possible.", studies: []
    },
    {
      id: "plant-emollients", names: ["caprylic capric triglyceride", "caprylic/capric triglyceride", "coconut oil", "cocos nucifera oil", "jojoba seed oil", "simmondsia chinensis seed oil", "sunflower seed oil", "helianthus annuus seed oil", "olive oil", "olea europaea fruit oil", "palm kernel oil", "hydrogenated soybean oil", "hydrogenated castor oil", "beeswax", "cera alba", "jojoba esters"],
      category: "Emollient / wax", role: "emollient", risk: "ok",
      summary: "Oils and waxes used for glide, softness and structure.", whatIs: "These lipids condition skin or give a solid product its shape.",
      whyFlagged: "Not flagged solely because they are plant-derived; formula fit and individual allergy still matter.", healthRisk: "Generally low concern; some oils may feel occlusive or trigger individual sensitivity.", studies: []
    },
    {
      id: "soap-base", names: ["sodium palmate", "sodium palm kernelate", "sodium cocoate", "sodium olivate", "saponified oils", "saponified oil"],
      category: "Saponified soap base", role: "cleanser-surfactant", risk: "limit",
      summary: "A traditional cleansing soap base that can be drying.", whatIs: "Saponified oils are fatty acids converted into soap with an alkali.",
      whyFlagged: "Effective rinse-off cleansing, but traditional soap can have a higher pH and strip dry or sensitive skin.", healthRisk: "Possible tightness, dryness or irritation; not a systemic toxicity concern.", studies: []
    },
    {
      id: "amine-oxide", names: ["c10-16 alkyldimethylamine oxide", "lauramine oxide", "cocamine oxide", "myristamine oxide"],
      category: "Amine-oxide surfactant", role: "cleanser-surfactant", risk: "limit",
      summary: "A grease-cutting and foam-supporting surfactant.", whatIs: "Amine oxides help dish and household cleaners lift oily soil.",
      whyFlagged: "The practical concern is skin and eye irritation from the concentrated product, plus down-the-drain environmental burden.", healthRisk: "Can irritate eyes or chapped hands; use as directed and rinse.", studies: []
    },
    {
      id: "nonionic-surfactant", names: ["c9-11 pareth-8", "deceth-8", "laureth-7", "c10-16 pareth"],
      category: "Nonionic surfactant", role: "cleanser-surfactant", risk: "limit",
      summary: "A grease-removing surfactant used in cleaners.", whatIs: "Pareth and deceth ingredients reduce surface tension so water can remove oils.",
      whyFlagged: "Usually a local irritation and environmental-screening issue, not proof of systemic harm; ethoxylated ingredients also depend on good manufacturing controls.",
      healthRisk: "Possible eye/skin irritation; environmental impact depends on biodegradation and aquatic toxicity.", studies: []
    },
    {
      id: "capb", names: ["cocamidopropyl betaine"],
      category: "Amphoteric surfactant", role: "cleanser-surfactant", risk: "limit",
      summary: "A milder foam booster that can still bother sensitized skin.", whatIs: "Cocamidopropyl betaine softens cleanser foam and reduces harshness.",
      whyFlagged: "Most people tolerate it, but allergy can occur, sometimes related to manufacturing impurities.", healthRisk: "Possible allergic contact dermatitis in susceptible people.", studies: []
    },
    {
      id: "hydrotrope", names: ["sodium cumene sulfonate", "sodium xylene sulfonate", "sodium xylenesulfonate"],
      category: "Hydrotrope", role: "formula-stabilizer", risk: "ok",
      summary: "Keeps a concentrated cleaner evenly mixed.", whatIs: "Hydrotropes help water carry surfactants and fragrance without separating.",
      whyFlagged: "Not flagged at normal formulation levels; concentrated product can still irritate eyes.", healthRisk: "Low concern in the finished rinse-off product.", studies: []
    },
    {
      id: "glycol-ether", names: ["dipropylene glycol butyl ether", "dpnb"],
      category: "Cleaning solvent", role: "carrier-solvent", risk: "limit",
      riskByContext: { "household-spray": "caution", "household-rinse-off": "limit" },
      summary: "A solvent that helps dissolve greasy soil.", whatIs: "Glycol ethers combine water and oil solubility, improving cleaning performance.",
      whyFlagged: "Spray use raises inhalation and eye-exposure potential; ventilation and directions matter more than the name alone.", healthRisk: "May irritate eyes, skin or airways with concentrated or poorly ventilated exposure.", studies: []
    },
    {
      id: "aerosol-propellants", names: ["butane", "isobutane", "propane", "nitrogen"],
      category: "Aerosol propellant", role: "propellant", risk: "limit",
      riskByContext: { "aerosol-body-spray": "caution" },
      summary: "Pressurizes the spray; the main issue is how the aerosol is used.", whatIs: "Compressed or liquefied gases push product from an aerosol can.",
      whyFlagged: "Flammability and deliberate or heavy inhalation are the key hazards; normal skin contact is not the main concern.", healthRisk: "Use away from heat and avoid breathing concentrated spray.", studies: []
    },
    {
      id: "emollient-esters", names: ["isopropyl myristate", "isopropyl palmitate", "c12-15 alkyl benzoate", "dicaprylyl ether"],
      category: "Emollient ester", role: "emollient", risk: "ok",
      summary: "Provides slip and a lighter skin feel.", whatIs: "Emollient esters help products spread smoothly and reduce a greasy feel.",
      whyFlagged: "Not generally a safety concern; acne-prone users may find some esters comedogenic.", healthRisk: "Low concern; possible pore-clogging or irritation for some users.", studies: []
    },
    {
      id: "bht", names: ["bht", "butylated hydroxytoluene"],
      category: "Antioxidant stabilizer", role: "antioxidant", risk: "limit",
      summary: "Prevents oils and fragrance from oxidizing.", whatIs: "BHT is a different antioxidant from BHA and is used in very small amounts to stabilize a formula.",
      whyFlagged: "Evidence at cosmetic exposure is mixed; a strict screen marks it for limiting without equating it to BHA or calling the whole product unsafe.", healthRisk: "Possible irritation or sensitization; systemic concern is uncertain at normal cosmetic use.", studies: []
    },
    {
      id: "declared-fragrance-allergens", names: ["limonene", "linalool", "citral", "coumarin", "citronellol", "geraniol", "eugenol", "amyl cinnamal", "hexyl cinnamal", "benzyl salicylate", "alpha-isomethyl ionone"],
      category: "Declared fragrance allergen", role: "fragrance-or-flavor", risk: "limit",
      riskByContext: { "leave-on-underarm": "caution", "aerosol-body-spray": "caution", "rinse-off-body": "limit", "household-rinse-off": "limit" },
      summary: "A named scent molecule with contact-allergy potential.", whatIs: "These fragrance components are listed separately so sensitive users can identify them.",
      whyFlagged: "They are not automatically harmful to everyone, but oxidized fragrance molecules can trigger contact allergy in susceptible people.", healthRisk: "Possible rash, itching or airway irritation in sensitive users.", studies: []
    },
    {
      id: "botanical-fragrance", names: ["naturally derived fragrance", "natural fragrance", "orange peel oil", "citrus aurantium dulcis peel oil", "pine leaf oil", "pine essential oil", "pinus palustris oil", "pinus sylvestris leaf oil", "peppermint oil", "mentha piperita oil", "menthol"],
      category: "Botanical fragrance / flavor", role: "fragrance-or-flavor", risk: "limit",
      riskByContext: { "leave-on-underarm": "caution", "oral-care": "limit", "rinse-off-body": "limit" },
      summary: "A natural-origin aromatic ingredient; natural does not mean allergy-free.", whatIs: "Essential oils and natural fragrance provide scent or flavor and contain multiple aromatic molecules.",
      whyFlagged: "The concern is irritation or allergy for sensitive users, not that botanical origin makes it better or worse by itself.", healthRisk: "Possible contact allergy, mouth irritation or photosensitivity depending on the oil and exposure.", studies: []
    },
    {
      id: "deodorant-absorbents", names: ["arrowroot", "arrowroot powder", "manihot esculenta powder", "manihot esculenta arrowroot powder", "charcoal powder", "activated charcoal", "kaolin clay", "kaolin", "maltodextrin"],
      category: "Absorbent powder", role: "absorbent", risk: "ok",
      summary: "Absorbs moisture or supports product texture.", whatIs: "Starches, clay and charcoal help manage wet feel or add color and texture.",
      whyFlagged: "Not flagged; these do not stop sweat like an antiperspirant and natural origin does not prove superior performance.", healthRisk: "Low concern in a stick or rinse-off bar; avoid inhaling loose powders.", studies: []
    },
    {
      id: "physical-exfoliants", names: ["oatmeal", "avena sativa kernel meal", "sand", "sea salt", "sodium chloride"],
      category: "Abrasive / texture agent", role: "abrasive", risk: "ok",
      riskByContext: { "rinse-off-body": "limit" },
      summary: "Adds scrub, texture or viscosity.", whatIs: "Grains, salt and mineral particles can thicken or physically exfoliate.",
      whyFlagged: "Not toxic, but coarse particles can over-exfoliate irritated skin; pressure and frequency matter.", healthRisk: "Possible mechanical irritation or dryness.", studies: []
    },
    {
      id: "deodorant-active-system", names: ["magnesium hydroxide", "triethyl citrate", "zinc neodecanoate", "zinc ricinoleate"],
      category: "Odor-control ingredient", role: "deodorant-active", risk: "ok",
      riskByContext: { "leave-on-underarm": "limit" },
      summary: "Controls odor without blocking sweat ducts.", whatIs: "These ingredients change odor chemistry, pH or bacterial activity in deodorant.",
      whyFlagged: "Generally low concern, though pH-active ingredients can irritate freshly shaved or sensitive underarms.", healthRisk: "Possible local stinging or rash; not an antiperspirant.", studies: []
    },
    {
      id: "ferments", names: ["lactobacillus ferment", "saccharomyces ferment", "ferment filtrate"],
      category: "Ferment / conditioning agent", role: "conditioning-agent", risk: "ok",
      summary: "A fermented ingredient used for conditioning or odor support.", whatIs: "Cosmetic ferments are processed ingredients or filtrates, not necessarily live probiotics.",
      whyFlagged: "Not flagged, but marketing claims should not be mistaken for proof of a clinical benefit.", healthRisk: "Generally low concern; rare individual sensitivity.", studies: []
    },
    {
      id: "oral-abrasives", names: ["hydrated silica", "calcium carbonate", "sodium bicarbonate"],
      category: "Toothpaste abrasive / buffer", role: "oral-abrasive", risk: "ok",
      summary: "Helps remove surface film and polish teeth.", whatIs: "Mineral abrasives and buffers clean teeth and help control formula pH.",
      whyFlagged: "Not automatically harsh; actual abrasivity depends on particle design and the complete toothpaste formula.", healthRisk: "Low concern as directed; aggressive brushing can cause abrasion regardless of ingredient list.", studies: []
    },
    {
      id: "oral-humectants", names: ["sorbitol", "xylitol"],
      category: "Oral-care humectant / sweetener", role: "oral-humectant", risk: "ok",
      summary: "Keeps toothpaste moist and improves taste without being an added dietary sugar.", whatIs: "Sorbitol and xylitol hold water in toothpaste and provide sweetness.",
      whyFlagged: "Not flagged for toothpaste use; the product is spit out rather than consumed as food.", healthRisk: "Low concern as directed; swallowing large amounts may cause digestive upset.", studies: []
    },
    {
      id: "oral-thickener", names: ["carrageenan", "cellulose gum", "xanthan gum"],
      category: "Oral-care thickener", role: "texture-structurant", risk: "ok",
      summary: "Keeps toothpaste evenly suspended.", whatIs: "Gums provide body and prevent liquid and solids from separating.",
      whyFlagged: "Not flagged in the short-contact, spit-and-rinse use of toothpaste.", healthRisk: "Low concern as directed.", studies: []
    },
    {
      id: "zinc-citrate", names: ["zinc citrate", "zinc citrate trihydrate"],
      category: "Oral-care active", role: "oral-care-active", risk: "ok",
      summary: "Helps control plaque, tartar or breath.", whatIs: "Zinc salts are used in toothpaste for oral-hygiene benefits.",
      whyFlagged: "Not flagged at toothpaste levels; follow label directions and spit out.", healthRisk: "Low concern as directed; may affect taste for some users.", studies: []
    },
    {
      id: "preservative-salts", names: ["sodium benzoate", "potassium sorbate"],
      category: "Preservative", role: "preservative", risk: "ok",
      summary: "Controls microbial spoilage in water-based products.", whatIs: "These preservative salts help keep a formula safe during normal use.",
      whyFlagged: "Not flagged at typical permitted levels; rare sensitivity is possible.", healthRisk: "Generally low concern; occasional irritation or allergy.", studies: []
    },
    {
      id: "benzyl-alcohol", names: ["benzyl alcohol"],
      category: "Preservative / fragrance component", role: "preservative", risk: "limit",
      summary: "A preservative and aromatic solvent with allergy potential.", whatIs: "Benzyl alcohol can preserve a formula or occur as a fragrance component.",
      whyFlagged: "Useful at controlled levels, but it can irritate or trigger contact allergy in susceptible people.", healthRisk: "Possible local irritation or allergy; low concern for most users at formula levels.", studies: []
    },
    {
      id: "volatile-alcohol", names: ["alcohol denat", "denatured alcohol", "sd alcohol", "ethanol", "isopropyl alcohol"],
      category: "Volatile solvent", role: "carrier-solvent", risk: "limit",
      riskByContext: { "aerosol-body-spray": "caution" },
      summary: "A quick-drying solvent that can be drying or irritating.", whatIs: "Volatile alcohol helps a spray dry quickly and carry fragrance.",
      whyFlagged: "High placement in a leave-on spray can dry skin and the airborne product should not be deliberately inhaled.", healthRisk: "Possible dryness, stinging and airway irritation with concentrated spray.", studies: []
    },
    {
      id: "botanical-extract", names: ["olive leaf extract", "olea europaea leaf extract", "pine tar"],
      category: "Botanical extract", role: "conditioning-agent", risk: "ok",
      riskByContext: { "rinse-off-body": "limit" },
      summary: "A plant-derived formula component; origin alone does not establish benefit or safety.", whatIs: "Botanical extracts can add scent, color or conditioning compounds.",
      whyFlagged: "Usually low concern in rinse-off use, but aromatic plant mixtures can irritate sensitive skin.", healthRisk: "Possible individual irritation or allergy.", studies: []
    },
    {
      id: "ph-adjusters", names: ["citric acid", "lactic acid", "sodium hydroxide", "aminomethyl propanol"],
      category: "pH adjuster", role: "ph-adjuster", risk: "ok",
      summary: "Sets the finished formula to its intended pH.", whatIs: "Acids and bases are added in controlled amounts to balance pH.",
      whyFlagged: "The raw chemical may be corrosive, but its presence does not mean the finished diluted product is caustic; final concentration and pH matter.", healthRisk: "Low concern in a properly formulated product; concentrated raw material can irritate or burn.", studies: []
    },
    {
      id: "simethicone", names: ["simethicone"],
      category: "Defoamer", role: "formula-stabilizer", risk: "ok",
      summary: "Controls unwanted foam during manufacturing or use.", whatIs: "Simethicone is a silicone-based antifoaming ingredient.",
      whyFlagged: "Not flagged; it is generally inert at formula levels.", healthRisk: "Low direct concern.", studies: []
    },
    {
      id: "declared-colorants", names: ["green 3", "ci 42053", "yellow 5", "ci 19140", "blue 1", "ci 42090", "red 40", "ci 16035"],
      category: "Declared colorant", role: "colorant", risk: "limit",
      summary: "Adds color but no cleaning or skin-care benefit.", whatIs: "Approved color additives identify or decorate the product.",
      whyFlagged: "A strict screen treats optional color as unnecessary, but a declared approved color is not the same risk as PPD hair dye.", healthRisk: "Low direct concern for most users; rare sensitivity is possible.", studies: []
    }
  );

  /* ---------------------------------------------------- concern buckets
   * Keyword fallback for the long tail of INCI names not in `additives`.
   * Each bucket key must also appear in `groups` below.                */
  const concernLists = {
    endocrine: [
      "resorcinol", "benzophenone", "homosalate", "octocrylene", "avobenzone",
      "butylphenyl methylpropional", "lilial", "cyclomethicone", "bpa", "bisphenol",
      "benzophenone-1", "benzophenone-2", "benzophenone-4", "ethylhexyl salicylate",
      "4-methylbenzylidene camphor", "3-benzylidene camphor", "genistein",
      "benzophenone-1", "benzophenone-2", "benzophenone-4", "4-methylbenzylidene camphor",
      "ethylhexyl salicylate", "octyl salicylate", "propyl gallate", "genistein",
      "octinoxate", "ethylhexyl methoxycinnamate", "benzophenone-3", "benzophenone-8",
      "padimate o", "ensulizole", "sulisobenzone", "bisphenol a", "bisphenol s",
      "triphenyl phosphate", "daidzein", "kaempferol", "octyl methoxycinnamate",
      "benzophenone-5", "benzophenone-6", "benzophenone-12", "4-hydroxybenzophenone",
      "octyl dimethyl paba", "padimate a", "enzacamene", "isoamyl p-methoxycinnamate",
      "butyl methoxydibenzoylmethane", "2-ethylhexyl salicylate", "menthyl anthranilate"
    ],
    formaldehydeReleaser: [
      "imidazolidinyl urea", "diazolidinyl urea", "sodium hydroxymethylglycinate",
      "bronopol", "2-bromo-2-nitropropane-1,3-diol", "polyoxymethylene urea",
      "methenamine", "hexamethylenetetramine", "glyoxal", "benzylhemiformal",
      "5-bromo-5-nitro-1,3-dioxane", "tris(hydroxymethyl) nitromethane",
      "dmdm hydantoin", "quaternium-15", "imidazolidinyl urea", "diazolidinyl urea",
      "sodium hydroxymethylglycinate", "methylene glycol", "formalin", "paraformaldehyde",
      "1,3-dimethylol-5,5-dimethylhydantoin", "ddmp", "dimethyloldimethyl hydantoin",
      "trimethylol nitromethane", "methanal", "oxymethylene"
    ],
    sulfate: [
      "ammonium lauryl sulfate", "ammonium laureth sulfate", "sodium myreth sulfate",
      "tea-lauryl sulfate", "sodium coco sulfate", "sodium lauryl sulfoacetate",
      "magnesium lauryl sulfate", "sodium cetearyl sulfate", "sodium c14-16 olefin sulfonate", "magnesium lauryl sulfate",
      "sodium c14-16 olefin sulfonate", "sodium xylenesulfonate", "ammonium xylenesulfonate",
      "sodium dodecylbenzenesulfonate", "linear alkylbenzene sulfonate", "sodium alpha-olefin sulfonate",
      "tea-dodecylbenzenesulfonate", "ammonium c12-15 pareth sulfate", "sodium c12-15 pareth sulfate",
      "sodium decyl sulfate", "sodium octyl sulfate",
      "potassium lauryl sulfate", "diethanolamine lauryl sulfate", "sodium lauryl ether sulfate",
      "sodium laureth-2 sulfate", "sodium laureth-3 sulfate", "ammonium lauryl ether sulfate",
      "tea-lauryl sulfate", "potassium cetyl sulfate", "sodium tridecyl sulfate"
    ],
    fragranceAllergen: [
      "limonene", "linalool", "citronellol", "geraniol", "eugenol", "coumarin",
      "cinnamal", "benzyl benzoate", "benzyl salicylate", "hexyl cinnamal", "amyl cinnamal", "farnesol",
      "citral", "isoeugenol", "cinnamyl alcohol", "anise alcohol",
      "alpha-isomethyl ionone", "hydroxycitronellal", "evernia prunastri", "evernia furfuracea",
      "isoeugenol", "citral", "anise alcohol", "benzyl cinnamate", "hydroxycitronellal",
      "alpha-isomethyl ionone", "methyl 2-octynoate", "evernia prunastri", "evernia furfuracea",
      "oakmoss extract", "cinnamyl alcohol", "butylphenyl methylpropional",
      "benzyl alcohol", "amylcinnamyl alcohol", "benzaldehyde", "isoeugenol", "methyl heptine carbonate",
      "acetylhexamethyl tetralin", "hydroxyisohexyl 3-cyclohexene carboxaldehyde", "hexamethylindanopyran",
      "3-propylidenephthalide", "salicylaldehyde", "dihydrocoumarin", "terpinolene",
      "carvone", "menthol", "vanillin", "cananga odorata", "rose ketone-4",
      "acetyl cedrene", "alpha-damascone", "beta-damascone", "delta-damascone", "damascenone",
      "amyl salicylate", "methyl salicylate", "anethole", "trans-anethole", "camphor",
      "eucalyptol", "linalyl acetate", "geranyl acetate", "isoeugenyl acetate", "methyl cinnamate",
      "myroxylon pereirae", "myroxylon pereirae resin", "santalol", "alpha-terpineol", "terpineol",
      "trimethylbenzenepropanol", "isobutyl quinoline", "neral", "geranial"
    ],
    sensitizer: [
      "methyldibromo glutaronitrile", "iodopropynyl butylcarbamate", "chlorphenesin",
      "propolis", "colophonium", "balsam of peru", "cocamidopropyl betaine",
      "lanolin", "thimerosal", "neomycin", "cocamidopropyl betaine",
      "chloroxylenol", "climbazole", "octylisothiazolinone", "benzisothiazolinone",
      "methylisothiazolinone", "methylchloroisothiazolinone", "propolis cera", "rosin",
      "abietic acid", "nickel sulfate", "potassium dichromate", "cobalt chloride",
      "glyceryl thioglycolate", "ammonium thioglycolate", "toluenesulfonamide formaldehyde resin",
      "dibromodicyanobutane", "sodium metabisulfite"
    ],
    alcoholDrying: [
      "alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "ethanol",
      "sd alcohol 40", "isopropanol", "sd alcohol 40-b", "alcohol denat.", "methanol",
      "benzyl alcohol", "propanol", "alcohol denatured"
    ],
    siliconeOther: [
      "cyclohexasiloxane", "phenyl trimethicone", "amodimethicone", "trimethicone",
      "dimethiconol", "trimethylsiloxysilicate", "cetyl dimethicone", "stearyl dimethicone",
      "behenoxy dimethicone", "bis-aminopropyl dimethicone",
      "cyclopentasiloxane", "cyclotetrasiloxane", "dimethicone crosspolymer", "dimethicone copolyol",
      "cetearyl methicone", "polysilicone-11", "caprylyl methicone", "hexamethyldisiloxane",
      "phenyl methicone", "cyclomethicone", "methicone"
    ],
    dye: [
      "lead acetate", "carbon black", "ci 77266",
      "ci 15985", "ci 17200", "ci 45380", "ci 45410", "chromium oxide greens", "ferric ferrocyanide", "p-aminophenol",
      "toluene-2,5-diamine", "basic brown 17", "hc blue", "ci 12490", "4-amino-2-hydroxytoluene",
      "ci 77491", "ci 77492", "ci 77499", "ci 73360", "ci 15850", "ci 45370", "ci 47005",
      "ci 42051", "ci 75470", "ci 77742", "ci 77000", "ci 77820", "d&c red 27", "d&c red 33",
      "p-phenylenediamine"
    ],
    phthalate: [
      "diethyl phthalate", "dibutyl phthalate", "dimethyl phthalate", "diethylhexyl phthalate",
      "di-n-butyl phthalate", "butyl benzyl phthalate", "diisononyl phthalate", "diisodecyl phthalate",
      "dep", "dbp", "dehp", "bbp", "dinp", "didp", "dmp"
    ],
    pegEthoxylate: [
      "peg-100 stearate", "peg-40 stearate", "peg-40 hydrogenated castor oil", "peg-7 glyceryl cocoate",
      "peg-150 distearate", "peg-12 dimethicone", "peg-8", "peg-32", "peg-75 lanolin",
      "ceteareth-20", "ceteareth-25", "ceteareth-12", "steareth-2", "steareth-20", "steareth-21",
      "laureth-4", "laureth-7", "laureth-23", "oleth-10", "oleth-20", "trideceth-6",
      "ppg-15 stearyl ether", "polysorbate 20", "polysorbate 60", "polysorbate 80",
      "peg-6", "peg-20", "peg-30", "peg-60", "peg-90", "peg-6 caprylic/capric glycerides",
      "peg-60 hydrogenated castor oil", "peg-40 sorbitan peroleate", "ceteareth-30", "ceteareth-6",
      "laureth-2", "laureth-9", "laureth-12", "oleth-5", "steareth-10", "steareth-100",
      "trideceth-9", "trideceth-12", "ppg-26-buteth-26", "ppg-12-buteth-16", "isoceteth-20"
    ],
    microplastic: [
      "polyethylene", "polypropylene", "nylon-12", "nylon-6", "acrylates copolymer",
      "acrylates crosspolymer", "polymethyl methacrylate", "polyethylene terephthalate",
      "styrene acrylates copolymer"
    ]
  };

  const concernMeta = {
    endocrine: { status: "caution", reason: "Possible hormone (endocrine) activity" },
    formaldehydeReleaser: { status: "caution", reason: "Releases formaldehyde over time" },
    sulfate: { status: "limit", reason: "Stripping sulfate surfactant" },
    fragranceAllergen: { status: "caution", reason: "Known fragrance allergen" },
    sensitizer: { status: "caution", reason: "Skin sensitizer / allergen" },
    alcoholDrying: { status: "limit", reason: "Drying alcohol" },
    siliconeOther: { status: "limit", reason: "Silicone (buildup / non-biodegradable)" },
    dye: { status: "caution", reason: "Colorant of concern" },
    phthalate: { status: "caution", reason: "Phthalate plasticizer (endocrine concern)" },
    pegEthoxylate: { status: "limit", reason: "Ethoxylated (possible 1,4-dioxane trace)" },
    microplastic: { status: "limit", reason: "Synthetic microplastic polymer" }
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
    siliconeOther: {
      category: "Silicone", status: "limit",
      summary: "A silicone conditioning agent that can build up and is poorly biodegradable.",
      whatIs: "Silicones give a smooth, slippery feel and seal the hair or skin surface.",
      whyFlagged: "Generally low-irritation, but heavier silicones can build up on hair and most do not biodegrade.",
      effects: "Possible buildup with frequent use; environmental persistence. Not a serious health hazard.",
      studies: []
    },
    dye: {
      category: "Colorant of concern", status: "caution",
      summary: "A colorant with contamination or toxicity concerns.",
      whatIs: "A pigment or dye used to color a personal-care product.",
      whyFlagged: "Some colorants carry heavy-metal contamination or other toxicity concerns.",
      effects: "Varies by colorant; possible irritation or contamination exposure.",
      studies: []
    },
    phthalate: {
      category: "Phthalate plasticizer", status: "caution",
      summary: "A plasticizer linked to possible hormone disruption.",
      whatIs: "Phthalates soften plastics and help fragrance and color cling; they often hide under the word \"fragrance\".",
      whyFlagged: "Several phthalates are suspected endocrine disruptors and are restricted in cosmetics and banned in children's products in the EU.",
      effects: "Possible hormonal and reproductive effects; evidence varies by specific phthalate.",
      studies: []
    },
    pegEthoxylate: {
      category: "Ethoxylated compound", status: "limit",
      summary: "A PEG/ethoxylated ingredient that can carry trace 1,4-dioxane.",
      whatIs: "PEG, -eth and polysorbate ingredients are made by ethoxylation to act as emulsifiers, solvents and surfactants.",
      whyFlagged: "The ethoxylation process can leave trace 1,4-dioxane (a probable carcinogen) unless purified; the ingredients themselves are generally low-hazard.",
      effects: "Low direct hazard; concern is residual 1,4-dioxane contamination and penetration enhancement.",
      studies: []
    },
    microplastic: {
      category: "Synthetic microplastic polymer", status: "limit",
      summary: "A solid plastic polymer used as a film-former, bulking or exfoliating agent.",
      whatIs: "These are synthetic plastics (polyethylene, nylon, acrylates, PMMA) added for texture, film or scrub beads.",
      whyFlagged: "They do not biodegrade and contribute to microplastic pollution; the EU is phasing out intentionally added microplastics.",
      effects: "Minimal direct health hazard; primary concern is environmental persistence.",
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

  const ingredientRoleMeta = {
    "carrier-solvent": { label: "Carrier / solvent", summary: "Carries, dissolves or delivers the active formula." },
    "cleanser-surfactant": { label: "Cleansing system", summary: "Lifts oil and soil; irritation depends on strength, concentration and rinse-off use." },
    "texture-structurant": { label: "Texture / structure", summary: "Controls thickness, glide or product shape." },
    "formula-stabilizer": { label: "Formula support", summary: "Keeps the product mixed, stable or at the intended pH." },
    "emollient": { label: "Emollient", summary: "Provides glide or skin conditioning." },
    "fragrance-or-flavor": { label: "Fragrance / flavor", summary: "Adds scent or taste; sensitivity and disclosure are assessed separately." },
    "propellant": { label: "Aerosol propellant", summary: "Delivers a spray; flammability and inhalation behavior matter." },
    "absorbent": { label: "Absorbent", summary: "Manages wet feel or supports texture without stopping sweat." },
    "abrasive": { label: "Abrasive / exfoliant", summary: "Provides physical cleaning or scrub; pressure and formula design matter." },
    "deodorant-active": { label: "Odor control", summary: "Targets odor without blocking sweat ducts." },
    "antiperspirant-active": { label: "Antiperspirant active", summary: "Reduces sweat using an FDA-regulated active ingredient." },
    "conditioning-agent": { label: "Conditioning agent", summary: "Supports skin feel or formula claims." },
    "oral-care-active": { label: "Oral-care active", summary: "Provides a labeled dental benefit when used as directed." },
    "oral-abrasive": { label: "Tooth-cleaning system", summary: "Polishes and cleans; whole-formula abrasivity matters." },
    "oral-humectant": { label: "Oral humectant", summary: "Keeps toothpaste moist and improves taste." },
    "ph-adjuster": { label: "pH control", summary: "Balances the finished formula; raw-material hazard is not the finished-product pH." },
    "colorant": { label: "Colorant", summary: "Adds appearance rather than core cleaning or care performance." },
    "preservative": { label: "Preservative", summary: "Protects a water-based formula from microbial spoilage." },
    "antioxidant": { label: "Antioxidant", summary: "Slows oxidation and rancidity." }
  };

  const useContexts = {
    "oral-care": { label: "Oral care", exposure: "Short contact in the mouth; brush, spit and rinse.", note: "Dental benefit and mouth sensitivity matter more than skin-care rules." },
    "leave-on-underarm": { label: "Leave-on underarm", exposure: "Repeated leave-on contact, often on warm or freshly shaved skin.", note: "Fragrance and pH-related irritation receive more weight." },
    "aerosol-body-spray": { label: "Aerosol body spray", exposure: "Brief skin exposure plus airborne droplets and a flammable propellant system.", note: "Ventilation, inhalation avoidance and fragrance sensitivity matter." },
    "rinse-off-body": { label: "Rinse-off body care", exposure: "Brief skin contact followed by rinsing.", note: "Cleansing strength and irritation matter more than long-term leave-on exposure." },
    "household-rinse-off": { label: "Dish care", exposure: "Repeated hand and eye exposure to a concentrated cleaner, followed by rinsing and down-drain release.", note: "Irritation, rinse quality, biodegradation and aquatic impact matter." },
    "household-spray": { label: "Household spray", exposure: "Hand, eye and potential inhalation exposure from a sprayed cleaner.", note: "Spray direction, ventilation and rinsing matter." },
    "general-beauty": { label: "Personal care", exposure: "Exposure varies by whether the product is rinsed off or left on.", note: "The package directions and exact formula determine the relevant context." },
    "general-household": { label: "Household product", exposure: "Potential skin, eye, inhalation and environmental exposure depends on use.", note: "Follow the product directions and never mix cleaners unless the label says to." }
  };

  /* Formula references are exact product records, never brand-wide guesses.
   * They supplement Open*Facts only for the matching name/barcode. The package
   * remains the source of truth because manufacturers can reformulate. */
  const referenceProducts = [
    {
      id: "axe-dark-temptation-antiperspirant", barcodes: ["079400061256"], aliases: ["axe dark temptation antiperspirant", "axe antiperspirant"],
      name: "Dark Temptation Antiperspirant Deodorant Stick", brand: "AXE", category: "antiperspirant deodorant stick", productType: "beauty", useContext: "leave-on-underarm",
      ingredientsText: "Aluminum zirconium tetrachlorohydrex gly, PPG-14 butyl ether, cyclopentasiloxane, stearyl alcohol, isopropyl palmitate, mineral oil, hydrogenated castor oil, PEG-8 distearate, fragrance (parfum), polyethylene, BHT, coumarin, limonene, linalool",
      source: "AXE official product page + DailyMed", sourceDate: "2026-07-18", sourceUrl: "https://www.axe.com/us/en/p/dark-temptation-antiperspirant-stick.html/00079400061256"
    },
    {
      id: "axe-dark-temptation-deodorant", barcodes: ["079400040404"], aliases: ["axe dark temptation deodorant stick", "axe aluminum free deodorant"],
      name: "Dark Temptation Aluminum-Free Deodorant Stick", brand: "AXE", category: "deodorant stick", productType: "beauty", useContext: "leave-on-underarm",
      ingredientsText: "Dipropylene glycol, aqua, propylene glycol, sodium stearate, C12-15 alkyl benzoate, parfum, disodium EDTA, BHT, simethicone, Green 3 (CI 42053)",
      source: "AXE official product page", sourceDate: "2026-07-18", sourceUrl: "https://www.axe.com/ca/en/p/dark-temptation-deodorant-stick.html/00079400040404"
    },
    {
      id: "axe-dark-temptation-body-spray", barcodes: ["079400523365"], aliases: ["axe dark temptation body spray", "axe body spray"],
      name: "Dark Temptation Deodorant Body Spray", brand: "AXE", category: "deodorant body spray", productType: "beauty", useContext: "aerosol-body-spray",
      ingredientsText: "Alcohol denat., butane, isobutane, propane, fragrance, zinc neodecanoate, nitrogen, isopropyl myristate, amyl cinnamal, citral, citronellol, coumarin, limonene, linalool",
      source: "AXE official product page", sourceDate: "2026-07-18", sourceUrl: "https://www.axe.com/us/en/p/dark-temptation-deodorant-body-spray.html/00079400523365"
    },
    {
      id: "dr-squatch-pine-tar-deodorant", barcodes: ["810095594663"], aliases: ["dr squatch pine tar deodorant", "pine tar deodorant"],
      name: "Pine Tar Deodorant", brand: "Dr. Squatch", category: "aluminum-free deodorant stick", productType: "beauty", useContext: "leave-on-underarm",
      ingredientsText: "Caprylic/Capric Triglyceride, Manihot Esculenta (Arrowroot) Powder, Stearyl Alcohol, Magnesium Hydroxide, Beeswax, Butyrospermum Parkii (Shea) Butter, Cocos Nucifera (Coconut) Oil, Triethyl Citrate, Simmondsia Chinensis (Jojoba) Seed Oil, Naturally Derived Fragrance, Jojoba Esters, Charcoal Powder, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Lactobacillus Ferment, Maltodextrin, Citrus Aurantium Dulcis (Orange) Peel Oil, Pinus Sylvestris Leaf Oil",
      analysisIngredientsText: "Caprylic/Capric Triglyceride, Arrowroot Powder, Stearyl Alcohol, Magnesium Hydroxide, Beeswax, Shea Butter, Coconut Oil, Triethyl Citrate, Jojoba Seed Oil, Naturally Derived Fragrance, Jojoba Esters, Charcoal Powder, Sunflower Seed Oil, Tocopherol, Lactobacillus Ferment, Maltodextrin, Orange Peel Oil, Pinus Sylvestris Leaf Oil",
      source: "Dr. Squatch official product page", sourceDate: "2026-07-18", sourceUrl: "https://www.drsquatch.com/products/pine-tar-deodorant-1"
    },
    {
      id: "dr-squatch-pine-tar-soap", barcodes: ["863765000001"], aliases: ["dr squatch pine tar soap", "pine tar bar soap"],
      name: "Pine Tar Bar Soap", brand: "Dr. Squatch", category: "bar soap", productType: "beauty", useContext: "rinse-off-body",
      ingredientsText: "Saponified oils of sustainable palm, coconut and olive, naturally derived fragrance, shea butter, pine tar, pine essential oil, oatmeal, sand, activated charcoal, kaolin clay, sea salt",
      source: "Dr. Squatch official product page", sourceDate: "2026-07-18", sourceUrl: "https://www.drsquatch.com/products/pine-tar"
    },
    {
      id: "dawn-ultra-original", barcodes: ["037000910640"], aliases: ["dawn ultra original", "dawn dish soap", "dawn ultra dishwashing liquid"],
      name: "Ultra Dishwashing Liquid Original Scent", brand: "Dawn", category: "hand dishwashing liquid", productType: "household", useContext: "household-rinse-off",
      ingredientsText: "Water, sodium lauryl sulfate, C10-16 alkyldimethylamine oxide, C9-11 Pareth-8, sodium chloride, PPG-26, PEG-8 propylheptyl ether, phenoxyethanol, methylisothiazolinone, fragrance, Yellow 5, Blue 1",
      source: "P&G SmartLabel", sourceDate: "2026-07-18", sourceUrl: "https://smartlabel.pg.com/en-us/00037000910640.html"
    },
    {
      id: "dawn-powerwash", barcodes: ["037000523642"], aliases: ["dawn powerwash", "dawn platinum powerwash", "dawn dish spray"],
      name: "Platinum Powerwash Dish Spray Fresh Clean", brand: "Dawn", category: "dish spray", productType: "household", useContext: "household-spray",
      ingredientsText: "Water, dipropylene glycol butyl ether, C10-16 alkyldimethylamine oxide, sodium laureth sulfate, sodium chloride, fragrance, phenoxyethanol, sodium hydroxide, sodium benzoate",
      source: "P&G SmartLabel", sourceDate: "2026-07-18", sourceUrl: "https://smartlabel.pg.com/00037000523642.html"
    },
    {
      id: "toms-whole-care-peppermint", barcodes: ["077326830833"], aliases: ["toms whole care peppermint", "tom's whole care toothpaste", "toms toothpaste"],
      name: "Whole Care Peppermint Toothpaste", brand: "Tom's of Maine", category: "anticavity toothpaste", productType: "beauty", useContext: "oral-care",
      ingredientsText: "Sodium monofluorophosphate 0.76%, glycerin, water, calcium carbonate, hydrated silica, xylitol, natural flavor (peppermint oil and other natural flavor), sodium lauryl sulfate, carrageenan, zinc citrate, sodium bicarbonate, benzyl alcohol",
      source: "U.S. National Library of Medicine DailyMed", sourceDate: "2026-06-01", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=fdbadaae-eab7-4d9a-acf7-815ca93f877c&type=display"
    },
    {
      id: "toms-mountain-spring-antiperspirant", barcodes: [], aliases: ["toms mountain spring antiperspirant", "tom's antiperspirant"],
      name: "Mountain Spring Antiperspirant", brand: "Tom's of Maine", category: "antiperspirant deodorant", productType: "beauty", useContext: "leave-on-underarm",
      ingredientsText: "Aluminum chlorohydrate 22%, palm kernel oil, stearyl alcohol, dicaprylyl ether, hydrogenated soybean oil, hydrogenated castor oil, natural fragrance, olive leaf extract, maltodextrin",
      source: "U.S. National Library of Medicine DailyMed", sourceDate: "2026-07-18", sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=b5b310d2-5a0d-47b1-8a07-a562f3faf9eb"
    }
  ];

  return {
    additives: additives,
    concernLists: concernLists,
    concernMeta: concernMeta,
    groups: groups,
    bannedMap: bannedMap,
    ingredientRoleMeta: ingredientRoleMeta,
    useContexts: useContexts,
    referenceProducts: referenceProducts
  };
})();
