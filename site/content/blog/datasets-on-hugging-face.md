---
title: Datasets on Hugging Face
date: 2026-11-12
---

A Case in Basecase is a world and a goal your robot tries in simulation. Every try is recorded: the joint positions, the actuator targets and camera video from the scene and from each camera on the robot. Until now the tries that passed left the app as a zip from Export Dataset, and getting them anywhere useful meant unpacking and uploading them yourself.

Now there's Publish to Hugging Face right under Export Dataset, and in ⌘K. Add a Hugging Face access token with write access in Settings ▸ Accounts once. After that, one click sends the passed tries to a public dataset repo on your account, and the toast's Open button takes you to it.

What lands on the Hub is the same LeRobot v2.1 dataset the zip holds: one parquet file and one video per camera for each try, plus the metadata LeRobot and GR00T read, including a modality file for GR00T. The repo is tagged v2.1, because LeRobot's reader loads a dataset at its version tag and refuses one without it. Large files go up through the Hub's LFS storage, in parts when they're big.

Each Case gets its own repo per scene, so publishing Touch the Dots from two different robots makes two datasets instead of one replacing the other. Publishing again from the same scene replaces that repo's episodes with the tries that pass now, and moves the tag to the new commit.

The token stays in the app's main process, encrypted on disk. The page that draws the app only learns whether you're signed in and your account name, and upload addresses outside huggingface.co never receive the token.
