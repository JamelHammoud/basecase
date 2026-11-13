---
title: Buy the parts for a robot
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 3
keywords:
  - shopping list
  - order
  - amazon
  - csv
  - spreadsheet
  - supplies
  - bom
related:
  - price-the-parts-and-set-a-budget
  - parts-the-agent-sources
  - print-a-robots-parts
covers:
  - src/components/build/BuyList.tsx
  - src/components/build/BuyRow.tsx
  - src/components/build/buyLine.ts
  - src/components/build/AddSupplyMenu.tsx
  - src/components/build/QtyEditor.tsx
  - src/components/PartDetails.tsx
  - src/utils/bomNeeds.ts
---

Open each store listing from the bill of materials, add the supplies a build needs, and export the list to order from.

1. In the **Build** tab, open a section of **Bill of materials**.
2. Hover a line and click the link at its right end. It opens the listing you saved, or an Amazon search for the exact part.
3. To add something the model doesn't show, click **+** beside **Bill of materials**.
4. Choose a supply under **Power**, **Wiring**, **Electronics** or **Tools**.
5. To buy more of a supply you added, click its quantity and change **Quantity**.
6. Click the spreadsheet icon beside **+**, then choose **CSV Spreadsheet** or **Markdown**.

Basecase saves `<scene>-bom.csv` or `<scene>-bom.md` to your downloads, to order from in any store.

Some lines arrive on their own. A battery brings a switch, fuse, connector, wire and charger, and servos bring their cables. Filament comes from the printed parts, in grams, so it isn't in the **+** menu.

A selected part's **Product** section in the Inspector has **Buy on Amazon** or **Find on Amazon**, **Datasheet** and **Product Page**. Basecase never places an order or reads store pages; you buy in the store.

After you buy, record what you paid with [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
