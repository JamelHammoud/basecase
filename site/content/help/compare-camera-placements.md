---
title: Compare camera placements
date: 2026-11-16
collection: simulate-and-train
type: task
keywords:
  - camera mount
  - visibility
  - occlusion
  - lens
  - study_design
hub_the_design_agent_order: 45
hub_the_design_agent: |
  - It [compares camera placements](/help/compare-camera-placements) against declared objects over one saved simulated try before you make training images.
related:
  - study-design-options
  - make-training-images
covers:
  - src/study/cameraChoices.ts
  - src/study/visibilitySession.ts
  - src/workspace/studyVisibility.ts
  - src/workspace/useStudyVisibility.ts
  - src/components/simulate/StudyVisibilityField.tsx
  - src/components/simulate/StudyVisibilityDetails.tsx
---

Compare camera placements over the same saved simulated try to see which ones keep declared objects visible. You can then apply a configuration before making training images.

You can measure simulated geometry, but you can’t measure detector accuracy with this comparison. Use camera parts that appear in live camera views. Changes to camera poses move connected mounting parts together. You can’t use the comparison to construct mounts or establish that a robot passes its Case.

1. Open the Case whose simulated try you want to replay.
2. Press [[⌘K]] and choose **Study**.
3. In **Try**, choose the saved try.
4. Turn on the cameras and target objects you want to measure.
5. For each target, enter its **Minimum area** in pixels.
6. In **Samples**, choose from 2 to 32 timestamps.
7. In the camera’s pose or lens field, enter the choices separated by commas.

![A rover Study with two camera orientations and a saved try](/help/compare-camera-placements/configure.png)

8. Click **Run Study**.
9. Click a result to inspect its visibility measurements.

![Camera placements with different visibility over the same four samples](/help/compare-camera-placements/results.png)

10. On the configuration you want, click **Apply**.

![The rover with its chosen camera orientation applied](/help/compare-camera-placements/applied.png)

Hover over a row to preview its geometry. Hold [[⇧]] while clicking rows to compare up to four configurations. Press [[⌘Z]] to undo an applied configuration.

For each pose choice, enter six space-separated numbers: position X, Y, Z in millimeters, then rotation X, Y, Z in degrees. The studio uses Y up. For example, enter `-2.47 200 5.12 -90 0 0, -2.47 200 5.12 90 0 0` to compare opposite orientations.

For each lens choice, enter a supported projection and angle, such as `pinhole 90, fisheye 180`. Pinhole angles range from 20° to 120°. Fisheye angles range from 120° to 240°. Supply the lens characteristics you intend to use. You can’t use the comparison to infer unknown sensor specifications.

You compare frames at 320 × 240 pixels. For each camera and target, you can check the pixel range, time meeting the minimum area, and intervals below that threshold. Outside view means the isolated capture has no target pixels. You may see this with near-plane clipping, hidden targets or targets smaller than a pixel. Occluded means the isolated target projects into the image, but another surface reduces its visible pixels.

With several cameras, a target meets its threshold when any camera sees enough pixels at that timestamp. To calculate overall visibility, you average that sampled time across targets. You don’t add pixels from different cameras. You can’t count an unavailable capture as meeting the threshold unless another camera meets the same target’s threshold.

For each interval, you use the sample’s measurement until the next timestamp. For the final sample, you use one recorded frame interval. You can miss events between samples. In the results, you can check the sample count and largest interval. If you choose a try with fewer recorded frames, you use fewer samples.

You can compare up to 8 cameras, 16 targets and 64 candidate designs, with a limit of 1,024 label/depth capture requests including the current design. You can use scenes with up to 256 robot and world parts, with 1,000,000 prepared robot triangles. Use source try files that fit within 64 MiB. Reduce the sample count or choices if their combination exceeds the capture limit.

Use camera choices for camera comparisons. Study other mechanism changes in a separate comparison. You can’t get visibility evidence from missing assets, changed source models or malformed poses. Run another comparison after editing the scene or replacing the source try.

After you apply the configuration, you can [Make training images from a Case](/help/make-training-images) using the scene’s camera poses and lenses.
