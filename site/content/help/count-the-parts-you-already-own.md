---
title: Count the parts you already own
date: 2026-11-13
collection: build-and-print
type: task
order: 3
keywords:
  - on hand
  - inventory
  - stock
  - owned
  - kit
  - drawer
  - bom
  - budget
related:
  - price-the-parts-and-set-a-budget
  - buy-the-parts-for-a-robot
covers:
  - src/components/build/QtyEditor.tsx
  - src/components/build/BuyRow.tsx
  - src/components/build/buyLine.ts
  - src/components/BuildPanel.tsx
  - src/utils/onHand.ts
  - src/utils/bom.ts
  - src/agent/agentCatalogPrices.ts
  - src/workspace/agentCostRequests.ts
  - electron/cad-mcp/buildTools.mjs
  - electron/backend/purchases.mjs
---

Tell Basecase which parts you have, so the bill of materials and the budget count only what's left to buy.

1. In the **Build** tab, find **Bill of materials**.
2. Click a section, such as **Components**, to open it.
3. Click a line's quantity.
4. Type how many you own in **On hand**, and press Enter.

![On hand set to 6 under the 6× Feetech STS3215 line of an SO-101](/help/count-the-parts-you-already-own/on-hand.png)

The quantity drops to what's left to buy, and the line shows how many come from your own parts. The line's price and the total count only the parts left to buy. On an SO-101 with six STS3215s, 6 on hand takes the servo line from ≈ $120.00 to $0.00, and the total from ≈ $127.48 to ≈ $7.48.

![The SO-101 bill of materials with 0× Feetech STS3215, 6 on hand and $0.00](/help/count-the-parts-you-already-own/owned.png)

Click **Undo** in the toast to put the old count back. Type 0 to clear it.

## How counts work

- Counts are in pieces, not packs. With 100 M3 screws on hand, a robot that uses 13 lists none to buy.
- Filament counts in grams.
- A count belongs to the part, not the scene. Every scene that uses the part takes it off.
- Basecase doesn't take parts off the count when you build a robot. Change the count yourself after a build.
- The Budget check and **Buy All** leave out the parts you own.

## Tell the agent what you own

Paste an order confirmation or a parts list into the agent's composer, and ask it to record what you own. It saves the counts in the same place. When it picks parts, it lists the ones you own first and uses them before buying others.

Next, [buy the parts for a robot](/help/buy-the-parts-for-a-robot).
