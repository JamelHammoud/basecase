---
title: Stress a skill
date: 2026-11-14
image: /changelog/stress-a-skill/cover.png
---

You can now stress a ready skill to find the friction, weight, servo strength or servo delay where it starts to fail. Then you can retrain it on those values.

Right-click a ready skill in the Simulate tab and choose Stress. Arena says whether a skill passes, not where it would start to fail. A Stand on our quad-servo test robot, held with its legs swung 0.745 rad, passes Arena in all 96 tries. Stress shows it sinks below its height limit once its links weigh 1.58 times as much.

Stress pushes friction from ×0.2 to ×1.5, link mass from ×0.5 to ×2, servo strength from 40% to 120% and servo delay up to 150 ms. It changes one setting at a time and then all of them together, judging every run with the skill's own contract. The default is 48 runs, which took 15 to 23 seconds for Stand on an M5 Pro. Each finding shows the value where the skill starts to fail and its margin, and clicking one replays that run in the simulation.

Train on These widens the failing ranges and retrains the skill in Forge. The new skill is kept only if Arena passes it on the wider ranges. Train on These works on Motor Kit skills, in the desktop app.

Steps are in [Stress a skill to find where it breaks](/help/stress-a-skill).
