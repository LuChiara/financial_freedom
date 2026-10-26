// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const data = require('../data/countries.json');

const TYPES = ['official', 'derived', 'reputable', 'convention', 'personal'];
const NEEDS_SOURCE = ['coreSpend', 'medical', 'housing.rent', 'housing.homePrice', 'kids.annualCost',
  'kids.educationCost', 'pension.annual', 'lifeExpectancy', 'longTermCare.annual', 'nominalReturn', 'taxRate'];

for (const [code, c] of Object.entries(data.countries)) {
  test(`${code}: defaults load into the engine without errors`, () => {
    assert.deepEqual(E.validate(c.params, 50), []);
    const t = E.target(c.params, 50);
    assert.ok(t.total > 0 && Number.isFinite(t.total));
  });

  test(`${code}: every key default has a typed, cited source`, () => {
    for (const [key, s] of Object.entries(c.sources)) assert.ok(TYPES.includes(s.type), `${key} type`);
    for (const key of NEEDS_SOURCE) {
      const s = c.sources[key];
      assert.ok(s, `${key} missing`);
      assert.ok(s.source && s.url, `${key} needs source + url`);
      assert.ok(s.year >= 2023, `${key} data older than 2023`);
    }
  });

  test(`${code}: every sourced path exists in params or kidTemplate`, () => {
    for (const key of Object.keys(c.sources)) {
      const v = key.startsWith('kids.')
        ? E.getPath(c.kidTemplate, key.slice(5))
        : E.getPath(c.params, key);
      assert.notEqual(v, undefined, key);
    }
  });

  test(`${code}: kid template works with every reverse solve`, () => {
    const p = JSON.parse(JSON.stringify(c.params));
    p.kids = [Object.assign({}, c.kidTemplate)];
    p.annualSavings = 40000;
    for (const key of Object.keys(E.REVERSIBLE)) E.solve(p, key, 55); // must not throw
  });
}
