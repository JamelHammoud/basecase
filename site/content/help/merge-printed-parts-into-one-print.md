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

Print parts that are bolted together on one link as a single part, with fewer screws and fewer build steps.

1. Press [[⌘P]] to open Print mode.
2. Find the row in **Merge** that names the parts. Under the names is what merging saves, such as −1 part, −4 screws, −2 steps.
3. Read any line under the row, such as “Servo Cover stays separate so Knee Servo can go in”. That part stays out of the merge.
4. Click **Merge** on the row.

![Print mode with a Merge row for Shin Bracket and Foot Plate](/help/merge-printed-parts-into-one-print/merge-row.png)

The parts become one printed part, and the screws and inserts that only joined them leave the scene. The BOM, Checks, plates and build guide follow on their own. Press [[⌘Z]] to undo the whole merge at once.

![The plate after the merge, with two parts left and a Merged Foot Plate into Shin Bracket toast](/help/merge-printed-parts-into-one-print/merged.png)

A row shows only for parts of one material on one link that touch and are joined only by screws and inserts. Basecase offers it only when the robot still comes apart in order and no servo gets sealed in. The merged part must also fit your printer's bed with no more than 2 cm³ of extra support.

You can also choose **Merge** with the part names from [[⌘K]] while Print mode is open, or ask the agent to merge them. The merged part keeps the parts it was made from under it in Layers, so you can still move or resize them.
