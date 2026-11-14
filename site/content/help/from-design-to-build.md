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

Basecase measures a design against real parts, your printer, your budget and the hours you have. When it marks a design Ready to build, you can make it.

## Real parts, not guesses

Every part you can buy comes from a real product, with the maker's geometry, datasheet and price. Parts lists only those products, ISO hardware such as screws, nuts and bearings, and basic shapes.

The agent may block out a robot with stand-ins first. A stand-in is a generic servo, board or bracket that's about the right size. It only holds a place, so a design that has one is never ready. If the catalog doesn't have a part, the agent finds a real one and adds it. To learn how, see [Parts the agent sources](/help/parts-the-agent-sources).

## Checks give the verdict

The **Build** tab tells you whether you can build the design. Its **Checks** run in the background about 1.5 seconds after you stop editing. A robot with 225 parts gets its verdict in about 5 seconds.

Each problem is either a blocker or a note:

- A **blocker** stops Ready to build. For example, a screw that no driver can reach, a wall too thin to print, or a servo too weak for its joint.
- A **note** turns a check amber but doesn't change the verdict. For example, a part that needs a lot of support material.

Only you can set a blocker aside, with **Ignore**. The agent can say it disagrees, and the row shows its reason, but nothing the agent writes clears a blocker or changes the verdict. For the full list, see [Checks in the Build tab](/help/build-checks).

## What you buy

Basecase builds the **Bill of materials** from the scene. It counts components by part, and screws and nuts by their exact size. It turns printed parts into grams of filament for each material, then rounds filament up to whole spools with 15% to spare. If you don't have a printer, Slant 3D can quote each printed part instead.

The list also includes things the build needs that the model doesn't show:

- A battery adds a switch, fuse, wire and charger.
- Bus servos add one cable, of the type they plug into, for each hop of their bus.
- Each battery plug or barrel jack on the power path adds a pigtail.

Prices you check in a store are exact. Other prices are list prices, and Basecase marks them with ≈. Parts you own cost nothing.

## How it gets made

Print mode lays out the printed parts on plates in the order the build guide needs them. It slices them in Bambu Studio or OrcaSlicer, then sends each plate to one of your printers. If you don't have a printer, see [Price printed parts from a print service](/help/price-printed-parts-from-a-print-service). If several parts bolt together on one link, Print mode also offers to print them as a single part, as long as the robot still goes together.

The build guide is a PDF of assembly steps. Basecase checks that the parts can go together in that order. The guide names each printed part with a letter, and Print mode cuts that letter into a hidden face of the part.

## What the checks can't promise

- Print times and filament amounts are estimates until Print mode slices the plates.
- Time adds up fixed minutes for each part, screw and servo. Basecase doesn't measure your own build.
- Basecase tests range of motion every 15°, so it can miss a clash narrower than that.
- Peak torque needs a trained walking policy, and stays Not run without one.
- Falls stays Not run until the agent tips the robot over in the simulation.

Open the Build tab and follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
