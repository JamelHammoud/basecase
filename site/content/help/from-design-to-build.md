---
title: The path from design to build
date: 2026-11-13
updated: 2026-11-14
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

Basecase checks your design against real parts, your printer, and your budget. When it marks a design Ready to build, you can make it.

## Real parts, not guesses

Every part you can buy in Basecase comes from a real product, with the maker's geometry, datasheet, and price. Parts lists only those products, ISO hardware such as screws, nuts, and bearings, and basic shapes.

The agent may block out a robot with stand-ins. These are generic servos, boards, or brackets of about the right size that hold a place in the design. A design that contains a stand-in never reaches Ready to build. If the catalog doesn't have a part, the agent finds a real one and adds it. To learn more, see [Parts the agent sources](/help/parts-the-agent-sources).

## Checks give the verdict

The **Build** tab tells you whether you can build the design. Basecase runs its **Checks** in the background about 1.5 seconds after you stop editing. For a robot with 225 parts, the verdict arrives in about 5 seconds.

Each problem counts as either a blocker or a note:

- A **blocker** keeps the design from being Ready to build. For example, a screw that no driver can reach, a wall too thin to print, or a servo too weak for its joint.
- A **note** turns a check amber but doesn't change the verdict. For example, a part that needs a lot of support material.

Only you can set a blocker aside, using **Ignore**. The agent can disagree and write its reason in the row, but it can't clear anything, and nothing it writes changes the verdict. For the full list, see [Checks in the Build tab](/help/build-checks).

## What you buy

Basecase builds the **Bill of materials** from the scene:

- Components are counted by part.
- Screws and nuts are counted by their exact size.
- Printed parts become grams of filament for each material, rounded up to whole spools with 15% to spare.
- Parts [cut from sheet](/help/cut-a-part-from-sheet) are listed by material and thickness.

If you don't have a printer, Slant 3D can quote each printed part.

The list also includes things the build needs that the model doesn't show:

- A battery adds a switch, a fuse, wire, and a charger.
- Bus servos add one cable for each hop of their bus, of the type the servos plug into.
- Each battery plug or barrel jack on the power path adds a pigtail.

A price you check in a store is exact. Every other price is a list price, marked with ≈. Parts you own cost nothing.

## How it gets made

Print mode lays out the printed parts on plates in the order the build guide needs them. It slices the plates in Bambu Studio or OrcaSlicer, then sends each plate to one of your printers. If you don't have a printer, see [Price printed parts from a print service](/help/price-printed-parts-from-a-print-service).

When parts on one link are bolted together, Print mode can offer to print them as a single part, as long as the robot can still go together with the merged part.

The build guide is a PDF of assembly steps, and Basecase checks that the parts can go together in that order. Each printed part gets a letter in the guide, and Print mode cuts that letter into a hidden face of the part.

## What the checks can't promise

- Print times and filament amounts are estimates until Print mode slices the plates.
- Basecase tests range of motion every 15°, so it can miss a clash narrower than that.
- Peak torque stays at Not run until the robot has a trained walking policy.
- Falls stays at Not run until the agent tips the robot over in the simulation.

Open the Build tab, then follow the steps in [Get a robot ready to build](/help/get-a-robot-ready-to-build).
