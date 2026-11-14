---
title: Render labeled training images
date: 2026-11-14
image: /changelog/make-training-images/cover.png
---

You can now render labeled images from a Case and export them as COCO or Ultralytics YOLO datasets. Choose Make Training Images in Results or ⌘K.

An arm learning to pick up a block needs images from its wrist camera. The scene already knows where that block is, including the pixels hidden by the gripper. Rendering labels from those visible pixels gives each image its box and mask without drawing them by hand.

Choose up to 1,000 images, the cameras and the classes to include. Each image has a seed controlling scene variation, including lighting, declared colors and camera mount tolerance. The saved frames carry masks, named keypoints and radial depth. Export keeps train, validation and test splits, and publishing uses the dataset's existing version history.

YOLO text labels contain detection boxes. Its Basecase sidecar keeps masks, polygons, keypoints and depth. Captured worlds use the geometry supported by the shared camera worker.

Steps are in [Make training images from a Case](/help/make-training-images).
