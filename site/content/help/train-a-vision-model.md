---
title: Train a vision model
date: 2026-11-15
collection: simulate-and-train
type: task
keywords:
  - detection
  - segmentation
  - keypoints
  - classification
  - onnx
  - roboflow
related:
  - import-an-image-dataset
  - make-training-images
covers:
  - src/components/tries/DatasetPane.tsx
  - src/components/tries/VisionTrainingResults.tsx
  - src/workspace/visionTrainingView.ts
  - src/workspace/datasetCommands.tsx
  - src/vision/training/
  - electron/visionTrainer/
---

Fit a model to your labeled images in the desktop app and compare it with the current model on held-out real images.

Your images must have separate training and validation groups. Basecase reserves an eligible real recording group for testing before freezing the working dataset.

1. In **Library**, open an image dataset under **Datasets**. To bring in labeled images, follow [Import an image dataset](/help/import-an-image-dataset).
2. In **Vision task**, choose **Detect Objects**, **Segment Objects**, **Find Keypoints** or **Classify Images**.
3. In **Latency limit**, enter the maximum inference time in milliseconds.
4. In **Size limit**, enter the maximum model size in megabytes.
5. Click **Train**.

![An image dataset with task, latency and size controls ready to train](/help/train-a-vision-model/train.png)

6. When training finishes, check the candidate and incumbent scores, per-class misses, false positives, inference time and model size.

![A completed training attempt with its incumbent comparison and model measurements](/help/train-a-vision-model/results.png)

7. For a retained model, in **Apply model to**, choose its destination.
8. Click **Apply Model**.

To stop a run, click **Stop Training**. You can also choose **Train** or **Stop Training** from [[⌘K]] while the image dataset is open.

![A training run showing its progress and Stop Training](/help/train-a-vision-model/running.png)

Training freezes the working dataset's images, labels and split assignments as a version. To train from a saved version, choose it in **Dataset version** before clicking **Train**. Accept suggested labels before training. Classification needs at least two classes and exactly one annotation per image, and keypoint training needs named landmarks.

Basecase keeps a candidate only when it beats the incumbent on the same held-out real test images and meets your recorded limits. The first run compares with the initial model before training. A tie, a limit failure or a run without eligible real test images saves a checkpoint. Generated Case images and frames extracted from simulated tries don't count as real test evidence.

![A checkpoint after a candidate scored below its incumbent, beside the previously retained model](/help/train-a-vision-model/checkpoint.png)

The test split stays out of fitting and validation. Each attempt remains in the dataset's results, so repeated comparisons remain visible. Inference time is the measured 95th percentile, including preprocessing and result decoding. Model loading and JPEG decoding happen before this measurement.

To add generated views to your training data, follow [Make training images from a Case](/help/make-training-images).
