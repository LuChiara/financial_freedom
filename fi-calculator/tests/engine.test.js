// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const close = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

// A minimal person: rents, no kids, no pension, no tax. Easy to check by hand.
function base(overrides = {}) {
  return Object.assign({
    currentAge: 30, lifeExpectancy: 90,
    currentInvestments: 0, annualSavings: 0,
    nominalReturn: 0.07, inflation: 0.025, fee: 0,
    withdrawalRate: 0.04, method: 'swr', taxRate: 0,
    coreSpend: 40000, medical: 2000, otherAnnual: 0, buffer: 0,
    housing: { mode: 'rent', rent: 18000 },
    kids: [], pension: { annual: 0, startAge: 65 }, longTermCare: { annual: 0 },
  }, overrides);
}

test('real return: (1.07 − fee) / 1.025 − 1', () => {
  close(E.realReturn(0.07, 0.025, 0), 1.07 / 1.025 - 1);
  close(E.realReturn(0.07, 0.025, 0.01), 1.06 / 1.025 - 1);
});

test('pvStream matches an explicit annuity-due sum, and handles r = 0', () => {
  const r = 0.04;
  let sum = 0;
  for (let t = 3; t < 3 + 10; t++) sum += 1000 / Math.pow(1 + r, t);
  close(E.pvStream(1000, 10, r, 3), sum);
  close(E.pvStream(1000, 10, 0), 10000);
});

test('mortgage: 100k at 6% over 30y = 599.55/month; balance 100k at start, 0 at end', () => {
  close(E.mortgagePayment(100000, 0.06, 30), 599.55, 1e-5);
  close(E.mortgageBalance(100000, 0.06, 30, 0), 100000);
  close(E.mortgageBalance(100000, 0.06, 30, 360), 0);
});

test('basic target: (40k + 2k + 18k rent) / 4% = 1,500,000', () => {
  close(E.target(base(), 50).total, 1500000);
});

test('tax gross-up: 1.5M / (1 − 20%) = 1,875,000', () => {
  close(E.target(base({ taxRate: 0.2 }), 50).total, 1875000);
});

test('pension reduces living need; bridge covers the years before it starts', () => {
  const p = base({ pension: { annual: 12000, startAge: 65 } });
  const t = E.target(p, 55);
  const r = t.realReturn;
  close(t.components.living, (60000 - 12000) / 0.04);
  close(t.components.pensionBridge, E.pvStream(12000, 10, r));
  // FI after pension start → no bridge
  assert.equal(E.target(p, 70).components.pensionBridge, 0);
});

test('kids: a 10-year-old, FI in 5 years → 3 remaining years funded', () => {
  const p = base({ kids: [{ age: 10, annualCost: 10000, independentAge: 18, educationCost: 0 }] });
  const t = E.target(p, 35);
  close(t.components.kids, E.pvStream(10000, 3, t.realReturn));
});

test('kids: planned child (age −2), FI now → 18 years starting in 2 years, education at 18', () => {
  const p = base({ kids: [{ age: -2, annualCost: 10000, independentAge: 18, educationCost: 50000, educationAge: 18 }] });
  const t = E.target(p, 30);
  const r = t.realReturn;
  close(t.components.kids, E.pvStream(10000, 18, r, 2));
  close(t.components.education, 50000 / Math.pow(1 + r, 20));
});

test('kids already independent at FI cost nothing', () => {
  const p = base({ kids: [{ age: 15, annualCost: 10000, independentAge: 18, educationCost: 30000, educationAge: 18 }] });
  const t = E.target(p, 40);
  assert.equal(t.components.kids, 0);
  assert.equal(t.components.education, 0);
});

test('buy mode: lump = price × (1 + closing), running = carrying costs', () => {
  const p = base({ housing: { mode: 'buy', rent: 18000, homePrice: 500000, closingCostRate: 0.04,
    propertyTaxRate: 0.006, maintenanceRate: 0.01, insurance: 1000 } });
  const t = E.target(p, 50);
  close(t.components.housingLump, 520000);
  close(t.needBreakdown.housing, 500000 * 0.016 + 1000);
  close(E.currentOutflow(p).parts.housing, 18000); // still renting today
});

test('mortgage mode: lump is the real remaining balance at FI', () => {
  const p = base({ housing: { mode: 'mortgage', homePrice: 500000,
    mortgage: { principal: 400000, rate: 0.05, termYears: 25, yearsElapsed: 0 } } });
  const t = E.target(p, 40);
  const nominal = E.mortgageBalance(400000, 0.05, 25, 120);
  close(t.components.housingLump, nominal / Math.pow(1.025, 10));
  assert.equal(E.target(p, 56).components.housingLump, 0); // paid off by then
});

test('annuity (spend-down) needs less than perpetual SWR', () => {
  const swr = E.target(base(), 60).total;
  const ann = E.target(base({ method: 'annuity' }), 60).total;
  assert.ok(ann < swr);
  close(ann, E.pvStream(60000, 30, E.realReturn(0.07, 0.025, 0)));
});

test('required savings round-trips: saving that amount hits the target exactly', () => {
  const p = E.exampleParams();
  const s = E.requiredSavings(p, 50);
  const q = Object.assign({}, p, { annualSavings: s.annual });
  close(E.wealthAt(q, 20), s.target.total, 1e-9);
});

test('generic solver agrees with the closed-form savings', () => {
  const p = E.exampleParams();
  const closed = E.requiredSavings(p, 50).annual;
  const solved = E.solve(p, 'annualSavings', 50);
  assert.ok(solved.solved);
  close(solved.value, closed, 1e-6);
});

test('solver on spending, kid cost, home price and return lands exactly on zero gap', () => {
  const p = E.exampleParams();          // earliest FI is 58, so at 60 every variable has headroom
  for (const key of ['coreSpend', 'homePrice', 'nominalReturn']) {
    const s = E.solve(p, key, 60);
    assert.ok(s.solved, key + ': ' + s.reason);
    const q = E.setPath(JSON.parse(JSON.stringify(p)), E.REVERSIBLE[key].path, s.value);
    assert.ok(Math.abs(E.gapAt(q, 60)) < 1, key);
  }
});

test('income mode: kids cost money before FI too, so they change the answer even if adults by FI', () => {
  const p = Object.assign(E.exampleParams(), { savingsMode: 'income' });
  const s = E.solve(p, 'kidAnnualCost', 60);
  assert.ok(s.solved, s.reason);
  const q = E.setPath(JSON.parse(JSON.stringify(p)), 'kids.*.annualCost', s.value);
  assert.ok(Math.abs(E.gapAt(q, 60)) < 1);
});

test('income mode: outflow follows life events', () => {
  const p = E.exampleParams();
  const renter = Object.assign(E.exampleParams(), { housing: { mode: 'rent', rent: 20000 } });
  // year 2: second child is born → spending rises by exactly one child's cost (renter isolates kids)
  close(E.outflowAt(renter, 2) - E.outflowAt(renter, 1), 12000);
  // with a mortgage, the fixed payment shrinks in real terms each year, partly offsetting it
  assert.ok(E.outflowAt(p, 2) - E.outflowAt(p, 1) < 12000);
  // year 16: first child turns 18 → education lump, living cost stops
  const y16 = E.outflowAt(p, 16), y15 = E.outflowAt(p, 15);
  assert.ok(y16 > y15);
  // after the mortgage ends (23 years from now) housing drops to carrying costs
  assert.ok(E.outflowAt(p, 24) < E.outflowAt(p, 22));
});

test('income mode: required net income reaches the target exactly', () => {
  const p = Object.assign(E.exampleParams(), { savingsMode: 'income' });
  const inc = E.requiredNetIncome(p, 55);
  const q = Object.assign({}, p, { netIncome: inc.annual });
  assert.ok(Math.abs(E.gapAt(q, 55)) < 1);
});

test('fixed mode: a planned child reduces savings by exactly its compounded costs', () => {
  const p = base({ currentInvestments: 10000, annualSavings: 20000, kids: [] });
  const kid = { age: -1, annualCost: 8000, independentAge: 18, educationCost: 30000, educationAge: 18 };
  const q = Object.assign({}, p, { kids: [kid] });
  const r = E.realReturn(0.07, 0.025, 0);
  const n = 25;
  let drag = 0;
  for (let t = 0; t < n; t++) {
    const age = -1 + t;
    const c = (age >= 0 && age < 18 ? 8000 : 0) + (age === 18 ? 30000 : 0);
    drag += c * Math.pow(1 + r, n - 1 - t);
  }
  close(E.wealthAt(p, n) - E.wealthAt(q, n), drag, 1e-9);
});

test('fixed mode: a child you already have does not change savings', () => {
  const p = base({ annualSavings: 20000 });
  const q = base({ annualSavings: 20000, kids: [{ age: 5, annualCost: 8000, independentAge: 18 }] });
  close(E.wealthAt(p, 20), E.wealthAt(q, 20));
});

test('required savings round-trips with planned children', () => {
  const p = base({ currentInvestments: 5000, kids: [{ age: -2, annualCost: 9000, independentAge: 18, educationCost: 30000 }] });
  const s = E.requiredSavings(p, 55);
  const q = Object.assign({}, p, { annualSavings: s.annual });
  close(E.wealthAt(q, 25), s.target.total, 1e-9);
});

test('solver reports when a goal is unreachable instead of returning a wrong number', () => {
  const p = E.exampleParams();          // at 40 even free kids can't close the gap
  const s = E.solve(p, 'kidAnnualCost', 40);
  assert.equal(s.solved, false);
  assert.equal(s.value, null);
});

test('earliestFI is the first age where wealth ≥ target', () => {
  const p = E.exampleParams();
  const e = E.earliestFI(p);
  assert.ok(e);
  assert.ok(E.gapAt(p, e.fiAge) >= 0);
  assert.ok(E.gapAt(p, e.fiAge - 1) < 0);
});

test('maxKids stops before the gap turns negative', () => {
  const p = base({ currentInvestments: 2e6 });
  const tpl = { age: -1, annualCost: 15000, independentAge: 18, educationCost: 40000 };
  const k = E.maxKids(p, 30, tpl);
  const q = Object.assign({}, p, { kids: Array(k).fill(tpl) });
  assert.ok(E.gapAt(q, 30) >= 0);
  const q2 = Object.assign({}, p, { kids: Array(k + 1).fill(tpl) });
  assert.ok(E.gapAt(q2, 30) < 0);
});

test('validation rejects impossible inputs', () => {
  assert.throws(() => E.target(base({ withdrawalRate: 0 }), 50));
  assert.throws(() => E.target(base({ taxRate: 1 }), 50));
  assert.throws(() => E.target(base(), 95));
});
