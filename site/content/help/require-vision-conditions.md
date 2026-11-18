---
title: Set requirements for vision model retention
date: 2026-11-17
collection: simulate-and-train
type: task
related:
  - compare-vision-conditions
  - train-a-vision-model
covers:
  - src/components/tries/DatasetVisionFields.tsx
  - src/components/tries/DatasetVisionRequirements.tsx
  - src/components/tries/VisionRequirementFields.tsx
  - src/components/tries/VisionRequirementResults.tsx
  - src/components/tries/useRequirementChoices.ts
  - src/vision/training/requirements.ts
  - src/vision/training/requirementEvaluation.ts
  - src/vision/training/requirementRetention.ts
---

Keep an overall winner as a checkpoint if it misses a declared condition, camera or class requirement.

You train models on desktop. For measured support, you need held-out real images from verified recording sources.

1. In **Library** under **Datasets**, open the image dataset.
2. In **Vision task**, choose the task to train.
3. Click **Add Requirement**.
4. In **Group**, choose an existing condition or camera.
5. In **Class**, choose a required class or **All Classes**.
6. In **Score floor**, set the minimum score as a percentage.
7. In **Minimum real test**, set the minimum number of measured images.
8. In **Permitted regression**, set the allowed score drop in percentage points.

![A night requirement with a score floor, minimum real test support and permitted regression](/help/require-vision-conditions/requirements.png)

9. Click **Train**.

![An overall winner kept as a checkpoint because its night score is below the floor](/help/require-vision-conditions/checkpoint.png)

10. In the completed result, click **Inspect Images**.

![The frozen night images and the candidate and incumbent requirement scores](/help/require-vision-conditions/inspection.png)

In **Group**, choose the required group, then click an image's name to see its frozen labels and predictions.

You can declare up to 16 requirements. You meet a threshold if your result equals it. For a required class, count real test images containing that class toward its support.

You can’t count synthetic images or unverified imports toward measured support. You can’t pass a class requirement without examples.

To apply a model, you must meet each requirement along with overall improvement and the latency and size limits. You keep the model as a checkpoint if groups are missing, evidence is unavailable or evaluation limits prevent a pass.

You can’t use **Apply Model** on a checkpoint. If you edit current requirements or group membership, you change future comparisons and leave saved results unchanged.

![The saved requirement remains below its original floor after current membership and threshold edits](/help/require-vision-conditions/history.png)

You supply the criteria for requirements. You can’t use them to establish statistical significance, physical safety or deployment performance.

To create or explore groups, follow [Compare vision models by condition](/help/compare-vision-conditions).
