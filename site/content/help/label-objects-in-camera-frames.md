---
title: Label objects in camera frames
date: 2026-11-15
collection: simulate-and-train
type: task
related:
  - scrub-a-try-on-the-timeline
  - import-an-image-dataset
  - make-training-images
covers:
  - src/components/visionLabels/FrameLabelEditor.tsx
  - src/components/visionLabels/AddFramesSheet.tsx
  - src/components/tries/DatasetImages.tsx
  - src/workspace/useFrameLabels.ts
  - src/workspace/useFrameSegmentation.ts
  - src/vision/tryFramesClient.ts
  - src/vision/prelabels.ts
hub_open_a_try_from_any_scene_order: 25
hub_open_a_try_from_any_scene: |
  To label objects inside a recorded camera image, choose **Add Frames** on its timeline. See [Label objects in camera frames](/help/label-objects-in-camera-frames).
hub_the_design_agent_order: 85
hub_the_design_agent: |
  - Ask it to label objects in a saved frame set. Its labels stay unreviewed until you accept them, as in [Label objects in camera frames](/help/label-objects-in-camera-frames).
---

Turn a try’s camera images into a labeled dataset with boxes, polygons, masks and named keypoints.

1. In **Results**, click a recorded try.
2. On its timeline, click **Add Frames**.
3. In **Frame selection**, choose **Playhead**, **Every Nth**, **Range** or **Sample**.
4. Under **Cameras**, select the views to include.

![The Add frames sheet with frame selection and camera choices](/help/label-objects-in-camera-frames/frames.png)

5. Click **Add Frames**.

If **Classes** is empty, click **Add class**, enter a name and click **Add Class** before drawing.

6. Under **Classes**, select the object’s class.
7. Click **Draw box**.
8. On the image, drag a rectangle around the object.
9. Press [[→]] to label the next frame.
10. Close the editor when you finish.

![The frame editor showing labels projected from the recorded block pose](/help/label-objects-in-camera-frames/labels.png)

Edits save automatically. Press [[⌘Z]] to undo or [[⇧⌘Z]] to redo while the editor has focus.

![A hand-drawn box alongside the labels from the scene](/help/label-objects-in-camera-frames/box.png)

To take frames from several tries, select them in **Library** ▸ **Tries**, then right-click the selection and choose **Add Frames**.

You can take up to 1,000 camera frames in one action. A simulated try gets labels from its recorded body poses through the training-image renderer. If its source scene no longer matches the recorded model, extraction stops.

Imported LeRobot and Operate tries use their saved videos. Imported MCAP tries use their compressed-image topics. Video frames start without object labels.

## Polygons, keypoints and classes

Use **Draw polygon** to place corners, then press [[↩]] to finish. Drag an existing polygon’s corners to fix its outline.

Select a label before using **Place keypoint**. Give its point a name in **Keypoint name**, then click its position. Reuse that name on later frames.

Use **Add Class** for another object class. **Rename Class** changes that class’s name across every frame in the set.

## Masks and suggested labels

With a class selected, choose **Segment object** and click the object. SAM 2 small downloads on first use and runs locally.

Select a label and choose **Track Forward** to carry it into the next 30 frames from that try and camera. Each predicted label stays unreviewed. Correct it or choose **Accept Label** before using it as reviewed data.

**See Objects** fills the set with detector suggestions while keeping manual and accepted labels. To accept the current frame’s suggestions together, choose **Select label**, click empty space in the image and click **Accept Labels**. The agent’s labels also stay unreviewed.

Open the saved dataset in **Library** and click **Label Objects** under an image to edit it again. If a saved version is selected, choose **Working Dataset** in **Dataset version** first. [Export Dataset](/help/export-a-lerobot-dataset) includes the image labels as COCO and YOLO packages.
