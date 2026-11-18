---
title: Compare vision models by condition
date: 2026-11-17
collection: simulate-and-train
type: task
related:
  - inspect-vision-comparisons
  - train-a-vision-model
covers:
  - src/components/tries/DatasetConditions.tsx
  - src/components/tries/DatasetImages.tsx
  - src/components/tries/DatasetImageTile.tsx
  - src/components/tries/VisionGroupFilter.tsx
  - src/components/tries/VisionConditionResults.tsx
  - src/components/tries/useConditionComparison.ts
  - src/workspace/imageConditions.ts
  - src/vision/conditions.ts
  - src/vision/training/conditionEvaluation.ts
  - src/vision/training/conditionImages.ts
  - src/vision/training/conditionRequest.ts
---

Use saved groups of images with the same declared condition, camera or recording source to find failures you might miss in an overall score.

You can get measured scores for held-out real test images. Conditions are labels you supply. They don't verify lighting, weather or physical performance.

## Assign a condition

1. In **Library** under **Datasets**, open the image dataset.
2. Under **Images**, click each image's name to select it.
3. In **Condition**, type a label such as `night`.
4. Click **Assign Condition**.

![Rover images with night and glare assigned to the selected image](/help/compare-vision-conditions/conditions.png)

Repeat the assignment for another condition. You can assign an image to eight conditions and declare 32 condition names in a dataset.

To remove a condition from selected images, click **Remove Condition** to open a confirmation. Click **Delete** to remove that membership and keep the condition definition.

![The confirmation for removing night from selected images](/help/compare-vision-conditions/remove.png)

## Compare the frozen members

5. Click **Train**.
6. In the completed result, click **Inspect Images**.
7. In **Group**, choose a condition, camera or source.
8. In the image list, click an image's name.

![A frozen night group with support, both model scores and its reviewed image](/help/compare-vision-conditions/comparison.png)

Use **Class** to select a class's score and images. Use **Finding** to filter the image list for matching errors and changes.

Group scores remain exploratory unless you [set requirements for vision model retention](/help/require-vision-conditions) before training. Retention still requires improvement on the complete real test.

You can see separate support counts for synthetic and unverified test images. You won't see measured scores for these images, empty groups or groups without real test members.

You can change current membership without changing saved comparisons. You can't add conditions created after a comparison to that report.

For overlays and source navigation, follow [Inspect a vision model comparison](/help/inspect-vision-comparisons).
