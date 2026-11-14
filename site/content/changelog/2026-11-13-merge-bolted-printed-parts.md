---
title: Merge printed parts bolted together into one print
date: 2026-11-13
image: /changelog/merge-bolted-printed-parts/cover.png
---

Print mode now offers to print parts that are bolted together on one link as a single part, without the screws and inserts that only joined them.

Each row in the Merge section of Print mode names the parts and what merging them saves. In the shin we test with, a bracket and a foot plate share four M3 screws and four heat inserts. Merge them and you save one part, four screws and two guide steps.

## What Gets Checked

Before Basecase offers a merge, it checks that the robot still comes apart in order, that every servo still goes in, and that the merged part fits your printer's bed with no more than 2 cm³ of extra support.

When a whole group fails, Basecase offers the largest part of it that passes and names what it left out. In that shin, the servo cover stays separate so the servo can go in.

## Undo and the Agent

A merge is a single undo step, and you can still edit the parts inside the union.

The agent's `check_assembly` lists the same groups, and the agent merges one when you ask.

## What Doesn't Merge

Basecase only offers parts of one material that touch and are joined by screws and inserts. It doesn't offer glued, strapped or press-fit parts.

Read [Merge printed parts into one print](/help/merge-printed-parts-into-one-print) in the help center for the steps.
