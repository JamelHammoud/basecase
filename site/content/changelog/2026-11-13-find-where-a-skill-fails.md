---
title: Find where a skill fails
date: 2026-11-13
image: /changelog/find-where-a-skill-fails/cover.png
---

You can now stress a ready skill to find the friction, weight, servo strength or servo delay where it stops passing. Train on These then retrains it to hold there.

Right-click a ready skill in Simulate's Train section and choose Stress, or use ⌘K. The agent's `stress_skill` tool runs the same search when you ask whether a skill will hold.

Arena tries servo delays up to 40 ms. On our test quadruped, a Stand with stiff feedback passed all 96 of Arena's tries. Stress found that it shakes itself over past 74 ms of delay. A full stress of that Stand is 96 runs at most and took 13 seconds on a laptop.

It tries one condition at a time, then all four together, in at most 96 runs. The limits are friction ×0.2 to ×1.5, weight ×0.5 to ×2, servo strength 40% to 120% and servo delay 0 to 150 ms. Every run is judged by the contract Arena uses. Each finding reads like Delay > 74 ms, with its margin, and clicking it replays that run on the canvas.

Train on These adds the failing values to the skill's training ranges and retrains it in Forge, starting from the skill. Arena then judges it on the wider ranges. The new skill replaces the old one only if it passes.

Train on These works on Motor Kit skills in the desktop app. Findings aren't saved with the scene.

Steps are in [Find where a skill fails](/help/find-where-a-skill-fails).
