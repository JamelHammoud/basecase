---
title: Price the parts and set a budget
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 2
keywords:
  - bom
  - bill of materials
  - cost
  - price
  - currency
  - euro
  - stale
related:
  - buy-the-parts-for-a-robot
  - get-a-robot-ready-to-build
  - from-design-to-build
covers:
  - src/components/build/BuyList.tsx
  - src/components/build/BuyRow.tsx
  - src/components/build/BuyTotal.tsx
  - src/components/build/CheckSheet.tsx
  - src/components/build/budget.ts
  - src/components/settings/BuildPane.tsx
  - src/utils/bom.ts
  - src/utils/currencyStore.ts
  - electron/backend/purchases.mjs
---

Add the prices you see in a store to the bill of materials, then set a budget for your robot. The Budget check compares your design against that budget.

1. In the **Build** tab, find **Bill of materials**.
2. Click a section, such as **Components**, to open it.
3. On a line, click its price. If the line doesn't have a price, click **Add Price**.
4. In **Price**, type the price you see in the store.
5. Set **Pieces per listing** to the number of pieces in one pack. For filament, set **Grams per spool** instead.
6. Click **Save**.
7. Type your budget in the field beside the total.

![The bill of materials with a $150 budget beside the ≈ $22.99 total](/help/get-a-robot-ready-to-build/build-tab.png)

The bar under the total shows how much of your budget is left, or how far over budget you are. To clear the budget, type 0 in the field.

## What the prices mean

- A price you saved shows in white. It counts in every scene that uses the part.
- A price marked ≈ is the maker's or a distributor's list price. If any line uses a list price, the total shows ≈ too.
- A line's price and the total don't include parts you [already own](/help/count-the-parts-you-already-own).
- A price saved more than 60 days ago turns amber. Hover over it to see the date, then save the price you see now.
- The budget doesn't count **Equipment**, such as tools.

To keep the store page with a price, open **Listing** in the same sheet and paste the link into **Listing link**.

To delete a saved price, click it, click **Delete Price**, then click **Delete**. The line goes back to its ≈ list price. If it doesn't have one, the line shows **Add Price** again.

![Delete price for Feetech STS3215 7.4 V (C001)? over the price sheet](/help/price-the-parts-and-set-a-budget/delete-price.png)

## Show prices in your currency

Press [[⌘,]], choose **Build**, then pick one of 30 currencies in **Currency** under **Prices**. Basecase converts prices using European Central Bank rates, which update once a day when the app starts. A price you type in your currency shows exactly as you typed it.

Next, [buy the parts for a robot](/help/buy-the-parts-for-a-robot).
