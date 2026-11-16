---
title: Export remaining purchases
date: 2026-11-16
collection: build-and-print
type: task
keywords:
  - DigiKey
  - MyLists
  - supplier
  - manufacturer part number
  - csv
related:
  - buy-the-parts-for-a-robot
  - count-the-parts-you-already-own
covers:
  - src/components/build/CheckSheet.tsx
  - src/components/build/IdentityFields.tsx
  - src/components/build/purchaseForm.ts
  - src/utils/bomFormat.ts
  - src/utils/purchaseIdentity.ts
---

Use the robot’s spreadsheet export to send a supplier the exact part numbers and quantities you have left to buy.

1. In **Build**, expand the component’s section under **Bill of materials**.
2. On its line, click the price or **Add Price**.
3. In **Listing**, enter the product link and the exact manufacturer and supplier part numbers from that listing.
4. Fill **Ordering unit** with the listing’s order unit, such as piece or reel.
5. Fill **Units per order** with the number of BOM units in that order unit.
6. Fill **Price** with the price for the listing’s pack.
7. Click **Save**.
8. On the component’s line, click its quantity and enter **On hand** as individual pieces.
9. Next to **Bill of materials**, click the spreadsheet icon.
10. Choose **CSV Spreadsheet**.

![Raspberry Pi Pico 2 listing with separate manufacturer and DigiKey part numbers and one piece per order](/help/export-remaining-purchases/identity.png)

![The spreadsheet menu beside a bill of materials with two Pico 2 boards left to buy and one on hand](/help/export-remaining-purchases/export.png)

Basecase names the download `<scene>-bom.csv` and includes every BOM line, including parts you have enough of with zero remaining units.

To send the file to DigiKey, keep DigiKey rows with a positive Supplier Order Qty. In [DigiKey MyLists](https://www.digikey.com/en/mylists), upload the file and map Supplier Part Number, Supplier Order Qty and Customer Reference. Review the matched parts and packaging before ordering. For other suppliers, filter by Supplier before uploading. Their lines use the same fields.

Read Remaining Units in the units from the Unit column: pieces or grams after subtracting stock. Read Supplier Order Qty as the number of ordering units you entered. For three Pico 2 boards with one on hand, a cut-tape listing sold by the piece exports 2 remaining units and an order quantity of 2. Use Packs to Buy for the pack count used in the saved listing’s price and Amazon cart.

If Supplier Order Qty is blank, check for a missing identity, order unit or conversion. Keep the listing link and correct the fields before ordering. For descriptive catalog numbers, Basecase leaves the fields blank until you supply an exact number. If you change the listing link, Basecase clears its identity fields. Enter the new listing’s details before saving.

In Customer Reference, Basecase keeps the BOM key. In Component References, it keeps every scene part id on that line, even when names repeat. Basecase adds an apostrophe before formula-like text so spreadsheet applications read it as text.

Basecase exports the file without connecting to a supplier account. It doesn’t upload the file, confirm supplier matches or place an order.
