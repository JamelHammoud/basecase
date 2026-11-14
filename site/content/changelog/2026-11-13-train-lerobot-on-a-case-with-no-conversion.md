---
title: Train LeRobot on a Case with no conversion
date: 2026-11-13
---

You can now point `lerobot-train` straight at a dataset from Export Dataset or Publish to Hugging Face. Basecase writes LeRobot v3.0, the format LeRobot 0.4 and later read.

Every dataset used to be LeRobot v2.1. Before training, you had to run LeRobot's `convert_dataset_v21_to_v30` script on it in Python. Now a published Case trains by name, and `--dataset.streaming=true` streams it from the Hub.

On the Hub, v3.0 is the repo's main branch, tagged `v3.0`. GR00T still reads only v2, so the v2.1 copy with `meta/modality.json` stays at the `v2.1` tag. The exported zip holds v3.0 at the top and v2.1 in a `v2.1` folder.

In v3.0, all episodes share one data file and one video per camera. A new file starts before one passes 100 MB of rows or 200 MB of video. Episode videos are joined without encoding them again.

The zip and the upload carry every video twice, once per layout. Steps are in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
