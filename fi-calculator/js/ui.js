/* UI for the FI calculator. Depends on window.FIEngine (js/engine.js) and
   window.FI_COUNTRIES (data/countries.js). No frameworks, no build step. */
(function () {
  'use strict';

  const E = window.FIEngine;
  const DATA = window.FI_COUNTRIES;
  const STORE_KEY = 'fi-calculator-v1';
  const $ = (sel) => document.querySelector(sel);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const BADGES = {
    official: 'Official data',
    derived: 'Calculated from official data',
    reputable: 'Reputable source',
    convention: 'Rule of thumb',
    personal: 'Your own number',
  };

  const COMPONENTS = {
    living: { label: 'Everyday costs, for life', color: 'var(--wealth)' },
    pensionBridge: { label: 'Bridge until your pension starts', color: '#6f9a8f' },
    kids: { label: 'Kids still living at home', color: '#9a7bb0' },
    education: { label: 'University', color: '#c07a9a' },
    longTermCare: { label: 'Care in late life', color: '#7c8b9c' },
    housingLump: { label: 'Buying the home or paying off the mortgage', color: 'var(--target)' },
    buffer: { label: 'Emergency cash', color: '#a8a28e' },
  };

  // Fields, grouped. `src` points at a key in the country's `sources`.
  const owning = (p) => ['buy', 'mortgage', 'own'].includes(p.housing.mode);
  const GROUPS = [
    {
      id: 'you', title: 'You', open: true, fields: [
        { key: 'currentAge', label: 'Your age', kind: 'int', min: 16, max: 85 },
        { key: 'lifeExpectancy', label: 'Plan until age', kind: 'int', min: 60, max: 110, src: 'lifeExpectancy' },
        { key: 'currentInvestments', label: 'Invested today, both of you', kind: 'money', src: 'currentInvestments' },
        { key: 'savingsMode', label: 'How you save', kind: 'select', options: [['fixed', 'A set amount each year'], ['income', 'Whatever my pay leaves over']] },
        {
          key: 'annualSavings', label: 'Household savings per year', kind: 'money', per: 'yr', show: (p) => p.savingsMode !== 'income', src: 'annualSavings',
          hint: 'What you both put aside today. Planned children reduce this while they live at home.',
        },
        {
          key: 'netIncome', label: 'Household take-home pay per year', kind: 'money', per: 'yr', show: (p) => p.savingsMode === 'income', src: 'netIncome',
          hint: 'Both partners’ pay after tax. Each year you save this minus that year’s costs, so kids, tuition and the mortgage change what you can put away.',
        },
      ],
    },
    {
      id: 'living', title: 'Everyday life', open: true, fields: [
        { key: 'coreSpend', label: 'Living costs', kind: 'money', per: 'yr', src: 'coreSpend', hint: 'Food, transport, clothes, leisure. Not housing, health or kids.' },
        { key: 'medical', label: 'Medical costs you pay yourself', kind: 'money', per: 'yr', src: 'medical' },
        { key: 'otherAnnual', label: 'Utilities and anything else', kind: 'money', per: 'yr', src: 'otherAnnual' },
        { key: 'buffer', label: 'Emergency cash to keep', kind: 'money', src: 'buffer' },
      ],
    },
    {
      id: 'home', title: 'Home', fields: [
        { key: 'housing.mode', label: 'Your plan', kind: 'select', options: [['rent', 'Rent for life'], ['buy', 'Rent now, buy outright when I stop working'], ['mortgage', 'I own it, with a mortgage'], ['own', 'I own it outright'], ['none', 'No housing costs']] },
        { key: 'housing.rent', label: 'Rent', kind: 'money', per: 'yr', show: (p) => ['rent', 'buy'].includes(p.housing.mode), src: 'housing.rent' },
        { key: 'housing.homePrice', label: 'Home value', kind: 'money', show: owning, src: 'housing.homePrice' },
        { key: 'housing.closingCostRate', label: 'Buying costs and taxes', kind: 'pct', show: (p) => p.housing.mode === 'buy', src: 'housing.closingCostRate' },
        { key: 'housing.mortgage.principal', label: 'Mortgage you took out', kind: 'money', show: (p) => p.housing.mode === 'mortgage' },
        { key: 'housing.mortgage.rate', label: 'Mortgage rate', kind: 'pct', show: (p) => p.housing.mode === 'mortgage', src: 'housing.mortgage.rate' },
        { key: 'housing.mortgage.termYears', label: 'Mortgage length', kind: 'int', post: 'years', min: 1, max: 40, show: (p) => p.housing.mode === 'mortgage' },
        { key: 'housing.mortgage.yearsElapsed', label: 'Years already paid', kind: 'int', post: 'years', min: 0, max: 40, show: (p) => p.housing.mode === 'mortgage' },
        { key: 'housing.propertyTaxRate', label: 'Property tax, share of home value', kind: 'pct', post: '% / yr', show: owning, src: 'housing.propertyTaxRate' },
        { key: 'housing.maintenanceRate', label: 'Upkeep, share of home value', kind: 'pct', post: '% / yr', show: owning, src: 'housing.maintenanceRate' },
        { key: 'housing.insurance', label: 'Home insurance', kind: 'money', per: 'yr', show: owning, src: 'housing.insurance' },
      ],
    },
    { id: 'kids', title: 'Kids', custom: true },
    {
      id: 'retire', title: 'Retirement', fields: [
        { key: 'pension.annual', label: 'Public pension after tax, both of you', kind: 'money', per: 'yr', src: 'pension.annual' },
        { key: 'pension.startAge', label: 'Pension starts at age', kind: 'int', min: 55, max: 75, src: 'pension.startAge' },
        { key: 'longTermCare.annual', label: 'Care home or home care', kind: 'money', per: 'yr', src: 'longTermCare.annual' },
        { key: 'longTermCare.startAge', label: 'Care needed from age', kind: 'int', min: 60, max: 110 },
        { key: 'method', label: 'Your money should', kind: 'select', options: [['swr', 'Last forever (live off the returns)'], ['annuity', 'Run out at the end of the plan']] },
        {
          key: 'withdrawalRate', label: 'Withdrawal rate', kind: 'pct', post: '% / yr', show: (p) => p.method !== 'annuity', src: 'withdrawalRate',
          hint: 'The share of your investments you spend each year once you stop. 3.5% of 1,000,000 is 35,000 a year. Lower is safer but needs a bigger pot.',
        },
      ],
    },
    {
      id: 'invest', title: 'Investing', fields: [
        { key: 'nominalReturn', label: 'Stock market return', kind: 'pct', post: '% / yr', src: 'nominalReturn' },
        { key: 'inflation', label: 'Inflation', kind: 'pct', post: '% / yr', src: 'inflation' },
        { key: 'fee', label: 'Fees and account taxes', kind: 'pct', post: '% / yr', src: 'fee' },
        { key: 'taxRate', label: 'Tax on what you withdraw', kind: 'pct', src: 'taxRate' },
      ],
    },
  ];

  const SOLVE_DIRECTION = {
    annualSavings: 'at least', netIncome: 'at least', currentInvestments: 'at least',
    nominalReturn: 'at least', withdrawalRate: 'at least', pension: 'at least',
  };

  // ─────────────────────────── state ───────────────────────────
  let state = load() || { country: Object.keys(DATA.countries)[0], params: {}, goalAge: null };
  const country = () => DATA.countries[state.country];
  const params = () => state.params[state.country];
  if (!params()) state.params[state.country] = clone(country().params);

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      return s && DATA.countries[s.country] ? s : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  // ─────────────────────────── formatting ───────────────────────────
  function moneyFmt(compact) {
    const c = country();
    const locale = c.currency === 'EUR' ? 'en-IE' : 'en-CA';
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: c.currency, maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? 'compact' : 'standard',
    });
  }
  const money = (v) => moneyFmt(false).format(Math.round(v));
  const compact = (v) => moneyFmt(true).format(v);
  const pct = (v) => (Math.round(v * 1000) / 10).toLocaleString('en') + '%';
  const symbol = () => (country().currency === 'EUR' ? '€' : '$');

  // ─────────────────────────── country switch ───────────────────────────
  function renderCountries() {
    const el = $('#country');
    el.innerHTML = Object.entries(DATA.countries).map(([code, c]) =>
      `<button type="button" role="radio" data-code="${code}" aria-checked="${code === state.country}">${esc(c.name)}</button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.code === state.country) return;
      state.country = b.dataset.code;
      if (!params()) state.params[state.country] = clone(country().params);
      state.goalAge = null;
      state.goalPinned = false;
      renderCountries();
      renderForm();
      update();
    };
  }

  // ─────────────────────────── form ───────────────────────────
  function sourceHtml(srcKey) {
    const s = country().sources[srcKey];
    if (!s) return '';
    const parts = [`<p><span class="badge ${s.type}">${BADGES[s.type] || s.type}</span>${s.year ? `, ${s.year}` : ''}</p>`];
    if (s.source) parts.push(`<p>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : esc(s.source)}</p>`);
    if (s.derivation) parts.push(`<p>${esc(s.derivation)}</p>`);
    if (s.note) parts.push(`<p>${esc(s.note)}</p>`);
    return parts.join('');
  }

  function fieldHtml(f, id, value) {
    let control;
    if (f.kind === 'select') {
      control = `<select id="${id}" data-key="${f.key}">${f.options.map(([v, l]) =>
        `<option value="${v}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else {
      const shown = f.kind === 'pct' ? +(value * 100).toFixed(3) : value;
      const step = f.kind === 'pct' ? '0.1' : f.kind === 'money' ? '100' : '1';
      const pre = f.kind === 'money' ? `<span class="affix pre">${symbol()}</span>` : '';
      const post = f.post || (f.kind === 'pct' ? '%' : f.per ? '/ year' : '');
      control = `${pre}<input id="${id}" data-key="${f.key}" data-kind="${f.kind}" type="number" inputmode="decimal" step="${step}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} value="${shown}">${post ? `<span class="affix post">${esc(post)}</span>` : ''}`;
    }
    const src = f.src && country().sources[f.src];
    return `<div class="field" data-field="${f.key}">
      <div class="field-head"><label for="${id}">${esc(f.label)}</label>${src ? `<button type="button" class="src-toggle" aria-expanded="false" aria-controls="${id}-src">Source</button>` : ''}</div>
      <div class="control">${control}</div>
      ${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}
      ${src ? `<div class="src" id="${id}-src" hidden>${sourceHtml(f.src)}</div>` : ''}
    </div>`;
  }

  function kidsHtml() {
    const p = params();
    const rows = p.kids.map((k, i) => `
      <div class="kid" data-kid="${i}">
        <div class="kid-head"><span>Child ${i + 1}</span><button type="button" class="link-btn danger" data-remove="${i}">Remove</button></div>
        ${fieldHtml({ key: `kids.${i}.age`, label: 'Age today', kind: 'int', min: -15, max: 40, hint: 'Use a negative number for a planned child: −2 means born in two years.' }, `kid-${i}-age`, k.age)}
        ${fieldHtml({ key: `kids.${i}.annualCost`, label: 'Cost per year', kind: 'money', per: 'yr', src: 'kids.annualCost' }, `kid-${i}-cost`, k.annualCost)}
        ${fieldHtml({ key: `kids.${i}.independentAge`, label: 'Independent at age', kind: 'int', min: 14, max: 40 }, `kid-${i}-indep`, k.independentAge)}
        ${fieldHtml({ key: `kids.${i}.educationCost`, label: 'University, total', kind: 'money', src: 'kids.educationCost' }, `kid-${i}-edu`, k.educationCost)}
      </div>`).join('');
    const modeHint = p.savingsMode !== 'income' && p.kids.length
      ? '<p class="hint">Planned children (negative age) come out of your yearly savings while they live at home. Children you already have are part of today’s budget, so only their costs after you stop are added.</p>' : '';
    return `${modeHint}${rows || '<p class="hint">No kids in the plan. Add current or planned children to include what they cost.</p>'}
      <button type="button" class="add-kid" id="add-kid">Add a child</button>`;
  }

  function groupPeek(g) {
    const p = params();
    if (g.id === 'kids') return p.kids.length ? `${p.kids.length}` : 'None';
    if (g.id === 'home') return GROUPS[2].fields[0].options.find(([v]) => v === p.housing.mode)[1];
    return '';
  }

  function renderForm() {
    const p = params();
    $('#form').innerHTML = GROUPS.map((g) => `
      <details class="group" data-group="${g.id}"${g.open ? ' open' : ''}>
        <summary><span>${esc(g.title)}</span><span class="peek">${esc(groupPeek(g))}</span></summary>
        <div class="group-body">${g.custom ? kidsHtml() : g.fields.map((f) => fieldHtml(f, 'f-' + f.key.replace(/\./g, '-'), E.getPath(p, f.key))).join('')}</div>
      </details>`).join('');
    applyVisibility();
    $('#disclaimer').textContent = DATA.disclaimer;
  }

  function rerenderGroup(id) {
    const details = document.querySelector(`[data-group="${id}"]`);
    const g = GROUPS.find((x) => x.id === id);
    details.querySelector('.group-body').innerHTML = g.custom ? kidsHtml()
      : g.fields.map((f) => fieldHtml(f, 'f-' + f.key.replace(/\./g, '-'), E.getPath(params(), f.key))).join('');
    details.querySelector('.peek').textContent = groupPeek(g);
    applyVisibility();
  }

  function applyVisibility() {
    const p = params();
    GROUPS.forEach((g) => (g.fields || []).forEach((f) => {
      const el = document.querySelector(`[data-field="${f.key}"]`);
      if (el) el.hidden = f.show ? !f.show(p) : false;
    }));
  }

  function onInput(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    let v;
    if (el.tagName === 'SELECT') v = el.value;
    else {
      if (el.value === '' || isNaN(+el.value)) return;
      v = +el.value;
      if (el.dataset.kind === 'pct') v = v / 100;
      if (el.dataset.kind === 'int') v = Math.round(v);
    }
    E.setPath(params(), key, v);
    if (el.tagName === 'SELECT') {
      applyVisibility();
      const peek = el.closest('details').querySelector('.peek');
      const g = GROUPS.find((x) => x.id === el.closest('details').dataset.group);
      peek.textContent = groupPeek(g);
      if (key === 'savingsMode') rerenderGroup('kids');
    }
    if (key === 'currentAge' || key === 'lifeExpectancy') { state.goalAge = null; state.goalPinned = false; }
    update();
  }

  function onClick(e) {
    const t = e.target;
    if (t.classList.contains('src-toggle')) {
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      const open = panel.hidden;
      panel.hidden = !open;
      t.setAttribute('aria-expanded', String(open));
      t.textContent = open ? 'Hide source' : 'Source';
    } else if (t.id === 'add-kid') {
      params().kids.push(clone(country().kidTemplate));
      rerenderGroup('kids');
      update();
    } else if (t.dataset.remove != null) {
      params().kids.splice(+t.dataset.remove, 1);
      rerenderGroup('kids');
      update();
    }
  }

  // ─────────────────────────── chart ───────────────────────────
  // Step size of 1, 2, 2.5 or 5 × 10^n, so four gridlines land on round numbers.
  function niceStep(v) {
    if (!(v > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  function chartSvg(rows, earliest, goalAge) {
    const W = Math.max(320, Math.round($('#chart').clientWidth || 760));
    const narrow = W < 520;
    const H = narrow ? 240 : 320, m = { l: narrow ? 52 : 64, r: 16, t: 28, b: 34 };
    const x0 = rows[0].age, x1 = rows[rows.length - 1].age;
    const peak = Math.max(...rows.map((r) => r.target));
    const yMax = niceStep((peak * 1.6) / 4) * 4;
    const x = (a) => m.l + ((a - x0) / Math.max(1, x1 - x0)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - Math.max(0, v) / yMax) * (H - m.t - m.b);
    const line = (key) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.age).toFixed(1)},${y(r[key]).toFixed(1)}`).join('');
    const area = `${line('wealth')}L${x(x1).toFixed(1)},${y(0)}L${x(x0).toFixed(1)},${y(0)}Z`;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      grid += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 10}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`;
    }
    const span = x1 - x0;
    const step = span > 40 ? 10 : 5;
    for (let a = Math.ceil(x0 / step) * step; a <= x1; a += step) {
      grid += `<text class="tick" x="${x(a)}" y="${H - 10}" text-anchor="middle">${a}</text>`;
    }

    let marks = '';
    if (goalAge != null && goalAge >= x0 && goalAge <= x1) {
      marks += `<line class="goal-line" x1="${x(goalAge)}" x2="${x(goalAge)}" y1="${m.t - 10}" y2="${y(0)}"/>`;
    }
    if (earliest) {
      const cx = x(earliest.fiAge), cy = y(earliest.target.total);
      const anchor = cx > W - 140 ? 'end' : 'start';
      marks += `<circle class="cross" cx="${cx}" cy="${cy}" r="7"/><text class="cross-label" x="${cx + (anchor === 'end' ? -12 : 12)}" y="${cy - 12}" text-anchor="${anchor}">Free at ${earliest.fiAge}</text>`;
    }
    // Lines that run above the top of the chart are clipped rather than flattened.
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Projected investments compared with the amount needed, by age">
      <defs><clipPath id="plot"><rect x="${m.l}" y="${m.t - 2}" width="${W - m.l - m.r}" height="${H - m.t - m.b + 2}"/></clipPath></defs>
      ${grid}<g clip-path="url(#plot)"><path class="wealth-area" d="${area}"/><path class="target" d="${line('target')}"/><path class="wealth" d="${line('wealth')}"/></g>${marks}</svg>
      <figcaption><span class="key">What you’ll have invested</span><span class="key t">What you’d need to stop at that age</span></figcaption>`;
  }

  // ─────────────────────────── results ───────────────────────────
  function update() {
    save();
    const p = params();
    const err = $('#error');
    const errors = E.validate(p);
    if (errors.length) {
      err.hidden = false;
      err.textContent = errors.join(' ');
      return;
    }
    err.hidden = true;

    const minGoal = p.currentAge, maxGoal = p.lifeExpectancy - 1;
    let summary;
    try {
      const earliest = E.earliestFI(p);
      if (!state.goalPinned || state.goalAge == null || state.goalAge < minGoal || state.goalAge > maxGoal) {
        state.goalAge = earliest ? earliest.fiAge : Math.min(maxGoal, Math.max(minGoal, 55));
      }
      summary = E.summarize(p, state.goalAge);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      return;
    }

    renderVerdict(p, summary);
    $('#chart').innerHTML = chartSvg(summary.projection, summary.earliest, state.goalAge);
    renderGoal(p, summary, minGoal, maxGoal);
    renderBreakdown(p, summary.target);
    renderSolve(p);
  }

  function renderVerdict(p, s) {
    const e = s.earliest;
    const bar = $('#mobile-bar');
    if (e && e.fiAge === p.currentAge) {
      $('#verdict').innerHTML = `<p class="lead">You could stop working</p><span class="age not">today</span>
        <p class="sub">Your <strong class="w">${money(e.wealth)}</strong> already covers the <strong class="t">${money(e.target.total)}</strong> you need.</p>`;
      bar.textContent = 'Free today';
    } else if (e) {
      $('#verdict').innerHTML = `<p class="lead">You can be financially free at</p><span class="age">${e.fiAge}</span>
        <p class="sub">That’s in ${e.years} year${e.years === 1 ? '' : 's'}. By then you’ll have about <strong class="w">${money(e.wealth)}</strong> invested, enough to cover the <strong class="t">${money(e.target.total)}</strong> you need from that point on.</p>`;
      bar.textContent = `Free at ${e.fiAge}`;
    } else {
      $('#verdict').innerHTML = `<p class="lead">At this pace</p><span class="age not">You won’t be free before ${p.lifeExpectancy}</span>
        <p class="sub">Move the slider to pick when you’d like to stop, and see what it takes.</p>`;
      bar.textContent = `Not free before ${p.lifeExpectancy}`;
    }
  }

  function renderGoal(p, s, min, max) {
    const slider = $('#goal-age');
    slider.min = min; slider.max = max; slider.value = state.goalAge;
    $('#goal-age-out').textContent = state.goalAge;
    const t = s.target;
    const have = E.wealthAt(p, state.goalAge - p.currentAge);
    const gap = have - t.total;
    const rs = s.requiredSavings;
    const ri = s.requiredNetIncome;
    const months = (v) => `${money(v / 12)}<small> / month</small>`;
    const rows = [
      ['You’d need invested', money(t.total)],
      ['You’ll have', money(have)],
      [gap >= 0 ? 'Spare' : 'Short by', `<span class="${gap >= 0 ? '' : 'bad'}">${money(Math.abs(gap))}</span>`],
    ];
    const planned = p.kids.some((k) => k.age < 0);
    if (rs && rs.annual != null) rows.push([planned ? 'Save, before planned kids' : 'Household savings needed', months(rs.annual)]);
    else if (rs) rows.push(['Lump sum needed today', money(rs.lumpShortfall)]);
    if (ri && ri.annual != null) rows.push(['Household take-home pay needed', months(ri.annual)]);
    rows.push(['Yearly costs once free', `${money(t.annualNeed)}<small> / yr</small>`]);
    $('#goal-figures').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  function renderBreakdown(p, t) {
    const entries = Object.entries(t.components).filter(([, v]) => v > 0.5);
    const total = t.total || 1;
    const pensionLine = t.pensionUsed > 0
      ? ` Your pension covers ${money(t.pensionUsed)} a year from age ${p.pension.startAge}.`
      : '';
    $('#breakdown').innerHTML = `<h2>Where the ${money(t.total)} goes</h2>
      <p class="intro">If you stop at ${t.fiAge}. Includes tax on withdrawals at ${pct(p.taxRate)}.${pensionLine}</p>
      <div class="stack" aria-hidden="true">${entries.map(([k, v]) => `<span style="width:${(v / total) * 100}%;background:${COMPONENTS[k].color}"></span>`).join('')}</div>
      <ul class="parts">${entries.map(([k, v]) => `<li><span class="sw" style="background:${COMPONENTS[k].color}"></span><span>${COMPONENTS[k].label}</span><span class="val">${money(v)}</span><span class="pct">${Math.round((v / total) * 100)}%</span></li>`).join('')}
      <li class="total"><span></span><span>Total</span><span class="val">${money(t.total)}</span><span class="pct"></span></li></ul>`;
  }

  function solveOptions(p) {
    const opts = ['coreSpend', 'medical', 'otherAnnual', 'currentInvestments', 'nominalReturn', 'pension'];
    opts.unshift(p.savingsMode === 'income' ? 'netIncome' : 'annualSavings');
    if (['rent', 'buy'].includes(p.housing.mode)) opts.push('rent');
    if (['buy', 'mortgage', 'own'].includes(p.housing.mode)) opts.push('homePrice');
    if (p.kids.length) opts.push('kidAnnualCost');
    if (p.method !== 'annuity') opts.push('withdrawalRate');
    return opts;
  }

  function renderSolve(p) {
    const opts = solveOptions(p);
    if (!opts.includes(state.solveKey)) state.solveKey = opts[0];
    $('#solve').innerHTML = `<h2>Work backwards</h2>
      <p class="intro">Pick one number. Everything else stays as you set it, and this finds the value that lets you stop at ${state.goalAge}.</p>
      <div class="solve-row"><div class="control"><select id="solve-key" aria-label="Number to solve for">${opts.map((k) =>
        `<option value="${k}"${k === state.solveKey ? ' selected' : ''}>${esc(E.REVERSIBLE[k].label)}</option>`).join('')}</select></div></div>
      <p class="answer" id="solve-answer"></p>
      <p class="answer" id="kids-answer"></p>`;
    $('#solve-key').onchange = (e) => { state.solveKey = e.target.value; save(); answer(p); };
    answer(p);
  }

  const HIGHER_IS_EASIER = ['annualSavings', 'netIncome', 'currentInvestments', 'nominalReturn', 'withdrawalRate', 'pension'];

  function answer(p) {
    const key = state.solveKey;
    const spec = E.REVERSIBLE[key];
    const A = state.goalAge;
    const isPct = key === 'nominalReturn' || key === 'withdrawalRate';
    const fmt = (v) => (isPct ? pct(v) : money(v));
    const name = spec.label.charAt(0).toLowerCase() + spec.label.slice(1);
    const out = $('#solve-answer');
    let res;
    try { res = E.solve(p, key, A); } catch (e) { res = { solved: false, reason: e.message }; }

    if (!res.solved) {
      out.className = 'answer none';
      out.textContent = res.reason && res.reason.startsWith('Already')
        ? `You can stop at ${A} whatever this is, within a realistic range.`
        : `No realistic value of this alone gets you there by ${A}. Try a later age or change another number too.`;
    } else {
      const v = res.value;
      const now = E.getPath(p, spec.path);
      const up = HIGHER_IS_EASIER.includes(key);          // raising it makes stopping easier
      const room = up ? now >= v : now <= v;               // current plan already works
      out.className = 'answer';
      if (key === 'withdrawalRate') {
        out.innerHTML = room
          ? `You have room to be more careful: you could plan a safer withdrawal rate as low as <strong>${fmt(v)}</strong> (now ${fmt(now)}) and still stop at ${A}.`
          : `To stop at ${A} you’d have to withdraw at least <strong>${fmt(v)}</strong> a year (now ${fmt(now)}). Rates above 4% have often run out in history, so a later age is the safer fix.`;
      } else if (room) {
        out.innerHTML = up
          ? `You have room to spare: ${esc(name)} could drop to <strong>${fmt(v)}</strong> (now ${fmt(now)}) and you could still stop at ${A}.`
          : `You have room to spare: ${esc(name)} could go up to <strong>${fmt(v)}</strong> (now ${fmt(now)}) and you could still stop at ${A}.`;
      } else {
        out.innerHTML = up
          ? `To stop at ${A}, ${esc(name)} needs to rise to at least <strong>${fmt(v)}</strong> (now ${fmt(now)}).`
          : `To stop at ${A}, ${esc(name)} needs to come down to <strong>${fmt(v)}</strong> or less (now ${fmt(now)}).`;
      }
    }

    // Kids: a child born next year costs you twice, in lower savings while they're
    // at home and in any costs left after you stop. Compare that with the spare money.
    const k = $('#kids-answer');
    k.className = 'answer none';
    try {
      const tpl = country().kidTemplate;
      const spare = E.gapAt(p, A);
      const withOne = clone(p); withOne.kids.push(clone(tpl));
      const costOfOne = spare - E.gapAt(withOne, A);
      const n = E.maxKids(p, A, tpl, 6);
      const each = `A child born next year at the national average cost (${money(tpl.annualCost)} a year) would leave you about ${money(costOfOne)} short of where you’d otherwise be by ${A}, mostly through lower savings while they’re at home.`;
      if (spare < 0) k.textContent = `${each} Your plan is already short at ${A}.`;
      else if (n === 0) k.textContent = `${each} You have ${money(spare)} spare, so that would push you past ${A}.`;
      else k.textContent = `${each} You have ${money(spare)} spare at ${A}, so you could afford ${n === 6 ? '6 or more' : n} ${p.kids.length ? 'more ' : ''}${n === 1 ? 'child' : 'children'} and still stop then, with less left over.`;
    } catch (e) { k.textContent = ''; }
  }

  // ─────────────────────────── wiring ───────────────────────────
  $('#form').addEventListener('input', onInput);
  $('#form').addEventListener('change', onInput);
  $('#form').addEventListener('click', onClick);
  $('#goal-age').addEventListener('input', (e) => { state.goalAge = +e.target.value; state.goalPinned = true; update(); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(update, 120); });
  $('#reset').addEventListener('click', () => {
    state.params[state.country] = clone(country().params);
    state.goalAge = null;
    state.goalPinned = false;
    renderForm();
    update();
  });
  $('#mobile-bar').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  renderCountries();
  renderForm();
  update();
})();
