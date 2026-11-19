---
title: Robot kit contents
date: 2026-11-16
collection: build-and-print
type: reference
order: 10
related:
  - export-a-robot-kit
  - robot-package-contents
covers:
  - src/kit/
---

The files in a manufacturing kit archive connect assembly demand, remaining purchases, printable geometry and joint identities.

| File | Contents |
|---|---|
| `build-guide.html` | Illustrated assembly instructions to open in a browser |
| `packing.csv` | Total assembly quantities grouped by module and guide step |
| `servos.csv` | Part identity, joint names, bus ID, family, catalog component and variant |
| `joint_map.json` | The same joint-map entries used by Robot Package |
| `plates/<material>.3mf` | Manufacturing geometry arranged on plates, one file per material |
| `provenance.json` | Source parts, project, owned inventory, measurements, printer and plate plans, and design fingerprint |
| `sheets/<index>/<name>.dxf` | Each sheet part’s outline and holes in millimeters |
| `drawings/drawings.pdf` | Dimensioned orthographic views with declared units and scale |
| `drawings/*.svg` | Editable vector sheets from the same drawing preparation |
| `drawings/*.stl` | Matching source geometry in millimeters, Z up, before guide-letter cuts on print plates |
| `drawings/drawings.json` | Source identity, geometry and file hashes, projection matrices, quantities, datums, numerical allowances, authored tolerances and stack results |
| `electrical/robot.kicad_sch` | Current editable schematic for a generated carrier |
| `electrical/robot.kicad_pcb` | Editable board source, including diagnostic routed sources when rejected |
| `electrical/placement.json` | Placement identities, terminals, physical geometry evidence and unresolved requirements |
| `electrical/source.json` | Electrical inputs and geometry identities bound to the source fingerprint |
| `electrical/requirements.json` | Actual unresolved electrical and board requirements, with available validator status |
| `electrical/validation.json` | Native validation evidence when validation ran |
| `electrical/manifest.json` | Source, board and geometry fingerprints and SHA-256 hashes of electrical artifacts |
| `electrical/fabrication/*` | Gerbers and drill files included only after the existing native acceptance path accepts them |
| `kit.json` | Design fingerprint, guide plan, packing, purchases, print settings, wiring endpoints, sheet outputs, output references and Checks |

## Packing and purchases

Packing counts every part the assembly needs, including owned parts. A module's step numbers start again at 1. `guide_index` identifies the step's place in the complete guide.

Each physical part appears at its first guide occurrence. Repeated modules retain their own identities and assembly references. Unassigned rows include consumables, equipment and extra quantities without a guide step.

The manifest's `purchases` list keeps total demand, owned quantities and remaining purchases from the bill of materials. A printed service quote stays a purchase while the physical printed item is packed once.

## Printed parts and servos

Each printed part points to its material's 3MF file and plate number. Additional print copies appear in those output references and in unassigned packing rows. Filament demand includes those copies. The manifest records materials, infill, process selection, printer and label omissions. Files contain manufacturing geometry rather than sliced G-code.

The servo sheet uses the exact entries in `joint_map.json`, including names, bus IDs and catalog variants. The sheet records identities and doesn’t program servos.

## Carrier boards

A generated carrier appears once in `fabricated`, with process `PCB`, and retains its ordinary scene identity in the guide and packing list. Its box geometry is excluded from FDM plates and sheet cutting. Mechanical drawing preparation excludes the carrier because its manufacturing geometry lives in the electrical sources.

Connector demand is assigned to the carrier’s guide step. Reused catalog modules and mounting hardware retain their own demand. Owned stock reduces purchases, without reducing packing quantities.

The kit’s `electrical` record binds the electrical manifest hash to its design fingerprint and names the carrier identity. `fabrication` is `included` or `missing`. Missing fabrication doesn’t make diagnostic sources a complete board manufacturing package. Unrouted, stale and unsupported sources retain their requirements. No soldering or commissioning plan is included.

Native software validation establishes neither electrical performance nor physical fit. Checks remains the build-readiness verdict.

## Checks and limits

Checks retain their original measurement time and are recorded as current, stale or not run. Exporting neither changes readiness nor proves physical fit. Unproven steps remain marked, and the manifest records an assembly search that reached its time limit.

Missing sheet profiles and identities stop export. Hidden solids, missing geometry, omitted printable output and duplicate plate filenames also stop export. Archive contents are limited to 256 MB before compression. Drawing preparation limits a kit to 256 scene parts. Drawings occupy at most 64 MB before compression.

Steps are in [Export a robot kit](/help/export-a-robot-kit).
