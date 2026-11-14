---
title: Count the parts you already own
date: 2026-11-13
collection: build-and-print
type: task
order: 3
keywords:
  - inventory
  - stock
  - owned
  - on hand
  - drawer
  - kit
  - bom
related:
  - price-the-parts-and-set-a-budget
  - buy-the-parts-for-a-robot
covers:
  - src/components/build/QtyEditor.tsx
  - src/components/build/BuyRow.tsx
  - src/components/build/buyLine.ts
  - src/utils/purchases.ts
  - src/utils/bom.ts
  - src/agent/onHand.ts
  - electron/purchaseRecord.mjs
---

Record the servos, boards and screws you have, so the bill of materials prices only what's left to buy.

1. In the **Build** tab, find **Bill of materials**.
2. Click a section, such as **Components**, to open it.
3. Click a line's quantity, such as **8×**.
4. Type how many you own in **On hand**, and press Enter.

![On hand set to 6 for the Feetech STS3215, with 2× left to buy](/help/count-the-parts-you-own/on-hand.png)

The quantity now shows only the units left to buy, and the price counts only those. The count you own shows under the part's name. A part you own in full stays on the list at $0.

![The bill of materials with 2× Feetech STS3215 to buy and 6 on hand](/help/count-the-parts-you-own/bill-of-materials.png)

The total, the Budget check and **Buy All** count only the units to buy. Counts are in pieces, not packs: two packs of 100 screws is 200. A count applies to every scene, like a saved price, so two scenes can each count the same 6 servos. Filament isn't counted. Press ⌘Z to undo a count, or set it to 0 to clear it.

You can also tell the agent what you have, or paste an order confirmation into the chat. It records each part with `record_on_hand`, and its parts search lists the parts you own first. Its counts aren't undo steps; change them on the line.

Next, [buy the parts for a robot](/help/buy-the-parts-for-a-robot).
