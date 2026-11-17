---
title: Buy the parts for a robot
date: 2026-11-13
collection: build-and-print
type: task
order: 3
keywords:
  - shopping list
  - order
  - amazon
  - csv
  - spreadsheet
  - cart
  - buy all
  - supplies
  - bom
related:
  - price-the-parts-and-set-a-budget
  - parts-the-agent-sources
  - print-a-robots-parts
covers:
  - src/components/build/BuyList.tsx
  - src/components/build/cart.ts
  - src/workspace/buildCommands.tsx
  - src/components/build/BuyRow.tsx
  - src/components/build/buyLine.ts
  - src/utils/bomCategories.ts
  - src/utils/bomFormat.ts
  - src/components/build/AddSupplyMenu.tsx
  - src/components/build/QtyEditor.tsx
  - src/components/PartDetails.tsx
  - src/utils/bomNeeds.ts
  - src/wiring/netlist.ts
  - src/wiring/wiringSupplies.ts
---

From the bill of materials, you can fill an Amazon cart, open listings in other stores, add the supplies a build needs and export the list.

1. In the **Build** tab, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Buy All**. Your browser opens an Amazon cart with every line that has an Amazon listing, in whole packs.
3. Below **Buy All**, choose each line listed under another store to open its listing in that store.
4. To add something the model doesn't show, click **+** next to **Bill of materials**.
5. Choose a supply under **Power**, **Wiring**, **Electronics** or **Tools**.
6. To buy more of a supply you added, click its quantity, then change **Quantity**.
7. To keep a copy, click the spreadsheet icon, then choose **CSV Spreadsheet** or **Markdown**.

![The bill of materials menu with Buy All for amazon.com, and screws and wire listed under their own stores](/help/buy-the-parts-for-a-robot/buy-all.png)

You can also press [[⌘K]] and choose **Buy All**.

Basecase leaves any parts you [already own](/help/count-the-parts-you-already-own) out of the cart. Pack counts come from the price you checked, so six servos sold in pairs go in as 3, and 13 screws sold by the hundred go in as 1. If a line has no saved pack size, it goes in by the piece.

Other stores don't take a shared cart, so you open their listings one at a time. To buy a line with no store link, hover over it and click the link at its right end to search Amazon.

Exports save to your downloads as `<scene>-bom.csv` or `<scene>-bom.md`. For exact supplier numbers, remaining quantities and DigiKey column mapping, see [Export remaining purchases](/help/export-remaining-purchases).

Some lines are added for you. If your design has a battery, you get a switch, fuse, wire and charger. Filament is counted in grams from the printed parts, so it isn't in the **+** menu. If you choose **Made by a Service**, **Printed parts** takes its place, and Basecase doesn't order them.

A [board placement](/help/fit-an-electronics-board) adds its required connectors to the list. Existing regulators and their included headers are counted once.

Cables come from the wiring, one for each hop of each servo bus, starting at the adapter. Once routes are measured, Basecase chooses the shortest compatible stock cable that covers the route through joint motion, including slack. Waveshare 5264 cables come in 300 mm and 900 mm lengths. DYNAMIXEL X servos use the 180 mm **ROBOTIS Robot Cable-X3P**.

Each product and length has its own line, price and on-hand count. Extra cables you add count toward the required quantity only on the same product's line. The remaining pieces round up to whole packs. A route without a suitable known length stays blocked in **Cable reach**, even if a cable appears in the list. [Servo bus or Cable reach is red](/help/troubleshoot-servo-bus) explains unresolved routes.

Power connections use the same routing check. Without a selected compatible cable, the list keeps a pigtail for each battery plug and barrel jack on the power path, such as the XT60 on a LiPo.

To find links for one part, select it and look in the **Product** section of the Inspector. It has **Buy on Amazon** or **Find on Amazon**, **Datasheet** and **Product Page**.

**Note:** Basecase never places an order or reads store pages. You buy everything in the store yourself.

After you buy, record what you paid. See [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
