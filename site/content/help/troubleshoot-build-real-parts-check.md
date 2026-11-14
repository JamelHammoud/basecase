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

The Real parts check blocks a design until every part is a real product you can look up and buy.

## “This is a placeholder, not a real part.”

This part is a stand-in, like a generic servo or board the agent used to block out the robot.

1. In the **Build** tab, click the row in **Bill of materials** that starts with **Replace** (for example, Replace 2 stand-ins with real parts). Clicking it selects the stand-ins.
2. Click **Fix** on the problem in Checks to have the agent swap in real parts.
3. Or delete a stand-in, then drag the real part from **Parts** into its place.

When it works, **Real parts** shows a green mark and the **Replace** row is gone.

## “Nothing says where to get this part.”

This part comes from somewhere other than your printer, like a CNC-machined or laser-cut part, and nothing names its maker.

1. Click **Fix** on the problem to have the agent find a maker for it.
2. Or, if you'll print the part yourself, set its **Material** in the Inspector to **Printed PLA / PETG**.

## “Its link and numbers aren’t checked.”

The agent sourced this part, but nobody has confirmed its link, its numbers or its 3D model.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. Saving a price confirms the store link.
3. If the problem stays, click **Fix**. The agent confirms the link, finds a source for the numbers or imports the maker's 3D model.

[Parts the agent sources](/help/parts-the-agent-sources) explains why these rules exist.

## “No price for” a part

This message is a note and doesn't block Ready to build. The parts it lists have no list price, and you haven't saved a price for them. If you already own enough of a part, it doesn't need a price.

1. Click **Add Price** on the part's line in **Bill of materials**.
2. Type the price, then click **Save**.
