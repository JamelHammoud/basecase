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

The Real parts check blocks a design until each part in it is a real product you can look up and buy.

## “This is a placeholder, not a real part.”

The agent used this part as a stand-in to block out the robot, such as a generic servo or board.

1. In the **Build** tab, click the **Bill of materials** row that starts with **Replace** (for example, Replace 2 stand-ins with real parts) to select the stand-ins.
2. Click **Fix** on the problem in Checks to have the agent swap in real parts.
3. Or delete a stand-in, then drag the real part from **Parts** into its place.

After a successful fix, **Real parts** shows a green mark and the **Replace** row disappears.

## “Nothing says where to get this part.”

The part's **Material** says **Off-the-shelf**, so it comes from somewhere other than your printer, but no maker is named for it.

1. Click **Fix** on the problem to have the agent find a maker for it.
2. Or, if you plan to print the part yourself, set its **Material** in the Inspector to **Printed PLA / PETG**.

## “Its link and numbers aren’t checked.”

The agent sourced this part without confirming its link, its numbers or its 3D model.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. Saving the price confirms the store link.
3. If the problem stays, click **Fix**. The agent confirms the link, finds a source for the numbers or imports the maker's 3D model.

Learn why these rules exist in [Parts the agent sources](/help/parts-the-agent-sources).

## “No price for” a part

This note doesn't block Ready to build. It lists parts with no list price and no price you've saved. A part you own enough of doesn't need a price.

1. Click **Add Price** on the part's line in **Bill of materials**.
2. Type the price, then click **Save**.

Lines under **Printed parts** have no **Add Price**, since their price comes from the [print service's quote](/help/price-printed-parts-from-a-print-service). If the service can't print a part, its line gives the reason in amber.
