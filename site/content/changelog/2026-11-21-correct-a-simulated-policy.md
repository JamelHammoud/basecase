---
title: Correct a simulated policy
date: 2026-11-21
image: /changelog/correct-a-simulated-policy/cover.png
---

You can take over a saved simulated arm policy, correct its motion and return control to it in one continuous try. You need the desktop app to train from corrections.

Take control from the Case's **Try** section if the hand misses its target. You keep the physics, contacts, faults and original deadline, and resume from the actions that reached simulation instead of stale policy output.

You can see the source policy and ownership intervals in the saved try. With **Use Corrections**, you select operator actions from successful or failed tries for a working dataset. You keep the full try's actual verdict.

With **Train from Tries**, you freeze those selections alongside your original demonstrations and start the candidate from the compatible source actor. You get separate Case evidence for the candidate across 32 fresh runs. If the candidate fails, you keep the incumbent.

You can use this with one fixed arm and vector observations. You can't use camera observations, clocks or Case controller logic. We make no claim that the simulation results transfer to physical hardware.

Follow the steps in [Correct a simulated policy](/help/correct-a-simulated-policy).
