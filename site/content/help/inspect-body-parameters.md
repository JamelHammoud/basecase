---
title: Inspect body parameters in a saved try
date: 2026-11-20
collection: operate
type: task
keywords:
  - mass
  - payload
  - friction
  - distinguishability
covers:
  - src/components/operate/BodyAnalysis.tsx
  - src/components/operate/BodyAnalysisResult.tsx
  - src/workspace/useBodyAnalysis.ts
  - src/reality/bodyEvidence.ts
---

Use body analysis to check which masses, payloads and floor friction you can distinguish from a saved try under its recorded model.

You can use body analysis in the desktop app if the try includes saved model evidence. You can read earlier tries without that evidence, but you can't analyze them.

1. In **Play**, open **Operate**.
2. In **Operate**, click the unit's named row, if more than one is listed.
3. In the body controls, click **Analyze Try**.
4. In the **Try** picker, choose the retained try.
5. Below the picker, click **Analyze**.

![A retained arm try with a distinguishable mass and coupled wrist parameters](/help/inspect-body-parameters/analysis.png)

You can choose **Analyze Try** from [[⌘K]]. To reopen a saved analysis, choose another try in the same picker.

Edits to the physical source mark saved results **Out of date**. Visual finishes keep their physical evidence current. You can still read the saved parameters and method.

![Historical body evidence remains readable after a source edit](/help/inspect-body-parameters/historical.png)

Open **Method** for parameter units, probes, bounds and scaling, the saved interval, assumed noise and numerical thresholds.

For [recommended motion recordings](/help/run-a-recommended-body-motion), **Method** also keeps completion, the original recommendation, connection identity and command and observation counts. Servo-emulator observations can’t establish body mass, payload or floor contact.

![Analyze Try with a completed motion’s actual observations and expanded Method](/help/run-a-recommended-body-motion/observations.png)

See [Recorded body parameters](/help/simulation-in-basecase#recorded-body-parameters) for the result labels and limits. To change the body fit, follow [Fit a robot's body from a recorded run](/help/fit-a-robots-body-from-a-recorded-run).

You can also [preview a motion for unresolved body parameters](/help/preview-a-motion-for-unresolved-body-parameters).

To gather complementary MuJoCo observations, [run a simulated body sequence](/help/run-a-simulated-body-sequence). Its independent validation stays separate from motion selection.
