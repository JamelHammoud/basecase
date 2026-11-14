---
title: Real parts check lists placeholders or unchecked parts
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 2
keywords:
  - stand-in
  - placeholder
  - block-out
  - no source
  - unconfirmed
  - added by agent
  - missing price
related:
  - parts-the-agent-sources
  - troubleshoot-build-check-blocks-ready-to-build
  - price-the-parts-and-set-a-budget
covers:
  - src/readiness/wording.ts
  - src/readiness/buildChecks.ts
  - src/data/sourcedItems.ts
  - src/components/build/BuyList.tsx
  - src/utils/bom.ts
---

The Real parts check blocks a design until every part is a real product you can look up and buy. Find the message you see below, then follow its steps.

## “This is a placeholder, not a real part.”

This part is a stand-in, such as a generic servo or board the agent used to block out the robot. To replace it:

1. In the **Build** tab, click the row in **Bill of materials** that starts with **Replace** (for example, Replace 2 stand-ins with real parts). This selects the stand-ins.
2. Click **Fix** on the problem in Checks. The agent swaps in real parts.
3. Or delete a stand-in, then drag the real part from **Parts** into its place.

If it worked, **Real parts** shows a green mark and the **Replace** row is gone.

## “Nothing says where to get this part.”

This part doesn't come from your printer, and no maker is listed for it. It might be a CNC-machined or laser-cut part, for example.

1. Click **Fix** on the problem, and the agent finds a maker for it.
2. Or, if you plan to print the part yourself, select it and set its **Material** in the Inspector to **Printed PLA / PETG**.

## “Its link and numbers aren’t checked.”

The agent sourced this part, but nobody has confirmed its link, its numbers or its 3D model.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. Saving a price also confirms the store link.
3. If the problem is still there, click **Fix**. The agent confirms the link, finds a source for the numbers, or imports the maker's 3D model.

The rules behind this check are explained in [Parts the agent sources](/help/parts-the-agent-sources).

## “No price for” a part

This message is a note and doesn't block Ready to build. It lists parts that have no list price and no price you've saved. If you already own enough of a part, that part doesn't need a price.

To add a price:

1. Click **Add Price** on the part's line in **Bill of materials**.
2. Type the price, then click **Save**.

A line under **Printed parts** has no **Add Price**. Its price comes from the [print service's quote](/help/price-printed-parts-from-a-print-service). If the service can't print a part, its line says why in amber.
