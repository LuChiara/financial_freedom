// Builds data/countries.json from raw official figures.
// Run: node data/build-countries.js
// To update a country: change a RAW value (and its source), re-run, commit both files.
//
// Every default records: value, year, source, url, type, and how it was derived.
//   type "official"   – published directly by a government / statistical agency
//   type "derived"    – computed from official figures (formula in `derivation`)
//   type "reputable"  – non-government but widely cited (industry body, academic, NGO)
//   type "convention" – planning rule of thumb; no official figure exists. Edit freely.
//   type "personal"   – depends entirely on you; placeholder only

const fs = require('fs');
const path = require('path');

const r = (x, step = 10) => Math.round(x / step) * step;

// Equivalence scales convert an "average household" into a two-adult household
// and give the extra cost of one child.
//  Canada: square-root scale (used by Statistics Canada's Low Income Measure).
//  Italy:  ISTAT absolute-poverty equivalence scale (2 people = 1.00, 3 = 1.33).
const sqrtScale = (n) => Math.sqrt(n);

// ─────────────────────────────── CANADA ───────────────────────────────
function canada() {
  const RAW = {
    consumption: 76750, shelter: 24671, health: 3087, education: 1694,   // SHS 2023
    avgHouseholdSize: 2.4,
    utilities2017: 2812, cpiFactor2017to2026: 1.28,
    homePrice: 666538,        // CREA, national average sale price, Sep 2026
    rent2br: 2130,            // StatCan Quarterly Rent Statistics, Q2 2026, all CMAs
    tuition: 7734,            // StatCan, Canadian undergraduate, 2025/2026
    cppAvgNew: 877.01, oasMax: 762.50,   // per person, monthly
    ltcMonthly: 2129.17,      // Ontario basic LTC co-payment, from Jul 1 2026
  };
  const toCouple = sqrtScale(2) / sqrtScale(RAW.avgHouseholdSize);
  const coreAvg = RAW.consumption - RAW.shelter - RAW.health - RAW.education;
  const core = r(coreAvg * toCouple, 100);
  const medical = r(RAW.health * toCouple);
  const utilities = r(RAW.utilities2017 * RAW.cpiFactor2017to2026, 100);
  const kidCost = r(core * (sqrtScale(3) / sqrtScale(2) - 1), 100);
  const pensionGross = (RAW.cppAvgNew + RAW.oasMax) * 12 * 2;
  const pensionNet = r(pensionGross * 0.95, 100);
  const rent = RAW.rent2br * 12;
  const buffer = r((core + medical + utilities + rent) / 2, 100);

  const SHS = 'https://www150.statcan.gc.ca/n1/pub/11-627-m/11-627-m2025026-eng.htm';
  return {
    name: 'Canada', currency: 'CAD', locale: 'en-CA', household: 'Two adults',
    params: {
      currentAge: 30, lifeExpectancy: 90,
      currentInvestments: 30000, savingsMode: 'fixed', annualSavings: 24000, netIncome: 99000,
      nominalReturn: 0.07, inflation: 0.02, fee: 0.0025,
      withdrawalRate: 0.035, method: 'swr', taxRate: 0.10,
      coreSpend: core, medical, otherAnnual: utilities, buffer,
      housing: {
        mode: 'rent', rent, homePrice: RAW.homePrice,
        propertyTaxRate: 0.0075, maintenanceRate: 0.01, insurance: 2000, closingCostRate: 0.03,
        mortgage: { principal: r(RAW.homePrice * 0.8, 100), rate: 0.045, termYears: 25, yearsElapsed: 0 },
      },
      kids: [],
      pension: { annual: pensionNet, startAge: 65 },
      longTermCare: { annual: r(RAW.ltcMonthly * 12), startAge: 85 },
    },
    kidTemplate: { age: -1, annualCost: kidCost, independentAge: 18, educationCost: RAW.tuition * 4, educationAge: 18 },
    sources: {
      coreSpend: {
        type: 'derived', year: 2023,
        source: 'Statistics Canada, Survey of Household Spending 2023', url: SHS,
        derivation: `Average household consumption $76,750 minus shelter $24,671, health $3,087 and education $1,694 = $${coreAvg.toLocaleString('en')}; converted from the average household (~2.4 people) to two adults with the square-root equivalence scale (×${toCouple.toFixed(3)}).`,
        note: 'Covers food, transport, clothing, recreation, household operation, personal care, etc. Excludes housing, utilities, health and education, which are separate inputs. 2023 dollars: roughly 5–7% below 2026 prices.',
      },
      medical: {
        type: 'derived', year: 2023, source: 'Statistics Canada, Survey of Household Spending 2023', url: SHS,
        derivation: 'Average household health-care spending $3,087 (includes private insurance premiums), scaled to two adults.',
      },
      otherAnnual: {
        type: 'derived', year: 2017,
        source: 'Statistics Canada, SHS modelled annual statistics (water, fuel and electricity: $2,812 in 2017)',
        url: 'https://www150.statcan.gc.ca/n1/pub/62f0026m/2020001/tbl/tblappb-eng.htm',
        derivation: '$2,812 × ~1.28 CPI growth 2017→2026.', note: 'Utilities. Add anything else recurring here (insurance, car replacement, travel).',
      },
      'housing.rent': {
        type: 'official', year: 2026, source: 'Statistics Canada / CMHC, Quarterly Rent Statistics, Q2 2026',
        url: 'https://www150.statcan.gc.ca/n1/en/surveys/5427',
        derivation: 'Average asking rent for a two-bedroom apartment, all census metropolitan areas: $2,130/month × 12.',
        note: 'Asking rent for new leases; sitting tenants usually pay less. Vancouver and Toronto are much higher.',
      },
      'housing.homePrice': {
        type: 'reputable', year: 2026, source: 'Canadian Real Estate Association (CREA), September 2026',
        url: 'https://storeys.com/canada-homes-cheaper-september-buyers/',
        derivation: 'National average sale price $666,538.', note: 'Averages are pulled up by Toronto and Vancouver.',
      },
      'housing.propertyTaxRate': { type: 'convention', note: 'Varies by municipality (roughly 0.3%–1.5% of value). Check your city.' },
      'housing.maintenanceRate': { type: 'convention', note: 'Common 1%-of-value-per-year rule for repairs and upkeep.' },
      'housing.insurance': { type: 'convention', note: 'Typical home insurance; get a quote.' },
      'housing.closingCostRate': { type: 'convention', note: 'Land transfer tax + legal fees; higher in Toronto (municipal LTT).' },
      'housing.mortgage.rate': { type: 'convention', note: 'Check current 5-year fixed rates; the Bank of Canada was signalling a hike in Oct 2026.' },
      'kids.annualCost': {
        type: 'derived', year: 2023, source: 'Derived from Statistics Canada SHS 2023 and the LIM square-root scale', url: SHS,
        derivation: `Two-adult core spending × (√3/√2 − 1) = ${core} × 0.225. Extra household consumption for one child.`,
        note: 'Does not include full-price daycare; Canada-wide early learning fees vary by province.',
      },
      'kids.educationCost': {
        type: 'official', year: 2025, source: 'Statistics Canada, Tuition fees 2025/2026',
        url: 'https://www150.statcan.gc.ca/n1/daily-quotidien/250910/dq250910d-eng.htm',
        derivation: 'Average Canadian undergraduate tuition $7,734 × 4 years.', note: 'Tuition only; add living costs if they study away from home.',
      },
      'pension.annual': {
        type: 'derived', year: 2026, source: 'Government of Canada, CPP and OAS amounts 2026',
        url: 'https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-october-december.html',
        derivation: `Per person: average new CPP retirement pension $877.01/month (Jul–Sep 2026) + maximum OAS $762.50/month (Oct–Dec 2026). Two adults = $${Math.round(pensionGross).toLocaleString('en')}/yr gross, less ~5% income tax.`,
        note: 'CPP max is $1,507.65/month at 65 with ~39 years of maximum contributions. Check your own statement in My Service Canada Account.',
      },
      'pension.startAge': { type: 'official', source: 'Government of Canada', note: 'Standard age 65; CPP can start at 60 (reduced) or 70 (increased).' },
      lifeExpectancy: {
        type: 'derived', year: 2024, source: 'Statistics Canada, Deaths 2024',
        url: 'https://www150.statcan.gc.ca/n1/daily-quotidien/260113/dq260113b-eng.htm',
        derivation: 'Life expectancy at birth 82.16 (2024). Those who reach 65 live longer; planning to 90 covers longevity risk.',
      },
      'longTermCare.annual': {
        type: 'official', year: 2026, source: 'Government of Ontario, LTC maximum co-payment from July 1, 2026',
        url: 'https://www.ontario.ca/page/get-help-paying-long-term-care',
        derivation: 'Basic long-stay co-payment $2,129.17/month × 12, one person, ages 85–90.',
        note: 'Provincial rates differ. Private retirement homes cost far more.',
      },
      nominalReturn: {
        type: 'reputable', year: 2025, source: 'UBS Global Investment Returns Yearbook 2026 (Dimson, Marsh, Staunton)',
        url: 'https://www.ubs.com/global/en/media/display-page-ndp/en-20260303-global-investment-returns-yearbook-2026.html',
        derivation: 'Since 1900, global equities returned about 6.6%/yr real; the world excluding the US about 4.5%. Default 7% nominal with 2% inflation ≈ 4.9% real before fees, a deliberately conservative choice.',
      },
      inflation: { type: 'official', source: 'Bank of Canada inflation-control target (2%)', url: 'https://www.bankofcanada.ca/' },
      fee: { type: 'convention', note: 'Typical all-in cost of a broad index ETF portfolio.' },
      withdrawalRate: { type: 'convention', note: 'The 4% rule comes from US history; international studies find lower safe rates, so 3.5% is used.' },
      taxRate: {
        type: 'derived', year: 2026, source: 'Canada Revenue Agency: capital gains inclusion rate is one-half',
        url: 'https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2025/update-cra-administration-proposed-capital-gains-taxation-changes.html',
        derivation: 'Only the gain portion of a withdrawal is taxed, at half inclusion; TFSA withdrawals are tax-free, RRSP withdrawals fully taxed. ~10% blended is a middle estimate.',
        note: 'Mostly TFSA → lower. Mostly RRSP → 20–30%.',
      },
      buffer: { type: 'convention', derivation: 'Six months of core + medical + utilities + rent.' },
      currentAge: { type: 'personal', note: 'Example only. Replace with your own number.' }, currentInvestments: { type: 'personal', note: 'Example only. Replace with your own number.' },
      annualSavings: { type: 'personal', note: 'Example only. Replace with your own number.' }, netIncome: { type: 'personal', note: 'Example only: roughly today’s average costs plus the example savings. Replace with your own.' },
    },
  };
}

// ─────────────────────────────── ITALY ───────────────────────────────
function italy() {
  const RAW = {
    monthlySpend: 2782, housingEnergyShare: 0.36,       // ISTAT 2025
    avgHouseholdSize: 2.2, istatScaleAvg: 1.066,          // interpolated between 2 (1.00) and 3 (1.33)
    oopBillion: 41.3, households: 27.0e6,                 // out-of-pocket health 2024
    rentMonthly: 438,                                     // ISTAT 2025 average rent paid
    homePrice: 162100,                                    // OMI-ABI: avg value of a home sold in 2025
    mortgageRate: 0.0335,                                 // OMI-ABI: avg initial rate 2025
    universityFee: 1000,                                  // avg annual fee, state universities
    pensionMonthly: 1264,                                 // INPS: avg new pension, H1 2026 (13 payments/yr)
    replacementNow: 0.719, replacementFuture: 0.585,      // RGS: employee, 38y contributions, 2030 → 2070
    rsaMonthly: 1750,                                     // family share of RSA fee, €1,500–2,000
  };
  const annual = RAW.monthlySpend * 12;
  const medicalAvg = (RAW.oopBillion * 1e9) / RAW.households;
  const coreAvg = annual * (1 - RAW.housingEnergyShare) - medicalAvg;
  const core = r(coreAvg / RAW.istatScaleAvg, 100);
  const medical = r(medicalAvg / RAW.istatScaleAvg);
  const kidCost = r(core * 0.33, 100);
  const futureMonthly = RAW.pensionMonthly * (RAW.replacementFuture / RAW.replacementNow);
  const pensionGross = futureMonthly * 13 * 2;
  const pensionNet = r(pensionGross * 0.88, 100);
  const rent = RAW.rentMonthly * 12;
  const utilities = 2000;
  const buffer = r((core + medical + utilities + rent) / 2, 100);

  const ISTAT_SPESE = 'https://www.istat.it/?p=137003';
  return {
    name: 'Italy', currency: 'EUR', locale: 'it-IT', household: 'Two adults',
    params: {
      currentAge: 30, lifeExpectancy: 90,
      currentInvestments: 15000, savingsMode: 'fixed', annualSavings: 9000, netIncome: 36000,
      nominalReturn: 0.07, inflation: 0.02, fee: 0.0045,
      withdrawalRate: 0.035, method: 'swr', taxRate: 0.13,
      coreSpend: core, medical, otherAnnual: utilities, buffer,
      housing: {
        mode: 'rent', rent, homePrice: RAW.homePrice,
        propertyTaxRate: 0, maintenanceRate: 0.01, insurance: 300, closingCostRate: 0.04,
        mortgage: { principal: r(RAW.homePrice * 0.8, 100), rate: RAW.mortgageRate, termYears: 25, yearsElapsed: 0 },
      },
      kids: [],
      pension: { annual: pensionNet, startAge: 70 },
      longTermCare: { annual: RAW.rsaMonthly * 12, startAge: 85 },
    },
    kidTemplate: { age: -1, annualCost: kidCost, independentAge: 18, educationCost: RAW.universityFee * 5, educationAge: 19 },
    sources: {
      coreSpend: {
        type: 'derived', year: 2025, source: 'ISTAT, Le spese per i consumi delle famiglie – Anno 2025', url: ISTAT_SPESE,
        derivation: `€2,782/month × 12 = €${annual.toLocaleString('en')}; minus the housing & energy division (36%, includes imputed rent) and out-of-pocket health (€${Math.round(medicalAvg)}), then converted from the average household (~2.2 people) to two adults with ISTAT’s equivalence scale (÷${RAW.istatScaleAvg}).`,
        note: 'Average spending is above the median (€2,338/month). North-East households spend ~39% more than the South.',
      },
      medical: {
        type: 'derived', year: 2024, source: 'ISTAT System of Health Accounts via Corte dei Conti / GIMBE: out-of-pocket health €41.3bn (2024)',
        url: 'https://www.quotidianosanita.it/?p=148364',
        derivation: '€41.3bn ÷ ~27m households, scaled to two adults. Visits, dental, drugs and diagnostics paid privately.',
        note: 'Regional range is wide: about €1,000 per person in Lombardy vs under €400 in Basilicata.',
      },
      otherAnnual: { type: 'convention', note: 'Utilities (electricity, gas, water, TARI waste tax). Add other recurring costs here.' },
      'housing.rent': {
        type: 'official', year: 2025, source: 'ISTAT, Spese per consumi 2025: average rent paid €438/month', url: ISTAT_SPESE,
        derivation: '€438 × 12.', note: 'Average of all existing contracts, including old ones. New leases in large cities are typically 2–3× higher; check OMI rent quotes for your zone.',
      },
      'housing.homePrice': {
        type: 'official', year: 2025, source: 'Agenzia delle Entrate OMI & ABI, Rapporto Immobiliare Residenziale 2026',
        url: 'https://iusletter.com/dalla-redazione/processo-esecuzione-mediazione/real-estate/mercato-residenziale-la-fotografia-di-omi-e-abi/',
        derivation: 'Average value of a home sold in 2025: €162,100.', note: 'Rome averages ~€3,000/m² vs a national asking average near €1,900/m².',
      },
      'housing.propertyTaxRate': { type: 'official', note: 'IMU does not apply to a non-luxury primary residence (prima casa). Set ~1% for a second home.' },
      'housing.maintenanceRate': { type: 'convention', note: '1%-of-value rule; condominium fees can be significant, add them here or in Other.' },
      'housing.insurance': { type: 'convention', note: 'Home insurance is optional unless required by the mortgage.' },
      'housing.closingCostRate': { type: 'convention', note: 'Prima casa: 2% registration tax on cadastral value + notary + agency. ~4% of price.' },
      'housing.mortgage.rate': {
        type: 'official', year: 2025, source: 'OMI-ABI 2026: average initial mortgage rate 3.35%',
        url: 'https://iusletter.com/dalla-redazione/processo-esecuzione-mediazione/real-estate/mercato-residenziale-la-fotografia-di-omi-e-abi/',
      },
      'kids.annualCost': {
        type: 'derived', year: 2025, source: 'Derived from ISTAT spending and ISTAT’s equivalence scale (3 people = 1.33)', url: ISTAT_SPESE,
        derivation: `Two-adult core spending × 0.33 = ${core} × 0.33.`,
        note: 'Many Italian young adults live with parents well past 18. Raise "independent at age" to reflect that.',
      },
      'kids.educationCost': {
        type: 'reputable', year: 2024, source: 'UDU research on MUR data: average fees at state universities €900–1,000/yr',
        url: 'https://www.orizzontescuola.it/lunione-degli-universitari-denuncia-troppi-atenei-fuorilegge-sulle-tasse/',
        derivation: '€1,000 × 5 years (laurea + magistrale).', note: 'Fees depend on family ISEE; living away from home costs far more than fees.',
      },
      'pension.annual': {
        type: 'derived', year: 2026,
        source: 'INPS average new pension (H1 2026) adjusted by Ragioneria Generale dello Stato replacement-rate projections',
        url: 'https://www.orizzontescuola.it/il-primato-dellitalia-nellarea-ocse-con-il-155-della-ricchezza-destinata-alla-previdenza-spendiamo-quasi-il-doppio-della-media/',
        derivation: `Average new pension €1,264/month × (58.5% ÷ 71.9%), the RGS-projected fall in the pension-to-final-salary ratio for an employee with 38 years of contributions between 2030 and 2070 = €${Math.round(futureMonthly)}/month. × 13 payments × 2 adults = €${Math.round(pensionGross).toLocaleString('en')} gross, less ~12% IRPEF.`,
        note: 'Lowered for today’s young workers, who are fully under the contributory system. Self-employed workers face a steeper fall. Replace with your own INPS estimate (La mia pensione futura) for accuracy.',
      },
      'pension.startAge': {
        type: 'derived', year: 2026, source: 'Ragioneria Generale dello Stato, Rapporto n. 26: retirement age projected to reach 70 around 2060',
        url: 'https://lespresso.it/c/opinioni/2026/2/5/calo-spesa-pensioni-numeri-crisi-demografica/59520',
        note: 'The old-age pension age is 67 today, 67y1m in 2027 and 67y3m in 2028, then linked to life expectancy. Someone aged 30 now reaches it around 2063, so 70 is used. Lower it if you are closer to retirement.',
      },
      lifeExpectancy: {
        type: 'derived', year: 2024, source: 'ISTAT: life expectancy at birth 83.4 years (2024)',
        url: 'https://www.fortuneita.com/?p=369482',
        derivation: 'Planning to 90 covers longevity risk beyond the average.',
      },
      'longTermCare.annual': {
        type: 'reputable', year: 2025, source: 'Patto per un Nuovo Welfare sulla Non Autosufficienza: family share of RSA fees €1,500–2,000/month',
        url: 'https://www.disabili.com/anziani/rette-rsa-tra-vuoti-normativi-e-caos-giudiziario/',
        derivation: '€1,750 × 12, one person, ages 85–90.', note: 'Lombardy averages are higher (~€2,500/month in Varese).',
      },
      nominalReturn: {
        type: 'reputable', year: 2025, source: 'UBS Global Investment Returns Yearbook 2026 (Dimson, Marsh, Staunton)',
        url: 'https://www.ubs.com/global/en/media/display-page-ndp/en-20260303-global-investment-returns-yearbook-2026.html',
        derivation: 'Global equities ~6.6%/yr real since 1900. Default 7% nominal with 2% inflation is a conservative global-portfolio assumption.',
      },
      inflation: { type: 'official', source: 'European Central Bank inflation target (2%)', url: 'https://www.ecb.europa.eu/' },
      fee: {
        type: 'derived', source: 'Imposta di bollo 0.2%/yr on securities accounts + ~0.25% fund costs',
        url: 'https://fiscoinvestimenti.it/?p=3837', derivation: '0.20% stamp duty + 0.25% ETF/broker costs.',
      },
      withdrawalRate: { type: 'convention', note: 'International research finds Italy historically among the weaker markets for the 4% rule; 3.5% is used, consider 3%.' },
      taxRate: {
        type: 'derived', year: 2026, source: 'Italian tax on financial income: 26% (12.5% on government bonds)',
        url: 'https://fiscoinvestimenti.it/?p=14825',
        derivation: '26% applies only to the gain portion of each withdrawal; assuming about half of late-stage withdrawals are gains → ~13%.',
      },
      buffer: { type: 'convention', derivation: 'Six months of core + medical + utilities + rent.' },
      currentAge: { type: 'personal', note: 'Example only. Replace with your own number.' }, currentInvestments: { type: 'personal', note: 'Example only. Replace with your own number.' },
      annualSavings: { type: 'personal', note: 'Example only. Replace with your own number.' }, netIncome: { type: 'personal', note: 'Example only: roughly today’s average costs plus the example savings. Replace with your own.' },
    },
  };
}

const out = {
  schemaVersion: 1,
  generated: '2026-10-25',
  disclaimer: 'Defaults are national averages for a two-adult household, for illustration only. Not financial advice.',
  countries: { CA: canada(), IT: italy() },
};

const json = JSON.stringify(out, null, 2);
fs.writeFileSync(path.join(__dirname, 'countries.json'), json + '\n');
// Same data as a script, so index.html works when opened directly from disk (no fetch needed).
fs.writeFileSync(path.join(__dirname, 'countries.js'),
  '// Generated by data/build-countries.js. Do not edit by hand.\nwindow.FI_COUNTRIES = ' + json + ';\n');
console.log('Wrote data/countries.json and data/countries.js');
for (const [code, c] of Object.entries(out.countries)) {
  const p = c.params;
  console.log(code, { core: p.coreSpend, medical: p.medical, other: p.otherAnnual, rent: p.housing.rent,
    home: p.housing.homePrice, kid: c.kidTemplate.annualCost, edu: c.kidTemplate.educationCost,
    pension: p.pension.annual, ltc: p.longTermCare.annual, buffer: p.buffer });
}
