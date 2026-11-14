---
title: Export a LeRobot dataset
date: 2026-11-13
updated: 2026-11-14
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

You can turn the passed tries in a dataset into a LeRobot dataset with camera video, then use it to fine-tune LeRobot, GR00T or another robot model.

LeRobot is Hugging Face's open library for robot learning. GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations, which are recordings of a task done right. In Basecase, each passed try is a demonstration, and the dataset's task is its instruction.

1. Open a Case and record tries with **Try It** until at least one passes. To learn how, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Export Dataset**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

A toast shows "Exporting dataset…", then tells you how many tries went in. Basecase saves the zip to your downloads and names it after the dataset. For example, Touch a Point exports as `touch-a-point-dataset.zip`.

You can also find **Export Dataset** in [[⌘K]] while a dataset is open.

Every time you export, Basecase saves the dataset's tries as a version.

## Which tries go in

Basecase exports only the passed tries in a dataset, because those are its demonstrations. Missed tries stay in the dataset, but Basecase doesn't export them.

Each try must also come from the open Case, on the robot as it is now. Basecase leaves out tries from another Case or scene, and tries recorded before the robot's last change. The toast tells you how many it left out. For example: "Exported 3 tries as a dataset, left out 2 from another Case or design".

Tries made by [Multiply](/help/multiply-a-try-into-demonstrations) go in too, one episode each. Tries from your real robot don't go in, because they record only where the robot's base went.

If none of the passed tries fit, the toast says "Export and training take only passed tries of this Case as it is now. Try It to record more."

## What's in the zip

Each try becomes one episode, recorded at 25 frames a second. An episode holds:

- The joint positions
- The joint targets
- A 640 × 480 video from each camera

Every episode has a **scene** camera at the front three-quarters, plus one camera for each camera part on the robot. Basecase doesn't record camera views you add to the scene.

The zip holds two copies of the dataset:

- The top folder is LeRobot v3.0. LeRobot 0.4 and later load it as it is.
- The `v2.1` folder inside it is LeRobot v2.1, for GR00T, which reads only v2.

To see every file and column, go to [LeRobot dataset contents](/help/lerobot-dataset-contents).

## Learn more

- To put the dataset on the Hugging Face Hub instead of in a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- To train on the same tries inside Basecase, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
