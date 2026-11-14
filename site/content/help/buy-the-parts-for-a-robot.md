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

From the bill of materials, you can fill an Amazon cart, open listings in other stores, add the supplies a build needs, and export the list.

1. In the **Build** tab, click the spreadsheet icon next to **Bill of materials**.
2. Choose **Buy All**. Your browser opens an Amazon cart with every line that has an Amazon listing, in whole packs.
3. To buy a line listed under another store, choose it below **Buy All**. Its listing opens in that store.
4. To add something the model doesn't show, click **+** next to **Bill of materials**.
5. Choose a supply under **Power**, **Wiring**, **Electronics** or **Tools**.
6. To buy more of a supply you added, click its quantity, then change **Quantity**.
7. To keep a copy of the list, click the spreadsheet icon, then choose **CSV Spreadsheet** or **Markdown**.

![The bill of materials menu with Buy All for amazon.com, and screws and wire listed under their own stores](/help/buy-the-parts-for-a-robot/buy-all.png)

Or press [[⌘K]] and choose **Buy All**.

## How the Amazon cart is filled

Basecase leaves any parts you [already own](/help/count-the-parts-you-already-own) out of the cart and works out pack counts from the price you checked. For example, six servos sold in pairs go in as 3, and 13 screws sold by the hundred go in as 1. A line with no saved pack size goes in by the piece.

## Buy from other stores

Other stores don't take a shared cart, so you open their listings one at a time.

To search Amazon for a line with no store link, hover over the line and click the link at its right end.

## Export the list

Basecase saves the export to your downloads as `<scene>-bom.csv` or `<scene>-bom.md`. You can order from either file in any store.

## Lines Basecase adds for you

- If your design has a battery, you get a switch, a fuse, wire, and a charger.
- Filament is counted in grams from the printed parts, so you won't find it in the **+** menu.
- Cables are counted from the wiring: one for each hop of each servo bus, starting at the adapter. For example, an SO-101 with six STS3215s on a Waveshare adapter lists 6 **Bus Servo Cable**. DYNAMIXEL X servos get **ROBOTIS Robot Cable-X3P** instead. Any cable you add yourself counts toward that number.
- You get a pigtail for each battery plug and barrel jack on the power path, such as the XT60 on a LiPo.

## Find links for one part

Select the part, then look in the **Product** section of the Inspector. You'll find **Buy on Amazon** or **Find on Amazon**, along with **Datasheet** and **Product Page**.

**Note:** Basecase never places an order or reads store pages. You buy everything in the store yourself.

To record what you paid after you buy, see [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
