---
title: Export a LeRobot dataset
date: 2026-11-13
updated: 2026-11-13
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
  - try-a-case
  - multiply-a-try-into-demonstrations
  - publish-a-dataset-to-hugging-face
covers:
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/caseCommands.tsx
  - src/datasets/
---

You can turn a Case's passed tries into a LeRobot dataset with camera video. Use it to fine-tune LeRobot, GR00T or another robot model.

LeRobot is Hugging Face's open library for robot learning, and GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations, which are recordings of a task done right. Each passed try is a demonstration, and the Case's brief is its instruction.

1. Open a Case and record tries with **Try It** until at least one passes. For the steps, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Export Dataset**.

![Export Dataset under a passed try in Results](/help/publish-a-dataset-to-hugging-face/results.png)

A toast shows "Exporting dataset…" and then tells you how many tries went in. Basecase saves the zip to your downloads and names it after the Case. For example, Touch the Dots exports as `touch-the-dots-dataset.zip`.

You can also find **Export Dataset** in [[⌘K]].

## Which tries go in

A dataset holds the task done right, so Basecase exports only passed tries. Each try must also match the robot as it is now. Basecase leaves out tries recorded before the robot's last change, and the toast tells you how many it left out, for example "Exported 3 tries as a dataset, left out 2 from an earlier design".

Tries made by [Multiply](/help/multiply-a-try-into-demonstrations) go in too, one episode each. Tries from your real robot don't, because they only record where the robot's base went.

If every passed try is from an earlier design, the toast says "These tries are from an earlier design. Try It again to record new ones."

## What's in the zip

Each try becomes one episode, recorded at 25 frames a second. An episode holds the joint positions, the joint targets, and a 640 × 480 video from each camera. There's always a **scene** camera at the front three-quarters, plus one camera for each camera part on the robot. Camera views you add to the scene aren't recorded.

The zip holds two copies of the dataset. The top folder is LeRobot v3.0, which LeRobot 0.4 and later load as it is. The `v2.1` folder inside it is LeRobot v2.1, for GR00T, which reads only v2. For every file and column, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

To put the dataset on the Hugging Face Hub instead of in a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). To train on the same tries inside Basecase, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
