/*
 * NutriCheck ingredient knowledge base.
 * Seeded from what Yuka / Bobby Approved commonly flag, with plain-English
 * explanations, a risk rating, and real, verifiable study/regulatory citations.
 *
 * risk:  "avoid"   - strong evidence or regulatory bans
 *        "caution" - meaningful concern / mixed evidence
 *        "limit"   - fine occasionally, not great in excess
 *        "ok"      - generally recognized as fine / whole-food
 *
 * Citations are summaries of real sources (IARC, EFSA, FDA, peer-reviewed
 * studies). They are starting points, not medical advice.
 */
var CB_DATA = (function () {
  const additives = [
    {
      id: "red40", names: ["red 40", "allura red", "red dye 40", "fd&c red no. 40", "e129"], enumber: "E129",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic petroleum-derived red dye linked to hyperactivity in children.",
      whatIs: "Allura Red AC is a synthetic azo dye made from petroleum, used to color candy, drinks, cereal and snacks. It has no nutritional purpose.",
      whyFlagged: "Purely cosmetic. Associated with behavioral effects in sensitive children and may contain trace carcinogenic contaminants (benzidine).",
      healthRisk: "Hyperactivity/attention effects in some children; possible allergic reactions. The EU requires a warning label on foods containing it.",
      studies: [
        { title: "McCann et al. — food additives and hyperactivity in children (Southampton study)", source: "The Lancet", year: 2007 },
        { title: "Health effects of synthetic food dyes (neurobehavioral review)", source: "California OEHHA report", year: 2021 }
      ]
    },
    {
      id: "yellow5", names: ["yellow 5", "tartrazine", "fd&c yellow no. 5", "e102"], enumber: "E102",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic yellow dye tied to hyperactivity and allergic reactions.",
      whatIs: "Tartrazine is a synthetic lemon-yellow azo dye used in soft drinks, chips, candy and sauces.",
      whyFlagged: "Cosmetic only; one of the dyes in the Southampton hyperactivity study. Can trigger reactions in aspirin-sensitive and asthmatic individuals.",
      healthRisk: "Hyperactivity in sensitive children; hives/asthma flare in a small subset. EU warning label required.",
      studies: [
        { title: "McCann et al. — food additives and hyperactivity (Southampton study)", source: "The Lancet", year: 2007 }
      ]
    },
    {
      id: "yellow6", names: ["yellow 6", "sunset yellow", "fd&c yellow no. 6", "e110"], enumber: "E110",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic orange-yellow dye with the same hyperactivity concerns.",
      whatIs: "Sunset Yellow FCF is a synthetic azo dye used in snacks, cheese products and beverages.",
      whyFlagged: "Cosmetic only; part of the Southampton dye study; possible contamination with carcinogenic byproducts.",
      healthRisk: "Hyperactivity in sensitive children; allergic responses. EU warning label required.",
      studies: [
        { title: "McCann et al. — food additives and hyperactivity (Southampton study)", source: "The Lancet", year: 2007 }
      ]
    },
    {
      id: "red3", names: ["red 3", "erythrosine", "fd&c red no. 3", "e127"], enumber: "E127",
      category: "Artificial color", risk: "avoid",
      summary: "Red dye the FDA banned from food in 2025 over cancer findings.",
      whatIs: "Erythrosine is a synthetic cherry-red dye historically used in candy, frosting and maraschino cherries.",
      whyFlagged: "Caused thyroid tumors in rats; already banned in cosmetics since 1990. The FDA revoked its authorization for food in January 2025.",
      healthRisk: "Animal carcinogen (thyroid). Being phased out of the U.S. food supply.",
      studies: [
        { title: "FDA revokes authorization for the use of Red No. 3 in food", source: "U.S. FDA", year: 2025 }
      ]
    },
    {
      id: "blue1", names: ["blue 1", "brilliant blue", "fd&c blue no. 1", "e133"], enumber: "E133",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic blue dye; cosmetic, with limited safety data.",
      whatIs: "Brilliant Blue FCF is a synthetic dye used in drinks, candy and ice cream.",
      whyFlagged: "No nutritional value; part of the synthetic-dye group flagged for neurobehavioral effects in children.",
      healthRisk: "Possible behavioral effects in sensitive children; occasional allergic reactions.",
      studies: [
        { title: "Health effects of synthetic food dyes", source: "California OEHHA report", year: 2021 }
      ]
    },
    {
      id: "titaniumdioxide", names: ["titanium dioxide", "e171"], enumber: "E171",
      category: "Whitening agent", risk: "avoid",
      summary: "Whitener banned in the EU after a genotoxicity concern.",
      whatIs: "Titanium dioxide (E171) is a white pigment used to brighten candy, gum, frosting and sauces.",
      whyFlagged: "EFSA concluded in 2021 that it can no longer be considered safe as a food additive because genotoxicity (DNA damage) could not be ruled out. Banned as a food additive in the EU since 2022.",
      healthRisk: "Possible genotoxicity; nanoparticles may accumulate. Still permitted in the U.S.",
      studies: [
        { title: "Safety assessment of titanium dioxide (E171) as a food additive", source: "EFSA Journal", year: 2021 }
      ]
    },
    {
      id: "potassiumbromate", names: ["potassium bromate", "e924"], enumber: "E924",
      category: "Flour treatment", risk: "avoid",
      summary: "Dough conditioner classified as a possible human carcinogen; banned in many countries.",
      whatIs: "Potassium bromate strengthens dough and is used in some breads and baked goods.",
      whyFlagged: "IARC lists it as Group 2B (possibly carcinogenic to humans). Banned in the EU, UK, Canada and elsewhere; California requires a warning.",
      healthRisk: "Kidney and thyroid tumors in animals; potential carcinogen.",
      studies: [
        { title: "IARC Monograph: potassium bromate (Group 2B)", source: "IARC", year: 1999 }
      ]
    },
    {
      id: "bha", names: ["bha", "butylated hydroxyanisole", "e320"], enumber: "E320",
      category: "Preservative", risk: "avoid",
      summary: "Antioxidant preservative 'reasonably anticipated' to be a carcinogen.",
      whatIs: "BHA prevents fats from going rancid in chips, cereal, cured meats and gum.",
      whyFlagged: "IARC Group 2B; the U.S. National Toxicology Program lists it as 'reasonably anticipated to be a human carcinogen.'",
      healthRisk: "Tumors in animal forestomach studies; possible endocrine effects.",
      studies: [
        { title: "Report on Carcinogens — butylated hydroxyanisole", source: "U.S. National Toxicology Program", year: 2021 },
        { title: "IARC Monograph: BHA (Group 2B)", source: "IARC", year: 1986 }
      ]
    },
    {
      id: "bht", names: ["bht", "butylated hydroxytoluene", "e321"], enumber: "E321",
      category: "Preservative", risk: "caution",
      summary: "Synthetic antioxidant preservative with mixed safety data.",
      whatIs: "BHT preserves fats and oils in cereals, snack foods and packaging.",
      whyFlagged: "Animal studies show conflicting tumor results; banned or restricted in some countries' foods.",
      healthRisk: "Possible liver and thyroid effects in animals; human evidence inconclusive.",
      studies: [
        { title: "Re-evaluation of BHT (E321) as a food additive", source: "EFSA Journal", year: 2012 }
      ]
    },
    {
      id: "tbhq", names: ["tbhq", "tertiary butylhydroquinone", "e319"], enumber: "E319",
      category: "Preservative", risk: "caution",
      summary: "Petroleum-derived preservative with limited intake limits.",
      whatIs: "TBHQ extends shelf life of fats in processed and fried foods, crackers and fast food.",
      whyFlagged: "Strict regulatory intake limits; some research links it to immune-system effects.",
      healthRisk: "High doses caused tumors/precursors in animals; possible effects on immune response.",
      studies: [
        { title: "Re-evaluation of TBHQ (E319) as a food additive", source: "EFSA Journal", year: 2016 }
      ]
    },
    {
      id: "sodiumnitrite", names: ["sodium nitrite", "sodium nitrate", "e250", "e251"], enumber: "E250",
      category: "Preservative (curing)", risk: "avoid",
      summary: "Curing agent in processed meats classed as a Group 1 carcinogen pathway.",
      whatIs: "Sodium nitrite/nitrate cures and colors bacon, hot dogs, deli meat and sausages.",
      whyFlagged: "Can form nitrosamines; the WHO/IARC classified processed meat as a Group 1 carcinogen (causes cancer in humans) in 2015.",
      healthRisk: "Colorectal cancer risk from processed meat consumption.",
      studies: [
        { title: "Carcinogenicity of consumption of red and processed meat (Group 1)", source: "IARC / The Lancet Oncology", year: 2015 }
      ]
    },
    {
      id: "aspartame", names: ["aspartame", "e951", "nutrasweet", "equal"], enumber: "E951",
      category: "Artificial sweetener", risk: "avoid",
      summary: "Artificial sweetener classified 'possibly carcinogenic' by IARC in 2023.",
      whatIs: "Aspartame is a low-calorie sweetener in diet sodas, sugar-free gum and 'light' products.",
      whyFlagged: "IARC classified it Group 2B (possibly carcinogenic) in 2023, though JECFA kept the acceptable daily intake. Unsafe for people with PKU.",
      healthRisk: "Possible (limited-evidence) cancer link; must be avoided by people with phenylketonuria (PKU).",
      studies: [
        { title: "Aspartame hazard and risk assessment (Group 2B)", source: "IARC / WHO–JECFA", year: 2023 }
      ]
    },
    {
      id: "sucralose", names: ["sucralose", "e955", "splenda"], enumber: "E955",
      category: "Artificial sweetener", risk: "avoid",
      summary: "Chlorinated sweetener; recent research raised genotoxicity questions.",
      whatIs: "Sucralose is a zero-calorie sweetener used in diet drinks, protein products and baked goods.",
      whyFlagged: "A 2023 study reported that a breakdown product, sucralose-6-acetate, may be genotoxic and affect gut health.",
      healthRisk: "Possible DNA/gut effects (emerging evidence); may alter gut microbiome.",
      studies: [
        { title: "Toxicological and pharmacokinetic properties of sucralose-6-acetate", source: "Journal of Toxicology and Environmental Health", year: 2023 }
      ]
    },
    {
      id: "acesulfame", names: ["acesulfame potassium", "acesulfame k", "ace-k", "e950"], enumber: "E950",
      category: "Artificial sweetener", risk: "avoid",
      summary: "Synthetic sweetener often paired with aspartame/sucralose.",
      whatIs: "Acesulfame-K is a calorie-free sweetener used in diet sodas and sugar-free foods.",
      whyFlagged: "Limited long-term human data; some animal and microbiome concerns.",
      healthRisk: "Possible effects on gut microbiome and metabolism (emerging evidence).",
      studies: [
        { title: "Non-nutritive sweeteners and the gut microbiome", source: "Microbiome / review literature", year: 2021 }
      ]
    },
    {
      id: "saccharin", names: ["saccharin", "e954", "sweet'n low"], enumber: "E954",
      category: "Artificial sweetener", risk: "avoid",
      summary: "Oldest artificial sweetener; historic (now-delisted) cancer concern.",
      whatIs: "Saccharin is a calorie-free sweetener used in tabletop packets and some diet products.",
      whyFlagged: "Caused bladder tumors in rats; removed from the U.S. carcinogen list in 2000 as the rat mechanism doesn't apply to humans, but still commonly limited.",
      healthRisk: "Low human risk per current consensus; possible microbiome effects.",
      studies: [
        { title: "Delisting of saccharin from Report on Carcinogens", source: "U.S. NTP", year: 2000 }
      ]
    },
    {
      id: "hfcs", names: ["high fructose corn syrup", "hfcs", "high-fructose corn syrup", "corn syrup"], enumber: "",
      category: "Added sugar", risk: "avoid",
      summary: "Cheap liquid sweetener tied to metabolic and obesity concerns.",
      whatIs: "HFCS is a corn-derived sweetener in sodas, sauces, bread and countless processed foods.",
      whyFlagged: "A marker of ultra-processed food; high intake is associated with obesity, fatty liver and type-2 diabetes.",
      healthRisk: "Excess added-sugar intake; metabolic and cardiovascular risk.",
      studies: [
        { title: "Added sugars and cardiovascular disease risk", source: "Circulation (AHA)", year: 2009 }
      ]
    },
    {
      id: "transfat", names: ["partially hydrogenated", "partially hydrogenated oil", "hydrogenated oil", "trans fat"], enumber: "",
      category: "Trans fat", risk: "avoid",
      summary: "Artificial trans fat the FDA removed from the safe list in 2018.",
      whatIs: "Partially hydrogenated oils create artificial trans fats used in margarine, fried foods and baked goods.",
      whyFlagged: "Strongly linked to heart disease; the FDA revoked GRAS status and effectively banned them in 2018; WHO targets global elimination.",
      healthRisk: "Raises LDL, lowers HDL; major cardiovascular disease risk.",
      studies: [
        { title: "Final determination regarding partially hydrogenated oils", source: "U.S. FDA", year: 2018 }
      ]
    },
    {
      id: "carrageenan", names: ["carrageenan", "e407"], enumber: "E407",
      category: "Thickener", risk: "caution",
      summary: "Seaweed-derived thickener linked to gut inflammation in studies.",
      whatIs: "Carrageenan thickens and stabilizes plant milks, deli meats, yogurt and ice cream.",
      whyFlagged: "Degraded carrageenan is an IARC Group 2B agent; food-grade carrageenan is debated, with animal studies showing intestinal inflammation.",
      healthRisk: "Possible digestive inflammation; evidence mixed for food-grade form.",
      studies: [
        { title: "Review of carrageenan and processed eucheuma seaweed", source: "EFSA / IARC", year: 2018 }
      ]
    },
    {
      id: "polysorbate80", names: ["polysorbate 80", "e433"], enumber: "E433",
      category: "Emulsifier", risk: "caution",
      summary: "Emulsifier shown to disturb the gut microbiome in research.",
      whatIs: "Polysorbate 80 keeps ingredients mixed in ice cream, sauces and supplements.",
      whyFlagged: "Studies show dietary emulsifiers can alter the gut microbiome and promote inflammation/metabolic changes.",
      healthRisk: "Possible gut-barrier and microbiome disruption (animal + emerging human data).",
      studies: [
        { title: "Dietary emulsifiers impact the mouse gut microbiota promoting colitis", source: "Nature (Chassaing et al.)", year: 2015 }
      ]
    },
    {
      id: "cmc", names: ["carboxymethylcellulose", "cellulose gum", "e466"], enumber: "E466",
      category: "Emulsifier", risk: "caution",
      summary: "Common emulsifier with the same gut-microbiome concerns.",
      whatIs: "Carboxymethylcellulose (cellulose gum) thickens ice cream, dressings and gluten-free foods.",
      whyFlagged: "Part of the emulsifier group shown to alter gut bacteria and intestinal lining in studies.",
      healthRisk: "Possible microbiome disruption and intestinal inflammation.",
      studies: [
        { title: "Randomized controlled-feeding study of carboxymethylcellulose in humans", source: "Gastroenterology", year: 2022 }
      ]
    },
    {
      id: "msg", names: ["monosodium glutamate", "msg", "e621"], enumber: "E621",
      category: "Flavor enhancer", risk: "limit",
      summary: "Flavor enhancer; the old 'MSG syndrome' is largely not supported.",
      whatIs: "MSG is a sodium salt of glutamate used to add savory (umami) flavor to snacks, soups and fast food.",
      whyFlagged: "Generally recognized as safe; the historic 'Chinese restaurant syndrome' has not held up in controlled trials, but sensitive people report symptoms and it signals processed food.",
      healthRisk: "Mostly safe in normal amounts; transient symptoms in a small subset.",
      studies: [
        { title: "Re-evaluation of glutamic acid and glutamates as food additives", source: "EFSA Journal", year: 2017 }
      ]
    },
    {
      id: "sodiumbenzoate", names: ["sodium benzoate", "e211"], enumber: "E211",
      category: "Preservative", risk: "caution",
      summary: "Preservative that can form benzene when combined with vitamin C.",
      whatIs: "Sodium benzoate prevents microbial growth in sodas, juices, dressings and condiments.",
      whyFlagged: "With ascorbic acid (vitamin C) and heat/light it can form benzene, a carcinogen; also part of the Southampton hyperactivity mixtures.",
      healthRisk: "Benzene formation risk in acidic drinks; behavioral effects with dyes.",
      studies: [
        { title: "Benzene in beverages — survey and guidance", source: "U.S. FDA", year: 2007 }
      ]
    },
    {
      id: "caramel4", names: ["caramel color", "caramel colour", "e150d", "caramel color iv"], enumber: "E150d",
      category: "Artificial color", risk: "caution",
      summary: "Cola-type caramel coloring can contain the contaminant 4-MEI.",
      whatIs: "Class III/IV caramel color browns colas, sauces and baked goods.",
      whyFlagged: "Ammonia-process caramel can contain 4-methylimidazole (4-MEI); IARC lists 4-MEI as Group 2B and California requires a warning above set levels.",
      healthRisk: "Possible carcinogen exposure (4-MEI) in some sodas/sauces.",
      studies: [
        { title: "IARC Monograph: 4-methylimidazole (Group 2B)", source: "IARC", year: 2011 }
      ]
    },
    {
      id: "bvo", names: ["brominated vegetable oil", "bvo"], enumber: "",
      category: "Emulsifier", risk: "avoid",
      summary: "Citrus-soda emulsifier whose food use the FDA revoked in 2024.",
      whatIs: "Brominated vegetable oil kept citrus flavor evenly mixed in some sodas.",
      whyFlagged: "Bromine can accumulate in the body; the FDA revoked authorization for BVO in food in 2024. Long banned in the EU and Japan.",
      healthRisk: "Bromine accumulation; thyroid and neurological concerns at high intake.",
      studies: [
        { title: "FDA revokes authorization for the use of brominated vegetable oil", source: "U.S. FDA", year: 2024 }
      ]
    },
    {
      id: "azodicarbonamide", names: ["azodicarbonamide", "ada", "e927a"], enumber: "",
      category: "Flour treatment", risk: "avoid",
      summary: "Dough conditioner (also used in foamed plastics) banned in the EU.",
      whatIs: "Azodicarbonamide bleaches flour and conditions dough in some commercial breads and buns.",
      whyFlagged: "Can break down into semicarbazide and urethane (a carcinogen) during baking. Banned in the EU and Australia.",
      healthRisk: "Possible carcinogenic breakdown products; respiratory sensitizer.",
      studies: [
        { title: "Azodicarbonamide — toxicological evaluation", source: "WHO/IPCS", year: 1999 }
      ]
    },
    {
      id: "propylparaben", names: ["propylparaben", "propyl paraben", "e216"], enumber: "E216",
      category: "Preservative", risk: "caution",
      summary: "Preservative with endocrine-disruption concerns; banned in EU food.",
      whatIs: "Propylparaben preserves some baked goods and processed foods.",
      whyFlagged: "Acts as a weak estrogen; the EU removed it from the approved food-additive list.",
      healthRisk: "Possible endocrine (hormone) disruption.",
      studies: [
        { title: "Re-evaluation of parabens as food additives", source: "EFSA Journal", year: 2004 }
      ]
    },
    {
      id: "propyleneglycol", names: ["propylene glycol", "e1520"], enumber: "E1520",
      category: "Humectant/solvent", risk: "limit",
      summary: "Multi-use additive (also in antifreeze) allowed in food at limits.",
      whatIs: "Propylene glycol keeps foods moist and carries flavors in cake mixes, dressings and drinks.",
      whyFlagged: "Generally recognized as safe in food amounts, but a marker of heavily processed products; banned in food in the EU.",
      healthRisk: "Low risk at food levels; high intake can stress kidneys/liver.",
      studies: [
        { title: "Propylene glycol — food additive evaluation", source: "U.S. FDA GRAS / EFSA", year: 2018 }
      ]
    },
    {
      id: "phosphoricacid", names: ["phosphoric acid", "e338"], enumber: "E338",
      category: "Acidulant", risk: "limit",
      summary: "Cola acid linked to lower bone density at high soda intake.",
      whatIs: "Phosphoric acid gives colas their tang and acts as a preservative.",
      whyFlagged: "Heavy cola consumption is associated with reduced bone mineral density and dental erosion.",
      healthRisk: "Bone density and dental concerns with high soda intake.",
      studies: [
        { title: "Cola consumption and bone mineral density", source: "American Journal of Clinical Nutrition", year: 2006 }
      ]
    },
    {
      id: "maltodextrin", names: ["maltodextrin"], enumber: "",
      category: "Filler/carbohydrate", risk: "limit",
      summary: "Highly processed starch with a very high glycemic index.",
      whatIs: "Maltodextrin is a starch-derived powder used as a filler, thickener and sweetener-carrier.",
      whyFlagged: "Spikes blood sugar faster than table sugar; signals ultra-processing and may affect gut bacteria.",
      healthRisk: "Blood-sugar spikes; possible gut-microbiome effects.",
      studies: [
        { title: "Maltodextrin and intestinal mucus / microbiota", source: "PLOS ONE", year: 2012 }
      ]
    },
    {
      id: "modifiedstarch", names: ["modified corn starch", "modified food starch", "modified starch"], enumber: "",
      category: "Thickener", risk: "limit",
      summary: "Chemically/physically altered starch; marker of processed food.",
      whatIs: "Modified food starch is treated to improve texture and stability in sauces, soups and snacks.",
      whyFlagged: "Not harmful per se, but indicates a highly processed product; offers little nutrition.",
      healthRisk: "Low direct risk; ultra-processing marker.",
      studies: []
    },
    {
      id: "carmine", names: ["carmine", "cochineal", "carminic acid", "e120"], enumber: "E120",
      category: "Natural color", risk: "avoid",
      summary: "Insect-derived red color that can cause severe allergic reactions.",
      whatIs: "Carmine is a red dye made from cochineal insects, used in yogurt, juice and candy.",
      whyFlagged: "Can trigger serious allergic reactions/anaphylaxis in sensitive people; not vegetarian/vegan.",
      healthRisk: "Allergy/anaphylaxis risk in sensitive individuals.",
      studies: [
        { title: "Cochineal/carmine hypersensitivity reports", source: "Journal of Allergy and Clinical Immunology", year: 2009 }
      ]
    },
    {
      id: "propylgallate", names: ["propyl gallate", "e310"], enumber: "E310",
      category: "Preservative", risk: "caution",
      summary: "Antioxidant preservative with possible endocrine effects.",
      whatIs: "Propyl gallate prevents fats from spoiling in meat products, snacks and gum.",
      whyFlagged: "Some animal data suggest possible endocrine and tumor effects; often used with BHA/BHT.",
      healthRisk: "Possible hormone effects; limited human data.",
      studies: [
        { title: "Re-evaluation of propyl gallate (E310)", source: "EFSA Journal", year: 2014 }
      ]
    },
    {
      id: "erythritol", names: ["erythritol", "e968"], enumber: "E968",
      category: "Sugar alcohol", risk: "caution",
      summary: "Zero-calorie sweetener linked in 2023 research to cardiovascular events.",
      whatIs: "Erythritol is a sugar alcohol used to sweeten 'keto', 'sugar-free' and low-calorie products.",
      whyFlagged: "A 2023 study associated higher blood erythritol with increased risk of heart attack and stroke and showed it can promote clotting; more research is ongoing.",
      healthRisk: "Possible cardiovascular/clotting effects (emerging); can cause bloating and diarrhea in larger amounts.",
      studies: [
        { title: "The artificial sweetener erythritol and cardiovascular event risk", source: "Nature Medicine (Witkowski et al.)", year: 2023 }
      ]
    },
    {
      id: "monodiglycerides", names: ["mono and diglycerides", "monoglycerides", "diglycerides", "mono- and diglycerides", "e471"], enumber: "E471",
      category: "Emulsifier", risk: "limit",
      summary: "Common emulsifier that can hide a source of artificial trans fat.",
      whatIs: "Mono- and diglycerides keep oil and water mixed in bread, peanut butter, margarine and ice cream.",
      whyFlagged: "Because they're classified as emulsifiers (not fats), products can contain small amounts of trans fat from them without it showing on the label.",
      healthRisk: "Possible hidden trans fat; marker of processed food.",
      studies: [
        { title: "Re-evaluation of mono- and diglycerides of fatty acids (E471)", source: "EFSA Journal", year: 2017 }
      ]
    },
    {
      id: "calciumpropionate", names: ["calcium propionate", "e282", "propionate"], enumber: "E282",
      category: "Preservative", risk: "limit",
      summary: "Mold-inhibiting bread preservative with some behavioral questions.",
      whatIs: "Calcium propionate stops mold and bacteria in breads and baked goods.",
      whyFlagged: "Generally considered safe, but small studies have linked it to irritability/sleep issues in some children.",
      healthRisk: "Possible behavioral effects in sensitive children (limited evidence).",
      studies: [
        { title: "Behavioural effects of calcium propionate in children", source: "Journal of Paediatrics and Child Health (Dengate)", year: 2002 }
      ]
    },
    {
      id: "sulfites", names: ["sulfur dioxide", "sulphur dioxide", "sodium sulfite", "sodium bisulfite", "sodium metabisulfite", "potassium metabisulfite", "sulfites", "sulphites", "e220", "e223"], enumber: "E220",
      category: "Preservative", risk: "caution",
      summary: "Preservative in wine and dried fruit that triggers asthma in some people.",
      whatIs: "Sulfites preserve color and prevent spoilage in dried fruit, wine, juices and some processed potatoes.",
      whyFlagged: "Can cause asthma attacks and allergic-type reactions in sensitive people; the FDA requires labeling above 10 ppm.",
      healthRisk: "Asthma/breathing reactions in sulfite-sensitive individuals.",
      studies: [
        { title: "Sulfite sensitivity and asthma", source: "Journal of Allergy and Clinical Immunology", year: 1986 }
      ]
    },
    {
      id: "sodiumphosphate", names: ["sodium phosphate", "disodium phosphate", "trisodium phosphate", "phosphate", "e339"], enumber: "E339",
      category: "Additive (phosphate)", risk: "limit",
      summary: "Phosphate additive; high intake is a concern for kidney/heart health.",
      whatIs: "Sodium phosphates are used to adjust texture, leaven, and retain moisture in processed cheese, meats and baked goods.",
      whyFlagged: "Diets high in added phosphates are linked to cardiovascular and kidney concerns, especially for people with kidney disease.",
      healthRisk: "High added-phosphate intake associated with vascular and kidney effects.",
      studies: [
        { title: "Phosphate additives in food and health", source: "Deutsches Ärzteblatt International", year: 2012 }
      ]
    },
    {
      id: "edta", names: ["disodium edta", "calcium disodium edta", "edta", "e385"], enumber: "E385",
      category: "Preservative (chelator)", risk: "limit",
      summary: "Preservative that binds metals; fine in small amounts.",
      whatIs: "EDTA preserves color and flavor in dressings, sauces, canned goods and soda by binding trace metals.",
      whyFlagged: "Safe at the small amounts used in food, but a marker of heavily processed products; high doses can affect mineral absorption.",
      healthRisk: "Low risk at food levels; possible mineral binding at high intake.",
      studies: [
        { title: "Safety of calcium disodium EDTA as a food additive", source: "EFSA Journal", year: 2018 }
      ]
    },
    {
      id: "soylecithin", names: ["soy lecithin", "soya lecithin", "lecithin", "e322"], enumber: "E322",
      category: "Emulsifier", risk: "ok",
      summary: "Common, generally safe emulsifier (often from soy or sunflower).",
      whatIs: "Lecithin keeps ingredients blended in chocolate, dressings and baked goods; usually derived from soy or sunflower.",
      whyFlagged: "Widely regarded as safe. Note: soy-derived lecithin is a concern only for those avoiding soy/allergic.",
      healthRisk: "No significant concerns for most people.",
      studies: []
    },
    {
      id: "xanthangum", names: ["xanthan gum", "e415"], enumber: "E415",
      category: "Thickener", risk: "ok",
      summary: "Fermented thickener; safe for most, gas in large amounts.",
      whatIs: "Xanthan gum thickens and stabilizes dressings, gluten-free baked goods and sauces.",
      whyFlagged: "Generally recognized as safe; very large amounts can cause bloating or act as a laxative.",
      healthRisk: "Minimal; digestive upset only at high intake.",
      studies: []
    },
    {
      id: "citricacid", names: ["citric acid", "e330"], enumber: "E330",
      category: "Acidulant", risk: "ok",
      summary: "Common sour/preservative acid; safe, though usually manufactured.",
      whatIs: "Citric acid adds tartness and preserves freshness in drinks, candy and canned foods. Most commercial citric acid is made by fermentation, not from citrus.",
      whyFlagged: "Generally safe; a rare manufactured-citric-acid sensitivity has been reported in isolated cases.",
      healthRisk: "No significant concerns for most people.",
      studies: []
    },
    {
      id: "amaranth", names: ["amaranth", "red 2", "fd&c red no. 2", "e123"], enumber: "E123",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic red dye banned in the United States since 1976.",
      whatIs: "Amaranth (Red No. 2) is a synthetic azo dye once used to color foods and drinks.",
      whyFlagged: "Studies tied it to cancer in animals; the FDA banned it from food in 1976. Still permitted in limited uses in some countries.",
      healthRisk: "Possible carcinogen (animal data); part of the azo-dye group linked to hyperactivity.",
      studies: [
        { title: "FDA ban of FD&C Red No. 2 (amaranth)", source: "U.S. FDA", year: 1976 }
      ]
    },
    {
      id: "quinolineyellow", names: ["quinoline yellow", "e104"], enumber: "E104",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic yellow dye not approved for food in the U.S.",
      whatIs: "Quinoline Yellow is a synthetic dye used in some sweets, drinks and medicines outside the U.S.",
      whyFlagged: "One of the 'Southampton Six' dyes linked to hyperactivity; not approved as a food color in the United States and carries a warning label in the EU.",
      healthRisk: "Hyperactivity in sensitive children; possible allergic reactions.",
      studies: [
        { title: "McCann et al. — food additives and hyperactivity (Southampton study)", source: "The Lancet", year: 2007 }
      ]
    },
    {
      id: "ponceau4r", names: ["ponceau 4r", "ponceau", "e124", "cochineal red a"], enumber: "E124",
      category: "Artificial color", risk: "avoid",
      summary: "Synthetic red dye banned in the U.S. and Norway.",
      whatIs: "Ponceau 4R is a synthetic azo dye used to color sweets, drinks and desserts in some countries.",
      whyFlagged: "Banned in the United States and Norway; part of the Southampton hyperactivity study; possible carcinogenic concerns in animal studies.",
      healthRisk: "Hyperactivity in sensitive children; allergic reactions; animal-study concerns.",
      studies: [
        { title: "McCann et al. — food additives and hyperactivity (Southampton study)", source: "The Lancet", year: 2007 }
      ]
    },
    {
      id: "guargum", names: ["guar gum", "guaran", "e412"], enumber: "E412",
      category: "Thickener (soluble fiber)", risk: "ok",
      summary: "Natural soluble fiber from the guar bean used to thicken and stabilize.",
      whatIs: "Guar gum is ground endosperm of the guar bean (a legume). It thickens and stabilizes sauces, dairy, gluten-free baked goods and ice cream.",
      whyFlagged: "Considered safe and is itself a soluble fiber. Very large amounts can cause bloating, gas or loose stools, and powdered supplements have rarely caused esophageal blockage.",
      healthRisk: "At food-use levels it is benign and may modestly aid blood sugar and cholesterol; digestive upset only at high doses.",
      studies: [{ title: "Re-evaluation of guar gum (E 412) as a food additive", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "locustbeangum", names: ["locust bean gum", "carob bean gum", "carob gum", "e410"], enumber: "E410",
      category: "Thickener (soluble fiber)", risk: "ok",
      summary: "Natural gum from carob seeds; common, well-tolerated stabilizer.",
      whatIs: "Locust bean gum is extracted from the seeds of the carob tree and used to thicken and stabilize dairy, ice cream and plant milks.",
      whyFlagged: "Regarded as safe; a soluble fiber. Only flagged as a marker of processed food, and rare digestive upset at very high intake.",
      healthRisk: "Benign at food levels. EFSA found no safety concern at reported uses.",
      studies: [{ title: "Re-evaluation of locust bean gum (E 410) as a food additive", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "gellangum", names: ["gellan gum", "e418"], enumber: "E418",
      category: "Thickener / gelling agent", risk: "ok",
      summary: "Fermentation-derived gum used to suspend and gel; well-tolerated.",
      whatIs: "Gellan gum is made by bacterial fermentation and is used to suspend particles in plant milks and to gel jellies and desserts.",
      whyFlagged: "Considered safe; mainly a marker of processed/formulated products. Large amounts may be mildly laxative.",
      healthRisk: "Benign at normal use levels; no established toxicity.",
      studies: [{ title: "Re-evaluation of gellan gum (E 418) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "pectin", names: ["pectin", "amidated pectin", "e440"], enumber: "E440",
      category: "Gelling agent (soluble fiber)", risk: "ok",
      summary: "Natural fruit fiber used to set jams and thicken foods.",
      whatIs: "Pectin is a soluble fiber found naturally in apples and citrus peel, extracted to gel jams, jellies and fillings.",
      whyFlagged: "Safe and natural; itself a beneficial soluble fiber. Not a health concern.",
      healthRisk: "Benign; may modestly support cholesterol and blood-sugar control as a fiber.",
      studies: [{ title: "Re-evaluation of pectins (E 440) as food additives", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "gumarabic", names: ["gum arabic", "acacia gum", "gum acacia", "e414"], enumber: "E414",
      category: "Stabilizer (soluble fiber)", risk: "ok",
      summary: "Natural acacia tree sap used to emulsify and stabilize; a prebiotic fiber.",
      whatIs: "Gum arabic is the dried sap of acacia trees, used to stabilize soft drinks, emulsify flavors and glaze candy.",
      whyFlagged: "Long history of safe use and acts as a prebiotic soluble fiber. Not a concern.",
      healthRisk: "Benign; generally well tolerated, mild gas at very high intake.",
      studies: [{ title: "Re-evaluation of acacia gum (E 414) as a food additive", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "sodiumcitrate", names: ["sodium citrate", "trisodium citrate", "monosodium citrate", "e331"], enumber: "E331",
      category: "Acidity regulator / emulsifying salt", risk: "ok",
      summary: "Citric-acid salt used to control acidity and emulsify cheese; benign.",
      whatIs: "Sodium citrate is the sodium salt of citric acid, used to buffer acidity, give a tart flavor, and keep melted cheese smooth.",
      whyFlagged: "Recognized as safe. Adds a small amount of sodium; otherwise not a concern.",
      healthRisk: "Benign at food levels; relevant only as a minor sodium source.",
      studies: [{ title: "Re-evaluation of citric acid and its salts (E 330–333) as food additives", source: "EFSA Journal", year: 2022 }]
    },
    {
      id: "potassiumsorbate", names: ["potassium sorbate", "e202"], enumber: "E202",
      category: "Preservative", risk: "limit",
      summary: "Widely used mold/yeast preservative; low toxicity but a processing marker.",
      whatIs: "Potassium sorbate is the potassium salt of sorbic acid, used to stop mold and yeast in cheese, wine, baked goods and dips.",
      whyFlagged: "One of the gentler preservatives, but still a synthetic additive; rare skin/contact irritation and a marker of processed food.",
      healthRisk: "Generally recognized as safe; occasional mild allergic or irritant reactions.",
      studies: [{ title: "Re-evaluation of sorbic acid and salts (E 200, 202, 203) as food additives", source: "EFSA Journal", year: 2015 }]
    },
    {
      id: "sodiumerythorbate", names: ["sodium erythorbate", "erythorbic acid", "e316", "e315"], enumber: "E316",
      category: "Antioxidant", risk: "ok",
      summary: "Vitamin-C-related antioxidant used to preserve color in cured meats.",
      whatIs: "Sodium erythorbate is a stereoisomer of vitamin C used to fix color and prevent oxidation in cured and processed meats.",
      whyFlagged: "Low toxicity itself; mainly a signal that the product is cured/processed meat (the bigger concern).",
      healthRisk: "Benign as an additive; the cured-meat matrix it accompanies is the real consideration.",
      studies: [{ title: "Re-evaluation of erythorbic acid and salts (E 315, 316) as food additives", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "ascorbicacid", names: ["ascorbic acid", "l-ascorbic acid", "vitamin c", "e300"], enumber: "E300",
      category: "Antioxidant (vitamin C)", risk: "ok",
      summary: "Vitamin C used as a natural antioxidant; beneficial.",
      whatIs: "Ascorbic acid is vitamin C, added to preserve color and freshness and to fortify foods.",
      whyFlagged: "Not a concern — it is an essential nutrient and antioxidant.",
      healthRisk: "Benign and beneficial at food levels.",
      studies: [{ title: "Scientific opinion on the re-evaluation of ascorbic acid (E 300)", source: "EFSA Journal", year: 2015 }]
    },
    {
      id: "tocopherols", names: ["tocopherols", "mixed tocopherols", "alpha-tocopherol", "vitamin e", "e306", "e307", "e308", "e309"], enumber: "E306",
      category: "Antioxidant (vitamin E)", risk: "ok",
      summary: "Vitamin-E antioxidants used to keep oils from going rancid; beneficial.",
      whatIs: "Tocopherols are forms of vitamin E used as natural antioxidants to protect fats and oils from oxidation.",
      whyFlagged: "Not a concern — a natural, nutrient antioxidant, often used in place of BHA/BHT.",
      healthRisk: "Benign and beneficial at food levels.",
      studies: [{ title: "Re-evaluation of tocopherols (E 306–309) as food additives", source: "EFSA Journal", year: 2015 }]
    },
    {
      id: "lacticacid", names: ["lactic acid", "e270"], enumber: "E270",
      category: "Acidity regulator", risk: "ok",
      summary: "Natural acid (also made by fermentation) used to adjust tartness; benign.",
      whatIs: "Lactic acid occurs naturally in fermented foods like yogurt and sourdough and is added to regulate acidity and act as a mild preservative.",
      whyFlagged: "Recognized as safe; not a health concern.",
      healthRisk: "Benign at food levels.",
      studies: [{ title: "Re-evaluation of lactic acid (E 270) as a food additive", source: "EFSA Journal", year: 2019 }]
    },
    {
      id: "malicacid", names: ["malic acid", "dl-malic acid", "e296"], enumber: "E296",
      category: "Acidity regulator", risk: "ok",
      summary: "Tart fruit acid (found in apples) used as a flavor/acidity agent; benign.",
      whatIs: "Malic acid gives apples and grapes their sourness and is added to candy, drinks and baked goods for tartness.",
      whyFlagged: "Recognized as safe; not a health concern.",
      healthRisk: "Benign at food levels.",
      studies: [{ title: "Re-evaluation of malic acid (E 296) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "ssl", names: ["sodium stearoyl lactylate", "sodium stearoyl-2-lactylate", "ssl", "e481", "calcium stearoyl lactylate", "e482"], enumber: "E481",
      category: "Emulsifier / dough conditioner", risk: "limit",
      summary: "Synthetic emulsifier and dough strengthener; a marker of processed bread.",
      whatIs: "Sodium stearoyl lactylate is a synthetic emulsifier used to strengthen dough and improve texture and volume in commercial bread and baked goods.",
      whyFlagged: "Considered safe at use levels but is a processing aid typical of ultra-processed baked goods.",
      healthRisk: "No established toxicity at food levels; mainly an ultra-processing marker.",
      studies: [{ title: "Re-evaluation of stearoyl lactylates (E 481, 482) as food additives", source: "EFSA Journal", year: 2013 }]
    },
    {
      id: "datem", names: ["datem", "diacetyl tartaric acid esters of mono- and diglycerides", "e472e"], enumber: "E472e",
      category: "Emulsifier / dough conditioner", risk: "limit",
      summary: "Synthetic dough emulsifier common in commercial bread; processing marker.",
      whatIs: "DATEM is a synthetic emulsifier made from glycerides and tartaric acid, used to condition dough and improve loaf volume.",
      whyFlagged: "Approved and considered safe, but an emulsifier typical of ultra-processed bakery products; some animal data on emulsifiers and gut health is debated.",
      healthRisk: "No established human toxicity at food levels; ultra-processing marker.",
      studies: [{ title: "Re-evaluation of mono- and diglyceride esters (E 472a–f) as food additives", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "calciumcarbonate", names: ["calcium carbonate", "e170", "chalk"], enumber: "E170",
      category: "Mineral / firming / color", risk: "ok",
      summary: "Common mineral used as a firming agent, anti-caking aid and calcium source.",
      whatIs: "Calcium carbonate (chalk/limestone) is used to firm foods, reduce acidity, whiten and fortify with calcium.",
      whyFlagged: "Recognized as safe and a source of dietary calcium; not a concern.",
      healthRisk: "Benign at food levels; very high supplemental intake can cause constipation.",
      studies: [{ title: "Re-evaluation of calcium carbonate (E 170) as a food additive", source: "EFSA Journal", year: 2011 }]
    },
    {
      id: "silicondioxidefood", names: ["silicon dioxide", "silica", "amorphous silica", "e551"], enumber: "E551",
      category: "Anti-caking agent", risk: "limit",
      summary: "Anti-caking agent that keeps powders free-flowing; not a silicone.",
      whatIs: "Food-grade silicon dioxide (amorphous silica) is added to salt, spices, powdered mixes and supplements to prevent clumping. It is a mineral, NOT a silicone polymer.",
      whyFlagged: "Long used and largely inert, but EFSA could not fully rule out a nanoparticle fraction and called for tighter specifications, so it is treated cautiously.",
      healthRisk: "Low concern at dietary levels; uncertainty centers on nano-sized particles, not the bulk mineral.",
      studies: [{ title: "Re-evaluation of silicon dioxide (E 551) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "annatto", names: ["annatto", "annatto extract", "bixin", "norbixin", "e160b"], enumber: "E160b",
      category: "Natural color", risk: "limit",
      summary: "Natural yellow-orange color from achiote seeds; rare allergen.",
      whatIs: "Annatto is a natural color from the seeds of the achiote tree, used to give cheese, butter and snacks a yellow-orange hue.",
      whyFlagged: "Natural and generally safe, but a recognized (if uncommon) trigger of hives and other allergic reactions in sensitive people.",
      healthRisk: "Benign for most; rare allergic/intolerance reactions.",
      studies: [{ title: "Scientific opinion on annatto extracts (E 160b) as food additives", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "betacarotene", names: ["beta-carotene", "beta carotene", "carotene", "e160a"], enumber: "E160a",
      category: "Natural color (provitamin A)", risk: "ok",
      summary: "Orange plant pigment and vitamin-A precursor; benign as a food color.",
      whatIs: "Beta-carotene is the orange pigment of carrots, used to color foods and as a source of vitamin A.",
      whyFlagged: "Safe as a food color. High-dose supplements (not food coloring) raised lung-cancer risk in smokers — not relevant to coloring amounts.",
      healthRisk: "Benign at food-coloring levels.",
      studies: [{ title: "Re-evaluation of carotenes (E 160a) as food additives", source: "EFSA Journal", year: 2012 }]
    },
    {
      id: "paprikaextract", names: ["paprika extract", "paprika oleoresin", "capsanthin", "e160c"], enumber: "E160c",
      category: "Natural color", risk: "ok",
      summary: "Natural red color from paprika peppers; benign.",
      whatIs: "Paprika extract (oleoresin) is a natural red-orange color from paprika peppers, used in snacks, sauces and meats.",
      whyFlagged: "Natural and recognized as safe; not a concern.",
      healthRisk: "Benign at food levels.",
      studies: [{ title: "Re-evaluation of paprika extract (E 160c) as a food additive", source: "EFSA Journal", year: 2015 }]
    },
    {
      id: "stevia", names: ["stevia", "steviol glycosides", "rebaudioside a", "reb a", "e960"], enumber: "E960",
      category: "Natural sweetener", risk: "ok",
      summary: "Plant-derived zero-calorie sweetener; approved and well-tolerated.",
      whatIs: "Steviol glycosides are intensely sweet compounds extracted from the stevia leaf, used as a calorie-free sweetener.",
      whyFlagged: "Approved by EFSA and FDA with an established safe intake; some people dislike the aftertaste. Not a notable health concern.",
      healthRisk: "Benign within the acceptable daily intake; no calories or blood-sugar impact.",
      studies: [{ title: "Scientific opinion on the safety of steviol glycosides (E 960)", source: "EFSA Journal", year: 2010 }]
    },
    {
      id: "monkfruit", names: ["monk fruit", "monk fruit extract", "luo han guo", "mogroside"], enumber: "",
      category: "Natural sweetener", risk: "ok",
      summary: "Calorie-free sweetener from monk fruit; recognized as safe.",
      whatIs: "Monk fruit extract (mogrosides) is an intense, calorie-free sweetener from the luo han guo fruit.",
      whyFlagged: "FDA-recognized as safe (GRAS); no notable health concerns at use levels.",
      healthRisk: "Benign; no calories or blood-sugar impact.",
      studies: [{ title: "GRAS notices for Siraitia grosvenorii (monk fruit) extract", source: "U.S. FDA GRAS", year: 2010 }]
    },
    {
      id: "sorbitol", names: ["sorbitol", "e420"], enumber: "E420",
      category: "Sugar alcohol (polyol)", risk: "limit",
      summary: "Low-calorie sugar alcohol; laxative effect in larger amounts.",
      whatIs: "Sorbitol is a sugar alcohol used as a sweetener and humectant in sugar-free gum, candy and diet foods.",
      whyFlagged: "Poorly absorbed, so excess causes gas, bloating and a laxative effect; EU foods with >10% must warn it 'may cause laxative effects.'",
      healthRisk: "Digestive upset/diarrhea at higher intake; otherwise low concern and tooth-friendly.",
      studies: [{ title: "Statement on the safety of sorbitol (E 420)", source: "EFSA Journal", year: 2019 }]
    },
    {
      id: "xylitol", names: ["xylitol", "e967"], enumber: "E967",
      category: "Sugar alcohol (polyol)", risk: "limit",
      summary: "Tooth-friendly sugar alcohol; laxative in excess and toxic to dogs.",
      whatIs: "Xylitol is a sugar alcohol used in sugar-free gum, mints and dental products; it does not feed cavity bacteria.",
      whyFlagged: "Safe for people but causes gas/laxative effects in excess, and is highly toxic to dogs even in small amounts.",
      healthRisk: "Digestive upset at high intake for humans; keep away from pets.",
      studies: [{ title: "Re-evaluation of xylitol (E 967) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "maltitol", names: ["maltitol", "maltitol syrup", "e965"], enumber: "E965",
      category: "Sugar alcohol (polyol)", risk: "limit",
      summary: "Sugar alcohol sweetener; raises blood sugar more than other polyols and is laxative in excess.",
      whatIs: "Maltitol is a sugar alcohol used in 'sugar-free' chocolate and candy for a sugar-like taste and texture.",
      whyFlagged: "Has a higher glycemic impact than most polyols and causes gas/laxative effects in excess.",
      healthRisk: "Digestive upset at higher intake; modest blood-sugar rise.",
      studies: [{ title: "Re-evaluation of maltitol (E 965) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "mannitol", names: ["mannitol", "e421"], enumber: "E421",
      category: "Sugar alcohol (polyol)", risk: "limit",
      summary: "Sugar alcohol sweetener/anti-caking agent; laxative in excess.",
      whatIs: "Mannitol is a sugar alcohol used as a sweetener and to dust chewing gum; also used medically.",
      whyFlagged: "Poorly absorbed, with a pronounced laxative effect at higher intake; EU laxative warning applies.",
      healthRisk: "Digestive upset/diarrhea at higher intake; otherwise low concern.",
      studies: [{ title: "Re-evaluation of mannitol (E 421) as a food additive", source: "EFSA Journal", year: 2018 }]
    },
    {
      id: "dextrose", names: ["dextrose", "glucose", "anhydrous dextrose", "dextrose monohydrate"], enumber: "",
      category: "Added sugar", risk: "limit",
      summary: "Pure glucose used as an added sugar and bulking agent.",
      whatIs: "Dextrose is glucose derived from corn or other starch, used to sweeten, brown and bulk processed foods.",
      whyFlagged: "A free/added sugar that raises blood glucose quickly and adds empty calories.",
      healthRisk: "Counts as added sugar; excess intake drives the usual metabolic and dental risks.",
      studies: [{ title: "Dietary sugars and body weight (systematic review)", source: "BMJ", year: 2013 }]
    },
    {
      id: "invertsugar", names: ["invert sugar", "invert syrup", "inverted sugar syrup"], enumber: "",
      category: "Added sugar", risk: "limit",
      summary: "Glucose-fructose syrup made from sucrose; an added sugar.",
      whatIs: "Invert sugar is sucrose split into glucose and fructose, giving a smooth, very sweet syrup used in candy and baked goods.",
      whyFlagged: "A free/added sugar nutritionally similar to table sugar and high-fructose syrups.",
      healthRisk: "Counts as added sugar; excess intake drives metabolic and dental risks.",
      studies: [{ title: "Added sugar intake and cardiovascular disease mortality", source: "JAMA Internal Medicine", year: 2014 }]
    },
    {
      id: "palmoil", names: ["palm oil", "palm fruit oil", "palm olein", "refined palm oil"], enumber: "",
      category: "Tropical oil (saturated fat)", risk: "limit",
      summary: "High-saturated-fat tropical oil; also raises sustainability concerns.",
      whatIs: "Palm oil is a cheap, semi-solid oil from the oil-palm fruit, used widely in spreads, snacks and baked goods.",
      whyFlagged: "High in saturated fat, and refined palm oil contains process contaminants (3-MCPD, glycidyl esters); also linked to deforestation.",
      healthRisk: "High saturated-fat intake affects LDL cholesterol; refining contaminants are an additional concern.",
      studies: [{ title: "Process contaminants (glycidyl/3-MCPD esters) in vegetable oils", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "interesterifiedfat", names: ["interesterified fat", "interesterified oil", "interesterified vegetable oil", "fully hydrogenated"], enumber: "",
      category: "Modified fat", risk: "caution",
      summary: "Chemically rearranged fat that replaced trans fat; metabolic effects still debated.",
      whatIs: "Interesterification rearranges fatty acids on the glycerol backbone to make solid, shelf-stable fats without trans fat — common in shortenings and spreads after trans-fat bans.",
      whyFlagged: "A newer industrial fat; some studies suggest unfavorable effects on blood sugar and cholesterol, and long-term human data is limited.",
      healthRisk: "Possible adverse metabolic effects; a marker of ultra-processed fat. Evidence is still emerging.",
      studies: [{ title: "Health effects of interesterified fats (review)", source: "Nutrition Reviews", year: 2016 }]
    },
    {
      id: "disodiuminosinate", names: ["disodium inosinate", "inosinate", "e631"], enumber: "E631",
      category: "Flavor enhancer", risk: "limit",
      summary: "Umami booster usually paired with MSG; a high-purine compound.",
      whatIs: "Disodium inosinate is a flavor enhancer, almost always used together with MSG/glutamate to intensify savory taste in snacks and instant foods.",
      whyFlagged: "Its presence signals added glutamate and ultra-processing; being a purine, it is best limited by people with gout.",
      healthRisk: "Low direct toxicity; gout sufferers should moderate purines, and it marks processed savory foods.",
      studies: [{ title: "Re-evaluation of inosinic acid and salts (E 630–633) as food additives", source: "EFSA Journal", year: 2021 }]
    },
    {
      id: "disodiumguanylate", names: ["disodium guanylate", "guanylate", "e627"], enumber: "E627",
      category: "Flavor enhancer", risk: "limit",
      summary: "Umami booster paired with MSG; high-purine, processing marker.",
      whatIs: "Disodium guanylate is a flavor enhancer used with MSG/glutamate to deepen savory flavor in chips, seasonings and instant noodles.",
      whyFlagged: "Indicates added glutamate and ultra-processing; a purine, so worth limiting for those prone to gout.",
      healthRisk: "Low direct toxicity; gout caution and processed-food marker.",
      studies: [{ title: "Re-evaluation of guanylic acid and salts (E 626–629) as food additives", source: "EFSA Journal", year: 2021 }]
    },
    {
      id: "yeastextract", names: ["yeast extract", "autolyzed yeast", "autolyzed yeast extract", "hydrolyzed yeast"], enumber: "",
      category: "Flavor enhancer (natural glutamate)", risk: "caution",
      summary: "Savory flavoring naturally rich in glutamate — a label-friendly MSG source.",
      whatIs: "Yeast extract is made by breaking down yeast cells, releasing natural glutamates that add savory/umami flavor without declaring 'MSG.'",
      whyFlagged: "Often used as a 'clean label' way to add free glutamate; a marker of processed savory foods rather than a toxin.",
      healthRisk: "Generally safe; relevant mainly to those who react to free glutamate, and as a sodium/processing marker.",
      studies: [{ title: "Safety of glutamates as food additives (re-evaluation)", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "naturalflavors", names: ["natural flavors", "natural flavor", "natural flavoring", "natural flavour", "natural flavours"], enumber: "",
      category: "Undisclosed flavoring", risk: "avoid",
      summary: "Catch-all flavor term that can hide many undisclosed compounds.",
      whatIs: "'Natural flavors' are flavoring extracts of plant or animal origin; the term can legally cover dozens of undisclosed component chemicals and solvents.",
      whyFlagged: "Lack of transparency — the exact contents are proprietary, so allergen and additive detail is hidden, and it is a hallmark of processed food.",
      healthRisk: "Usually safe, but the opacity makes it hard to assess for sensitivities; mainly a transparency/processing concern.",
      studies: [{ title: "Code of Federal Regulations 21 CFR 101.22 (flavor labeling)", source: "U.S. FDA", year: 2023 }]
    },
    {
      id: "sodiumaluminumphosphate", names: ["sodium aluminum phosphate", "sodium aluminium phosphate", "salp", "e541"], enumber: "E541",
      category: "Leavening agent (aluminum)", risk: "limit",
      summary: "Aluminum-based leavening acid in some baked goods; limit aluminum intake.",
      whatIs: "Sodium aluminum phosphate is a leavening acid used in some self-rising flours, baking powders and processed cheese.",
      whyFlagged: "Contributes to dietary aluminum, which authorities advise limiting; EFSA set a tolerable weekly intake that frequent consumers can approach.",
      healthRisk: "Aluminum accumulation concern with high intake; a processing marker.",
      studies: [{ title: "Safety of aluminium from dietary intake", source: "EFSA Journal", year: 2008 }]
    },
    {
      id: "dextrin", names: ["dextrin", "white dextrin", "yellow dextrin", "e1400"], enumber: "E1400",
      category: "Modified starch", risk: "limit",
      summary: "Lightly processed starch used as a thickener/binder; a refined carb.",
      whatIs: "Dextrins are starches broken into shorter chains by heat or acid, used to thicken, bind and coat processed foods.",
      whyFlagged: "Safe but a refined, rapidly digested carbohydrate and a marker of processed food (distinct from beneficial resistant dextrin fiber).",
      healthRisk: "Low direct toxicity; nutritionally an empty refined carb.",
      studies: [{ title: "Safety of modified starches as food additives", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "inulin", names: ["inulin", "chicory root fiber", "chicory inulin", "oligofructose"], enumber: "",
      category: "Prebiotic fiber", risk: "ok",
      summary: "Plant-derived soluble fiber added to boost fiber; can cause gas in excess.",
      whatIs: "Inulin is a soluble prebiotic fiber from chicory root and other plants, added to boost fiber and lightly sweeten.",
      whyFlagged: "Beneficial as a fiber/prebiotic; only flagged because large amounts cause bloating and gas in sensitive people.",
      healthRisk: "Benign and generally beneficial; digestive upset at high intake.",
      studies: [{ title: "Health benefits of inulin and oligofructose (review)", source: "Journal of Nutrition", year: 2007 }]
    },
    {
      id: "glycerol", names: ["glycerol", "glycerin", "glycerine", "e422"], enumber: "E422",
      category: "Humectant", risk: "ok",
      summary: "Sweet-tasting humectant that keeps foods moist; benign at food levels.",
      whatIs: "Glycerol (glycerin) is a sugar alcohol-like humectant used to retain moisture in bars, frostings and soft candies.",
      whyFlagged: "Recognized as safe; only very large amounts can have a mild laxative effect.",
      healthRisk: "Benign at food levels; provides some calories.",
      studies: [{ title: "Re-evaluation of glycerol (E 422) as a food additive", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "agar", names: ["agar", "agar-agar", "agar agar", "e406"], enumber: "E406",
      category: "Gelling agent (seaweed)", risk: "ok",
      summary: "Seaweed-derived gelling fiber; vegetarian gelatin alternative.",
      whatIs: "Agar is a gelling agent extracted from red seaweed, used to set desserts and as a plant-based alternative to gelatin.",
      whyFlagged: "Safe and a source of fiber; not a concern. Powder taken dry can swell, so it is consumed hydrated.",
      healthRisk: "Benign at food levels; mildly laxative in large amounts.",
      studies: [{ title: "Re-evaluation of agar (E 406) as a food additive", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "alginate", names: ["sodium alginate", "alginic acid", "potassium alginate", "calcium alginate", "e401", "e400"], enumber: "E401",
      category: "Thickener / gelling agent (seaweed)", risk: "ok",
      summary: "Seaweed-derived thickener used to gel and stabilize; benign.",
      whatIs: "Alginates are extracted from brown seaweed and used to thicken, gel and stabilize sauces, fillings and reformed foods.",
      whyFlagged: "Recognized as safe and a soluble fiber; only a marker of processed/formulated foods.",
      healthRisk: "Benign at food levels.",
      studies: [{ title: "Re-evaluation of alginic acid and salts (E 400–404) as food additives", source: "EFSA Journal", year: 2017 }]
    },
    {
      id: "potassiumchloride", names: ["potassium chloride", "e508"], enumber: "E508",
      category: "Salt substitute / mineral", risk: "ok",
      summary: "Used to replace sodium and as a firming agent; benign for most.",
      whatIs: "Potassium chloride is a mineral salt used to cut sodium (as a salt substitute) and to firm and stabilize foods.",
      whyFlagged: "Generally beneficial for lowering sodium; a slightly bitter taste, and people with kidney disease or on certain medications should watch potassium.",
      healthRisk: "Benign for most; caution with impaired kidney function or potassium-affecting drugs.",
      studies: [{ title: "Re-evaluation of potassium chloride (E 508) as a food additive", source: "EFSA Journal", year: 2019 }]
    },
    {
      id: "enrichedflour", names: ["enriched flour", "enriched wheat flour", "enriched bleached flour", "enriched bleached wheat flour", "bleached flour", "bleached wheat flour", "enriched unbleached flour", "enriched white flour"], enumber: "",
      category: "Refined grain", risk: "caution",
      summary: "Stripped, refined white flour with synthetic nutrients added back.",
      whatIs: "Enriched flour is white flour whose bran and germ (and most fiber, vitamins and minerals) have been milled out, then a few synthetic vitamins (iron, niacin, thiamine, folic acid) are added back. 'Bleached' flour is additionally whitened with chemical agents.",
      whyFlagged: "A refined, rapidly-digested carbohydrate stripped of fiber and most nutrients — a hallmark of ultra-processed food. Bleaching uses agents such as benzoyl peroxide or chlorine.",
      healthRisk: "Spikes blood sugar, low in fiber/nutrients; frequent intake is linked to weight gain and metabolic issues.",
      studies: [{ title: "Whole grains vs. refined grains and chronic disease risk (review)", source: "Nutrients", year: 2020 }]
    },
    {
      id: "bioengineered", names: ["bioengineered", "bioengineered food ingredient", "bioengineered food ingredients", "made with genetic engineering", "genetically engineered"], enumber: "",
      category: "Genetically engineered (GMO)", risk: "caution",
      summary: "Genetically modified ingredient; commonly paired with heavy pesticide use.",
      whatIs: "A 'bioengineered' (GMO) disclosure means the ingredient was produced with genetic engineering. Most bioengineered crops (corn, soy, canola, sugar beet) are engineered to tolerate herbicides like glyphosate.",
      whyFlagged: "A marker of industrial, herbicide-intensive agriculture. Bobby-Approved-style scanning flags GMO ingredients for transparency and pesticide-residue concerns.",
      healthRisk: "GMO foods are regulator-approved, but the associated herbicide residues (e.g., glyphosate) are a live area of safety debate.",
      studies: [{ title: "Glyphosate residues in food and human exposure (review)", source: "Environmental Sciences Europe", year: 2016 }]
    },
    {
      id: "hydrolyzedprotein", names: ["hydrolyzed protein", "hydrolyzed soy protein", "hydrolyzed corn protein", "hydrolyzed vegetable protein", "hydrolyzed wheat protein", "hydrolised vegetable protein", "textured vegetable protein", "hydrolyzed plant protein"], enumber: "",
      category: "Flavor enhancer (free glutamate)", risk: "caution",
      summary: "Protein broken down to release free glutamate — hidden MSG-style flavoring.",
      whatIs: "Hydrolyzed proteins are broken down with acid or enzymes to release free glutamic acid, adding savory/umami flavor without declaring 'MSG.'",
      whyFlagged: "A 'clean label' way to add free glutamate; processing can also create chloropropanol contaminants (3-MCPD). A marker of heavily processed savory foods.",
      healthRisk: "Relevant to people sensitive to free glutamate; possible 3-MCPD contaminant concern; a processing marker.",
      studies: [{ title: "3-MCPD esters in foods and processing (review)", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "soyproteinisolate", names: ["soy protein isolate", "isolated soy protein", "soy protein concentrate", "soy protein", "soya protein isolate"], enumber: "",
      category: "Ultra-processed protein", risk: "caution",
      summary: "Highly processed soy protein extracted with solvents like hexane.",
      whatIs: "Soy protein isolate is soybean protein stripped from the bean using high heat, alkali and often hexane solvent, then spray-dried into a powder used in bars, shakes and meat substitutes.",
      whyFlagged: "An ultra-processed, fractionated ingredient; processing can leave solvent residues and create off-flavors masked with added flavorings. Usually GMO-derived.",
      healthRisk: "Generally safe as protein, but a marker of ultra-processed formulation; contains phytoestrogens and possible hexane residue.",
      studies: [{ title: "Solvent extraction and processing of soy protein (review)", source: "Journal of Food Science", year: 2018 }]
    },
    {
      id: "artificialcolor", names: ["artificial color", "artificial colors", "artificial colour", "artificial colours", "artificial coloring", "artificial colouring", "color added", "colored with", "us certified color", "fd&c color", "artificial colors added"], enumber: "",
      category: "Artificial color", risk: "avoid",
      summary: "Undisclosed synthetic petroleum dye with no nutritional purpose.",
      whatIs: "A generic 'artificial color' declaration means one or more synthetic, petroleum-derived dyes were added purely for appearance, without naming the specific dye.",
      whyFlagged: "Purely cosmetic and undisclosed. Synthetic dyes as a class are linked to behavioral effects in sensitive children; the EU requires warning labels on several of them.",
      healthRisk: "Possible hyperactivity/attention effects in some children; allergic reactions in a subset.",
      studies: [{ title: "Health effects of synthetic food dyes", source: "California OEHHA report", year: 2021 }]
    },
    {
      id: "vanillin", names: ["vanillin", "ethyl vanillin", "ethylvanillin", "artificial vanilla", "imitation vanilla", "vanillin flavor"], enumber: "",
      category: "Artificial flavor", risk: "caution",
      summary: "Synthetic vanilla flavor, often petroleum- or wood-pulp-derived.",
      whatIs: "Vanillin is a lab-made imitation of vanilla, commonly synthesized from petrochemicals (guaiacol) or wood-pulp byproducts (lignin), used in place of real vanilla.",
      whyFlagged: "An artificial flavoring and a marker of processed food formulated to taste like a whole ingredient it doesn't contain.",
      healthRisk: "Generally recognized as safe; mainly a processing/quality marker rather than a toxin.",
      studies: [{ title: "Production and safety of vanillin (review)", source: "Journal of Agricultural and Food Chemistry", year: 2014 }]
    },
    {
      id: "olestra", names: ["olestra", "olean"], enumber: "",
      category: "Fat substitute", risk: "avoid",
      summary: "Indigestible fake fat that blocks nutrient absorption and causes GI distress.",
      whatIs: "Olestra (Olean) is a synthetic, calorie-free fat substitute once used in 'light' chips; it passes through the body undigested.",
      whyFlagged: "Inhibits absorption of fat-soluble vitamins (A, D, E, K) and carotenoids and historically caused cramping and loose stools; required a warning label for years.",
      healthRisk: "Reduced fat-soluble vitamin absorption; gastrointestinal distress.",
      studies: [{ title: "Olestra and the absorption of fat-soluble vitamins and carotenoids", source: "Journal of Nutrition", year: 1997 }]
    },
    {
      id: "doughconditioner", names: ["potassium iodate", "calcium iodate", "potassium bromate and iodate", "dough conditioner", "dough conditioners"], enumber: "",
      category: "Dough conditioner", risk: "caution",
      summary: "Industrial dough oxidizer used to speed up commercial bread making.",
      whatIs: "Dough conditioners and oxidizers such as potassium iodate strengthen and bleach dough so factory bread rises fast and uniformly.",
      whyFlagged: "Markers of industrial baking; iodate oxidizers are restricted in several countries and unnecessary in real bread making.",
      healthRisk: "Excess iodate intake is a concern; primarily a processing marker.",
      studies: [{ title: "Use and safety of oxidizing agents in bread making (review)", source: "Comprehensive Reviews in Food Science", year: 2017 }]
    },
    {
      id: "calciumperoxide", names: ["calcium peroxide", "benzoyl peroxide", "e928", "e930"], enumber: "E930",
      category: "Flour bleaching agent", risk: "caution",
      summary: "Chemical bleach/oxidizer used to whiten and age flour fast.",
      whatIs: "Calcium peroxide and benzoyl peroxide are oxidizing agents used to bleach flour and condition dough in industrial baking.",
      whyFlagged: "Chemical bleaching agents banned for flour in the EU; a hallmark of ultra-processed white flour products.",
      healthRisk: "Banned for this use in some regions; mainly a processing marker.",
      studies: [{ title: "Re-evaluation of benzoyl peroxide as a food additive", source: "EFSA Journal", year: 2016 }]
    },
    {
      id: "diacetyl", names: ["diacetyl", "starter distillate", "alpha-acetolactate"], enumber: "",
      category: "Artificial butter flavor", risk: "caution",
      summary: "Buttery flavor compound linked to lung damage in workers.",
      whatIs: "Diacetyl is the compound that gives artificial butter flavor (e.g., in microwave popcorn and some snacks) its taste.",
      whyFlagged: "Inhaling diacetyl during manufacturing causes 'popcorn lung' (bronchiolitis obliterans). Safe to eat at food levels, but a marker of synthetic butter flavoring.",
      healthRisk: "Respiratory risk is occupational (inhalation); in food it is mainly a synthetic-flavor marker.",
      studies: [{ title: "Diacetyl and bronchiolitis obliterans in flavoring workers", source: "U.S. NIOSH", year: 2016 }]
    }
  ];

  /* Countries/regions where an additive is banned or restricted (by id). */
  const bannedMap = {
    red3: "Banned in food in the EU; the U.S. FDA revoked its food use in January 2025",
    red40: "Requires a hyperactivity warning label across the EU",
    yellow5: "Requires a warning label in the EU; previously banned in Norway and Austria",
    yellow6: "Requires a warning label in the EU; was banned in Norway",
    amaranth: "Banned in food in the United States (FDA, since 1976)",
    quinolineyellow: "Not approved for food in the United States; warning label in the EU",
    ponceau4r: "Banned in the United States and Norway",
    titaniumdioxide: "Banned as a food additive in the European Union (since 2022)",
    potassiumbromate: "Banned in the EU, UK, Canada, Brazil, Argentina and others",
    bha: "Restricted in the EU; California requires a cancer warning",
    bht: "Restricted in parts of the EU and Japan",
    tbhq: "Tightly restricted; banned in food in Japan",
    bvo: "Banned in the EU, India and Japan; the U.S. revoked it in 2024",
    azodicarbonamide: "Banned in the EU, UK and Australia",
    propylparaben: "Removed from the EU's approved food additives list",
    transfat: "Effectively banned in the U.S. (2018), Canada, Denmark and many countries",
    sodiumnitrite: "Tightly restricted in the EU; processed meat is an IARC Group 1 carcinogen",
    caramel4: "Restricted under California Prop 65 (4-MEI cancer warning)",
    propylgallate: "Restricted in several countries for certain food uses"
  };

  // Seed/vegetable oils flagged per user preference (Bobby-Approved style).
  const seedOils = [
    "canola oil", "rapeseed oil", "soybean oil", "soya bean oil", "corn oil",
    "cottonseed oil", "vegetable oil", "sunflower oil", "safflower oil",
    "grapeseed oil", "rice bran oil", "palm kernel oil"
  ];

  // Added-sugar names (hidden sugars).
  const addedSugars = [
    "sugar", "cane sugar", "brown sugar", "corn syrup", "high fructose corn syrup",
    "glucose syrup", "glucose-fructose syrup", "dextrose", "maltose", "fructose",
    "invert sugar", "molasses", "agave", "rice syrup", "barley malt", "evaporated cane juice",
    "fruit juice concentrate", "honey solids", "caramel syrup", "sucrose"
  ];

  const artificialSweeteners = ["aspartame", "sucralose", "acesulfame", "saccharin", "neotame", "advantame", "cyclamate", "alitame"];

  // Synthetic vitamins/minerals added back to fortify/enrich processed foods.
  // Not whole foods, but not "bad" either — recognized so they don't read as Unknown.
  const fortifiedVitamins = [
    "niacin", "niacinamide", "nicotinic acid", "nicotinamide", "thiamine", "thiamin",
    "thiamine mononitrate", "thiamin mononitrate", "thiamine hydrochloride", "riboflavin",
    "folic acid", "folate", "folacin", "pyridoxine hydrochloride", "pyridoxine",
    "reduced iron", "ferrous sulfate", "ferrous fumarate", "ferric orthophosphate", "iron",
    "zinc oxide", "zinc sulfate", "zinc gluconate", "vitamin a palmitate", "retinyl palmitate",
    "vitamin a acetate", "vitamin d3", "vitamin d", "cholecalciferol", "vitamin b12",
    "cyanocobalamin", "vitamin b6", "vitamin b1", "vitamin b2", "vitamin b3",
    "calcium pantothenate", "pantothenic acid", "d-calcium pantothenate", "biotin",
    "vitamin e acetate", "dl-alpha tocopheryl acetate", "tocopheryl acetate",
    "potassium iodide", "sodium selenite", "manganese sulfate", "copper gluconate",
    "vitamin k1", "phytonadione", "choline bitartrate"
  ];

  // Vague / low-transparency terms.
  const vagueTerms = [
    "natural flavor", "natural flavors", "natural flavour", "natural flavours",
    "artificial flavor", "artificial flavors", "artificial flavour",
    "spices", "spice", "flavoring", "flavouring", "flavorings"
  ];

  // Recognized clean / whole-food ingredients (marked good).
  const cleanIngredients = [
    "water", "filtered water", "salt", "sea salt", "oats", "rolled oats", "whole grain oats",
    "almonds", "peanuts", "cashews", "walnuts", "pecans", "oat flour", "whole wheat flour",
    "brown rice", "rice", "quinoa", "lentils", "chickpeas", "black beans", "beans",
    "tomatoes", "tomato", "spinach", "kale", "carrots", "onion", "garlic", "ginger",
    "olive oil", "extra virgin olive oil", "avocado oil", "coconut oil", "coconut",
    "butter", "milk", "cream", "yogurt", "eggs", "egg", "honey", "maple syrup",
    "apple", "apples", "banana", "bananas", "strawberries", "blueberries", "raisins",
    "cocoa", "cacao", "vanilla", "vanilla extract", "cinnamon", "turmeric", "basil",
    "chicken", "beef", "salmon", "tuna", "lemon juice", "lime juice", "vinegar",
    "apple cider vinegar", "baking soda", "yeast", "chia seeds", "flax seeds", "flaxseed",
    "sunflower seeds", "pumpkin seeds", "dates", "citric acid", "ascorbic acid", "vitamin c"
  ];

  // Map diet/allergen profile flags to ingredient keywords.
  const allergenMap = {
    gluten: ["wheat", "barley", "rye", "malt", "spelt", "semolina", "farro", "gluten", "wheat flour", "enriched flour", "couscous"],
    dairy: ["milk", "cream", "butter", "cheese", "whey", "casein", "lactose", "yogurt", "ghee", "milk solids", "buttermilk"],
    egg: ["egg", "eggs", "albumin", "egg white", "egg yolk", "ovalbumin"],
    soy: ["soy", "soya", "soybean", "soy lecithin", "soybean oil", "edamame", "tofu", "soy protein"],
    peanut: ["peanut", "peanuts", "peanut oil", "groundnut"],
    treenut: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pecan", "pistachio", "hazelnut", "macadamia"],
    shellfish: ["shrimp", "prawn", "crab", "lobster", "shellfish", "crayfish"],
    fish: ["fish", "salmon", "tuna", "cod", "anchovy", "anchovies", "tilapia"],
    sesame: ["sesame", "tahini", "sesame oil"],
    vegan: ["milk", "cream", "butter", "cheese", "whey", "casein", "egg", "eggs", "honey", "gelatin", "carmine", "cochineal", "chicken", "beef", "pork", "fish", "lard"],
    vegetarian: ["chicken", "beef", "pork", "fish", "gelatin", "lard", "anchovy", "carmine", "cochineal"],
    keto: ["sugar", "high fructose corn syrup", "corn syrup", "maltodextrin", "wheat flour", "rice", "dextrose"]
  };

  /* Broad additive / E-number reference so EVERY additive on a U.S. (or global)
     label gets identified and rated, even without a full writeup. risk as above. */
  const eNumbers = [
    // Colors (E100–E199)
    ["E100", "Curcumin (turmeric color)", "ok"], ["E101", "Riboflavin (B2)", "ok"],
    ["E102", "Tartrazine (Yellow 5)", "avoid"], ["E104", "Quinoline Yellow", "avoid"],
    ["E110", "Sunset Yellow (Yellow 6)", "avoid"], ["E120", "Carmine / Cochineal", "avoid"],
    ["E122", "Carmoisine / Azorubine", "avoid"], ["E123", "Amaranth (Red 2)", "avoid"],
    ["E124", "Ponceau 4R", "avoid"], ["E127", "Erythrosine (Red 3)", "avoid"],
    ["E128", "Red 2G", "avoid"], ["E129", "Allura Red (Red 40)", "avoid"],
    ["E131", "Patent Blue V", "avoid"], ["E132", "Indigotine (Blue 2)", "avoid"],
    ["E133", "Brilliant Blue (Blue 1)", "avoid"], ["E140", "Chlorophyll", "ok"],
    ["E141", "Copper chlorophyll", "ok"], ["E142", "Green S", "avoid"],
    ["E150a", "Plain caramel color", "limit"], ["E150b", "Caustic sulphite caramel", "limit"],
    ["E150c", "Ammonia caramel color", "caution"],
    ["E150d", "Sulphite ammonia caramel (4-MEI)", "caution"], ["E151", "Brilliant Black BN", "avoid"],
    ["E153", "Vegetable carbon", "ok"], ["E154", "Brown FK", "avoid"], ["E155", "Brown HT", "avoid"],
    ["E160a", "Beta-carotene", "ok"], ["E160b", "Annatto", "limit"], ["E160c", "Paprika extract", "ok"],
    ["E160d", "Lycopene", "ok"], ["E160e", "Beta-apo-8'-carotenal", "limit"],
    ["E161b", "Lutein", "ok"], ["E161g", "Canthaxanthin", "caution"],
    ["E162", "Beetroot red", "ok"], ["E163", "Anthocyanins", "ok"],
    ["E170", "Calcium carbonate", "ok"], ["E171", "Titanium dioxide", "avoid"],
    ["E172", "Iron oxides", "ok"], ["E173", "Aluminium", "caution"], ["E174", "Silver", "limit"],
    ["E175", "Gold", "ok"], ["E180", "Litholrubine BK", "avoid"],
    // Preservatives (E200–E299)
    ["E200", "Sorbic acid", "limit"], ["E202", "Potassium sorbate", "limit"],
    ["E203", "Calcium sorbate", "limit"], ["E210", "Benzoic acid", "caution"],
    ["E211", "Sodium benzoate", "caution"], ["E212", "Potassium benzoate", "caution"],
    ["E213", "Calcium benzoate", "caution"], ["E214", "Ethylparaben", "caution"],
    ["E215", "Sodium ethyl para-hydroxybenzoate", "caution"], ["E218", "Methylparaben", "caution"],
    ["E219", "Sodium methyl para-hydroxybenzoate", "caution"], ["E220", "Sulphur dioxide", "caution"],
    ["E221", "Sodium sulphite", "caution"], ["E222", "Sodium bisulphite", "caution"],
    ["E223", "Sodium metabisulphite", "caution"], ["E224", "Potassium metabisulphite", "caution"],
    ["E226", "Calcium sulphite", "caution"], ["E228", "Potassium bisulphite", "caution"],
    ["E234", "Nisin", "limit"], ["E235", "Natamycin", "limit"],
    ["E239", "Hexamethylene tetramine", "caution"], ["E242", "Dimethyl dicarbonate", "limit"],
    ["E249", "Potassium nitrite", "avoid"], ["E250", "Sodium nitrite", "avoid"],
    ["E251", "Sodium nitrate", "avoid"], ["E252", "Potassium nitrate", "avoid"],
    ["E260", "Acetic acid", "ok"], ["E261", "Potassium acetate", "ok"],
    ["E262", "Sodium acetate", "ok"], ["E263", "Calcium acetate", "ok"],
    ["E270", "Lactic acid", "ok"], ["E280", "Propionic acid", "limit"],
    ["E281", "Sodium propionate", "limit"], ["E282", "Calcium propionate", "limit"],
    ["E283", "Potassium propionate", "limit"], ["E284", "Boric acid", "caution"],
    ["E290", "Carbon dioxide", "ok"], ["E296", "Malic acid", "ok"], ["E297", "Fumaric acid", "ok"],
    // Antioxidants & acidity regulators (E300–E399)
    ["E300", "Ascorbic acid (vitamin C)", "ok"], ["E301", "Sodium ascorbate", "ok"],
    ["E302", "Calcium ascorbate", "ok"], ["E304", "Ascorbyl palmitate", "ok"],
    ["E306", "Tocopherols (vitamin E)", "ok"], ["E307", "Alpha-tocopherol", "ok"],
    ["E308", "Gamma-tocopherol", "ok"], ["E309", "Delta-tocopherol", "ok"],
    ["E310", "Propyl gallate", "caution"], ["E311", "Octyl gallate", "caution"],
    ["E312", "Dodecyl gallate", "caution"], ["E315", "Erythorbic acid", "limit"],
    ["E316", "Sodium erythorbate", "limit"], ["E319", "TBHQ", "caution"],
    ["E320", "BHA", "avoid"], ["E321", "BHT", "caution"], ["E322", "Lecithin", "ok"],
    ["E325", "Sodium lactate", "ok"], ["E326", "Potassium lactate", "ok"],
    ["E327", "Calcium lactate", "ok"], ["E330", "Citric acid", "ok"],
    ["E331", "Sodium citrate", "ok"], ["E332", "Potassium citrate", "ok"],
    ["E333", "Calcium citrate", "ok"], ["E334", "Tartaric acid", "ok"],
    ["E335", "Sodium tartrate", "ok"], ["E336", "Potassium tartrate (cream of tartar)", "ok"],
    ["E337", "Potassium sodium tartrate", "ok"], ["E338", "Phosphoric acid", "limit"],
    ["E339", "Sodium phosphate", "limit"], ["E340", "Potassium phosphate", "limit"],
    ["E341", "Calcium phosphate", "limit"], ["E343", "Magnesium phosphate", "limit"],
    ["E350", "Sodium malate", "ok"], ["E352", "Calcium malate", "ok"],
    ["E353", "Metatartaric acid", "ok"], ["E355", "Adipic acid", "ok"],
    ["E363", "Succinic acid", "ok"], ["E380", "Triammonium citrate", "ok"],
    ["E385", "Calcium disodium EDTA", "limit"],
    // Thickeners, stabilizers, emulsifiers (E400–E499)
    ["E400", "Alginic acid", "ok"], ["E401", "Sodium alginate", "ok"],
    ["E402", "Potassium alginate", "ok"], ["E403", "Ammonium alginate", "ok"],
    ["E404", "Calcium alginate", "ok"], ["E405", "Propylene glycol alginate", "limit"],
    ["E406", "Agar", "ok"], ["E407", "Carrageenan", "caution"],
    ["E407a", "Processed eucheuma seaweed", "caution"], ["E410", "Locust bean gum", "ok"],
    ["E412", "Guar gum", "ok"], ["E413", "Tragacanth", "ok"], ["E414", "Gum arabic (acacia)", "ok"],
    ["E415", "Xanthan gum", "ok"], ["E416", "Karaya gum", "ok"], ["E417", "Tara gum", "ok"],
    ["E418", "Gellan gum", "ok"], ["E420", "Sorbitol", "limit"], ["E421", "Mannitol", "limit"],
    ["E422", "Glycerol (glycerin)", "ok"], ["E425", "Konjac gum", "ok"],
    ["E426", "Soybean hemicellulose", "ok"], ["E427", "Cassia gum", "ok"],
    ["E431", "Polyoxyethylene stearate", "caution"], ["E432", "Polysorbate 20", "caution"],
    ["E433", "Polysorbate 80", "caution"], ["E434", "Polysorbate 40", "caution"],
    ["E435", "Polysorbate 60", "caution"], ["E436", "Polysorbate 65", "caution"],
    ["E440", "Pectin", "ok"], ["E441", "Gelatine", "ok"],
    ["E442", "Ammonium phosphatides", "limit"], ["E444", "Sucrose acetate isobutyrate", "limit"],
    ["E445", "Glycerol esters of wood rosin", "limit"], ["E450", "Diphosphates", "limit"],
    ["E451", "Triphosphates", "limit"], ["E452", "Polyphosphates", "limit"],
    ["E459", "Beta-cyclodextrin", "ok"], ["E460", "Cellulose", "ok"],
    ["E461", "Methyl cellulose", "ok"], ["E463", "Hydroxypropyl cellulose", "ok"],
    ["E464", "Hydroxypropyl methyl cellulose", "ok"], ["E465", "Ethyl methyl cellulose", "ok"],
    ["E466", "Carboxymethylcellulose", "caution"], ["E468", "Crosslinked sodium carboxymethyl cellulose", "ok"],
    ["E470a", "Salts of fatty acids", "ok"], ["E470b", "Magnesium salts of fatty acids", "ok"],
    ["E471", "Mono- and diglycerides", "limit"], ["E472a", "Acetic acid esters of mono-/diglycerides", "limit"],
    ["E472b", "Lactic acid esters of mono-/diglycerides", "limit"],
    ["E472c", "Citric acid esters of mono-/diglycerides", "limit"], ["E472e", "DATEM", "limit"],
    ["E473", "Sucrose esters of fatty acids", "limit"], ["E474", "Sucroglycerides", "limit"],
    ["E475", "Polyglycerol esters of fatty acids", "limit"], ["E476", "Polyglycerol polyricinoleate", "limit"],
    ["E477", "Propylene glycol esters of fatty acids", "limit"], ["E481", "Sodium stearoyl lactylate", "limit"],
    ["E482", "Calcium stearoyl lactylate", "limit"], ["E483", "Stearyl tartrate", "limit"],
    ["E491", "Sorbitan monostearate", "limit"], ["E492", "Sorbitan tristearate", "limit"],
    ["E494", "Sorbitan monooleate", "limit"], ["E495", "Sorbitan monopalmitate", "limit"],
    // pH / anti-caking / misc (E500–E599)
    ["E500", "Sodium bicarbonate (baking soda)", "ok"], ["E501", "Potassium carbonate", "ok"],
    ["E503", "Ammonium carbonate", "ok"], ["E504", "Magnesium carbonate", "ok"],
    ["E507", "Hydrochloric acid", "ok"], ["E508", "Potassium chloride", "ok"],
    ["E509", "Calcium chloride", "ok"], ["E511", "Magnesium chloride", "ok"],
    ["E514", "Sodium sulphate", "ok"], ["E515", "Potassium sulphate", "ok"],
    ["E516", "Calcium sulphate", "ok"], ["E517", "Ammonium sulphate", "ok"],
    ["E520", "Aluminium sulphate", "caution"], ["E521", "Aluminium sodium sulphate", "caution"],
    ["E524", "Sodium hydroxide", "ok"], ["E525", "Potassium hydroxide", "ok"],
    ["E526", "Calcium hydroxide", "ok"], ["E527", "Ammonium hydroxide", "ok"],
    ["E528", "Magnesium hydroxide", "ok"], ["E529", "Calcium oxide", "ok"],
    ["E535", "Sodium ferrocyanide", "limit"], ["E536", "Potassium ferrocyanide", "limit"],
    ["E541", "Sodium aluminium phosphate", "caution"], ["E551", "Silicon dioxide", "limit"],
    ["E552", "Calcium silicate", "limit"], ["E553b", "Talc", "limit"],
    ["E554", "Sodium aluminium silicate", "caution"], ["E555", "Potassium aluminium silicate", "caution"],
    ["E570", "Stearic acid", "ok"], ["E575", "Glucono delta-lactone", "ok"],
    ["E576", "Sodium gluconate", "ok"], ["E578", "Calcium gluconate", "ok"],
    ["E585", "Ferrous lactate", "ok"], ["E586", "4-Hexylresorcinol", "limit"],
    // Flavor enhancers (E600–E699)
    ["E620", "Glutamic acid", "limit"], ["E621", "Monosodium glutamate (MSG)", "limit"],
    ["E622", "Monopotassium glutamate", "limit"], ["E623", "Calcium diglutamate", "limit"],
    ["E624", "Monoammonium glutamate", "limit"], ["E625", "Magnesium diglutamate", "limit"],
    ["E626", "Guanylic acid", "limit"], ["E627", "Disodium guanylate", "limit"],
    ["E628", "Dipotassium guanylate", "limit"], ["E629", "Calcium guanylate", "limit"],
    ["E630", "Inosinic acid", "limit"], ["E631", "Disodium inosinate", "limit"],
    ["E632", "Dipotassium inosinate", "limit"], ["E633", "Calcium inosinate", "limit"],
    ["E634", "Calcium 5'-ribonucleotides", "limit"], ["E635", "Disodium 5'-ribonucleotides", "limit"],
    ["E640", "Glycine", "ok"], ["E650", "Zinc acetate", "ok"],
    // Glazing agents, gases, sweeteners (E900–E999)
    ["E900", "Dimethylpolysiloxane", "limit"], ["E901", "Beeswax", "ok"],
    ["E902", "Candelilla wax", "ok"], ["E903", "Carnauba wax", "ok"], ["E904", "Shellac", "ok"],
    ["E905", "Microcrystalline wax", "limit"], ["E907", "Hydrogenated poly-1-decene", "limit"],
    ["E912", "Montan acid esters", "limit"], ["E914", "Oxidized polyethylene wax", "limit"],
    ["E920", "L-cysteine", "ok"], ["E921", "L-cystine", "ok"],
    ["E924", "Potassium bromate", "avoid"], ["E927a", "Azodicarbonamide", "avoid"],
    ["E927b", "Carbamide (urea)", "ok"], ["E938", "Argon", "ok"], ["E939", "Helium", "ok"],
    ["E941", "Nitrogen", "ok"], ["E942", "Nitrous oxide", "ok"], ["E943a", "Butane", "limit"],
    ["E944", "Propane", "limit"], ["E948", "Oxygen", "ok"], ["E950", "Acesulfame K", "avoid"],
    ["E951", "Aspartame", "avoid"], ["E952", "Cyclamate", "avoid"], ["E953", "Isomalt", "limit"],
    ["E954", "Saccharin", "avoid"], ["E955", "Sucralose", "avoid"], ["E957", "Thaumatin", "ok"],
    ["E959", "Neohesperidine DC", "limit"], ["E960", "Steviol glycosides (stevia)", "ok"],
    ["E961", "Neotame", "avoid"], ["E962", "Aspartame-acesulfame salt", "avoid"],
    ["E965", "Maltitol", "limit"], ["E966", "Lactitol", "limit"], ["E967", "Xylitol", "limit"],
    ["E968", "Erythritol", "limit"], ["E969", "Advantame", "avoid"],
    // Additional / modified starches, enzymes (E1000–E1525)
    ["E1100", "Amylase", "ok"], ["E1101", "Protease", "ok"], ["E1105", "Lysozyme", "limit"],
    ["E1200", "Polydextrose", "ok"], ["E1201", "Polyvinylpyrrolidone (PVP)", "limit"],
    ["E1202", "Polyvinylpolypyrrolidone", "limit"], ["E1400", "Dextrin", "limit"],
    ["E1404", "Oxidized starch", "limit"], ["E1410", "Monostarch phosphate", "limit"],
    ["E1412", "Distarch phosphate", "limit"], ["E1413", "Phosphated distarch phosphate", "limit"],
    ["E1414", "Acetylated distarch phosphate", "limit"], ["E1420", "Acetylated starch", "limit"],
    ["E1422", "Acetylated distarch adipate", "limit"], ["E1440", "Hydroxypropyl starch", "limit"],
    ["E1442", "Hydroxypropyl distarch phosphate", "limit"], ["E1450", "Starch sodium octenylsuccinate", "limit"],
    ["E1451", "Acetylated oxidized starch", "limit"], ["E1505", "Triethyl citrate", "ok"],
    ["E1510", "Ethanol", "ok"], ["E1517", "Glyceryl diacetate", "limit"],
    ["E1518", "Triacetin", "limit"], ["E1519", "Benzyl alcohol", "limit"],
    ["E1520", "Propylene glycol", "limit"], ["E1521", "Polyethylene glycol (PEG)", "limit"],
    // --- Supplemental gap-fill: remaining assigned codes across all ranges ---
    // Colours (E100–E199)
    ["E121", "Citrus Red 2", "avoid"], ["E125", "Ponceau SX (Scarlet GN)", "avoid"],
    ["E160f", "Ethyl ester of beta-apo-8'-carotenoic acid", "ok"],
    ["E161a", "Flavoxanthin", "ok"], ["E161c", "Cryptoxanthin", "ok"],
    ["E161d", "Rubixanthin", "ok"], ["E161e", "Violaxanthin", "ok"],
    ["E161f", "Rhodoxanthin", "ok"], ["E161h", "Zeaxanthin", "ok"],
    ["E181", "Tannic acid", "ok"],
    // Preservatives (E200–E299)
    ["E209", "Heptyl para-hydroxybenzoate", "caution"], ["E216", "Propylparaben", "avoid"],
    ["E217", "Sodium propyl para-hydroxybenzoate", "avoid"], ["E225", "Potassium sulphite", "caution"],
    ["E227", "Calcium hydrogen sulphite", "caution"], ["E230", "Biphenyl (diphenyl)", "caution"],
    ["E231", "Orthophenyl phenol", "caution"], ["E232", "Sodium orthophenyl phenol", "caution"],
    ["E233", "Thiabendazole", "caution"], ["E236", "Formic acid", "limit"],
    ["E237", "Sodium formate", "limit"], ["E238", "Calcium formate", "limit"],
    ["E243", "Ethyl lauroyl arginate", "limit"],
    // Antioxidants & acidity regulators (E300–E399)
    ["E303", "Potassium ascorbate", "ok"], ["E323", "Anoxomer", "limit"],
    ["E354", "Calcium tartrate", "ok"], ["E356", "Sodium adipate", "ok"],
    ["E357", "Potassium adipate", "ok"], ["E359", "Ammonium adipate", "ok"],
    ["E365", "Sodium fumarate", "ok"], ["E366", "Potassium fumarate", "ok"],
    ["E367", "Calcium fumarate", "ok"], ["E368", "Ammonium fumarate", "ok"],
    ["E370", "1,4-Heptonolactone", "limit"], ["E375", "Niacin (nicotinic acid)", "ok"],
    ["E381", "Ferric ammonium citrate", "ok"], ["E383", "Calcium glycerophosphate", "ok"],
    ["E384", "Isopropyl citrate", "limit"], ["E386", "Disodium EDTA", "limit"],
    ["E387", "Oxystearin", "limit"], ["E388", "Thiodipropionic acid", "limit"],
    ["E389", "Dilauryl thiodipropionate", "limit"], ["E390", "Distearyl thiodipropionate", "limit"],
    ["E391", "Phytic acid", "ok"], ["E399", "Calcium lactobionate", "ok"],
    // Thickeners, stabilizers, emulsifiers (E400–E499)
    ["E424", "Curdlan", "ok"], ["E429", "Peptones", "ok"],
    ["E430", "Polyoxyethylene (8) stearate", "caution"], ["E443", "Brominated vegetable oil", "avoid"],
    ["E456", "Potassium polyaspartate", "ok"], ["E457", "Alpha-cyclodextrin", "ok"],
    ["E462", "Ethyl cellulose", "ok"], ["E467", "Ethyl hydroxyethyl cellulose", "ok"],
    ["E469", "Enzymatically hydrolysed carboxymethyl cellulose", "ok"],
    ["E472d", "Tartaric acid esters of mono- and diglycerides", "limit"],
    ["E472f", "Mixed acetic and tartaric acid esters of mono- and diglycerides", "limit"],
    ["E478", "Lactylated fatty acid esters of glycerol", "limit"],
    ["E479b", "Thermally oxidized soya bean oil", "limit"],
    ["E480", "Dioctyl sodium sulphosuccinate", "limit"], ["E493", "Sorbitan monolaurate", "limit"],
    ["E496", "Sorbitan trioleate", "limit"],
    // pH / anti-caking / misc (E500–E599)
    ["E510", "Ammonium chloride", "ok"], ["E512", "Stannous chloride", "limit"],
    ["E513", "Sulphuric acid", "ok"], ["E518", "Magnesium sulphate", "ok"],
    ["E519", "Copper sulphate", "caution"], ["E523", "Aluminium ammonium sulphate", "caution"],
    ["E530", "Magnesium oxide", "ok"], ["E538", "Calcium ferrocyanide", "limit"],
    ["E542", "Bone phosphate", "limit"], ["E544", "Calcium polyphosphate", "limit"],
    ["E545", "Ammonium polyphosphate", "limit"], ["E550", "Sodium silicate", "limit"],
    ["E553a", "Magnesium silicate", "limit"], ["E556", "Aluminium calcium silicate", "caution"],
    ["E558", "Bentonite", "ok"], ["E559", "Aluminium silicate (kaolin)", "caution"],
    ["E574", "Gluconic acid", "ok"], ["E577", "Potassium gluconate", "ok"],
    ["E579", "Ferrous gluconate", "ok"],
    // Flavor enhancers (E600–E699)
    ["E636", "Maltol", "limit"], ["E637", "Ethyl maltol", "limit"], ["E641", "L-leucine", "ok"],
    // Glazing agents, gases, sweeteners, improvers (E900–E999)
    ["E908", "Rice bran wax", "ok"], ["E913", "Lanolin", "limit"],
    ["E915", "Esters of colophonium", "limit"], ["E922", "Potassium persulphate", "caution"],
    ["E923", "Ammonium persulphate", "caution"], ["E925", "Chlorine", "caution"],
    ["E926", "Chlorine dioxide", "caution"], ["E928", "Benzoyl peroxide", "caution"],
    ["E930", "Calcium peroxide", "limit"], ["E940", "Dichlorodifluoromethane", "limit"],
    ["E943b", "Isobutane", "limit"], ["E945", "Chloropentafluoroethane", "limit"],
    ["E949", "Hydrogen", "ok"], ["E956", "Alitame", "avoid"],
    ["E964", "Polyglycitol syrup", "limit"], ["E999", "Quillaia extract", "limit"],
    // Additional / modified starches, enzymes (E1000–E1525)
    ["E1000", "Cholic acid", "limit"], ["E1001", "Choline salts", "ok"],
    ["E1103", "Invertase", "ok"], ["E1104", "Lipases", "ok"],
    ["E1204", "Pullulan", "ok"], ["E1205", "Basic methacrylate copolymer", "limit"],
    ["E1206", "Neutral methacrylate copolymer", "limit"], ["E1207", "Anionic methacrylate copolymer", "limit"],
    ["E1208", "Polyvinylpyrrolidone-vinyl acetate copolymer", "limit"],
    ["E1209", "Polyvinyl alcohol-polyethylene glycol graft copolymer", "limit"],
    ["E1401", "Acid-treated starch", "limit"], ["E1402", "Alkaline-treated starch", "limit"],
    ["E1403", "Bleached starch", "limit"], ["E1405", "Enzyme-treated starch", "limit"],
    ["E1411", "Distarch glycerol", "limit"], ["E1423", "Acetylated distarch glycerol", "limit"],
    ["E1430", "Distarch glycerine", "limit"], ["E1452", "Starch aluminium octenyl succinate", "limit"],
    ["E1503", "Castor oil", "ok"], ["E1504", "Ethyl acetate", "limit"]
  ];

  // Expanded whole-food / clean ingredient recognition.
  const extraClean = [
    "wheat", "whole grain wheat", "whole wheat", "barley", "rye", "millet", "buckwheat",
    "corn", "whole grain corn", "cornmeal", "sweet potato", "potato", "potatoes", "peas",
    "green beans", "broccoli", "cauliflower", "cabbage", "celery", "cucumber", "bell pepper",
    "peppers", "mushrooms", "zucchini", "squash", "beets", "asparagus", "lettuce", "avocado",
    "orange", "oranges", "grapes", "pineapple", "mango", "peach", "pear", "cherries", "cranberries",
    "coconut milk", "almond milk", "oat milk", "soy milk", "cottage cheese", "cheddar cheese",
    "mozzarella", "parmesan", "sour cream", "whole milk", "skim milk", "heavy cream",
    "turkey", "pork", "lamb", "shrimp", "cod", "sardines", "anchovies", "ground beef",
    "olive", "olives", "sesame seeds", "hemp seeds", "pecans", "hazelnuts", "pistachios",
    "macadamia", "brazil nuts", "pine nuts", "tahini", "peanut butter", "almond butter",
    "rolled oats", "steel cut oats", "wild rice", "basmati rice", "jasmine rice", "couscous",
    "pasta", "durum wheat", "semolina", "chickpea flour", "almond flour", "coconut flour",
    "tapioca", "arrowroot", "cocoa powder", "dark chocolate", "unsweetened chocolate",
    "rosemary", "thyme", "oregano", "parsley", "cilantro", "dill", "mint", "sage", "paprika",
    "cumin", "coriander", "nutmeg", "cloves", "cardamom", "bay leaf", "chili", "cayenne",
    "black pepper", "white pepper", "mustard", "mustard seed", "horseradish", "capers",
    "tomato paste", "tomato puree", "balsamic vinegar", "white vinegar", "rice vinegar",
    "sea salt", "kosher salt", "himalayan salt", "baking powder", "cream of tartar",
    "gelatin", "collagen", "bone broth", "chicken broth", "vegetable broth", "kefir",
    "tempeh", "edamame", "miso", "seaweed", "nori", "kombucha", "sauerkraut", "kimchi",
    "stevia", "monk fruit", "erythritol", "allulose", "blackstrap molasses", "coconut sugar"
  ];

  // Large second pass of common U.S. grocery ingredients (whole foods / basics).
  const extraClean2 = [
    "watermelon", "cantaloupe", "honeydew", "kiwi", "plum", "apricot", "fig", "pomegranate",
    "grapefruit", "tangerine", "clementine", "nectarine", "blackberries", "raspberries",
    "currant", "guava", "papaya", "passion fruit", "dragon fruit", "lychee", "persimmon",
    "prunes", "dried apricots", "dried cranberries", "coconut flakes",
    "brussels sprouts", "artichoke", "eggplant", "okra", "leek", "scallion", "scallions",
    "shallot", "radish", "turnip", "parsnip", "rutabaga", "fennel", "bok choy", "collard greens",
    "swiss chard", "arugula", "romaine", "watercress", "endive", "jalapeno", "serrano",
    "poblano", "butternut squash", "acorn squash", "pumpkin", "corn kernels", "snap peas",
    "snow peas", "bean sprouts", "water chestnut", "bamboo shoots", "green onion", "cherry tomatoes",
    "sushi rice", "bulgur", "rye flour", "spelt", "teff", "sorghum", "amaranth", "polenta",
    "grits", "popcorn", "whole grain", "bran", "wheat germ", "cornstarch", "corn starch",
    "turkey breast", "ground turkey", "tofu", "seitan", "egg whites", "whey protein",
    "pea protein", "halibut", "mahi mahi", "trout", "mackerel", "herring", "clams", "mussels",
    "oysters", "scallops", "duck", "venison", "bison", "crab", "lobster",
    "greek yogurt", "ricotta", "feta", "goat cheese", "swiss cheese", "provolone", "gouda",
    "brie", "half and half", "evaporated milk", "plain yogurt",
    "sunflower butter", "cashew butter", "poppy seeds", "hemp hearts",
    "kidney beans", "pinto beans", "navy beans", "cannellini beans", "lima beans", "split peas",
    "black eyed peas", "soybeans", "fava beans", "mung beans", "adzuki beans", "great northern beans",
    "allspice", "anise", "caraway", "celery seed", "chili powder", "chives", "curry powder",
    "fennel seed", "fenugreek", "garlic powder", "onion powder", "marjoram", "mustard powder",
    "saffron", "savory", "star anise", "tarragon", "vanilla bean", "lemongrass", "bay leaves",
    "smoked paprika", "red pepper flakes", "italian seasoning", "herbs",
    "tomato sauce", "crushed tomatoes", "diced tomatoes", "coconut water", "almond extract",
    "cocoa butter", "unsweetened cocoa", "baking chocolate", "arrowroot", "nutritional yeast",
    "pickles", "soy sauce", "tamari", "fish sauce", "worcestershire sauce", "dijon mustard",
    "ghee", "tallow", "duck fat", "sesame oil", "walnut oil", "flaxseed oil", "mct oil",
    "ground beef", "chicken breast", "pork chop", "egg noodles", "whole grain bread",
    "rolled barley", "quinoa flakes", "potato starch", "tapioca starch", "rice flour",
    "vanilla beans", "fresh herbs", "lime", "lemon", "garlic", "onions", "celery"
  ];
  for (var c1 = 0; c1 < extraClean.length; c1++) {
    if (cleanIngredients.indexOf(extraClean[c1]) === -1) cleanIngredients.push(extraClean[c1]);
  }
  for (var c2 = 0; c2 < extraClean2.length; c2++) {
    if (cleanIngredients.indexOf(extraClean2[c2]) === -1) cleanIngredients.push(extraClean2[c2]);
  }

  // Third pass: more common whole foods / pantry basics seen on real labels.
  const extraClean3 = [
    // produce
    "strawberries", "blueberries", "spinach", "kale", "carrots", "carrot", "tomato", "tomatoes",
    "apple", "apples", "banana", "bananas", "lemon juice", "lime juice", "ginger", "garlic cloves",
    "sweet corn", "green peas", "yellow onion", "red onion", "white onion", "sweet onion",
    "red pepper", "green pepper", "yellow pepper", "chili pepper", "habanero", "anaheim pepper",
    "napa cabbage", "red cabbage", "green cabbage", "iceberg lettuce", "mixed greens", "baby spinach",
    "portobello", "shiitake", "cremini", "white mushrooms", "russet potato", "yukon gold potato",
    "raisins", "dates", "dried figs", "golden raisins", "dried mango", "sun-dried tomatoes",
    // grains / starches
    "brown rice", "white rice", "long grain rice", "short grain rice", "wheat flour",
    "whole wheat flour", "all-purpose flour", "bread flour", "oat flour", "buckwheat flour",
    "rolled oats", "quick oats", "instant oats", "oat bran", "wheat bran", "farro", "freekeh",
    "millet flour", "barley flour", "chickpea pasta", "lentil pasta", "brown rice pasta",
    // protein
    "chicken thigh", "chicken wings", "whole chicken", "ground chicken", "pork loin",
    "pork tenderloin", "beef sirloin", "beef tenderloin", "ribeye", "flank steak", "chuck roast",
    "salmon", "tuna", "tilapia", "catfish", "snapper", "pollock", "whitefish", "octopus", "squid",
    "egg", "eggs", "egg yolk", "egg yolks", "whole egg", "liquid egg whites",
    // dairy / alternatives
    "buttermilk", "clotted cream", "creme fraiche", "mascarpone", "burrata", "queso fresco",
    "cashew milk", "rice milk", "hemp milk", "macadamia milk", "pea milk", "lactose-free milk",
    // legumes / nuts / seeds
    "garbanzo beans", "white beans", "red lentils", "green lentils", "brown lentils", "yellow lentils",
    "roasted peanuts", "raw almonds", "raw cashews", "walnuts", "almonds", "cashews", "peanuts",
    "chia seeds", "flax seeds", "ground flaxseed", "pumpkin seeds", "sunflower seeds", "sesame oil",
    // condiments / pantry
    "extra virgin olive oil", "olive oil", "avocado oil", "coconut oil", "grapeseed oil",
    "apple cider vinegar", "red wine vinegar", "sherry vinegar", "champagne vinegar",
    "honey mustard", "whole grain mustard", "yellow mustard", "ketchup", "salsa", "guacamole",
    "hummus", "pesto", "marinara", "vegetable stock", "beef broth", "fish stock",
    "vanilla extract", "lemon zest", "orange zest", "lime zest", "fresh ginger", "fresh garlic",
    "cinnamon", "ground cinnamon", "ground ginger", "ground turmeric", "turmeric", "basil", "tarragon"
  ];
  for (var c3 = 0; c3 < extraClean3.length; c3++) {
    if (cleanIngredients.indexOf(extraClean3[c3]) === -1) cleanIngredients.push(extraClean3[c3]);
  }

  // Fourth pass: even more common whole foods, pantry staples and prepared basics.
  const extraClean4 = [
    // produce
    "asparagus", "green beans", "broccolini", "cauliflower", "broccoli", "zucchini",
    "yellow squash", "spaghetti squash", "delicata squash", "beets", "beet", "celery root",
    "kohlrabi", "daikon", "jicama", "plantain", "plantains", "taro", "yam", "yams",
    "sweet potato", "sweet potatoes", "cucumber", "cucumbers", "mango", "mangoes",
    "pineapple", "cherries", "cherry", "grapes", "green grapes", "red grapes", "cranberries",
    "elderberry", "gooseberry", "mulberry", "boysenberry", "blackberry", "cantaloupe melon",
    "honeycrisp apple", "granny smith apple", "gala apple", "fuji apple", "bartlett pear",
    "navel orange", "blood orange", "cara cara orange", "meyer lemon", "key lime",
    "rhubarb", "chayote", "tomatillo", "okra pods", "snap beans",
    // grains / starches
    "couscous", "israeli couscous", "wild rice", "jasmine rice", "basmati rice", "arborio rice",
    "black rice", "red rice", "steel cut oats", "cracked wheat", "wheat berries", "kamut",
    "semolina", "durum wheat", "corn meal", "yellow cornmeal", "hominy", "masa harina",
    "rice noodles", "soba noodles", "udon noodles", "whole wheat pasta", "semolina pasta",
    // protein
    "lamb", "lamb chop", "ground lamb", "goat meat", "rabbit", "quail", "cornish hen",
    "turkey", "ground turkey breast", "deli turkey", "pork shoulder", "pork belly", "ham hock",
    "sardines", "anchovies", "shrimp", "prawns", "crawfish", "sea bass", "grouper", "swordfish",
    "arctic char", "branzino", "smoked salmon", "canned tuna", "canned salmon",
    "egg substitute", "liquid eggs", "duck egg", "quail egg",
    // dairy / alternatives
    "cottage cheese", "cream cheese", "sour cream", "heavy cream", "whipping cream",
    "monterey jack", "colby cheese", "pepper jack", "muenster", "havarti", "manchego",
    "parmesan", "parmigiano reggiano", "romano cheese", "asiago", "blue cheese", "cheddar",
    "almond milk", "soy milk", "oat milk", "coconut milk", "cashew milk", "goat milk",
    "skim milk", "whole milk", "2% milk", "kefir milk",
    // legumes / nuts / seeds
    "lima beans", "butter beans", "cranberry beans", "lupini beans", "tepary beans",
    "yellow split peas", "green split peas", "whole green peas", "roasted chickpeas",
    "macadamia nuts", "brazil nuts", "pine nuts", "hazelnuts", "pistachios", "chestnuts",
    "tahini", "sesame seeds", "hemp seeds", "watermelon seeds", "nigella seeds",
    "peanut butter", "almond butter", "cashew butter",
    // oils / fats / condiments / pantry
    "sesame oil", "peanut oil", "rice bran oil", "macadamia oil", "hemp oil",
    "almond flour", "coconut flour", "cassava flour", "chickpea flour", "tapioca flour",
    "baking soda", "baking powder", "cream of tartar", "active dry yeast", "instant yeast",
    "vegetable broth", "chicken stock", "bone broth", "miso paste", "coconut aminos",
    "rice wine vinegar", "malt vinegar", "balsamic glaze", "tomato paste", "tahini paste",
    "dijon", "stone ground mustard", "horseradish", "sriracha", "hot sauce", "chili paste",
    "maple syrup", "molasses", "vanilla bean paste", "cocoa powder", "dark chocolate",
    "shredded coconut", "coconut cream", "dried oregano", "dried thyme", "dried rosemary",
    "ground cumin", "ground coriander", "smoked paprika", "garlic salt", "onion salt",
    "everything bagel seasoning", "old bay", "herbes de provence", "za'atar"
  ];
  for (var c4 = 0; c4 < extraClean4.length; c4++) {
    if (cleanIngredients.indexOf(extraClean4[c4]) === -1) cleanIngredients.push(extraClean4[c4]);
  }

  // Fifth pass: Bobby-Approved-style whole foods, superfoods and "real" pantry
  // staples, plus quality descriptors so good ingredients read as Clean.
  const extraClean5 = [
    // superfoods / greens
    "spirulina", "chlorella", "matcha", "matcha powder", "acai", "acai berry", "goji berries",
    "goji berry", "maca", "maca powder", "cacao nibs", "raw cacao", "moringa", "wheatgrass",
    "barley grass", "microgreens", "dandelion greens", "dulse", "wakame", "kelp",
    // fruit / produce
    "blackberry", "raspberry", "blueberry", "strawberry", "cranberry", "elderberries",
    "pomegranate seeds", "passionfruit", "starfruit", "jackfruit", "lychee", "longan",
    "rambutan", "dragonfruit", "ataulfo mango", "concord grapes", "medjool dates",
    "kabocha squash", "rainbow chard", "fennel bulb", "garlic scapes", "ramps",
    // proteins (Bobby favors pasture-raised / wild)
    "grass-fed beef", "grass fed beef", "pasture-raised eggs", "pasture raised eggs",
    "wild-caught salmon", "wild caught salmon", "wild salmon", "chicken liver", "beef liver",
    "ground bison", "lamb shoulder", "pork rinds", "uncured bacon", "wild cod", "fresh tuna",
    "free-range chicken", "free range chicken", "bone-in chicken thigh",
    // fats / dairy Bobby approves
    "grass-fed butter", "grass fed butter", "raw honey", "manuka honey", "raw milk",
    "cold pressed olive oil", "extra virgin coconut oil", "macadamia nut oil", "duck fat",
    "cultured butter", "raw cheese", "a2 milk",
    // pantry / ferments / flours / salts
    "himalayan pink salt", "pink himalayan salt", "celtic sea salt", "real salt", "redmond salt",
    "flaky sea salt", "nutritional yeast", "coconut aminos", "fish sauce", "raw apple cider vinegar",
    "kombucha", "kimchi", "sauerkraut", "miso paste", "tempeh", "natto",
    "almond flour", "cassava flour", "coconut flour", "tigernut flour", "tapioca flour",
    "arrowroot powder", "psyllium husk", "ground flaxseed", "hemp hearts", "hemp seeds",
    "chia seeds", "sacha inchi", "collagen peptides", "bone broth", "beef gelatin",
    // grains / legumes
    "buckwheat groats", "sprouted oats", "sprouted lentils", "black rice", "forbidden rice",
    "green lentils", "beluga lentils", "great northern beans", "heirloom beans"
  ];
  for (var c5 = 0; c5 < extraClean5.length; c5++) {
    if (cleanIngredients.indexOf(extraClean5[c5]) === -1) cleanIngredients.push(extraClean5[c5]);
  }

  // More added-sugar synonyms seen on U.S. labels.
  const extraSugars = [
    "turbinado", "demerara", "muscovado", "powdered sugar", "confectioners sugar",
    "brown rice syrup", "tapioca syrup", "date syrup", "maple sugar", "palm sugar",
    "golden syrup", "treacle", "sorghum syrup", "malt syrup", "caramel syrup",
    "beet sugar", "raw sugar", "coconut nectar", "corn sweetener", "crystalline fructose",
    "fruit juice", "honey", "agave nectar", "maltose syrup",
    "evaporated cane juice", "cane sugar", "cane juice", "rice syrup", "barley malt",
    "barley malt syrup", "fruit juice concentrate", "grape juice concentrate", "carob syrup",
    "rice malt syrup", "yacon syrup", "panela", "jaggery",
    "anhydrous dextrose", "glucose-fructose syrup", "glucose syrup", "isoglucose",
    "corn syrup solids", "glucose solids", "dried glucose syrup", "brown rice syrup solids",
    "tapioca syrup", "tapioca dextrose", "dextrose monohydrate", "fructose syrup",
    "high maltose corn syrup", "refiners syrup", "sugar cane", "sucanat", "florida crystals",
    "barley malt extract"
  ];
  for (var s2 = 0; s2 < extraSugars.length; s2++) {
    if (addedSugars.indexOf(extraSugars[s2]) === -1) addedSugars.push(extraSugars[s2]);
  }

  // More vague / undisclosed terms.
  const extraVague = ["flavor", "flavors", "flavour", "flavours", "natural and artificial flavors", "seasoning", "seasonings", "smoke flavor", "natural smoke flavor", "natural flavor", "natural flavors", "artificial flavor", "artificial flavors", "natural flavoring", "spices", "spice", "spice extract", "flavoring", "flavorings", "natural flavour", "artificial flavour",
    // word-form variants seen on real labels ("ARTIFICIALLY FLAVORED PINK LEMONADE")
    "artificially flavored", "artificially flavoured", "artificial flavored", "natural flavored", "naturally flavored", "naturally flavoured", "artificially colored", "artificially coloured", "artificial flavors added", "flavored", "flavoured"];
  for (var v2 = 0; v2 < extraVague.length; v2++) {
    if (vagueTerms.indexOf(extraVague[v2]) === -1) vagueTerms.push(extraVague[v2]);
  }

  /* Category-level explanations so EVERY ingredient has a meaningful detail
     page even when it isn't one of the individually-written additives. */
  const groups = {
    seedOil: {
      category: "Industrial seed/vegetable oil", status: "avoid",
      summary: "Highly refined, solvent-extracted oil rich in oxidized omega-6 fat.",
      whatIs: "Seed and vegetable oils (canola, soybean, corn, sunflower, safflower, cottonseed, grapeseed, rice bran, etc.) are extracted from seeds using high heat and chemical solvents like hexane, then bleached and deodorized.",
      whyFlagged: "Avoid: these refined oils are very high in omega-6 linoleic acid and oxidize easily during processing and cooking, and they are one of the most reliable markers of ultra-processed food. Bobby-Approved-style scanning flags them red.",
      effects: "A heavily skewed omega-6:omega-3 ratio and oxidized-fat intake; an indicator the product is industrially processed. Choose butter, olive, avocado or coconut oil instead.",
      studies: [{ title: "Dietary linoleic acid and the omega-6/omega-3 balance (review)", source: "Nutrients", year: 2018 }]
    },
    fortified: {
      category: "Added vitamin/mineral", status: "ok",
      summary: "A synthetic vitamin or mineral added to fortify or enrich the food.",
      whatIs: "Nutrients like folic acid, reduced iron, niacin, thiamine and added vitamins/minerals are put into processed foods to replace what refining removed or to meet fortification standards.",
      whyFlagged: "Not a harmful additive — but its presence usually signals a refined product that needed nutrients added back. The nutrients themselves are generally recognized as safe.",
      effects: "No known concerns at the amounts used; mainly a marker that the base ingredient was refined.",
      studies: []
    },
    addedSugar: {
      category: "Added sugar", status: "limit",
      summary: "Sugar added during processing; excess intake drives metabolic disease.",
      whatIs: "Added sugars (cane sugar, corn syrup, dextrose, fructose, syrups, juice concentrates) are sweeteners added to a product — unlike sugar naturally present in whole fruit or milk.",
      whyFlagged: "They add calories with no nutrients and are easy to over-consume. Health authorities advise keeping added sugar under ~10% of daily calories.",
      effects: "High intake is linked to weight gain, type-2 diabetes, fatty liver, tooth decay and heart disease.",
      studies: [
        { title: "Added sugar intake and cardiovascular disease mortality", source: "JAMA Internal Medicine", year: 2014 },
        { title: "Dietary sugars and cardiovascular health (AHA scientific statement)", source: "Circulation", year: 2009 }
      ]
    },
    sweetener: {
      category: "Artificial sweetener", status: "avoid",
      summary: "Synthetic non-nutritive sweetener best avoided.",
      whatIs: "Non-nutritive sweeteners (aspartame, sucralose, acesulfame-K, saccharin, neotame, etc.) deliver sweetness with little or no calories and are many times sweeter than sugar.",
      whyFlagged: "Avoid: regulator-approved, but research links them to effects on the gut microbiome, appetite and metabolism, and the WHO advises against using them for weight control. Bobby-Approved-style scanning flags artificial sweeteners red.",
      effects: "Possible gut-microbiome and metabolic effects; some people report digestive upset and increased cravings.",
      studies: [{ title: "Use of non-sugar sweeteners — WHO guideline", source: "World Health Organization", year: 2023 }]
    },
    vague: {
      category: "Undisclosed ingredient", status: "caution",
      summary: "A vague catch-all term that can hide many undisclosed compounds.",
      whatIs: "Terms like 'natural flavors', 'artificial flavors', 'flavoring' and 'spices' are umbrella labels that can each represent dozens of individual compounds — including solvents and carriers — a manufacturer isn't required to disclose.",
      whyFlagged: "Lack of transparency — you can't tell exactly what's in it, and flavor blends may contain solvents, preservatives or allergens. Undisclosed flavorings are flagged hardest.",
      effects: "A transparency problem and a hallmark of processed food; a real issue for people with sensitivities or allergies who can't verify the contents.",
      studies: []
    },
    clean: {
      category: "Whole-food ingredient", status: "good",
      summary: "A recognized whole-food ingredient with no known concerns.",
      whatIs: "This is a real, recognizable food ingredient rather than an industrial additive.",
      whyFlagged: "Not flagged — this is exactly the kind of ingredient you want to see on a label.",
      effects: "No known concerns at normal dietary amounts.",
      studies: []
    },
    unknown: {
      category: "Not yet catalogued", status: "unknown",
      summary: "We don't have detailed information on this ingredient yet.",
      whatIs: "This ingredient isn't in NutriCheck's database yet, so we can't fully classify it.",
      whyFlagged: "Not necessarily bad — just unrecognized. The database is expanding continuously.",
      effects: "Unknown. If it reads like a chemical additive, treat it with mild caution.",
      studies: []
    },
    eOk: {
      category: "Food additive", status: "ok",
      summary: "An approved food additive generally considered low-risk.",
      whatIs: "An approved food additive (E-number) used for color, texture, preservation or flavor.",
      whyFlagged: "Considered low-risk at normal levels by food-safety regulators.",
      effects: "No significant concerns at typical dietary amounts.",
      studies: []
    },
    eLimit: {
      category: "Food additive", status: "limit",
      summary: "An approved additive that's best kept in moderation.",
      whatIs: "An approved food additive (E-number); common in processed foods.",
      whyFlagged: "Approved, but a marker of processed food and best limited.",
      effects: "Low direct risk; the bigger concern is a diet high in ultra-processed foods.",
      studies: []
    },
    eCaution: {
      category: "Food additive", status: "caution",
      summary: "An additive with some safety questions or mixed evidence.",
      whatIs: "An approved food additive that has drawn safety questions or restrictions in some regions.",
      whyFlagged: "Mixed or emerging evidence of effects such as digestive, behavioral or allergic reactions.",
      effects: "Possible effects in sensitive individuals; the strength of evidence varies by additive.",
      studies: []
    },
    eAvoid: {
      category: "Food additive", status: "avoid",
      summary: "An additive linked to notable health concerns or bans.",
      whatIs: "A food additive associated with health concerns and restricted or banned in some countries.",
      whyFlagged: "Stronger evidence of harm or regulatory action against it.",
      effects: "Potential health risk — worth avoiding where you can.",
      studies: []
    }
  };

  return {
    groups: groups, bannedMap: bannedMap,
    additives: additives, seedOils: seedOils, addedSugars: addedSugars,
    artificialSweeteners: artificialSweeteners, vagueTerms: vagueTerms,
    cleanIngredients: cleanIngredients, fortifiedVitamins: fortifiedVitamins,
    allergenMap: allergenMap, eNumbers: eNumbers
  };
})();
// UMD-style export: browser global + Node require (for engine unit tests).
if (typeof module === "object" && module.exports) module.exports = CB_DATA;
if (typeof window !== "undefined") window.CB_DATA = CB_DATA;
else if (typeof globalThis !== "undefined") globalThis.CB_DATA = CB_DATA;
