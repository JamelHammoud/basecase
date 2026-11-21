---
title: Correct a simulated policy
date: 2026-11-20
collection: simulate-and-train
type: task
covers:
  - src/components/simulate/CaseTeachingControls.tsx
  - src/workspace/useCaseTry.ts
  - src/workspace/selectCorrections.ts
  - src/components/simulate/TryOwnership.tsx
---

Take over a saved arm policy, record corrections, and train a candidate using your corrections and original demonstrations.

You can use one fixed arm and a saved Forge vector policy. You can't use camera observations, clock observations or Case controller logic.

1. In **Simulate**, open the Case with its saved policy.
2. Under **Try**, click **Try Policy**.

![The saved Touch a Point policy running with Take Control available](/help/correct-a-simulated-policy/policy.png)

3. Click **Take Control**.
4. Click the canvas.
5. Use the Case's drive controls to move the hand.

![The hand under manual control with Resume Policy available](/help/correct-a-simulated-policy/correction.png)

6. Click **Resume Policy**.
7. Click **Stop Try** when you finish.
8. In **Library**, open the saved try.

![The continuous try showing its source policy and ownership intervals](/help/correct-a-simulated-policy/owners.png)

You can take control and resume the policy multiple times during the same try. Physics, contacts, faults and the original Case deadline continue through each handoff. You can't undo a missed deadline with a correction.

9. Click **Done**.
10. Hold [[⌘]] and select the teaching try and your original demonstrations.
11. In [[⌘K]], choose **Make Dataset**.
12. In the working dataset, right-click the teaching try and choose **Use Corrections**.
13. Click **Train from Tries**.

![The dataset containing original demonstrations and selected correction windows](/help/correct-a-simulated-policy/dataset.png)

To train with corrections, you need both original and correction samples in the training split, plus an independent validation group. Basecase assigns selected corrections to the training split by default and keeps explicit split assignments unchanged. It keeps related windows and branches together.

Basecase saves the complete teaching recording in the saved version as context and uses the selected operator actions as correction targets. It uses each fitting row once per epoch and excludes validation and test rows from fitting.

You can use corrections from a failed try without changing its failed status. Basecase starts the candidate from the source actor and evaluates it using the existing Case acceptance rule. If preparation, training or evaluation fails, Basecase keeps the incumbent intact.

In the training job, Basecase records the source policy, frozen version, selected windows and fitting row counts. For retention rules, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
