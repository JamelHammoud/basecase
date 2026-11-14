---
title: Find each printed part by its guide letter
date: 2026-11-13
image: /changelog/find-printed-parts-by-their-guide-letters/cover.png
---

You can now print each part with its build guide letter cut into it, on a face you can't see once the robot is built.

It's on by default. The setting is Label parts, in Print mode.

Many printed parts of a legged robot come in left and right mirror pairs. The build guide gives each one a letter, but until now the letters were only on paper, so on a first build you held two brackets up to the screen to tell them apart.

## Where the Letter Goes

Basecase picks the largest flat face that touches no other part and isn't the face the part prints on. The face also has to be hidden: no ray from 96 directions around the built robot reaches it.

The letter goes as near the middle of that face as it fits. It's 0.4 mm deep and 4 to 10 mm tall.

The letters come from the guide's own plan, so the PDF, Build Along and the parts all agree.

## What Changes

Only the plate files change. The scene, Checks, the bill of materials and the record of printed parts stay as they were.

If a part has no hidden, free face big enough, it prints without its letter, and its row in Parts says so.

Read [Label printed parts with their guide letters](/help/label-printed-parts) for the steps.
