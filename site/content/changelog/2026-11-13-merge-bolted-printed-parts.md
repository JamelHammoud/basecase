---
title: Merge printed parts bolted together into one print
date: 2026-11-13
image: /changelog/merge-bolted-printed-parts/cover.png
---

Print mode now offers to print parts bolted together on one link as a single part. It removes the screws and inserts that only joined them.

Each row in Print mode's Merge section names the parts and what merging saves. In the shin we test with, a bracket and a foot plate share four M3 screws and four heat inserts. Merging them saves one part, four screws and two guide steps.

Basecase checks each merge before offering it. The robot must still come apart in order, and every servo must still go in. The merged part must fit your printer's bed with no more than 2 cm³ of extra support. When a whole group fails, Basecase offers the largest part of it that passes and names what it left out. In that shin, the servo cover stays separate so the servo can go in.

Merge is one undo step, and the parts stay editable inside the union. The agent's `check_assembly` lists the same groups, and it merges one when you ask.

Only parts of one material that touch and are joined by screws and inserts are offered. Glued, strapped or press-fit parts aren't.

Steps are in [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).
