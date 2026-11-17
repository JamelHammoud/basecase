---
title: Compare vision models by condition
date: 2026-11-17
image: /changelog/compare-vision-conditions/cover.png
---

You can compare vision models by declared condition, camera and recording source in Inspect Images. Basecase limits measured scores to held-out real images.

Your rover's overall score can improve while its scores on night images get worse. Assign those images a `night` condition before training to keep that exact set of images in the comparison.

You can add 32 condition names in the existing dataset view, with up to eight memberships per image. In Inspect Images, choose a group to see its support and both models' scores. For detection, segmentation, keypoints and classification, Basecase uses the existing task scorers and retained predictions without another inference run.

Basecase counts support for synthetic or unverified test images apart from held-out real images and leaves empty groups unmeasured. Saved groups keep their historical images and membership after you change the current labels.

You can explore groups without changing which model Basecase retains. These scores don't establish statistical significance or guarantee deployment performance.

Follow the steps in [Compare vision models by condition](/help/compare-vision-conditions).
