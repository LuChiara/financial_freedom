/*!
 * FI Engine — "How much do I need to be financially free?"
 *
 * Pure calculation core: no DOM, no country data, no side effects.
 * Works in the browser (window.FIEngine) and in Node (require('./engine')).
 *
 * CONVENTIONS
 *  - All money is in TODAY'S currency (real terms). Inflation only enters via the real return.
 *  - Amounts are annual unless the name says otherwise.
 *  - After FI, spending is withdrawn at the START of each year (annuity-due).
 *  - Before FI, savings are contributed at the END of each year.
 *  - Pension amounts are NET (after tax). taxRate (τ) is the effective tax on portfolio withdrawals,
 *    and every component of the target is grossed up by 1 / (1 − τ).
 *
 * THE FORMULA
 *  FI_target = [ Living + Bridge + Kids + Education + LongTermCare + HousingLump + Buffer ] / (1 − τ)
 *    Living       = (S + M + Other + H_run − P) / w           (method "swr", perpetual)
 *                 = PV of (S + M + Other + H_run − P) over remaining life  (method "annuity", spend-down)
 *    Bridge       = PV of P from FI age until pension start age
 *    Kids         = Σ PV of each child's remaining dependent-year costs
 *    Education    = Σ PV of each child's post-secondary lump sum
 *    LongTermCare = PV of late-life care costs
 *    HousingLump  = remaining mortgage (real) or purchase price + closing costs
 *  Path: W_n = W_0·(1+r)^n + PMT·((1+r)^n − 1)/r ; you are free when W_n ≥ FI_target(n)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FIEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;

  // ───────────────────────────── financial primitives ─────────────────────────────

  /** Real return net of fees: (1 + nominal − fee) / (1 + inflation) − 1 */
  function realReturn(nominal, inflation, fee) {
    return (1 + nominal - (fee || 0)) / (1 + inflation) - 1;
  }

  function discount(r, t) {
    return Math.pow(1 + r, -t);
  }

  /**
   * Present value of `amount` paid at the start of each year for `years` years,
   * with the first payment `delay` years from now.
   */
  function pvStream(amount, years, r, delay) {
    delay = delay || 0;
    if (!(years > 0) || amount === 0) return 0;
    const pv = Math.abs(r) < EPS
      ? amount * years
      : amount * (1 - Math.pow(1 + r, -years)) / r * (1 + r);
    return pv * discount(r, delay);
  }

  /** Future value of starting wealth w0 plus end-of-year contributions pmt, after n years. */
  function fvSavings(w0, pmt, r, n) {
    if (Math.abs(r) < EPS) return w0 + pmt * n;
    const g = Math.pow(1 + r, n);
    return w0 * g + pmt * (g - 1) / r;
  }

  /** Monthly payment on a fixed-rate amortizing mortgage. */
  function mortgagePayment(principal, annualRate, termYears) {
    const n = termYears * 12;
    const i = annualRate / 12;
    if (n <= 0) return 0;
    if (Math.abs(i) < EPS) return principal / n;
    return principal * i / (1 - Math.pow(1 + i, -n));
  }

  /** Outstanding (nominal) balance after `monthsElapsed` payments. */
  function mortgageBalance(principal, annualRate, termYears, monthsElapsed) {
    const n = termYears * 12;
    const i = annualRate / 12;
    const k = Math.min(Math.max(monthsElapsed, 0), n);
    if (k >= n) return 0;
    const pay = mortgagePayment(principal, annualRate, termYears);
    if (Math.abs(i) < EPS) return Math.max(0, principal - pay * k);
    const g = Math.pow(1 + i, k);
    return Math.max(0, principal * g - pay * (g - 1) / i);
  }

  // ───────────────────────────── components ─────────────────────────────

  /** Annual cost of owning: property tax + maintenance (as % of value) + insurance. */
  function carryingCost(h) {
    return (h.homePrice || 0) * ((h.propertyTaxRate || 0) + (h.maintenanceRate || 0)) + (h.insurance || 0);
  }

  /**
   * Housing modes:
   *  "rent"     rent forever                      → running = rent
   *  "own"      owned outright                    → running = carrying cost
   *  "mortgage" owned, mortgage being paid        → running = carrying cost, lump = balance left at FI
   *  "buy"      renting now, buy outright at FI   → running = carrying cost, lump = price + closing costs
   *  "none"     housing excluded (e.g. living with family)
   * Returns { running, lump, current } where current = what housing costs you per year today.
   */
  function housing(p, n) {
    const h = p.housing || { mode: 'none' };
    const carry = carryingCost(h);
    switch (h.mode) {
      case 'rent':
        return { running: h.rent || 0, lump: 0, current: h.rent || 0 };
      case 'own':
        return { running: carry, lump: 0, current: carry };
      case 'mortgage': {
        const m = h.mortgage || {};
        const principal = m.principal || 0;
        const rate = m.rate || 0;
        const term = m.termYears || 0;
        const elapsedNow = (m.yearsElapsed || 0) * 12;
        const payment = mortgagePayment(principal, rate, term);
        const nominalAtFI = mortgageBalance(principal, rate, term, Math.round(elapsedNow + n * 12));
        const realAtFI = nominalAtFI / Math.pow(1 + (p.inflation || 0), Math.max(n, 0));
        const stillPaying = mortgageBalance(principal, rate, term, elapsedNow) > 0;
        return {
          running: carry,
          lump: realAtFI,
          current: carry + (stillPaying ? payment * 12 : 0),
          monthlyPayment: payment,
        };
      }
      case 'buy':
        return {
          running: carry,
          lump: (h.homePrice || 0) * (1 + (h.closingCostRate || 0)),
          current: h.rent || 0,
        };
      default:
        return { running: 0, lump: 0, current: 0 };
    }
  }

  /**
   * Kids. Each child: { age, annualCost, independentAge, educationCost, educationAge }.
   * A negative age means the child is planned (age −2 = born in 2 years).
   * Costs incurred before FI are assumed paid from income; only costs from the FI date on are funded.
   */
  function kids(p, n, r) {
    let living = 0;
    let education = 0;
    let current = 0;
    (p.kids || []).forEach(function (k) {
      const indep = k.independentAge != null ? k.independentAge : 18;
      const eduAge = k.educationAge != null ? k.educationAge : indep;
      const ageAtFI = k.age + n;
      const start = Math.max(0, ageAtFI);
      living += pvStream(k.annualCost || 0, indep - start, r, start - ageAtFI);
      if (eduAge >= ageAtFI) education += (k.educationCost || 0) * discount(r, eduAge - ageAtFI);
      if (k.age >= 0 && k.age < indep) current += k.annualCost || 0;
    });
    return { living: living, education: education, current: current };
  }

  // ───────────────────────────── validation ─────────────────────────────

  function validate(p, fiAge) {
    const errors = [];
    if (!(p.lifeExpectancy > p.currentAge)) errors.push('Life expectancy must be greater than current age.');
    if (fiAge != null && fiAge < p.currentAge) errors.push('FI age cannot be earlier than current age.');
    if (fiAge != null && fiAge >= p.lifeExpectancy) errors.push('FI age must be before life expectancy.');
    if (p.method !== 'annuity' && !(p.withdrawalRate > 0)) errors.push('Withdrawal rate must be above 0.');
    if (!(p.taxRate >= 0 && p.taxRate < 1)) errors.push('Tax rate must be between 0% and 100%.');
    if (!(1 + p.inflation > 0)) errors.push('Inflation must be above −100%.');
    return errors;
  }

  // ───────────────────────────── the formula ─────────────────────────────

  /** FI target (in today's money) if you stop working at `fiAge`, with a full breakdown. */
  function target(p, fiAge) {
    const errors = validate(p, fiAge);
    if (errors.length) throw new Error(errors.join(' '));

    const n = fiAge - p.currentAge;
    const r = realReturn(p.nominalReturn, p.inflation, p.fee);
    const grossUp = 1 / (1 - (p.taxRate || 0));
    const yearsInRetirement = p.lifeExpectancy - fiAge;

    const h = housing(p, n);
    const need = {
      core: p.coreSpend || 0,
      medical: p.medical || 0,
      other: p.otherAnnual || 0,
      housing: h.running,
    };
    const annualNeed = need.core + need.medical + need.other + need.housing;

    const pen = p.pension || {};
    const pension = Math.min(pen.annual || 0, annualNeed);
    const pensionStart = pen.startAge != null ? pen.startAge : p.lifeExpectancy;
    const bridgeYears = Math.max(0, Math.min(pensionStart, p.lifeExpectancy) - fiAge);

    const living = p.method === 'annuity'
      ? pvStream(annualNeed - pension, yearsInRetirement, r)
      : (annualNeed - pension) / p.withdrawalRate;
    const bridge = pvStream(pension, bridgeYears, r);

    const ltc = p.longTermCare || {};
    const ltcStart = Math.max(ltc.startAge || p.lifeExpectancy, fiAge);
    const longTermCare = pvStream(ltc.annual || 0, p.lifeExpectancy - ltcStart, r, ltcStart - fiAge);

    const k = kids(p, n, r);

    const net = {
      living: living,
      pensionBridge: bridge,
      kids: k.living,
      education: k.education,
      longTermCare: longTermCare,
      housingLump: h.lump,
      buffer: p.buffer || 0,
    };
    const components = {};
    let total = 0;
    Object.keys(net).forEach(function (key) {
      components[key] = net[key] * grossUp;
      total += components[key];
    });

    return {
      fiAge: fiAge,
      yearsToFI: n,
      yearsInRetirement: yearsInRetirement,
      realReturn: r,
      annualNeed: annualNeed,
      needBreakdown: need,
      pensionUsed: pension,
      bridgeYears: bridgeYears,
      components: components,
      total: total,
    };
  }

  /**
   * Spending in year t from now (today's money), used in income mode.
   * Kids cost while 0 ≤ age < independentAge, education is paid in the year it falls due,
   * the mortgage payment shrinks in real terms and stops once paid off, and "buy" keeps renting until FI.
   */
  function outflowAt(p, t) {
    const h = p.housing || { mode: 'none' };
    let housingCost = 0;
    switch (h.mode) {
      case 'rent': housingCost = h.rent || 0; break;
      case 'buy': housingCost = h.rent || 0; break;
      case 'own': housingCost = carryingCost(h); break;
      case 'mortgage': {
        const m = h.mortgage || {};
        const months = ((m.yearsElapsed || 0) + t) * 12;
        const paying = mortgageBalance(m.principal || 0, m.rate || 0, m.termYears || 0, months) > 0;
        const pay = mortgagePayment(m.principal || 0, m.rate || 0, m.termYears || 0) * 12;
        housingCost = carryingCost(h) + (paying ? pay / Math.pow(1 + (p.inflation || 0), t) : 0);
        break;
      }
      default: housingCost = 0;
    }
    let kidCost = 0;
    (p.kids || []).forEach(function (k) {
      const indep = k.independentAge != null ? k.independentAge : 18;
      const eduAge = k.educationAge != null ? k.educationAge : indep;
      const age = k.age + t;
      if (age >= 0 && age < indep) kidCost += k.annualCost || 0;
      if (Math.round(age) === Math.round(eduAge)) kidCost += k.educationCost || 0;
    });
    return (p.coreSpend || 0) + (p.medical || 0) + (p.otherAnnual || 0) + housingCost + kidCost;
  }

  /**
   * Costs in year t of children not yet born today (age < 0), including their education lump.
   * Children you already have are part of today's budget; planned ones are not.
   */
  function plannedKidCostAt(p, t) {
    let cost = 0;
    (p.kids || []).forEach(function (k) {
      if (!(k.age < 0)) return;
      const indep = k.independentAge != null ? k.independentAge : 18;
      const eduAge = k.educationAge != null ? k.educationAge : indep;
      const age = k.age + t;
      if (age >= 0 && age < indep) cost += k.annualCost || 0;
      if (Math.round(age) === Math.round(eduAge)) cost += k.educationCost || 0;
    });
    return cost;
  }

  /**
   * Savings in year t.
   *  fixed:  the set amount, minus the costs of planned children while they're at home
   *  income: net income minus that year's total spending
   */
  function savingsAt(p, t) {
    return p.savingsMode === 'income'
      ? (p.netIncome || 0) - outflowAt(p, t)
      : (p.annualSavings || 0) - plannedKidCostAt(p, t);
  }

  function hasPlannedKids(p) {
    return (p.kids || []).some(function (k) { return k.age < 0; });
  }

  /** Projected investments after n years. */
  function wealthAt(p, n) {
    const r = realReturn(p.nominalReturn, p.inflation, p.fee);
    if (p.savingsMode !== 'income' && !hasPlannedKids(p)) return fvSavings(p.currentInvestments || 0, p.annualSavings || 0, r, n);
    let w = p.currentInvestments || 0;
    for (let t = 0; t < n; t++) w = w * (1 + r) + savingsAt(p, t);
    return w;
  }

  /** Projected wealth minus target at a given FI age (≥ 0 means you are free). */
  function gapAt(p, fiAge) {
    return wealthAt(p, fiAge - p.currentAge) - target(p, fiAge).total;
  }

  /** Year-by-year projection of wealth vs the target if you stopped that year. */
  function projection(p) {
    const rows = [];
    for (let n = 0; p.currentAge + n < p.lifeExpectancy; n++) {
      const age = p.currentAge + n;
      rows.push({ age: age, wealth: wealthAt(p, n), target: target(p, age).total });
    }
    return rows;
  }

  /** Earliest whole-year age at which projected wealth covers the target, or null. */
  function earliestFI(p) {
    for (let n = 0; p.currentAge + n < p.lifeExpectancy; n++) {
      const age = p.currentAge + n;
      const t = target(p, age);
      const w = wealthAt(p, n);
      if (w >= t.total) return { fiAge: age, years: n, wealth: w, target: t };
    }
    return null;
  }

  // ───────────────────────────── reverse calculations ─────────────────────────────

  /** Annual savings needed to be free at `fiAge` (closed form, fixed-savings mode). */
  function requiredSavings(p, fiAge) {
    if (p.savingsMode === 'income') p = Object.assign({}, p, { savingsMode: 'fixed' });
    const n = fiAge - p.currentAge;
    const t = target(p, fiAge);
    const r = t.realReturn;
    const w0 = p.currentInvestments || 0;
    if (n <= 0) {
      const shortfall = Math.max(0, t.total - w0);
      return { annual: null, monthly: null, lumpShortfall: shortfall, target: t };
    }
    const g = Math.pow(1 + r, n);
    // Planned children's costs come out of savings; add back what they'd have grown to.
    let kidDrag = 0;
    for (let i = 0; i < n; i++) kidDrag += plannedKidCostAt(p, i) * Math.pow(1 + r, n - 1 - i);
    const pmt = Math.abs(r) < EPS ? (t.total - w0 + kidDrag) / n : (t.total - w0 * g + kidDrag) * r / (g - 1);
    const annual = Math.max(0, pmt);
    return { annual: annual, monthly: annual / 12, lumpShortfall: 0, target: t };
  }

  /** What life costs you today: core + medical + other + current housing + kids now. */
  function currentOutflow(p) {
    const r = realReturn(p.nominalReturn, p.inflation, p.fee);
    const h = housing(p, 0);
    const k = kids(p, 0, r);
    const parts = {
      core: p.coreSpend || 0,
      medical: p.medical || 0,
      other: p.otherAnnual || 0,
      housing: h.current,
      kids: k.current,
    };
    let total = 0;
    Object.keys(parts).forEach(function (key) { total += parts[key]; });
    return { parts: parts, total: total };
  }

  /**
   * Net (after-tax) income needed to be free at fiAge.
   * Fixed mode: today's spending + required savings.
   * Income mode: solved so that year-by-year (income − spending) exactly reaches the target.
   */
  function requiredNetIncome(p, fiAge) {
    const out = currentOutflow(p);
    if (p.savingsMode === 'income') {
      const s = solve(p, 'netIncome', fiAge);
      if (!s.solved) return { annual: null, monthly: null, spending: out.total, savings: null, reason: s.reason };
      return { annual: s.value, monthly: s.value / 12, spending: out.total, savings: s.value - out.total };
    }
    const s = requiredSavings(p, fiAge);
    if (s.annual == null) return { annual: null, monthly: null, spending: out.total, savings: null };
    const annual = out.total + s.annual;
    return { annual: annual, monthly: annual / 12, spending: out.total, savings: s.annual };
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /** Set a dotted path on an object; "*" applies to every element of an array. */
  function setPath(obj, path, value) {
    const keys = path.split('.');
    (function walk(node, i) {
      if (node == null) return;
      const key = keys[i];
      if (key === '*') {
        if (Array.isArray(node)) node.forEach(function (child) { walk(child, i + 1); });
        return;
      }
      if (i === keys.length - 1) { node[key] = value; return; }
      if (node[key] == null) node[key] = {};
      walk(node[key], i + 1);
    })(obj, 0);
    return obj;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (node, key) {
      if (node == null) return undefined;
      if (key === '*') return Array.isArray(node) && node.length ? node[0] : undefined;
      return node[key];
    }, obj);
  }

  /** Variables the UI can solve for, with sensible search bounds. */
  const REVERSIBLE = {
    annualSavings: { label: 'Household savings per year', path: 'annualSavings', lo: 0, hi: 1e8 },
    netIncome: { label: 'Household take-home pay', path: 'netIncome', lo: 0, hi: 1e8 },
    coreSpend: { label: 'Living costs per year', path: 'coreSpend', lo: 0, hi: 1e8 },
    medical: { label: 'Medical (out-of-pocket) per year', path: 'medical', lo: 0, hi: 1e7 },
    otherAnnual: { label: 'Other annual costs', path: 'otherAnnual', lo: 0, hi: 1e8 },
    currentInvestments: { label: 'Invested today', path: 'currentInvestments', lo: 0, hi: 1e10 },
    nominalReturn: { label: 'Stock market return', path: 'nominalReturn', lo: -0.05, hi: 0.3 },
    withdrawalRate: { label: 'Withdrawal rate', path: 'withdrawalRate', lo: 0.005, hi: 0.2 },
    homePrice: { label: 'Home price', path: 'housing.homePrice', lo: 0, hi: 1e9 },
    rent: { label: 'Rent per year', path: 'housing.rent', lo: 0, hi: 1e7 },
    kidAnnualCost: { label: 'Annual cost per child', path: 'kids.*.annualCost', lo: 0, hi: 1e7 },
    pension: { label: 'Pension per year, after tax', path: 'pension.annual', lo: 0, hi: 1e7 },
  };

  /**
   * Solve for the value of one variable that makes you exactly free at `fiAge`
   * (projected wealth = target). Uses bisection; works for any variable in REVERSIBLE
   * or any dotted path with explicit bounds.
   */
  function solve(p, key, fiAge, opts) {
    opts = opts || {};
    const spec = REVERSIBLE[key] || { label: key, path: key };
    const lo0 = opts.lo != null ? opts.lo : spec.lo;
    const hi0 = opts.hi != null ? opts.hi : spec.hi;
    if (lo0 == null || hi0 == null) throw new Error('Bounds required for "' + key + '".');

    const f = function (x) { return gapAt(setPath(clone(p), spec.path, x), fiAge); };
    let lo = lo0;
    let hi = hi0;
    let fLo = f(lo);
    const fHi = f(hi);
    if (fLo === 0) return { key: key, label: spec.label, value: lo, solved: true };
    if (fHi === 0) return { key: key, label: spec.label, value: hi, solved: true };
    if ((fLo > 0) === (fHi > 0)) {
      return {
        key: key, label: spec.label, value: null, solved: false,
        reason: fLo > 0
          ? 'Already free at this age across the whole range.'
          : 'Not reachable at this age within the range.',
      };
    }
    for (let i = 0; i < 200 && hi - lo > Math.max(1e-9, Math.abs(hi) * 1e-12); i++) {
      const mid = (lo + hi) / 2;
      const fMid = f(mid);
      if ((fMid > 0) === (fLo > 0)) { lo = mid; fLo = fMid; } else { hi = mid; }
    }
    return { key: key, label: spec.label, value: (lo + hi) / 2, solved: true, current: getPath(p, spec.path) };
  }

  /** Most children (built from `template`) you can add and still be free at `fiAge`. */
  function maxKids(p, fiAge, template, limit) {
    limit = limit || 10;
    let count = 0;
    let q = clone(p);
    q.kids = (q.kids || []).slice();
    if (gapAt(q, fiAge) < 0) return 0;
    while (count < limit) {
      q.kids.push(clone(template));
      if (gapAt(q, fiAge) < 0) break;
      count++;
    }
    return count;
  }

  /** Everything the UI needs in one call. */
  function summarize(p, fiAge) {
    const earliest = earliestFI(p);
    const chosen = fiAge != null ? fiAge : (earliest ? earliest.fiAge : null);
    return {
      earliest: earliest,
      fiAge: chosen,
      target: chosen != null ? target(p, chosen) : null,
      requiredSavings: chosen != null ? requiredSavings(p, chosen) : null,
      requiredNetIncome: chosen != null ? requiredNetIncome(p, chosen) : null,
      currentOutflow: currentOutflow(p),
      projection: projection(p),
    };
  }

  /** Illustrative inputs only — real country defaults live in data/countries.json. */
  function exampleParams() {
    return {
      currentAge: 30,
      lifeExpectancy: 90,
      currentInvestments: 50000,
      savingsMode: 'fixed',     // 'fixed' = annualSavings each year; 'income' = netIncome − that year's spending
      annualSavings: 20000,
      netIncome: 110000,
      nominalReturn: 0.07,
      inflation: 0.025,
      fee: 0.002,
      withdrawalRate: 0.035,
      method: 'swr',
      taxRate: 0.15,
      coreSpend: 30000,
      medical: 1500,
      otherAnnual: 2000,
      buffer: 15000,
      housing: {
        mode: 'mortgage',
        homePrice: 600000,
        propertyTaxRate: 0.007,
        maintenanceRate: 0.01,
        insurance: 1500,
        closingCostRate: 0.03,
        rent: 0,
        mortgage: { principal: 480000, rate: 0.045, termYears: 25, yearsElapsed: 2 },
      },
      kids: [
        { age: 2, annualCost: 12000, independentAge: 18, educationCost: 40000, educationAge: 18 },
        { age: -2, annualCost: 12000, independentAge: 18, educationCost: 40000, educationAge: 18 },
      ],
      pension: { annual: 18000, startAge: 65 },
      longTermCare: { annual: 25000, startAge: 85 },
    };
  }

  return {
    realReturn: realReturn,
    pvStream: pvStream,
    fvSavings: fvSavings,
    mortgagePayment: mortgagePayment,
    mortgageBalance: mortgageBalance,
    housing: housing,
    kids: kids,
    validate: validate,
    target: target,
    wealthAt: wealthAt,
    outflowAt: outflowAt,
    plannedKidCostAt: plannedKidCostAt,
    savingsAt: savingsAt,
    gapAt: gapAt,
    projection: projection,
    earliestFI: earliestFI,
    requiredSavings: requiredSavings,
    currentOutflow: currentOutflow,
    requiredNetIncome: requiredNetIncome,
    solve: solve,
    maxKids: maxKids,
    summarize: summarize,
    setPath: setPath,
    getPath: getPath,
    REVERSIBLE: REVERSIBLE,
    exampleParams: exampleParams,
  };
});
