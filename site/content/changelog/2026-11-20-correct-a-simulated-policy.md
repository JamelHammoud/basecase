---
title: Correct a simulated policy
date: 2026-11-20
image: /changelog/correct-a-simulated-policy/cover.png
---

You can take over a saved simulated arm policy, correct its motion and return control to it within one continuous try. You'll find the controls in the Case's **Try** section.

If the hand misses its target, you can take control while keeping the physics, contacts, faults and original deadline. You resume from the actions that reached simulation instead of stale policy output.

You can see the source policy and ownership intervals in the saved try. **Use Corrections** selects operator actions from successful or failed tries in a working dataset. The full try keeps its actual verdict.

**Train from Tries** freezes those selections alongside your original demonstrations and starts the candidate from the compatible source actor. You get separate Case evidence for the candidate across 32 fresh runs. If the candidate fails, you keep the incumbent.

You can use this with one fixed arm and vector observations. You can't use camera observations, clocks or Case controller logic. Simulation results make no physical transfer claim.

Steps are in [Correct a simulated policy](/help/correct-a-simulated-policy).
