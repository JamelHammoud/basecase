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
  - try-a-case
  - multiply-a-try-into-demonstrations
  - publish-a-dataset-to-hugging-face
covers:
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/caseCommands.tsx
  - src/datasets/
---

You can turn the passed tries in a Case into a LeRobot dataset with camera video. Then use it to fine-tune LeRobot, GR00T or another robot model.

LeRobot is Hugging Face's open library for robot learning. GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations, which are recordings of a task done right. Basecase turns each passed try into one demonstration and uses the Case's brief as its instruction. If you or the agent gave a try its own instruction, the dataset uses that one instead.

1. Open a Case and record tries with **Try It** until at least one passes. For the steps, see [Try a Case](/help/try-a-case).
2. Under **Results**, click **Export Dataset**.

![Export Dataset under a passed try in Results](/help/publish-a-dataset-to-hugging-face/results.png)

A toast shows "Exporting dataset…", then tells you how many tries went in. Basecase saves the zip to your downloads folder under the Case's name. For example, Touch the Dots exports as `touch-the-dots-dataset.zip`.

You can also find **Export Dataset** in [[⌘K]].

## Which tries go in

Only passed tries that match the robot's current design go in. Basecase leaves out any try recorded before the robot's last change, and the toast tells you how many it left out. For example: "Exported 3 tries as a dataset, left out 2 from an earlier design".

Tries made by [Multiply](/help/multiply-a-try-into-demonstrations) go in too, one episode each. Tries from your real robot don't go in, because they only record where the robot's base went.

If every passed try is from an earlier design, the toast says "These tries are from an earlier design. Try It again to record new ones."

## What's in the zip

Basecase records each try as one episode at 25 frames a second. An episode holds:

- The joint positions
- The joint targets
- A 640 × 480 video from each camera

Each frame is labeled with the name of its subtask, such as "grasp the block." A subtask is the segment of the try that the frame falls in.

There's always a **scene** camera at the front three-quarters, plus one camera for each camera part on the robot. Basecase doesn't record camera views you add to the scene.

The zip holds two copies of the dataset:

- The top folder is LeRobot v3.0. LeRobot 0.7 and later load it directly.
- The `v2.1` folder inside it is LeRobot v2.1, for GR00T, which only reads v2.

For every file and column, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

## Learn more

- To put the dataset on the Hugging Face Hub instead of in a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
- To train on the same tries inside Basecase, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).
