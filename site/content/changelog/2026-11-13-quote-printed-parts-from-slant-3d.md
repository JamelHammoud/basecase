---
title: Quote printed parts from Slant 3D
date: 2026-11-13
image: /changelog/quote-printed-parts-from-slant-3d/cover.png
---

You can now get a Slant 3D price for every printed part, so a robot's cost is real without a printer. It works in the desktop app, and quotes only.

Someone finishing a first rover with no printer used to get filament in grams and spools. That isn't a price, and it isn't a way to get the parts made. Print services price one file at a time and know nothing about the robot.

Basecase knows each part's material, copies and print face. It uploads each part's shape and asks Slant 3D's estimate API for a price. The bill of materials then lists Printed parts in place of Filament, one line per part, and Budget counts the quoted total. Two copies of one part upload once. An edited part is quoted again on its own, and its old price shows in amber until then.

Slant 3D prints PLA and PETG. A part in another material, or too big for its printers, shows the service's reason and no price. Quotes cover printing only, with no shipping or delivery date, and Basecase doesn't place the order.

Steps are in [Price printed parts from a print service](/help/price-printed-parts-from-a-print-service).
