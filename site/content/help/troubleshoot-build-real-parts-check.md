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

The Real parts check blocks a design until every part is a real product that you can look up and buy. Find the message you see below, then follow its steps.

## “This is a placeholder, not a real part.”

The part is a stand-in, such as a generic servo or board that the agent used to block out the robot.

1. In the **Build** tab, click the row in **Bill of materials** that starts with **Replace** (for example, Replace 2 stand-ins with real parts). This selects the stand-ins.
2. To have the agent swap in real parts, click **Fix** on the problem in Checks.
3. Or delete a stand-in, then drag the real part from **Parts** into its place.

If the fix worked, **Real parts** shows a green mark and the **Replace** row is gone.

## “Nothing says where to get this part.”

The part doesn't come from your printer. It might be CNC-machined or laser-cut, for example, and nothing names who makes it.

1. To have the agent find a maker for the part, click **Fix** on the problem.
2. Or, if you'll print the part yourself, select it and set its **Material** in the Inspector to **Printed PLA / PETG**.

## “Its link and numbers aren’t checked.”

The agent sourced this part, but nobody has confirmed its link, its numbers, or its 3D model yet.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. Saving a price also confirms the store link.
3. If the problem is still there, click **Fix**. The agent confirms the link, finds a source for the numbers, or imports the maker's 3D model.

To learn why these rules exist, see [Parts the agent sources](/help/parts-the-agent-sources).

## “No price for” a part

This message is only a note and doesn't block Ready to build. It means the parts it lists have no list price and you haven't saved a price for them. If you already own enough of a part, that part doesn't need a price.

1. On the part's line in **Bill of materials**, click **Add Price**.
2. Type the price, then click **Save**.
