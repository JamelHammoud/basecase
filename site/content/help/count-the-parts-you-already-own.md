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

If you already have some of the parts for a robot, tell Basecase how many you own. The bill of materials and the budget then count only the parts you still need to buy.

1. In the **Build** tab, find **Bill of materials**.
2. Click a section, such as **Components**, to open it.
3. Click the quantity on a line.
4. Type how many you own in **On hand**, then press [[↩]].

![On hand set to 6 under the 6× Feetech STS3215 line of an SO-101](/help/count-the-parts-you-already-own/on-hand.png)

The quantity drops to the number you still need to buy, and the line shows how many come from your own parts. The line's price and the total go down too.

For example, an SO-101 uses six STS3215s. If you enter 6 on hand, the servo line goes from ≈ $120.00 to $0.00, and the total goes from ≈ $127.48 to ≈ $7.48.

![The SO-101 bill of materials with 0× Feetech STS3215, 6 on hand and $0.00](/help/count-the-parts-you-already-own/owned.png)

To put the old count back, click **Undo** in the toast. To clear a count, type 0.

## How counts work

- Count single pieces, even if you bought them in packs. For example, if you have 100 M3 screws on hand and a robot uses 13, Basecase lists none to buy.
- Count filament in grams.
- A count belongs to the part. Every scene that uses the part takes your count off what's left to buy.
- Basecase doesn't take parts off your count when you build a robot. After a build, update the count yourself.
- The Budget check and **Buy All** leave out the parts you own.

## Tell the agent what you own

You can also paste an order confirmation or a parts list into the agent's composer and ask it to record what you own. The agent saves the counts in the same place as the ones you type in **On hand**.

When the agent picks parts, it lists the ones you own first and uses them before buying others.

Next, [buy the parts for a robot](/help/buy-the-parts-for-a-robot).
