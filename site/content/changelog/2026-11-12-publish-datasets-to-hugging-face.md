---
title: Publish datasets to Hugging Face
date: 2026-11-12
image: /changelog/publish-datasets-to-hugging-face/cover.png
---

You can now publish a Case's passed tries to the Hugging Face Hub as a LeRobot dataset, from Results or ⌘K. It needs the desktop app and a Hugging Face token with write access.

A dataset in a zip on your disk can't feed a fine-tune on a rented GPU. On the Hub, a training script loads it by its repo name.

Each passed try becomes one episode of joint positions and actuator targets at 25 frames a second. It comes with a 640 × 480 video from the scene camera and from each camera on the robot. The dataset is LeRobot v2.1 with a GR00T modality file, tagged v2.1. GR00T and LeRobot before 0.4 load it as it is; LeRobot 0.4 and later convert it with their own script.

Publishing again from the same scene replaces the episodes with the tries that pass now. Tries from an earlier design of the robot are left out, and the toast says how many.

Datasets are public and go on your own account. Basecase writes no dataset card.

Steps are in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). Why it works this way is in [From a passed try to a Hugging Face dataset](/blog/datasets-on-hugging-face).
