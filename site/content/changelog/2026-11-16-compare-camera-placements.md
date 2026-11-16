---
title: Compare camera placements before making training images
date: 2026-11-16
image: /changelog/compare-camera-placements/cover.png
---

You can compare camera poses and lenses against target objects in Study, and apply a configuration before making training images. You replay a saved simulated try to measure geometric visibility.

A rover’s chassis can hide a low obstacle from its camera. By changing the camera’s orientation, you should see that blind interval before you generate a dataset.

You compare candidates using the same recorded body poses, timestamps, target identities and minimum pixel areas. In Study, you measure 320 × 240 instance and depth passes at 2 to 32 selected timestamps, with separate results for each camera and target. With multiple cameras, you count a target at a timestamp if any camera meets its minimum area.

Select a row to inspect visible pixels and intervals where the target falls outside the view or below the declared area. Preview changes on the canvas, and apply the camera and lens settings in one undoable edit. You use those scene settings to make training images.

You can miss events between timestamps when sampling. You measure simulated visibility here, not detector accuracy, physical sensor performance or Case success. You cannot use missing captures. If you change the source try, you need to run another comparison.

Follow the steps in [Compare camera placements](/help/compare-camera-placements).
