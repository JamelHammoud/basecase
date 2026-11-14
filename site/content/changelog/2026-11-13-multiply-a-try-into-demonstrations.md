---
title: Multiply a passed try into demonstrations
date: 2026-11-13
image: /changelog/multiply-a-try-into-demonstrations/cover.png
---

You can now turn one passed try into up to 50 varied passing tries, and export them all as a dataset. Right-click the try in Results and choose Multiply, or use ⌘K.

Training a vision-language-action model takes hundreds of demonstrations, and driving each one by hand is the slow part.

Each variation moves the Case's loose objects and spots up to 15 mm each way. It changes friction, masses, servo strength and servo delay the way Checks does. Then it replays the commands you drove, with each arm target moved by the offset of the object or spot it was nearest. The Case's contract judges every variation, and only passes are kept.

On the three-joint test arm's Touch the Dots, one driven try kept 50 of 50. Each variation took about 40 ms there. They run in the Case workers, so the canvas stays live, and Stop in the toast ends early.

The try's row counts its generated tries. Export Dataset includes them, and `meta/basecase.json` lists each episode's seed and the try it came from.

Tries recorded before this change carry no commands, so they can't be multiplied. Only targets move with the objects: a try driven with the keys alone replays the same key presses.

Steps are in [Multiply a try into demonstrations](/help/multiply-a-try-into-demonstrations).
