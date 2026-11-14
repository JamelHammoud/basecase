---
title: Stress a skill to find where it breaks
date: 2026-11-13
image: /changelog/stress-a-skill-to-find-where-it-breaks/cover.png
---

You can now stress a ready skill to find the friction, weight, servo strength and latency where it starts failing. Train on These then retrains it on those values and proves it again in Arena.

Stress sits on every ready row in Simulate's Train section, and in ⌘K. Arena only says a skill passes 96 tries near the floor it trained on. A Stand can pass Arena and still fall the day the robot carries a heavier battery. On our test quadruped, a Stand holding a 28° crouch passes Arena. Stress found it falls at twice its weight with its servos at 40% strength.

Stress searches past Arena's ranges up to fixed limits. Friction runs 0.2 to 1.5 times, weight 0.5 to 2 times, servo strength 40% to 120% and latency up to 150 ms. It judges every try with the skill's own contract. The default search runs 160 tries, about 15 seconds for a quadruped's Stand. The row lists up to three findings as numbers, and clicking one replays its worst try in the live sim.

Train on These widens only the failing ranges and warm-starts the skill in Forge. The new skill replaces the old one only if Arena passes it on the wider ranges. Train on These needs the desktop app and works on Motor Kit skills and moves.

Steps are in [Find where a skill breaks](/help/find-where-a-skill-breaks).
