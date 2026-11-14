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

Add the prices you see in a store to the bill of materials, and set the budget the Budget check holds the design to.

1. In the **Build** tab, find **Bill of materials**.
2. Click a section, such as **Components**, to open it.
3. On a line, click its price, or **Add Price** where it has none.
4. Type the price you see in **Price**.
5. Set **Pieces per listing** to how many come in one pack. For filament it's **Grams per spool**.
6. Click **Save**.
7. Type your budget in the field beside the total.

![The bill of materials with a $150 budget beside the ≈ $22.99 total](/help/get-a-robot-ready-to-build/build-tab.png)

The bar under the total shows how much is left, or how far over budget you are. Type 0 in the field to clear the budget.

## What the prices mean

- A price you saved shows in white. It counts in every scene that uses the part.
- A price marked ≈ is the maker's or a distributor's list price. The total is marked ≈ while any line uses one.
- Parts you [already own](/help/count-the-parts-you-already-own) are left out of a line's price and the total.
- A price saved more than 60 days ago turns amber. Hover it to see the date, then save the price you see now.
- **Equipment**, such as tools, is left out of the budget.

To keep the store page with a price, open **Listing** in the same sheet and paste the link into **Listing link**.

To delete a saved price, click it, click **Delete Price**, then **Delete**. The line goes back to its ≈ list price, or to **Add Price** where it has none.

![Delete price for Feetech STS3215 7.4 V (C001)? over the price sheet](/help/price-the-parts-and-set-a-budget/delete-price.png)

## Show prices in your currency

Press ⌘, (Ctrl+, on Windows), choose **Build** and pick one of 30 currencies in **Currency** under **Prices**. Basecase converts at European Central Bank rates, updated once a day when the app starts. A price you type in your currency reads back exactly as you typed it.

Next, [buy the parts for a robot](/help/buy-the-parts-for-a-robot).
