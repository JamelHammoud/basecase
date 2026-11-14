---
title: Buy the parts for a robot
date: 2026-11-13
updated: 2026-11-14
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
  - src/components/build/AddSupplyMenu.tsx
  - src/components/build/QtyEditor.tsx
  - src/components/PartDetails.tsx
  - src/utils/shopLink.ts
  - src/utils/bomNeeds.ts
  - src/wiring/netlist.ts
  - src/wiring/wiringSupplies.ts
---

Use the bill of materials as your shopping list. You can fill an Amazon cart from it, open listings in other stores, add the supplies a build needs, and export the list.

1. In the **Build** tab, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Buy All**. Your browser opens an Amazon cart with every line that has an Amazon listing, in whole packs.
3. Below **Buy All**, choose each line listed under another store to open its listing in that store.
4. To add something the model doesn't show, click **+** next to **Bill of materials**.
5. Choose a supply under **Power**, **Wiring**, **Electronics**, or **Tools**.
6. To buy more of a supply you added, click its quantity, then change **Quantity**.
7. To keep a copy of the list, click the spreadsheet icon, then choose **CSV Spreadsheet** or **Markdown**.

![The bill of materials menu with Buy All for amazon.com, and screws and wire listed under their own stores](/help/buy-the-parts-for-a-robot/buy-all.png)

You can also press [[⌘K]] and choose **Buy All**.

**Buy All** skips parts you [already own](/help/count-the-parts-you-already-own) and counts whole packs from the price you checked. Six servos sold in pairs go in as 3 packs, and 13 screws sold by the hundred go in as 1. A line with no saved pack size goes in by the piece.

Other stores don't take a shared cart, so you open their listings one at a time. To buy a line with no store link, hover over it and click **Find on Amazon** at its right end.

Basecase saves exports to your Downloads folder as `<scene>-bom.csv` or `<scene>-bom.md`. You can order from either file in any store.

Basecase adds some lines for you:

- If your design has a battery, you get a switch, fuse, wire, and charger.
- You also get a pigtail for each battery plug and barrel jack on the power path, such as the XT60 on a LiPo.
- Filament is counted in grams from the printed parts, so the **+** menu doesn't list it. If you choose **Made by a Service**, **Printed parts** takes its place, and Basecase doesn't order them.
- Cables come from the wiring, one for each hop of each servo bus, starting at the adapter. An SO-101 with six STS3215s on a Waveshare adapter lists 6 **Bus Servo Cable**. DYNAMIXEL X servos get **ROBOTIS Robot Cable-X3P** instead. Any cable you add yourself counts toward that number.

To see the links for a single part, select it and look in the **Product** section of the Inspector. It shows **Buy on Amazon** or **Find on Amazon**, **Datasheet**, and **Product Page**.

**Note:** Basecase never places an order or reads store pages. You buy everything in the store yourself.

After you buy, record what you paid. See [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
