---
title: Parts, assemblies and mounting ports
date: 2026-11-13
updated: 2026-11-13
collection: design
type: concept
order: 1
keywords:
  - part types
  - component
  - hardware
  - stand-in
  - placeholder
  - block-out
  - assembly
  - mate
  - mates
  - fasten
  - ports
  - mounting holes
  - datum
  - added by agent
related:
  - add-parts-from-the-catalog
  - checks-and-blockers
covers:
  - src/data/components.ts
  - src/data/componentPorts.ts
  - src/types/ports.ts
  - src/agent/ports.ts
  - src/utils/bom.ts
  - src/readiness/buildChecks.ts
  - docs/guide/parts-catalog.md
---

What a part is made from decides whether you can resize it, whether it's printed or bought, and how other parts fasten to it.

## Kinds of parts

| Kind | Where it comes from | Printed |
|---|---|---|
| Component | **Parts** ▸ **Components**: servos, boards, sensors, hands | No, bought |
| Hardware | **Parts** ▸ **Hardware**: screws, nuts, inserts, bearings | No, bought |
| Shape | **Shapes**, Sketch, Import SVG, Sculpt | Yes |
| Agent part | Modeled by the agent in CAD code | Yes |
| Imported mesh | Import, including STEP and IGES bodies | Yes |
| Robot link | Import Robot or **Robots** | No |

A shape, agent part or imported mesh is printed until you change its material under **Appearance**. Components keep the maker's exact size, so they can't be resized. Hardware changes size through its own **Size** and **Length** choices.

## Real components are never estimates

Every component in **Parts** is a real product with exact geometry. Its mesh comes from the maker's CAD file, or is modeled from the maker's drawing when there isn't one. A third-party file only ships after it's measured against the maker's drawing to about 0.1 mm.

The **Product** section in the Inspector shows the maker, part number, mounting notes, where the 3D model came from and links to buy it. Parts the agent finds outside the catalog appear under **Added by Agent**, with their link and source.

Estimated stand-ins, such as a generic servo or bracket, never appear in **Parts**. The agent can block out a design with them, and Checks list each one as a placeholder to replace.

## Assemblies

A robot is an assembly: parts held together by screws, inserts and nuts, with joints where they move. Groups only organize parts; they don't hold anything together.

Checks read the assembly as it's modeled. They ask whether every part is attached, every screw grips something, and there's an order in which it all goes together. [Build tab checks](/help/build-checks) lists each one.

## Mounting ports

Every component carries mounting ports: named holes, bores, bosses, faces and outputs, each with a position and a direction. They're measured from the maker's mesh and tested against it.

The Feetech STS3215 servo, for example, has:

- an output horn 19.95 mm across, with four M3 holes 3 mm deep on a 14 mm circle;
- an idler horn with the same pattern on the underside;
- four M2 holes on the top of the case and four on the bottom.

Hardware has ports too, and parts the agent models declare their own in their code.

The agent places parts by their ports. It mates a port on one part to a port on another: fastened, on the same axis, face to face, press fit or sliding. The mate is kept: when the agent moves or remodels either part, it's applied again. Dragging a mated part yourself releases the mate.

To join two parts with a screw, the agent picks the stock length from what the screw passes through. It adds the washer, insert or nut, and cuts the holes in the parts it modeled.

Checks use the ports too. A screw that threads into a component more than 1 mm from every hole is a blocker. So is one that goes deeper than its hole. Servo alignment reads each servo's output to see that it sits on its joint's axis.
