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
  - src/data/connectorPorts.ts
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
| Robot link | Import Robot or **Parts** ▸ **Robots** | No |

Shapes, agent parts and imported meshes are printed until you change their material under **Appearance**. Components keep the maker's exact size, so you can't resize them. To change the size of hardware, use its **Size** and **Length** choices.

## Real components are never estimates

Every component in **Parts** is a real product with exact geometry. Its mesh comes from the maker's CAD file, or from the maker's drawing if the maker doesn't provide a CAD file. A third-party file ships only after it's measured against the maker's drawing to about 0.1 mm.

Select a component to see its **Product** section in the Inspector. It shows the maker, the part number, mounting notes, where the 3D model came from, and links to buy the part.

When the agent finds a part that isn't in the catalog, the part appears under **Added by Agent** with its link and source.

Estimated stand-ins, such as a generic servo or bracket, never appear in **Parts**. The agent can use them to block out a design, and Checks list each one as a placeholder you need to replace.

## Assemblies

A robot is an assembly. Screws, inserts and nuts hold its parts together, with joints where parts move. Groups only organize parts and don't hold anything together.

Checks read the assembly as it's modeled and make sure that:

- Every part is attached.
- Every screw grips something.
- There's an order in which everything goes together.

For a list of every check, see [Build tab checks](/help/build-checks).

## Mounting ports

Every component has mounting ports: named holes, bores, bosses, faces and outputs, each with a position and a direction. Each port's position and direction come from the maker's mesh, and tests check them against it.

For example, the Feetech STS3215 servo has:

- An output horn 19.95 mm across, with four M3 holes 3 mm deep on a 14 mm circle
- An idler horn on the underside, with the same hole pattern
- Four M2 holes on the top of the case and four on the bottom

Bus servos, servo adapters, batteries and regulators also have connector ports where a cable plugs in. Each connector port has a type, such as 5264 or XT60. Connectors never mate. The bill of materials uses them to count cables.

Hardware has ports too, and parts the agent models declare their own ports in their code.

### How the agent uses ports

The agent places parts by their ports. It mates a port on one part to a port on another in one of these ways:

- Fastened
- On the same axis
- Face to face
- Press fit
- Sliding

The agent keeps each mate and applies it again whenever it moves or remodels either part. If you drag a mated part yourself, that releases the mate.

When the agent joins two parts with a screw, it picks the stock length based on what the screw passes through. It also adds the washer, insert or nut, and cuts the holes in any parts it modeled.

### How Checks use ports

Checks also read ports to find problems:

- A screw that threads into a component more than 1 mm from every hole is a blocker.
- A screw that goes deeper than its hole is a blocker.
- Servo alignment reads each servo's output to make sure it sits on its joint's axis.
