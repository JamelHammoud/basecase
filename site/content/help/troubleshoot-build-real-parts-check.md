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

The Real parts check blocks a design until every part is a real product someone can look up and buy.

## “This is a placeholder, not a real part.”

The part is a stand-in, such as a generic servo or board the agent used to block the robot out.

1. In the **Build** tab, click the row in **Bill of materials** that starts with **Replace**, such as Replace 2 stand-ins with real parts. It selects the stand-ins.
2. Click **Fix** on the problem in Checks to have the agent swap in real parts.
3. Or delete a stand-in and drag the real part from **Parts** into its place.

It worked when **Real parts** shows a green mark and the **Replace** row is gone.

## “Nothing says where to get this part.”

The part is made outside your printer, such as a CNC-machined or laser-cut part, and nothing says who makes it.

1. Click **Fix** on the problem to have the agent find a maker for it.
2. Or set the part's **Material** in the Inspector to **Printed PLA / PETG**, if you'll print it.

## “Its link and numbers aren’t checked.”

The agent sourced the part, but its link, its numbers or its 3D model aren't confirmed yet.

1. If the part comes from a store, find its line in **Bill of materials** and click **Add Price**.
2. Type the price you see, then click **Save**. A saved price confirms a store link.
3. If the problem stays, click **Fix**. The agent confirms the link, finds a source for the numbers or imports the maker's 3D model.

Why these rules exist is in [Parts the agent sources](/help/parts-the-agent-sources).

## “No price for” a part

This is a note, so it never blocks Ready to build. The listed parts have no list price and no price you saved.

1. Click **Add Price** on the part's line in **Bill of materials**.
2. Type the price and click **Save**.
