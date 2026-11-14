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

Turn a dataset's passed tries into a LeRobot zip with camera video, to fine-tune LeRobot, GR00T or another robot model on.

LeRobot is Hugging Face's open library for robot learning, and GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations: recordings of a task done right. A passed try is one, with the dataset's task as the instruction.

1. Open a Case and record tries with **Try It** until at least one passes. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Export Dataset**.

A toast shows "Exporting dataset…", then names how many tries went in. Basecase saves the zip to your downloads, named after the dataset: `touch-a-point-dataset.zip` for Touch a Point.

**Export Dataset** is also in [[⌘K]] while a dataset is open. Each export saves the dataset's tries as a version.

## Which tries go in

Only the dataset's passed tries go in: a dataset holds the task done right. A missed try stays in the dataset but isn't exported. Each try must also match the robot as it is now. Tries recorded before the robot's last change are left out. The toast counts them: "Exported 3 tries as a dataset, left out 2 from an earlier design".

Tries from your real robot stay out, because they record only where the robot's base went.

Tries made by [Multiply](/help/multiply-a-try-into-demonstrations) go in too, one episode each.

When every passed try is from an earlier design, the toast says "These tries are from an earlier design. Try It again to record new ones."

## What's in the zip

Each try becomes one episode at 25 frames a second: the joint positions, the joint targets, and a 640 × 480 video from each camera. There's always a **scene** camera at the front three-quarters, plus one for each camera part on the robot.

The zip holds the dataset twice. The top folder is LeRobot v3.0, which LeRobot 0.4 and later load as it is. The `v2.1` folder inside it is LeRobot v2.1 for GR00T, which reads only v2. Every file and column is in [LeRobot dataset contents](/help/lerobot-dataset-contents).

Camera views you add to the scene aren't recorded; camera parts are. To put the dataset on the Hugging Face Hub instead of a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). To train on the same tries inside Basecase, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
