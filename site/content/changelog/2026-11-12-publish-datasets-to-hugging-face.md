---
title: Publish datasets to Hugging Face
date: 2026-11-12
image: /changelog/publish-datasets-to-hugging-face/cover.png
---

You can publish a named dataset to Hugging Face and reuse a saved version after its tries or labels change. Publishing needs the desktop app and a Hugging Face token with write access.

The dataset view in the Library has export and publishing controls alongside a version picker.

After relabeling a grasp, you can export the version used for an earlier training run with its original instructions.

A saved version keeps the selected recording frames, instructions, labels, tags, quality decisions, images and image annotations. Editing the working dataset creates a new version the next time you export, publish or train. Unchanged content keeps its version, and repeating a saved version's export returns the same zip bytes.

A search for a segment includes its exact frame range. Samples from one source run, generated variations and identical content stay together in training, validation or test. Imported split assignments remain attached to their samples.

Failed tries and samples with quality flags stay out of exports and training. Each published version gets a Hub tag such as `dataset-v2`.

Older versions without saved samples can’t restore historical labels. Missing saved content stops export and training with an error.

Steps are in [Make a dataset from tries](/help/make-a-dataset-from-tries) and [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
