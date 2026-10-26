# Methodology

This page explains exactly how the calculator turns your inputs into a number. The code that does it is `js/engine.js`, and every rule here is covered by a test in `tests/engine.test.js`.

## 1. Everything is in today's money

Prices rise, so a euro in 30 years buys less than a euro today. Instead of inflating every cost, the calculator keeps all amounts in today's money and uses a **real return**, which is what your investments earn above inflation:

```
real return r = (1 + stock return − fees) ÷ (1 + inflation) − 1
```

With the defaults (7% return, 2% inflation, 0.25% fees), r ≈ 4.66% a year.

A fixed-rate mortgage payment does not rise with inflation, so in today's money it gets smaller each year. The engine accounts for that.

## 2. The target: how much you need invested on the day you stop

The target depends on the age you stop, because kids, a mortgage and the wait for your pension all change with time. For a stop age *A*:

| Part | What it covers | How it's calculated |
|---|---|---|
| Living | Living costs, medical, utilities, housing costs, minus your pension | (yearly need − pension) ÷ withdrawal rate, or the present value over the rest of the plan if you choose to spend it down |
| Bridge | The years between stopping and your pension starting | Present value of the pension amount over those years |
| Kids | Children still at home after you stop | Present value of each child's yearly cost from *A* until they become independent; planned children start when born |
| University | Each child's tuition | Present value of the lump sum, paid when the child reaches university age |
| Care | Care home or home care late in life | Present value of the yearly cost from the care age to the end of the plan |
| Home | Owning your home outright when you stop | Mortgage balance left at *A* (in today's money), or the purchase price plus buying costs |
| Buffer | Emergency cash | Added as is |

The sum is then divided by (1 − tax on withdrawals), because each euro or dollar you take out may be taxed.

**Costs before you stop are paid from your pay**, not from the target. That's why a child who will be grown up by your stop age adds nothing to the target. Children still cost money while you're saving, though. To capture that, choose "Whatever my pay leaves over" under *You*: your savings each year become your take-home pay minus that year's costs, so children, tuition years and the end of a mortgage all show up.

## 3. Two ways to make the money last

- **Last forever (default):** you withdraw a fixed share each year (the withdrawal rate) and aim to keep the capital. The well-known 4% rule comes from US market history. Studies across other countries find lower safe rates, so the default is 3.5%.
- **Run out at the end of the plan:** the money is spent down to zero by the "plan until" age. This needs less, but leaves nothing if you live longer than planned.

## 4. Getting there

Savings are added at the end of each year and grow at the real return:

```
invested after n years = invested today × (1 + r)^n + yearly savings × ((1 + r)^n − 1) ÷ r
```

You're **free** at the first age where this reaches the target for that age.

## 5. Working backwards

- **Savings needed** to stop at age *A* has an exact formula: (target − invested today × (1+r)^n) × r ÷ ((1+r)^n − 1).
- **Take-home pay needed** = today's costs + the savings needed (or, in pay mode, solved year by year).
- **Any other single number** is found by bisection: the engine tries values until projected wealth exactly equals the target at *A*. If no realistic value works, it says so instead of returning a misleading number.
- **Kids you could afford** adds children at the national average cost one at a time, assuming your pay stays the same.

## 6. Timing conventions

- Spending after you stop is withdrawn at the **start** of each year.
- Savings before you stop are added at the **end** of each year.
- Pension amounts are entered **after tax**.
- Ages are whole years.

## 7. Where the defaults come from

Every default lives in `data/build-countries.js`, with its source, year, link and derivation. The page shows these under each field's "Source" link. Defaults are typed:

- **Official:** published by a government or national statistics office.
- **Calculated from official data:** for example, average household spending converted to a two-adult household with the statistics office's own equivalence scale.
- **Reputable source:** non-government but widely cited (for example, the UBS Global Investment Returns Yearbook).
- **Rule of thumb:** no official figure exists (for example, 1% of a home's value a year for upkeep).
- **Your own number:** examples only.

Neither Canada nor Italy publishes an official yearly cost per child. The calculator derives it as the extra household spending a child adds, using Statistics Canada's square-root scale (a third person adds about 22% to a couple's costs) and ISTAT's equivalence scale (about 33%).

The Italian pension default is lowered for today's young workers, using the Ragioneria Generale dello Stato's projection of a falling pension-to-final-salary ratio, and starts at 70 in line with its projected retirement age.

## 8. What the model leaves out

- **Market ups and downs.** A single average return hides the risk of a crash just after you stop. A lower withdrawal rate or a cash buffer helps.
- **Detailed taxes.** One effective rate stands in for tax-sheltered accounts, brackets and benefit clawbacks.
- **Rising incomes.** Savings stay constant in today's money.
- **Inheritance, part-time work and selling the home later.** All of these would lower the target.
