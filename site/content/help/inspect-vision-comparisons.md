---
title: Inspect a vision model comparison
date: 2026-11-16
collection: simulate-and-train
type: task
keywords:
  - vision
  - evaluation
  - failures
  - predictions
  - frozen images
related:
  - train-a-vision-model
  - label-objects-in-camera-frames
hub_open_a_try_from_any_scene_order: 35
hub_open_a_try_from_any_scene: |
  To open the recorded frame behind a model failure, click **Open Source Try** in a [vision model comparison](/help/inspect-vision-comparisons). Missing or changed source content stays unavailable.
covers:
  - src/components/tries/VisionInspection.tsx
  - src/components/tries/VisionInspectionDetail.tsx
  - src/components/tries/VisionInspectionLinks.tsx
  - src/components/tries/useVisionInspection.ts
  - src/components/visionLabels/FrozenComparisonImage.tsx
  - src/workspace/visionInspectionNavigation.ts
  - src/vision/training/inspectionImage.ts
---

Compare candidate and incumbent predictions with the reviewed labels on the exact images used for evaluation.

For older attempts without saved predictions, you can view the aggregate results. You can inspect images without changing labels, splits or the retained model. Source recordings and individual camera videos can be up to 64 MiB. Each source can have up to four camera videos.

1. In **Library**, under **Datasets**, open the image dataset.
2. Under the training attempt, click **Inspect Images**.
3. In **Class**, choose the class to inspect.
4. In **Finding**, choose **Misses**, **False Positives**, **Candidate Improvements** or **Candidate Regressions**.
5. In the image list, click an image.

![The candidate prediction over the frozen cup image, beside its source and per-image counts](/help/inspect-vision-comparisons/candidate.png)

6. In **Prediction overlay**, choose **Incumbent** to compare its predictions with the same reviewed labels.

![The incumbent overlay showing a missed cup on the same frozen image](/help/inspect-vision-comparisons/incumbent.png)

7. In the comparison, open **Matching rules** to view the task's thresholds. The hashes identify both model files and the frozen test set.

For an image from a recorded try, click **Open Source Try** to open the try at the image's recorded timestamp.

![The source try open at the frozen image's recorded frame](/help/inspect-vision-comparisons/source.png)

In the comparison, click **Open Original Image** to open the matching current image in the existing label editor. You can't open missing or changed source content. You can edit current labels without changing the historical comparison.

You can also press [[⌘K]] and choose **Inspect Images** while the dataset is open.

To inspect frozen groups by declared condition, camera or source, follow [Compare vision models by condition](/help/compare-vision-conditions).

To prepare another comparison, follow [Train a vision model](/help/train-a-vision-model).
