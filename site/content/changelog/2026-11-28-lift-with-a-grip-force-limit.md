---
title: Lift with a grip-force limit
date: 2026-11-28
image: /changelog/lift-with-a-grip-force-limit/cover.png
---

You can give a pick Case a total grip-force ceiling and save the simulated jaw forces with its result. To pass, your gripper must hold the object within that ceiling.

In Cases, choose Pick Up a Block and turn on Limit grip force. The requirement covers simulated rigid contact. You can't use it to predict fracture or establish hardware safety.

A gripper can lift a light object while squeezing harder than its declared limit. We updated the reference to adjust closure using measured contact force and made its closing and loaded motion gentler. Joint and actuator limits apply.

In the saved plot, you can see each jaw's normal force, their total and the greatest total across physics steps. The total includes contact between the declared jaws and the target. An overload between the 50 Hz recording frames counts toward the verdict.

You keep the force evidence when you save, share or replay the result. You can't use an old recording without those observations to prove a new force requirement.

Steps are in [Limit grip force in a Case](/help/limit-grip-force).
