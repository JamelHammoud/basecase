---
title: Preview the next motion
date: 2026-11-20
image: /changelog/preview-the-next-motion/cover.png
---

You can preview a simulated motion to see whether it could separate body parameters left unresolved by a saved try. Basecase sends no robot commands.

In **Operate**'s **Analyze Try** result, **Preview Motion** shows saved collision geometry, a joint response plot and a time control for selected unresolved parameters.

If you leave an arm motionless, you may leave its link weights unresolved. Moving it may expose a difference. But you may be unable to distinguish a co-located weight and payload through any supported motion.

Basecase ranks up to 6 motions, each lasting 2 seconds. It includes the original observations and accounts for other parameters that could explain the response. Basecase doesn't qualify a motion on movement size alone.

You can read the preview's history with its original model, calibration, candidates and predictions after physical edits. Basecase disables a new search for the changed source.

Predicted separation doesn't establish physical identification accuracy. Basecase changes no calibration, policy or editable pose during the preview. It returns **Can’t tell** when the library can't establish separation.

Steps are in [Preview a motion for unresolved body parameters](/help/preview-a-motion-for-unresolved-body-parameters).
