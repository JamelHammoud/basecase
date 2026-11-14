---
title: The path from design to build
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: concept
order: 1
keywords:
  - buildable
  - manufacturable
  - assembly
  - readiness
  - blocker
related:
  - get-a-robot-ready-to-build
  - build-checks
  - price-the-parts-and-set-a-budget
  - print-a-robots-parts
covers:
  - src/readiness/
  - src/workspace/runReadiness.ts
  - src/components/BuildPanel.tsx
  - src/utils/bom.ts
  - src/utils/bomNeeds.ts
  - src/utils/engineering.ts
  - src/print/
  - src/guide/
---

Basecase measures a design against real parts, your printer and your budget, so Ready to build means you can make it.

## Real parts, not guesses

Every part you can buy comes from a real product with the maker's geometry, datasheet and price. Parts lists only those, plus ISO hardware like screws, nuts and bearings, and basic shapes.

The agent may block a robot out with stand-ins first: a generic servo, board or bracket of roughly the right size. A stand-in is a placeholder, so a design with one is never ready. When the catalog lacks a part, the agent finds a real one and adds it, as [Parts the agent sources](/help/parts-the-agent-sources) explains.

## Checks give the verdict

The **Build** tab answers one question: can this be built? Its **Checks** run on their own about 1.5 seconds after you stop editing, in the background. On a 225-part robot a verdict takes about 5 seconds.

Each problem is a blocker or a note:

- A **blocker** stops Ready to build. A screw no driver can reach, a wall too thin to print or a servo too weak for its joint are blockers.
- A **note** turns a check amber and never changes the verdict. A part that needs a lot of support material is a note.

Only you can set a blocker aside, with **Ignore**. The agent can say it disagrees, and the row shows its reason, but it can't clear anything. Text the agent writes never changes the verdict either. [Checks in the Build tab](/help/build-checks) lists every check.

## What you buy

The **Bill of materials** is built from the scene. Components count by part, screws and nuts by their exact size, and printed parts become grams of filament per material. Filament rounds up to whole spools with 15% to spare.

What the build needs but the model doesn't show joins the list too. A battery brings a switch, fuse, wire and charger. Bus servos bring one cable per hop of their bus, of the type they plug into, and each battery plug or barrel jack on the power path brings a pigtail. Prices you check in a store are exact; the rest are list prices, marked ≈. Parts you own cost nothing.

## How it gets made

Print mode lays the printed parts out on your printer's plates, slices them in Bambu Studio or OrcaSlicer and sends them. It also offers to print parts bolted together on one link as one part, when the robot still goes together. The build guide is a PDF of assembly steps, in an order Basecase checked the parts can go together.

## What the checks can't promise

Print times and filament are estimates until the plates are sliced. Range of motion is tested every 15°, so a clash thinner than that step can slip through. Peak torque needs a trained walking policy, and stays Not run without one. Falls stays Not run until the agent tips the robot over in the simulation.

To start, open the Build tab and follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
