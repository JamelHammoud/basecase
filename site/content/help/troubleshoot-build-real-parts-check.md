---
title: Real parts check lists placeholders or unchecked parts
date: 2026-11-13
updated: 2026-11-14
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
  - sheet
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
  - src/sheet/detect.ts
---

The Real parts check blocks a design until every part in it is a real product you can look up and buy. Find your message below, then follow the steps under it.

## “This is a placeholder, not a real part.”

The agent blocked out the robot with a stand-in for this part, such as a generic servo or board.

1. In the **Build** tab, click the row in **Bill of materials** that starts with **Replace** (for example, Replace 2 stand-ins with real parts). This selects the stand-ins.
2. Click **Fix** on the problem in Checks. The agent swaps in real parts.
3. Or delete a stand-in, then drag the real part from **Parts** into its place.

When the real parts are in place, **Real parts** shows a green mark and the **Replace** row goes away.

## “Nothing says where to get this part.”

The part's **Material** is **Off-the-shelf**, so it won't come from your printer. But the part doesn't name a maker.

1. Click **Fix** on the problem. The agent finds a maker for the part.
2. Or, if you plan to print the part yourself, set its **Material** in the Inspector to **Printed PLA / PETG**.

## “This part isn’t a flat plate, so it can’t be cut from sheet.”

The part's **Material** is **Cut from sheet**, but the part isn't flat anymore: it has a pocket, a chamfer or a thickness over 20 mm. You also see this message on a solid block that an older scene marked CNC aluminum.

1. Click **Fix** on the problem. The agent makes the part flat again or prints it.
2. Or set its **Material** in the Inspector to **Printed PLA / PETG**.

For what counts as flat, see [Cut a flat part from sheet](/help/cut-a-flat-part-from-sheet).

## “Its link and numbers aren’t checked.”

The agent sourced this part, but it didn't confirm the part's link, its numbers or its 3D model.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. Saving the price confirms the store link.
3. If the problem is still there, click **Fix**. The agent confirms the link, finds a source for the numbers or imports the maker's 3D model.

To learn the reasons for these rules, see [Parts the agent sources](/help/parts-the-agent-sources).

## “No price for” a part

This note lists parts that have no list price and no price you've saved. It doesn't block Ready to build. A part you own enough of needs no price.

1. Click **Add Price** on the part's line in **Bill of materials**.
2. Type the price, then click **Save**.

**Note:** Lines under **Printed parts** don't have **Add Price**. Their price comes from the [print service's quote](/help/price-printed-parts-from-a-print-service). If the service can't print a part, its line shows the reason in amber.
