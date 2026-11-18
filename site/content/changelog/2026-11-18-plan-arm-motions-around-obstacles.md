---
title: Plan arm motions around obstacles
date: 2026-11-18
image: /changelog/plan-arm-motions-around-obstacles/cover.png
---

You can plan a reach for a fixed-base arm around fixed Case obstacles. A clear endpoint doesn't guarantee a clear motion.

Describe the reach in **Teach it to** under **Train** in **Simulate**. You'll see the result in the existing skill row. Click **Try** to play its saved animation.

An arm can reach a target beyond a shelf but hit the shelf edge during a straight motion. The planner checks the transition from the arm's actual starting configuration, including its other links and parked branches.

Each motion search has a budget of 65,536 configuration checks. The planner moves only joints in the target chain and preserves authored contact exclusions. Arena retains a candidate only after it passes eight physical checks.

The planner refuses moving obstacles, closed mechanisms and unknown collision geometry. If it exhausts its search budget, it reports that it found no motion within that budget. It doesn't claim that no path exists.

Follow the steps in [Plan an arm reach](/help/plan-an-arm-reach).
