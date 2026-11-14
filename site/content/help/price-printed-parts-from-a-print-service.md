---
title: Price printed parts from a print service
date: 2026-11-13
collection: build-and-print
type: task
order: 4
keywords:
  - slant 3d
  - print service
  - no printer
  - quote
  - printed parts
  - print on demand
related:
  - price-the-parts-and-set-a-budget
  - print-a-robots-parts
covers:
  - electron/print/services/index.mjs
  - electron/print/services/slant3d.mjs
  - electron/print/services/slant3dClient.mjs
  - src/components/print/PrintSettings.tsx
  - src/components/settings/PrintServiceAccount.tsx
  - src/print/serviceQuotes.ts
  - src/utils/bomPrinted.ts
  - src/workspace/useServiceQuotes.ts
---

Get a Slant 3D price for every printed part when you have no printer, and count it in the bill of materials and budget.

You must have a Slant 3D API key, made in your account at [slant3dapi.com](https://slant3dapi.com). Quotes work in the desktop app only.

1. Press [[⌘,]] and choose **Accounts**.
2. Under **Slant 3D**, paste your key into **API key** and press [[↩]].

   ![Settings ▸ Accounts with a Slant 3D API key saved](/help/price-printed-parts-from-a-print-service/accounts.png)

3. Press [[⌘P]] to open Print mode.
4. In **Printer**, choose **Made by a Service**.

   ![The Print panel with Made by a Service chosen as the printer](/help/price-printed-parts-from-a-print-service/printer.png)

5. Click **Done**.
6. In the **Build** tab, open **Printed parts** under **Bill of materials**.

![Printed parts in the bill of materials, one line per part with its copies, material and quoted price](/help/price-printed-parts-from-a-print-service/printed-parts.png)

**Printed parts** takes the place of **Filament**. Each printed part is one line, with its copies as the count and its material under its name. Hover a price to see the day it was quoted.

Basecase uploads each part's shape in the pose its plate gives it. Two copies of one part upload once and are priced together. Mirrored left and right parts are two lines.

A part is quoted again when its shape, print face, material or copies change. Until the new price arrives, the old one shows in amber. Infill doesn't change the quote: Slant 3D prints at its own settings.

When Slant 3D doesn't answer, Basecase shows the error once and asks again a minute later. A key you fix in Settings ▸ Accounts is used from then on.

Slant 3D prints PLA and PETG. A part in another material, or one too big for its printers, shows the reason in amber and has no price. Its blockers stay in Checks.

The quote covers printing only, with no shipping and no delivery date. Basecase doesn't place the order.

To go back to filament, choose your printer in **Printer**. The **Filament** section returns as it was.

Budgets and the rest of the prices are in [Price the parts and set a budget](/help/price-the-parts-and-set-a-budget).
