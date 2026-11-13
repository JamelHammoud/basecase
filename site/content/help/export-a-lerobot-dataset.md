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
  - publish-a-dataset-to-hugging-face
covers:
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/caseCommands.tsx
  - src/datasets/
---

Turn a Case's passed tries into a LeRobot v2.1 dataset with camera video, to fine-tune GR00T, LeRobot or another robot model on.

LeRobot is Hugging Face's open library for robot learning, and GR00T is NVIDIA's foundation model for robots. Both learn from demonstrations: recordings of a task done right. A passed try is one, with the Case's brief as the instruction.

1. Open a Case and record tries with **Try It** until at least one passes. Steps are in [Try a Case](/help/try-a-case).
2. Under **Results**, click **Export Dataset**.

![Export Dataset under a passed try in Results](/help/publish-a-dataset-to-hugging-face/results.png)

A toast shows "Exporting dataset…", then names how many tries went in. Basecase saves the zip to your downloads, named after the Case: `touch-the-dots-dataset.zip` for Touch the Dots.

**Export Dataset** is also in [[⌘K]].

## Which tries go in

Only passed tries go in: a dataset holds the task done right. Each try must also match the robot as it is now. Tries recorded before the robot's last change are left out. The toast counts them: "Exported 3 tries as a dataset, left out 2 from an earlier design".

When every passed try is from an earlier design, the toast says "These tries are from an earlier design. Try It again to record new ones."

## What's in the zip

Each try becomes one episode at 25 frames a second: the joint positions, the joint targets, and a 640 × 480 video from each camera. There's always a **scene** camera at the front three-quarters, plus one for each camera part on the robot. Every file and column is in [LeRobot dataset contents](/help/lerobot-dataset-contents).

GR00T reads LeRobot v2.1. LeRobot 0.4 and later read v3, and convert v2.1 with their own script.

Camera views you add to the scene aren't recorded; camera parts are. To put the dataset on the Hugging Face Hub instead of a zip, see [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
