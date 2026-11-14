---
title: Stress-test a skill
date: 2026-11-14
image: /changelog/stress-test-a-skill/cover.png
---

You can now find where a ready skill breaks. Stress searches friction, payload, servo strength and delay past what Arena checks, and lists each limit as a number.

Arena tells you a skill passes at friction ×0.8 to ×1.2, masses within 10% and delays up to 40 ms. It doesn't tell you what happens on a polished floor or with a payload. On quad-servo, the Kit's Walk passes Arena but falls below 76% servo strength, above about ×1.5 link mass and at 60 ms of delay.

Stress is on a ready row's right-click menu in Simulate. It tries each of the four alone and then together, up to friction ×0.2 to ×1.5, mass ×0.5 to ×2, strength 40% to 120% and delay 150 ms. Every run is judged by the skill's own contract, and 120 runs take about 25 seconds for Walk. Click a finding to replay that run in the simulation.

Train on These retrains from the skill on ranges wide enough to cover the findings. The new version is kept only if Arena passes it there. It works on Motor Kit skills. Findings aren't saved with the scene.

Steps are in [Stress-test a skill to find where it breaks](/help/stress-test-a-skill).
