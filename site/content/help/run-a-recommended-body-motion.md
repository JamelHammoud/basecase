---
title: Run a recommended body motion
date: 2026-11-21
collection: operate
type: task
keywords:
  - body motion
  - experiment
  - recording
  - payload
related:
  - inspect-body-parameters
  - keep-a-robot-session-as-a-try
hub_open_a_try_from_any_scene_order: 40
hub_open_a_try_from_any_scene: |
  [Recommended motion recordings](/help/run-a-recommended-body-motion) keep actual observations and completion status, including interrupted runs. Open **Analyze Try** to inspect their original recommendation.
covers:
  - src/workspace/bodyExecutionAction.ts
  - src/workspace/useBodyExecution.ts
  - src/workspace/useBodyAnalysis.ts
  - src/reality/bodyExperimentEvidence.ts
  - src/components/operate/BodyRecommendedMotion.tsx
  - src/components/operate/BodyExperimentMethod.tsx
  - electron/robot/benchControl.mjs
  - electron/robot/bodyMotionRecording.mjs
---

Record a recommended motion on an emulated unit, then compare its observations with the saved prediction.

You can run recommended motions on local emulated Feetech and Dynamixel units. Their servo dynamics don’t include your design's body masses, payload or floor contact.

The unit must match the saved starting pose, model, calibration and joint order. If the starting pose differs, Basecase refuses the run without moving the unit into place.

1. In **Operate**, select the unit that recorded the original try.
2. Under **Ladder**, choose **Set Up**.
3. Choose **Test**.
4. Choose **Analyze Try**.
5. In **Try**, choose the original recording.
6. Choose **Analyze**.
7. Switch on an unresolved parameter.
8. Choose **Preview Motion**.

![Analyze Try with a retained predicted motion and Run](/help/run-a-recommended-body-motion/recommendation.png)

9. Choose **Run**.
10. After the motion stops, expand **Method**.

![Analyze Try showing the completed recording, received observations and the emulator's body-model limitation](/help/run-a-recommended-body-motion/observations.png)

The declaration lasts at most two seconds. In **Method**, you can review the completion status, original recommendation, connection identity and command and observation counts.

Choose **Stop** to interrupt the motion. Choose **Cancel** to stop the motion and close the sheet. If you interrupt a try, Basecase keeps its status and any observations it received.

![Analyze Try while the selected motion runs, with Stop available](/help/run-a-recommended-body-motion/running.png)

You can find the recording under **Tries** in **Library**. See [Open a try from any scene](/help/open-a-try-from-any-scene) for the timeline controls.

![The actual Operate recording opened from Library](/help/run-a-recommended-body-motion/recording.png)

To reopen its analysis, choose that recording in **Analyze Try**. You can read its original recommendation and observations after design edits. **Out of date** marks evidence that no longer matches the source.

**Fit Body** uses that selected recording. You can’t activate a body calibration with unsupported dynamics, even if the predicted motion had a higher information score.

The motion bounds are simulation declarations. They aren’t hardware safety limits, and you can’t drive real devices with this workflow.
