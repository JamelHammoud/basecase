---
title: Correct a simulated policy
date: 2026-11-21
collection: simulate-and-train
type: task
covers:
  - src/components/simulate/CaseTeachingControls.tsx
  - src/workspace/useCaseTry.ts
  - src/workspace/selectCorrections.ts
  - src/components/simulate/TryOwnership.tsx
---

You can take over a saved arm policy to record corrections, then train a candidate using those corrections and your original demonstrations.

You need the desktop app to train from corrections.

You must have one fixed arm and a saved Forge vector policy. You can't use camera observations, clock observations or Case controller logic.

1. In the saved policy’s Case, under **Simulate** ▸ **Try**, click **Try Policy**.

![The saved Touch a Point policy running with Take Control available](/help/correct-a-simulated-policy/policy.png)

2. Under **Try**, click **Take Control**.
3. On the canvas, click to focus the drive controls.
4. With the canvas focused, use the Case’s drive controls to move the hand.

![The hand under manual control with Resume Policy available](/help/correct-a-simulated-policy/correction.png)

5. Under **Try**, click **Resume Policy**.
6. Under **Try**, click **Stop Try** when you finish.

You can [open the saved try](/help/scrub-a-try-on-the-timeline) to inspect its source policy and ownership intervals.

![The continuous try showing its source policy and ownership intervals](/help/correct-a-simulated-policy/owners.png)

You can take control and resume the policy multiple times during the same try. Physics, contacts, faults and the original Case deadline continue through each handoff. You can't undo a missed deadline with a correction.

7. In **Library**, hold [[⌘]] and select the teaching try and your original demonstrations.
8. In [[⌘K]], choose **Make Dataset**.
9. In the working dataset, right-click the teaching try and choose **Use Corrections**.
10. In the dataset pane, click **Train from Tries**.

![The dataset containing original demonstrations and selected correction windows](/help/correct-a-simulated-policy/dataset.png)

To train with corrections, you need original and correction samples in the training split, plus an independent validation group. Basecase assigns selected corrections to the training split by default and preserves explicit split assignments. It keeps related windows and branches in the same split.

Basecase saves the complete teaching recording in the saved version for context and uses the selected operator actions as correction targets. It uses each fitting row once per epoch and excludes validation and test rows from fitting.

You can use corrections from a failed try without changing its failed status. Basecase starts the candidate from the source actor and evaluates it using the existing Case acceptance rule. If preparation, training or evaluation fails, Basecase keeps the incumbent intact.

In the training job, Basecase records the source policy, frozen version, selected windows and fitting row counts. For retention rules, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
