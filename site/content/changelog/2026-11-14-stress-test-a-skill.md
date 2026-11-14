---
title: Stress-test a skill
date: 2026-11-14
image: /changelog/stress-test-a-skill/cover.png
---

You can now find where a ready skill breaks. Stress pushes friction, payload, servo strength and delay past what Arena checks, and gives you each limit as a number.

Arena checks a skill at friction ×0.8 to ×1.2, masses within 10% and delays up to 40 ms, so a polished floor or a payload is outside what it tests. On quad-servo, for example, the Kit's Walk passes Arena, but it falls below 76% servo strength, above about ×1.5 link mass and at 60 ms of delay.

## How It Searches

Stress tries each of the four on its own, then all of them together, going as far as friction ×0.2 to ×1.5, mass ×0.5 to ×2, strength 40% to 120% and 150 ms of delay. The skill's own contract judges every run. For Walk, 120 runs take about 25 seconds.

Each finding replays its run in the simulation, under that finding's physics.

## Train on These

Train on These retrains from the skill on ranges wide enough to cover the findings, and keeps the new version only if Arena passes it on those ranges. It works on Motor Kit skills.

Findings aren't saved with the scene.

Read [Stress-test a skill to find where it breaks](/help/stress-test-a-skill) in the help center for the steps.
