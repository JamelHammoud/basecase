---
title: Export a LeRobot dataset
date: 2026-11-13
collection: simulate-and-train
type: task
order: 5
keywords:
  - record dataset
  - demonstrations
  - training data
  - gr00t
  - groot
  - vla
  - parquet
  - imitation learning
related:
  - make-a-dataset-from-tries
  - multiply-a-try-into-demonstrations
  - publish-a-dataset-to-hugging-face
covers:
  - src/components/tries/DatasetPane.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/useDatasetRecords.ts
  - src/workspace/datasetJob.ts
  - src/workspace/datasetCommands.tsx
  - src/datasets/
---

Export the passed tries in a dataset as a LeRobot dataset with camera video. You can then use it to fine-tune LeRobot, GR00T or another robot model.

LeRobot is Hugging Face's open library for robot learning, and GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations, which are recordings of a task done right. Each selected recording range is one demonstration. A selected segment uses its instruction or label. A whole try uses the instruction you or the agent wrote, else the dataset's task.

1. Open a Case and record tries with **Try It** until at least one passes. To learn how, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Export Dataset**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

A toast shows "Exporting dataset…" and then tells you how many tries went in. The zip saves to your downloads, named after the dataset. For example, Touch the Dots exports as `touch-the-dots-dataset.zip`.

You can also find **Export Dataset** in [[⌘K]] while a dataset is open. Exporting the working dataset freezes its samples, labels, content and split assignments as a version. To export an earlier version, choose it in **Dataset version**, then click **Export Dataset**. Re-exporting that version returns its saved zip bytes, even after you edit the original tries.

## Which tries go in

The working dataset exports passed and unjudged tries that fit the current robot model. Missed tries and tries with any quality flag stay in the dataset but out of the export. Tries from another robot model stay out too. The toast reports the number left out. A saved version exports against its saved robot and scene.

Tries made by [Multiply](/help/multiply-a-try-into-demonstrations) go in too, one episode each. Tries from your real robot don't go in, because they only record where the robot's base went. [Imported tries](/help/import-robot-data-as-tries) on the same robot go in as demonstrations, unless a Case judged them failed or you marked them failed.

If none of the tries fit, the toast says "Export and training take only passed tries of this Case as it is now. Try It to record more."

## What's in the zip

Each selected recording range becomes one episode, recorded at 25 frames a second. An episode holds the joint positions, the joint targets, and a 640 × 480 video from each camera. A try's segments go in as subtasks, each with its instruction or label. A segment selection includes only its selected frames and overlapping subtasks. There's always a **scene** camera at the front three-quarters, plus one camera for each camera part on the robot. Camera views you add to the scene aren't part of the dataset. A captured world's splat or mesh appears in every camera video, at the same placement as the Case.

The export keeps the version's training, validation and test assignments. Segments, variations and camera frames from one source stay together. Missing saved content stops the export with an error.

The zip holds two copies of the dataset. The top folder is LeRobot v3.0, which LeRobot 0.4 and later can load as is. The `v2.1` folder inside it is LeRobot v2.1, for GR00T, which only reads v2. For a list of every file and column, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

If the dataset also holds rendered or imported training images, the zip includes `coco/` and `yolo/` alongside the LeRobot files. An image-only dataset exports those two folders without LeRobot episodes. A mixed dataset with no fitting tries still exports its images. See [Make training images from a Case](/help/make-training-images) or [Import an image dataset](/help/import-an-image-dataset).

To put the dataset on the Hugging Face Hub instead of in a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). To train a policy inside Basecase, use a dataset without images and follow [Train a policy from your tries](/help/train-a-policy-from-your-tries).
