# How much do I need to be financially free?

A calculator that turns a whole life into one number: how much you need invested to stop working for good, and the age you can do it at. It starts from official national averages for **Canada** and **Italy**, and every number can be changed.

**Download and open `How much do I need to be financially free.html` in a browser and it works.** No install, no build step, no server, no tracking.

Example outputs:

<img width="846" height="626" alt="fi_main" src="https://github.com/user-attachments/assets/0894b332-545c-4234-9135-d217d449d8bc" />
<img width="831" height="333" alt="fi_breakdown" src="https://github.com/user-attachments/assets/1122c828-4b1b-44cd-915d-393c6ccf746f" />
<img width="823" height="221" alt="fi_backwards" src="https://github.com/user-attachments/assets/4bb4ac91-9c95-4a0d-a969-0cbc82fab8c9" />


## What it does

- **Forward:** enter your situation and see the earliest age you can be financially free, and what you'd have invested by then.
- **Backward:** pick the age you want to stop and see the monthly savings and take-home pay that requires.
- **Solve for any single number:** the most you can spend on living costs, rent or a home; the return you'd need; what kids can cost. Everything else stays as you set it.
- **Breakdown:** how much of the target comes from everyday costs, the bridge to your pension, kids, university, late-life care, buying a home and emergency cash.
- **Sources everywhere:** every default has a "Source" link showing where the number came from, the year, and how it was derived.

## The formula

All amounts are in today's money. *r* is the real return: (1 + return − fees) ÷ (1 + inflation) − 1.

```
FI target = [ Living + Bridge + Kids + University + Care + Home + Buffer ] ÷ (1 − tax on withdrawals)

  Living      = (living costs + medical + utilities + housing costs − pension) ÷ withdrawal rate
  Bridge      = present value of the pension amount from your stop age until the pension starts
  Kids        = present value of each child's yearly cost for the years they're still at home after you stop
  University  = present value of each child's tuition
  Care        = present value of late-life care costs
  Home        = remaining mortgage, or the purchase price + buying costs
  Buffer      = emergency cash

You're free at the first age where:  invested today × (1+r)^n + savings × ((1+r)^n − 1) ÷ r  ≥  FI target
```

See [METHODOLOGY.md](fi-calculator/METHODOLOGY.md) for every assumption and timing convention.

## Publish it with GitHub Pages

1. Create a new repository on GitHub and upload all the files from this folder (keep the folder structure).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. After a minute the calculator is live at `https://<your-username>.github.io/<repository-name>/`.

## Project layout

```
index.html                 the page
css/styles.css             styles (light and dark)
js/engine.js               all the maths; no UI, works in the browser and in Node
js/ui.js                   form, chart and results
data/build-countries.js    raw official figures + how each default is derived
data/countries.json        generated defaults with sources (readable by anyone)
data/countries.js          the same data as a script, so the page works from disk
tests/                     engine and data tests
tools/bundle.js            builds a single self-contained file in dist/
METHODOLOGY.md             the full method
```

## Use the engine in your own code

```js
const E = require('./js/engine.js');          // or <script src="js/engine.js"> → window.FIEngine
const data = require('./data/countries.json');

const me = { ...data.countries.CA.params, currentAge: 35, annualSavings: 30000 };
E.earliestFI(me);                              // { fiAge, years, wealth, target }
E.target(me, 55);                              // FI target at 55 with a full breakdown
E.requiredSavings(me, 55);                     // { annual, monthly }
E.solve(me, 'coreSpend', 55);                  // highest living costs that still allow 55
```

## Update the data or add a country

1. Edit the raw figures in `data/build-countries.js`. Each default carries its source, year, link, type (`official`, `derived`, `reputable`, `convention`, `personal`) and derivation.
2. To add a country, copy the `canada()` or `italy()` function, change the figures, and add it to `countries` at the bottom.
3. Run `npm run build:data`, then `npm test`. The tests check that every key default has a source, a link and recent data.

Pull requests with better or newer official sources are welcome.

## Run the tests

Needs Node 18 or newer, with no dependencies to install.

```
npm test             # engine + data tests
npm run bundle       # optional: dist/fi-calculator.html as a single file
```

## Limits

- It uses a single long-run average return. Real markets are bumpy, and a bad decade right after you stop working hurts more than the average suggests. A lower withdrawal rate is the usual protection.
- Defaults are national averages for a two-adult household. Your city, income and habits matter more than any average.
- Taxes are approximated with one effective rate on withdrawals.

## Disclaimer

This is an educational tool, not financial, tax or legal advice. Check important decisions with a qualified professional.

## License

MIT, see [LICENSE](LICENSE).
