---
title: Compare camera placements before making training images
date: 2026-11-16
image: /changelog/compare-camera-placements/cover.png
---

You can compare camera poses and lenses against target objects in Study, and apply a configuration before making training images. You replay a saved simulated try to measure geometric visibility.

A rover’s chassis can hide a low obstacle from its camera. By changing the camera’s orientation, you should see that blind interval before you generate a dataset.

You compare candidates using the same recorded body poses, timestamps, target identities and minimum pixel areas. In Study, you measure 320 × 240 instance and depth passes at 2 to 32 selected timestamps, with separate results for each camera and target. With multiple cameras, you count a target at a timestamp if any camera meets its minimum area.

Each result includes visible pixels and intervals where the target falls outside the view or below the declared area. Camera and lens settings preview on the canvas and apply in one undoable edit. Training images use the applied scene settings.

You can miss events between timestamps when sampling. You measure simulated visibility here, not detector accuracy, physical sensor performance or Case success. You can’t use missing captures. If you change the source try, you need to run another comparison.

Follow the steps in [Compare camera placements](/help/compare-camera-placements).
