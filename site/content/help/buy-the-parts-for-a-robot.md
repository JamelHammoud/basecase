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
  - src/utils/bomNeeds.ts
  - src/wiring/netlist.ts
  - src/wiring/wiringSupplies.ts
---

You can buy everything for a robot from its bill of materials. Fill an Amazon cart in one step, open listings in other stores, add the supplies your build needs, and export the list.

1. In the **Build** tab, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Buy All**. Your browser opens an Amazon cart with every line that has an Amazon listing, in whole packs.
3. Below **Buy All**, the menu lists lines from other stores under the store that sells them. Choose a line to open its listing in that store.
4. To add something that isn't in the model, click **+** next to **Bill of materials**.
5. Choose a supply under **Power**, **Wiring**, **Electronics** or **Tools**.
6. To buy more of a supply you added, click its quantity, then change **Quantity**.
7. To save a copy of the list, click the spreadsheet icon, then choose **CSV Spreadsheet** or **Markdown**.

![The bill of materials menu with Buy All for amazon.com, and screws and wire listed under their own stores](/help/buy-the-parts-for-a-robot/buy-all.png)

You can also press [[⌘K]] and choose **Buy All**.

The cart leaves out parts you [already own](/help/count-the-parts-you-already-own). Pack counts come from the price you checked. For example, six servos sold in pairs go in as 3, and 13 screws sold by the hundred go in as 1. If a line has no saved pack size, it goes in by the piece.

Other stores don't take a shared cart, so you open their listings one at a time. If a line has no store link, hover over it and click the link at its right end to search Amazon for it.

Exports save to your Downloads folder as `<scene>-bom.csv` or `<scene>-bom.md`. You can order from either file in any store.

Basecase adds some lines for you:

- If your design has a battery, you get a switch, fuse, wire and charger.
- Basecase counts filament in grams from the printed parts, so it isn't in the **+** menu.
- If you choose **Made by a Service**, **Printed parts** takes the filament's place, and Basecase doesn't order them.
- Cables come from the wiring. You get one for each hop of each servo bus, starting at the adapter. An SO-101 with six STS3215s on a Waveshare adapter, for example, lists 6 **Bus Servo Cable**. DYNAMIXEL X servos get **ROBOTIS Robot Cable-X3P** instead. Any cable you add yourself counts toward that number.
- You get a pigtail for each battery plug and barrel jack on the power path, such as the XT60 on a LiPo.

To find the links for a single part, select it and look in the **Product** section of the Inspector. It has **Buy on Amazon** or **Find on Amazon**, **Datasheet** and **Product Page**.

**Note:** Basecase never places an order or reads store pages. You buy everything in the store yourself.

After you buy, record what you paid. See [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
