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

Basecase checks a design against real parts, your printer and your budget. If it marks a design Ready to build, you can make it.

## Real parts, not guesses

Every part you can buy comes from a real product, with the maker's geometry, datasheet and price. Parts lists only those products, ISO hardware such as screws, nuts and bearings, and basic shapes.

The agent might block out a robot with stand-ins first. A stand-in is a generic servo, board or bracket that's about the right size. It only holds a place, so a design that has one is never ready. If the catalog doesn't have a part, the agent finds a real one and adds it. Learn more in [Parts the agent sources](/help/parts-the-agent-sources).

## Checks give the verdict

The **Build** tab tells you whether you can build the design. Its **Checks** run in the background about 1.5 seconds after you stop editing. For a robot with 225 parts, the verdict takes about 5 seconds.

Each problem is either a blocker or a note:

- A **blocker** stops Ready to build. A screw that no driver can reach is a blocker, and so are a wall too thin to print and a servo too weak for its joint.
- A **note** turns a check amber but doesn't change the verdict. A part that needs a lot of support material gets a note, for example.

Only you can set a blocker aside, using **Ignore**. The agent can say that it disagrees, and its reason shows in the row, but it can't clear anything. Nothing it writes changes the verdict. For a list of every check, see [Checks in the Build tab](/help/build-checks).

## What you buy

Basecase builds the **Bill of materials** from the scene. It counts components by part, and screws and nuts by their exact size. It lists printed parts as grams of filament for each material, rounded up to whole spools with 15% to spare. If you don't have a printer, Slant 3D can quote each printed part instead.

The list also includes things the build needs that the model doesn't show:

- A battery adds a switch, fuse, wire and charger.
- Bus servos add one cable for each hop of their bus, of the type they plug into.
- Each battery plug or barrel jack on the power path adds a pigtail.

Prices you check in a store are exact. Other prices are list prices, and Basecase marks them with ≈. Parts you own cost nothing.

## How it gets made

Print mode lays out the printed parts on plates, in the order the build guide needs them. It slices them in Bambu Studio or OrcaSlicer, then sends each plate to one of your printers. If you don't have a printer, see [Price printed parts from a print service](/help/price-printed-parts-from-a-print-service). Print mode also offers to print parts that are bolted together on one link as a single part, as long as the robot still goes together.

The build guide is a PDF of assembly steps, and Basecase checks that the parts can go together in that order. The guide names each printed part with a letter, and Print mode cuts that letter into a hidden face of the part.

## What the checks can't promise

Print times and filament amounts are estimates until Print mode slices the plates. Basecase tests range of motion every 15°, so it can miss a clash narrower than that. Peak torque needs a trained walking policy, and stays Not run without one. Falls stays Not run until the agent tips the robot over in the simulation.

To get started, open the Build tab and follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
