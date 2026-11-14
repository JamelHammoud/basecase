---
title: Publish datasets to Hugging Face
date: 2026-11-12
image: /changelog/publish-datasets-to-hugging-face/cover.png
---

You can now publish a Case's passed tries to the Hugging Face Hub as a LeRobot dataset.

Open Results and click Publish to Hugging Face under Export Dataset, or run it from ⌘K.

You need the desktop app and a Hugging Face token with write access.

![Publish to Hugging Face under Export Dataset in Results](/changelog/publish-datasets-to-hugging-face/results.png)

A fine-tune on a rented GPU can't use a dataset that sits in a zip on your disk, but once it's on the Hub, a training script loads it by its repo name.

## What's in It

Each passed try becomes one episode of joint positions and actuator targets at 25 frames a second. Each episode comes with a 640 × 480 video from the scene camera and from each camera on the robot.

The dataset is LeRobot v2.1 with a GR00T modality file, tagged v2.1. GR00T and LeRobot before 0.4 load it as it is, and LeRobot 0.4 and later convert it with their own script.

## Publishing Again

Publish again from the same scene and Basecase replaces the episodes with the tries that pass now. It leaves out tries from an earlier design of the robot, and the toast says how many.

Datasets are public and go on your own account. Basecase doesn't write a dataset card.

Read [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face) in the help center for the steps, and [From a passed try to a Hugging Face dataset](/blog/datasets-on-hugging-face) for why it works this way.
