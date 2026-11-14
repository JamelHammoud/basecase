---
title: Merge printed parts into one print
date: 2026-11-13
collection: build-and-print
type: task
keywords:
  - merge
  - fewer parts
  - fewer screws
  - consolidate
  - union
related:
  - print-a-robots-parts
  - cut-join-and-intersect-parts
covers:
  - src/print/merge/
  - src/workspace/useMerges.ts
  - src/components/print/MergeSection.tsx
  - src/workspace/printCommands.tsx
---

You can print parts that are bolted together on the same link as a single part. You end up with fewer screws and fewer build steps.

1. Press [[⌘P]] to open Print mode.
2. In **Merge**, find the row that names the parts. Under the names, you'll see what merging saves, such as −1 part, −4 screws, −2 steps.
3. Read any line under the row, such as “Servo Cover stays separate so Knee Servo can go in”. The part it names stays out of the merge.
4. Click **Merge** on the row.

![Print mode with a Merge row for Shin Bracket and Foot Plate](/help/merge-printed-parts-into-one-print/merge-row.png)

The parts become one printed part, and the screws and inserts that joined only those parts leave the scene. The BOM, Checks, plates and build guide update to match. To undo the whole merge at once, press [[⌘Z]].

![The plate after the merge, with two parts left and a Merged Foot Plate into Shin Bracket toast](/help/merge-printed-parts-into-one-print/merged.png)

A row appears only for parts that:

- Are the same material
- Sit on the same link
- Touch each other
- Are joined only by screws and inserts

Basecase also offers the merge only when the robot still comes apart in order, no servo gets sealed in, and the merged part fits your printer's bed with no more than 2 cm³ of extra support.

While Print mode is open, you can also choose **Merge** with the part names from [[⌘K]]. Or ask the agent to merge them. In Layers, the merged part keeps the parts it was made from under it, so you can still move or resize them.
