---
title: Limit grip force in a Case
date: 2026-11-28
collection: simulate-and-train
type: task
related:
  - make-a-case
  - try-a-case
covers:
  - src/components/cases/CaseGripForceField.tsx
  - src/cases/pickForce.ts
  - src/sim/contactForces.ts
  - src/sim/forceClosure.ts
hub_run_a_case: |
  Set a squeeze limit for a rigid object and inspect the saved forces in [Limit grip force in a Case](/help/limit-grip-force).
---

Set a modeled squeeze limit and save the simulated jaw forces with each try.

1. In **Cases**, click **New Case**.
2. Choose **Pick Up a Block**.
3. Turn on **Limit grip force**.
4. In **Grip force ceiling**, enter the maximum total force in newtons.
5. Click **Make Case**.
6. Click **Try Reference**.
7. Open the saved try.

![The Pick Up a Block builder with its grip-force ceiling enabled](/help/limit-grip-force/ceiling.png)

In the **Grip force** plot, you can inspect the saved normal force for each jaw, their total and the highest total across all physics steps. Floor contacts and other objects don't contribute to these forces. You can see a brief overload in the peak trace after the sampled force falls.

![A retained try with the jaw-force traces and its contract result](/help/limit-grip-force/retained.png)

To pass the try, you must meet the lift and hold contract and stay within the force ceiling. The reference adjusts closure based on measured force, within the joint and actuator limits. The try can fail if you set a limit below the force needed to hold the object.

The ceiling is a modeled requirement. You can't use it to predict material fracture or establish hardware safety. You can't prove a force requirement with recordings that lack force observations. After editing the source Case or robot, run a new try.

For a custom console or controller, use the generated probes `jawForce1`, `jawForce2`, `gripForce` and `gripForcePeak`. In Case code, read them through the existing `probe` signals.

Use **Export Try** on a scripted try to share its saved force evidence. In a shared `.basecase` file, you share the Case requirement without its recordings.
