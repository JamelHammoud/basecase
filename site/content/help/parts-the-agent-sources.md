---
title: Parts the agent sources
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: concept
order: 2
keywords:
  - added by agent
  - sourcing
  - sourced parts
  - not in catalog
  - step file
  - maker cad
  - referenceable
related:
  - buy-the-parts-for-a-robot
  - troubleshoot-build-real-parts-check
  - from-design-to-build
covers:
  - src/data/sourcedItems.ts
  - electron/backend/sourced.mjs
  - electron/cadImport/
  - src/components/parts/AddedByAgent.tsx
  - src/readiness/buildChecks.ts
  - src/utils/bom.ts
---

If the catalog doesn't have the part you need, the agent finds a real one online and adds it to Parts, marked Added by Agent.

## How a part gets added

Ask the agent for a part by name or with a link. Before it saves anything, the agent opens the maker's page and looks for the part number. If the maker publishes a STEP or IGES model, the agent downloads it, converts it and checks its size against the datasheet. You get a mounting point at each through-hole, as you do on a catalog part.

The part appears in **Parts** at once, under **Added by Agent** in **Components**. Parts that don't have a 3D model yet are listed under **Needs a 3D model**. You can't place these in the scene, so each one opens its product page instead.

## On the bill of materials

The bill of materials gives sourced parts their own section, **Added by Agent**. Materials and equipment the agent found have no shape, so the bill lists them under **Materials** or **Equipment**.

Prices for sourced items stay estimates until you save the price you see with **Add Price**.

## When a sourced part counts as real

A finished robot uses only parts someone can look up. The **Real parts** check blocks a sourced part until it meets all four of these:

- Its link is confirmed. A store link counts once you save a price for that line.
- Its numbers, such as torque or voltage, come from a named source.
- It has the maker's geometry, if it takes up space in the robot.
- Its CAD matches the size in the datasheet.

Until then, the check reads “Its link and numbers aren’t checked”.

The app never opens Amazon links, so an Amazon part waits until you save a price for it.

## Limits

- Sourcing works in the desktop app, where the agent runs.
- A sourced part's 3D model stays on the computer that added it. If you share the scene, the part's record goes with it, but the model doesn't.

If the check stays red, see [Real parts check lists placeholders or unchecked parts](/help/troubleshoot-build-real-parts-check).
