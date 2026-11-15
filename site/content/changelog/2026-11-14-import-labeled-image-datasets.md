---
title: Import labeled image datasets
date: 2026-11-14
image: /changelog/import-labeled-image-datasets/cover.png
---

You can now bring labeled images from Roboflow, Hugging Face or a local folder into Basecase and find them under Datasets in the Library.

A set of mug images labeled outside Basecase can join the training images made from a Case. Imports keep class names, bounding boxes and train, validation and test splits. COCO masks and named keypoints come in too, along with YOLO segmentation and pose labels and Pascal VOC boxes.

Each dataset shows its image and class counts. Export Dataset writes COCO and YOLO packages, and Publish to Hugging Face uploads them with the dataset's version tag and a card linking both formats.

Roboflow links require the desktop app and an API key in Accounts. Imports accept JPEG and PNG images, with up to 10,000 images in one import.

Follow [Import an image dataset](/help/import-an-image-dataset) to open a folder or a dataset link.
