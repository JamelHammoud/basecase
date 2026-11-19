---
title: Plan arm motions around obstacles
date: 2026-11-18
image: /changelog/plan-arm-motions-around-obstacles/cover.png
---

You can plan an arm reach around Case obstacles. The robot base and obstacles must be fixed.

Reach planning is in **Simulate** under **Train**. Saved reaches play through **Try**.

An arm can reach a target beyond a shelf but hit the shelf edge during a straight motion. The planner checks the transition from the arm's starting configuration, including its other links and parked branches.

Each motion search has a budget of 65,536 configuration checks. The planner keeps joints outside the target chain fixed and preserves authored contact exclusions. A candidate must pass eight physical development checks and the separate Arena verdict before the planner saves it as a skill.

The planner refuses moving obstacles, closed mechanisms and unknown collision geometry. If it exhausts its search budget, it reports that it found no motion within that budget. It doesn't claim that no path exists.

Follow the steps in [Plan an arm reach](/help/plan-an-arm-reach).
