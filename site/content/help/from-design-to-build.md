---
title: The path from design to build
date: 2026-11-13
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

Basecase measures a design against real parts, your printer, your money budget and your time budget. Checks decide whether it is Ready to build.

## Real parts, not guesses

Every part you can buy comes from a real product, with the maker's geometry, datasheet and price. Parts lists only those products, ISO hardware like screws, nuts and bearings, and basic shapes.

The agent may block out a robot with stand-ins first: a generic servo, board or bracket about the right size. A stand-in only holds a place, so a design that has one is never ready. If the catalog doesn't have a part, the agent finds a real one and adds it, as [Parts the agent sources](/help/parts-the-agent-sources) explains.

## Checks give the verdict

The **Build** tab tells you whether you can build the design. Its **Checks** run in the background about 1.5 seconds after you stop editing. A robot with 225 parts gets its verdict in about 5 seconds.

Each problem counts as a blocker or a note:

- A **blocker** stops Ready to build. A screw that no driver can reach is a blocker, and so is a wall too thin to print or a servo too weak for its joint.
- A **note** turns a check amber but doesn't change the verdict. A part that needs a lot of support material gets a note.

Only you can set a blocker aside, with **Ignore**. The agent can say it disagrees, and the row shows its reason. But the agent can't clear anything, and nothing it writes changes the verdict. [Checks in the Build tab](/help/build-checks) lists every check.

## What you buy

Basecase builds the **Bill of materials** from the scene. It counts components by part, and screws and nuts by their exact size. Printed parts become grams of filament for each material, and Basecase rounds filament up to whole spools with 15% to spare. If you don't have a printer, Slant 3D can quote each printed part instead.

Flat parts assigned a sheet material appear under **Sheet**, grouped by material and thickness. They don't count toward filament or print service quotes.

The list also includes things the build needs that the model doesn't show:

- A battery adds a switch, fuse, wire and charger.
- Bus servos add one cable for each measured hop, grouped by the selected product and length.
- Each battery plug or barrel jack on the power path adds a pigtail.

Prices you check in a store are exact. The others are list prices, and Basecase marks them with ≈. Parts you own cost nothing.

**Cable reach** checks these same connections through joint motion. A blocked route, missing port geometry or insufficient cable length stops Ready to build. [Servo bus or Cable reach is red](/help/troubleshoot-servo-bus) explains the findings. [Build Along](/help/build-along) shows each connection when both endpoints are installed.

## How it gets made

Print mode lays out the printed parts on plates in the order the build guide needs them, slices them in Bambu Studio or OrcaSlicer, and then sends each plate to one of your printers. If you don't have a printer, see [Price printed parts from a print service](/help/price-printed-parts-from-a-print-service). If the robot still goes together, Print mode also offers to print parts that are bolted together on one link as a single part.

For flat structural parts, [Cut parts from sheet](/help/cut-parts-from-sheet) exports DXF outlines for aluminum, carbon fiber or acrylic. Checks and simulation start with the sheet's solid volume and material density for weight and torque. An active [body fit](/help/fit-a-robots-body-from-a-recorded-run) adjusts those weights and adds the fitted payload. Shop limits, sheet prices, bends and press-in hardware aren't checked.

The build guide is a PDF of assembly steps. Basecase checks that the parts can go together in that order. The guide names each printed part with a letter, and Print mode cuts that letter into a hidden face of the part.

For a broken part, [Repair a part](/help/repair-a-part) plays the measured teardown, replacement and reassembly in Build Along. A printed replacement gets a one-part plate, even if its shape hasn't changed. Repair needs a measured removal path and proven reassembly order.

To fit a weekend build into the hours available, [set a time budget](/help/set-a-time-budget) beside the money budget. The Time check adds printing, estimated assembly and servo setup. It fails over budget, warns above 90%, and remains a note without a budget.

## What the checks can't promise

An imported Onshape robot can be ready to build with motions held fixed. Cylindrical mates keep their hinges, with their slides listed under **Fixed Mates** as notes. [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly) explains which mates move and how to bring in changes.

Print times and filament amounts are estimates until Print mode slices the plates. Basecase tests range of motion every 15°, so it can miss a clash narrower than that. Peak torque needs a trained walking policy and stays Not run without one. Falls stays Not run until the agent tips the robot over in the simulation.

Time keeps assembly and servo setup as estimates after slicing. It excludes delivery, failed prints and print service lead times.

Open the Build tab and follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
