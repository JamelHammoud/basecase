---
title: Inspect what a robot try can distinguish
date: 2026-11-20
image: /changelog/inspect-body-parameters/cover.png
---

You can inspect which body parameters a saved robot try can distinguish, which remain coupled and whether its model explains the observations. You can use this in the desktop app with tries that retain matching model evidence.

In **Operate**, **Analyze Try** compares bounded parameter changes through MuJoCo replay.

A wrist's mass and payload can produce similar motion. You might improve the fit by changing either, with little evidence in the recording to choose between them. You can see that ambiguity in the analysis without attributing it to a physical cause.

In the results, you can distinguish small responses, coupled directions and residual mismatch under explicit noise assumptions. The method analyzes up to 256 status samples and retains its model, calibration, parameter bounds and interval. After source edits, the analysis no longer applies. Basecase preserves the historical evidence.

You can run the analysis without sending robot commands or changing calibration or a Checks verdict. You can’t use this replay path with velocity-driven wheel commands. We use generated recordings to test the software's behavior. These tests don’t establish physical diagnostic accuracy.

Steps are in [Inspect body parameters in a saved try](/help/inspect-body-parameters).
