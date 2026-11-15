---
title: Train vision models
date: 2026-11-15
image: /changelog/train-vision-models/cover.png
---

You can now train vision models from an image dataset in Basecase and compare them on held-out real images. Training runs locally in the desktop app.

A detector that recognizes a cup in a catalog photo can miss that cup from a wrist camera. You can train on labeled camera images and generated Case views, with separate training, validation and test splits saved in a dataset version.

Choose detection, instance segmentation, named keypoints or image classification. Each attempt shows its task score, the incumbent's score, per-class misses and false positives, inference time and model size. Basecase retains a candidate only when it scores higher on the same real test images and meets the latency and size limits you set.

A tie, a failed limit or missing real test images leaves a checkpoint. Generated views don't count as real test evidence. Retained models can be applied to compatible cameras and ML nodes.

The steps are in [Train a vision model](/help/train-a-vision-model).
