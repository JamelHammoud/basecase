---
title: Preview a motion for unresolved body parameters
date: 2026-11-20
collection: operate
type: task
covers:
  - src/components/operate/BodyAnalysis.tsx
  - src/components/operate/BodyAnalysisResult.tsx
  - src/components/operate/BodyMotionPreview.tsx
  - src/workspace/useBodyAnalysis.ts
  - src/reality/bodyMotion.ts
---

Check whether you could distinguish parameters that remain unresolved in a saved try using a short simulated motion.

1. In **Play**, open **Operate**.
2. In the body controls, click **Analyze Try**.
3. In **Try**, choose a recording with saved model evidence.
4. Below the picker, click **Analyze**.
5. Beside an unresolved parameter, turn on its switch.
6. Below the parameters, click **Preview Motion**.
7. In the preview, drag **Time** to inspect the predicted response.

![A retained arm with a predicted motion and joint response plot](/help/preview-a-motion-for-unresolved-body-parameters/preview.png)

You preview the motion using the recording's saved collision geometry and calibration. You send no robot commands and change no pose, calibration or policy.

To reopen a saved preview, choose its recording in **Try**. After a physical edit, you’ll see **Out of date**, but you can still view its saved geometry and predictions.

![The saved arm preview remains visible after its source becomes out of date](/help/preview-a-motion-for-unresolved-body-parameters/historical.png)

If you see **Can’t tell**, the preview couldn't establish separation under the saved model and assumed noise.

See [Simulation in Basecase](/help/simulation-in-basecase#recorded-body-parameters) for the analysis limits.

You can [run a recommended body motion](/help/run-a-recommended-body-motion) on a matching emulated unit and inspect its actual observations.

You can also [run a simulated body sequence](/help/run-a-simulated-body-sequence) that chooses later motions from accumulated observations.
