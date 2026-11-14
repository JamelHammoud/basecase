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

You can export the passed tries in a dataset as a LeRobot dataset with camera video, then use it to fine-tune LeRobot, GR00T or another robot model.

LeRobot is Hugging Face's open library for robot learning, and GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations: recordings of a task done right. Each passed try is one demonstration, and the dataset's task is its instruction.

1. Open a Case and use **Try It** to record tries until at least one passes. To learn how, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
3. Click **Export Dataset**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

A toast shows "Exporting dataset…" and then tells you how many tries went in. The zip saves to your downloads with the dataset's name. For example, Touch the Dots exports as `touch-the-dots-dataset.zip`.

You can also choose **Export Dataset** from [[⌘K]] while a dataset is open. Each time you export, Basecase saves the dataset's tries as a version.

## Which tries go in

Only passed tries go in, and each one has to match the robot as it is now. Missed tries stay in the dataset, but the export skips them, along with tries from another robot and tries recorded before the robot's last change. The toast says how many it left out: "Exported 3 tries as a dataset, left out 2 from another Case or design".

Tries from [Multiply](/help/multiply-a-try-into-demonstrations) go in too, as one episode each. Tries from your real robot don't go in, because they only record where the robot's base went. [Imported tries](/help/import-robot-data-as-tries) on the same robot go in as demonstrations, because no Case judged them.

If none of the tries fit, the toast says "Export and training take only passed tries of this Case as it is now. Try It to record more."

## What's in the zip

Each try becomes one episode, recorded at 25 frames per second. An episode holds the joint positions, the joint targets and a 640 × 480 video from each camera. Every dataset has a **scene** camera at the front three-quarters, plus one camera for each camera part on the robot. Camera views you add to the scene don't go in.

The zip holds two copies of the dataset:

- The top folder is LeRobot v3.0. LeRobot 0.4 and later can load it as is.
- The `v2.1` folder inside it is LeRobot v2.1. Use this one for GR00T, which only reads v2.

For a list of every file and column, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

To put the dataset on the Hugging Face Hub instead of in a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). To train on the same tries inside Basecase, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

<!--
Scores (original): 36/50, no revision needed
| Dimension    | Score | Note |
|--------------|-------|------|
| Directness   | 8 | States facts and steps. It has no throat-clearing or rhetorical setups. |
| Rhythm       | 6 | The LeRobot/GR00T paragraph has three sentences of the same length in a row. It also has several three-item lists. |
| Trust        | 8 | It explains each concept once and doesn't soften anything. |
| Authenticity | 7 | The voice is plain, but it has some false agency ("the toast tells", "the zip saves", "the export skips"). |
| Density      | 7 | It has a few adverbs ("only" ×4, "also" ×3, "instead"), some passive voice ("recorded at", "made by", "aren't included") and one Wh- opener ("When a dataset is open"). |
-->
