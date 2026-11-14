---
title: Render labeled training images
date: 2026-11-14
image: /changelog/make-training-images/cover.png
---

You can now render labeled training images from a Case, using its cameras and the scene's geometry. Choose **Make Training Images** in **Results** or [[⌘K]].

An arm learning to find a block needs examples from the camera on its wrist. Basecase already knows where that block is and what hides it.

Each 640 × 480 image carries visible boxes, masks, named keypoints and depth. Seeds vary the lighting, surfaces, declared object colors, poses, distractors and camera tolerance.

The finished image dataset opens beside your try datasets in the Library. Export and publishing include COCO and YOLO layouts with training, validation and test splits.

Images describe the geometry the camera renderer supports. This step doesn't train a detector.

Steps are in [Make training images](/help/make-training-images).
