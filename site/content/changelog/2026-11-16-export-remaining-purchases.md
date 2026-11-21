---
title: Export exact parts left to buy
date: 2026-11-16
image: /changelog/export-remaining-purchases/cover.png
---

You can export exact supplier part numbers and the quantities you need to buy through Build’s CSV Spreadsheet. You get the same columns for every supplier.

If you need three Pico 2 boards and have one on hand, you need to buy two. You also need the exact part number and packaging to order from a supplier. In the listing fields, you can keep distinct manufacturer and supplier numbers, alongside the ordering unit and its conversion to pieces.

You get the existing spreadsheet columns plus remaining units, supplier order quantity, identity source and stable customer references. You get one purchase line for repeated components, with their scene part ids intact. For lines you own in full, you get zero remaining units. If the conversion is unknown, you get a blank supplier order quantity.

Filter the file to the supplier’s remaining purchases before uploading it. Basecase doesn’t upload to DigiKey, check matches or place orders.

Steps and column mapping are in [Export remaining purchases](/help/export-remaining-purchases).
