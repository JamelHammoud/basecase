---
title: Make training images
date: 2026-11-14
collection: simulate-and-train
type: task
order: 6
keywords:
  - synthetic images
  - computer vision
  - labels
  - masks
  - keypoints
  - depth
  - COCO
  - YOLO
related:
  - make-a-case
  - publish-a-dataset-to-hugging-face
covers:
  - src/components/TrainingImagesSheet.tsx
  - src/workspace/useTrainingImages.ts
  - src/workspace/trainingImageCommands.tsx
  - src/vision/
  - src/datasets/imageDatasetFiles.ts
---

Render camera images with boxes, masks, keypoints and depth from a Case, then export them for vision training.

COCO masks preserve holes. YOLO polygon labels omit them.

1. Open the Case you want to photograph, as in [Make a Case](/help/make-a-case).
2. Under **Results**, click **Make Training Images**.
3. In **Count**, enter the total number of images.
4. Under **Cameras**, choose the views to render.
5. Under **Classes**, choose the objects or robot links to label.

![Make Training Images for Pick Up a Block with count, cameras and classes](/help/make-training-images/choices.png)

6. Click **Make Training Images**.

The progress bar advances as frames are saved. The finished dataset opens with labeled image previews.

![The generated image dataset with visible boxes and Export Dataset](/help/make-training-images/dataset.png)

7. Above the images, click **Export Dataset**.

The zip contains COCO and YOLO detection and segmentation layouts. A YOLO pose layout is included when the selected classes have named keypoints. Its metadata preserves masks with holes, named keypoints and millimeter depth.

You can also find **Make Training Images** in [[⌘K]] while a Case is open.

To share the image dataset, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
