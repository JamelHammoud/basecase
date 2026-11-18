---
title: Retain vision models against operating requirements
date: 2026-11-17
image: /changelog/vision-operating-requirements/cover.png
---

You can set condition, camera and class requirements before training a vision model. A candidate that wins on overall score stays a checkpoint if it fails any requirement.

Open an image dataset in Library and add a requirement beside its training controls. A rover detector can improve across daytime images while missing every person in its night group. If you require night performance, you can’t retain that candidate based on its overall improvement.

For each requirement, set a score floor, minimum measured real-test support and permitted regression against the incumbent. You can declare 16 requirements across detection, segmentation, keypoints and classification. You compare both models using the same frozen images and requirements. Scores equal to the thresholds pass.

You can’t count synthetic images or unverified imports toward measured support. Candidates stay as checkpoints if groups are missing, classes are absent, evidence is unavailable or evaluation limits prevent a decision. You can’t apply checkpoints.

You can change the current labels or thresholds without changing the requirements, members or outcomes in saved results. The requirements express the criteria you supply. They don’t establish statistical significance, physical safety or deployment performance.

Steps are in [Set requirements for vision model retention](/help/require-vision-conditions).
