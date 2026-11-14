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

You can buy a robot's parts from its bill of materials: fill an Amazon cart, open listings in other stores, add the supplies a build needs, and export the list.

1. In the **Build** tab, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Buy All**. Your browser opens an Amazon cart with every line that has an Amazon listing, in whole packs.
3. Below **Buy All**, choose each line listed under another store. Its listing opens in that store.
4. To add something the model doesn't show, click **+** next to **Bill of materials**.
5. Choose a supply under **Power**, **Wiring**, **Electronics** or **Tools**.
6. To buy more of a supply you added, click its quantity, then change **Quantity**.
7. To keep a copy of the list, click the spreadsheet icon, then choose **CSV Spreadsheet** or **Markdown**.

![The bill of materials menu with Buy All for amazon.com, and screws and wire listed under their own stores](/help/buy-the-parts-for-a-robot/buy-all.png)

You can also press [[⌘K]] and choose **Buy All**.

Basecase leaves parts you [already own](/help/count-the-parts-you-already-own) out of the cart. Pack counts come from the price you checked. For example, six servos sold in pairs go in as 3, and 13 screws sold by the hundred go in as 1. If a line has no saved pack size, it goes in by the piece.

Other stores don't take a shared cart, so you open their listings one at a time. If a line has only an Amazon search and no listing, hover over the line, then click **Find on Amazon** at its right end.

Exports save to your downloads as `<scene>-bom.csv` or `<scene>-bom.md`, and you can order from either file in any store.

Basecase adds some lines on its own. If your design has a battery, the list gets a switch, fuse, wire and charger. Basecase counts filament in grams from the printed parts, so filament isn't in the **+** menu. If you choose **Made by a Service**, **Printed parts** replaces the filament, and Basecase doesn't order those parts.

Basecase also adds a cable for each hop of each servo bus in the wiring, starting at the adapter. For example, an SO-101 with six STS3215s on a Waveshare adapter lists 6 **Bus Servo Cable**. DYNAMIXEL X servos get **ROBOTIS Robot Cable-X3P** instead. Any cable you add yourself counts toward that number. For each battery plug and barrel jack on the power path, such as the XT60 on a LiPo, you also get a pigtail.

To find the links for a single part, select it, then look in the **Product** section of the Inspector for **Buy on Amazon** or **Find on Amazon**, **Datasheet** and **Product Page**.

**Note:** Basecase never places an order or reads store pages. You buy everything in the store yourself.

After you buy, record what you paid. See [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
