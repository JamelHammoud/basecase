---
title: Multiply a passed try into demonstrations
date: 2026-11-13
image: /changelog/multiply-a-try-into-demonstrations/cover.png
---

You can now turn one passed try into up to 50 varied passing tries, and export them all as a dataset.

Right-click the try in Results and choose Multiply, or use ⌘K.

Training a vision-language-action model takes hundreds of demonstrations, and driving each one by hand is the slow part. Now you drive one and multiply it.

## How It Varies

Each variation moves the Case's loose objects and spots by up to 15 mm in each direction. It changes friction, masses, servo strength and servo delay, the same way Checks does. Then it replays the commands you drove and moves each arm target by the offset of the object or spot nearest to it.

The Case's contract judges every variation, and Multiply keeps only the ones that pass.

On the three-joint test arm's Touch the Dots, one driven try kept 50 of 50. Each variation took about 40 ms there. They run in the Case workers, so the canvas stays live. Click Stop in the toast to end early.

## In the Dataset

The try's row counts the tries generated from it. Export Dataset includes them, and `meta/basecase.json` lists each episode's seed and the try it came from.

## What Doesn't Multiply

Tries recorded before this change carry no commands, so you can't multiply them.

Only targets move with the objects. If you drove a try with the keys alone, it replays the same key presses.

Read [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations) in the help center for the steps.
