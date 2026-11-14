---
title: Train LeRobot on a Case with no conversion
date: 2026-11-13
---

You can now point `lerobot-train` at a dataset from Export Dataset or Publish to Hugging Face. Basecase writes LeRobot v3.0, the format LeRobot 0.4 and later read.

Until now, every dataset was LeRobot v2.1, and before training you had to run LeRobot's `convert_dataset_v21_to_v30` script on it in Python. Now you train on a published Case by its name, and `--dataset.streaming=true` streams it from the Hub.

## Both Versions

On the Hub, v3.0 is the repo's main branch, tagged `v3.0`. GR00T still reads only v2, so the v2.1 copy with `meta/modality.json` stays at the `v2.1` tag.

The exported zip holds v3.0 at the top and v2.1 in a `v2.1` folder. Both the zip and the upload carry every video twice, once per layout.

## How v3.0 Stores Episodes

In v3.0, all episodes share one data file and one video per camera. Basecase starts a new file before one passes 100 MB of rows or 200 MB of video, and joins episode videos without encoding them again.

Read [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face) in the help center for the steps.
