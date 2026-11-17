---
title: Inspect the images behind model scores
date: 2026-11-16
image: /changelog/inspect-vision-comparisons/cover.png
---

You can compare candidate and incumbent predictions on the frozen images behind a training result. Open an image dataset from Library and choose **Inspect Images** on an attempt with saved predictions.

A model can improve its overall score while missing a person in one camera. You can't identify that image from the aggregate score. Use the class and failure filters to find images in the comparison and inspect their reviewed labels, candidate gains and regressions.

You see both overlays on the same historical image. For detection, you compare boxes. For segmentation, you compare masks. Keypoint counts respect visibility, and for classification, you compare the highest-scoring class. You can inspect the matching rules and complete model and test hashes with the comparison. Per-image findings don't give you an independent average-precision score.

Each model retains evidence for up to 1,000 real test images within 3 MiB. Basecase refuses to evaluate larger evidence and doesn't drop failures to fit the limits. You keep aggregate results from older runs. To navigate to the source, you need unchanged saved content. Inspecting a comparison leaves labels, splits and retention unchanged.

Steps are in [Inspect a vision model comparison](/help/inspect-vision-comparisons).
