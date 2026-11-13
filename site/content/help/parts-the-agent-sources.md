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

When the catalog lacks a part, the agent finds a real one online and adds it to Parts, marked Added by Agent.

## How a part gets added

Ask the agent for a part by name or with a link. It opens the maker's page and looks for the part number before it saves anything. When the maker publishes a STEP or IGES model, the agent downloads it, converts it and checks its size against the datasheet. Holes that go through the part become mounting points, like a catalog part's.

The part joins **Parts** at once, under **Added by Agent** in **Components**. Parts with no 3D model yet are listed under **Needs a 3D Model**. They can't be placed, so each opens its product page instead.

## On the bill of materials

Sourced parts have their own section, **Added by Agent**. Materials and equipment the agent found have no shape, so they appear under **Materials** or **Equipment**. Their prices are estimates until you save the price you see with **Add Price**.

## When a sourced part counts as real

A finished robot uses only parts someone can look up. The **Real parts** check blocks a sourced part until all of these hold:

- Its link is confirmed. A store link counts once you save a price for that line.
- Its numbers, such as torque or voltage, come from a named source.
- It has the maker's geometry, if it takes up space in the robot.
- Its CAD matches the datasheet's size.

Until then, the check reads “Its link and numbers aren’t checked”.

Amazon links are never opened by the app, so an Amazon part waits for your price.

## Limits

Sourcing runs in the desktop app, where the agent runs. A sourced part's model stays on the computer that added it. A shared scene keeps the part's record, but not its 3D model.

What to do when the check stays red is in [Real parts check lists placeholders or unchecked parts](/help/troubleshoot-build-real-parts-check).
