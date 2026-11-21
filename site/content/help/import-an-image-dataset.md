---
title: Import an image dataset
date: 2026-11-14
collection: simulate-and-train
type: task
keywords:
  - roboflow
  - coco
  - yolo
  - pascal voc
  - parquet
  - annotations
related:
  - make-training-images
  - publish-a-dataset-to-hugging-face
covers:
  - src/vision/import/
  - src/workspace/useDataImport.ts
  - src/workspace/dataImportSource.ts
  - src/workspace/importLink.ts
  - src/components/ImportRobotSheet.tsx
  - src/components/library/DatasetsSection.tsx
  - src/components/tries/DatasetPane.tsx
  - src/roboflow/
  - electron/roboflow/
---

Bring labeled camera images from a local folder, Roboflow or Hugging Face into the Library, with their classes and train, validation and test splits.

## From your computer

1. Press [[⌘K]] and choose **Import Robot**.
2. Click **Choose Folder**.
3. Pick the folder containing the images and their COCO, YOLO or Pascal VOC annotations.
4. In **Library**, click the imported dataset under **Datasets** to open its images and check the image and class counts.

![Library showing a COCO dataset with two images and two classes](/help/import-an-image-dataset/library.png)

You can also drop the folder or its zip on the canvas. For a zip, right-click the canvas and choose **Import**.

If a Case is open, a class whose name matches one world object takes that object's name and link. Matching ignores capitalization and singular or plural forms. Classes without one matching object keep their names.

## From Roboflow

Roboflow imports require the desktop app and a Roboflow API key. You can use a project link or a dataset version link from `app.roboflow.com` or `universe.roboflow.com`.

1. Press [[⌘K]] and choose **Import Robot**.
2. Paste the Roboflow link into **Robot link**.

![The Import Robot sheet with a Roboflow dataset version link](/help/import-an-image-dataset/link.png)

3. Click **Import**.
4. If **Settings** opens, enter the **Roboflow API key** in **Accounts**.
5. Press [[↩]] to save it.

![Accounts with the Roboflow API key field focused](/help/import-an-image-dataset/accounts.png)

6. Close **Settings** with [[Esc]].
7. Repeat steps 1 to 3 with the same link.
8. In **Library**, click the imported dataset under **Datasets**.

![Library with the local COCO dataset and imported Roboflow version, each holding two images and two classes](/help/import-an-image-dataset/roboflow.png)

A project link imports its latest version. A version link imports that version as COCO. Basecase keeps the images and annotations locally, so opening the dataset later doesn't fetch them again.

## From Hugging Face

Hugging Face imports require the desktop app. Basecase reads image datasets stored as COCO, YOLO, Pascal VOC or image Parquet files.

1. Press [[⌘K]] and choose **Import Robot**.
2. In **Robot link**, paste a `huggingface.co/datasets/…` link.
3. Press [[↩]].
4. In **Library**, click the imported dataset under **Datasets**.

## Limits

Images must be JPEG or PNG, with no side longer than 8,192 pixels and no more than 16,777,216 pixels per image. An import can contain up to 10,000 images and 20,000 files, with each image up to 64 MB. Annotation files can be up to 16 MB, and a Parquet shard can be up to 256 MB. All source files together must fit within 600 MB, and decoded images together must fit within 64 million pixels.

A Hugging Face download can contain up to 2,000 files and 1 GB in total, and image imports still have the 600 MB source-file limit. To bypass the Hub's file-count limit, download the dataset and import its folder.

COCO imports keep boxes, polygons, run-length masks and named keypoints. YOLO imports keep detection boxes, segmentation polygons and pose keypoints. Pascal VOC imports keep boxes. Boxes and polygons become masks sampled at pixel centers, so their saved outlines follow image pixels. JPEG bytes stay as they are, while PNG images are converted to JPEG.

Each YOLO label row starts with a class ID. Class IDs start at zero and follow the YAML class names.

In YOLO YAML, each split must name one directory, image or image-list text file. Lists of directories aren’t supported.

A published Basecase dataset can contain images and recorded tries together. Import keeps both when the tries fit the robot in the open scene.

To fit a model to the imported labels, follow [Train a vision model](/help/train-a-vision-model). You can [set requirements for vision model retention](/help/require-vision-conditions) before training to require scores for a condition, camera or class. To share the dataset, follow [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face).
