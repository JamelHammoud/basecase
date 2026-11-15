---
title: Make training images from a Case
date: 2026-11-14
collection: simulate-and-train
type: task
covers:
  - src/components/cases/TrainingImagesSheet.tsx
  - src/workspace/useTrainingImages.ts
  - src/vision/trainingImagesClient.ts
  - src/vision/frameSet.ts
  - src/vision/cocoExport.ts
  - src/vision/yoloExport.ts
---

Render labeled camera images from your robot's Case, then export them for model training.

1. In **Simulate**, open a Case.
2. Press [[⌘K]].
3. Choose **Make Training Images**.
4. In **Images**, enter how many images to render.
5. Under **Cameras**, select the views to include.
6. Under **Classes**, select the objects or robot links to label.
7. Click **Make Training Images**.
8. In the dataset, click **Export Dataset**.

![The training image picker with the Block class and Overhead camera selected](/help/make-training-images/select.png)

The dataset opens when rendering finishes. You can make up to 1,000 images per run.

![The saved Case dataset showing its rendered images](/help/make-training-images/dataset.png)

The ZIP contains COCO and Ultralytics YOLO packages with train, validation and test splits. COCO includes boxes, masks and keypoints. YOLO text labels contain boxes. Both packages keep full labels and depth in their Basecase files.

Exporting saves the image bytes, annotations and split assignments in a dataset version. Camera views from the same source run stay in one split. To export those saved images after editing the working dataset, choose the version in **Dataset version** before exporting.

The Case supplies object pose variation, named points and declared color classes. The picker repeats seed 1. The same Case, camera settings and rendering environment reproduce the same image and label bytes.

You can also open **Make Training Images** in a Case's **Results**. To publish a saved version, follow [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
