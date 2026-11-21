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

1. In the Play view, open **Operate**.
2. Click the unit's named row, if more than one is listed.
3. Click **Analyze Try**.
4. In **Try**, choose the retained try.
5. Click **Analyze**.

![A retained arm try with a distinguishable mass and coupled wrist parameters](/help/inspect-body-parameters/analysis.png)

You can choose **Analyze Try** from [[⌘K]]. To reopen a saved analysis, choose another try in the same picker.

**Distinguishable** means a parameter produces a separate local response above the method's threshold. **Coupled** means different parameter changes can explain similar motion. **Poor excitation** means the response is too small under the assumed noise.

A residual mismatch remains unresolved. You can use these results to assess the supplied model and observations, but you can't identify a unique physical cause or assign probabilities from them.

If you edit the source, you'll see **Out of date** on saved results. You can still read the original model, calibration, observations and method in the evidence.

![Historical body evidence remains readable after a source edit](/help/inspect-body-parameters/historical.png)

Open **Method** for units, probes, bounds, scaling, assumed noise and numerical thresholds. You can analyze up to 256 status samples from the recorded interval. You can't use velocity-driven wheel commands with this replay path.

You won't change calibration, policy, scene geometry or the Checks verdict by running analysis. Use the separate **Fit Body** action described in [Fit a robot's body from a recorded run](/help/fit-a-robots-body-from-a-recorded-run) to fit the body.
