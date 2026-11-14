---
title: Import robots from GitHub, Hugging Face and zips
date: 2026-11-12
image: /changelog/import-robot-repos-and-zips/cover.png
---

You can now import a published robot from a link to its GitHub or Hugging Face repo, a folder in one, or a zip. Basecase finds the URDF or MJCF inside and inserts the robot with its joints, limits and masses.

A robot repo rarely holds only the robot. Launch files, configs and test worlds sit beside one or more descriptions, and the one you want is often a few folders down.

## Where it is

Press ⌘K and choose Import Robot. It's also in **File** ▸ **Import Robot**, and behind the + at the top of the Robots view.

Paste the link into the sheet's one field. It takes a GitHub repo, a folder in one, or its Download ZIP link, like `github.com/TheRobotStudio/SO-ARM100`. A Hugging Face model or dataset repo works too, and so does a folder or a single file in one, or a direct link to a `.urdf`, `.xacro`, `.xml` or `.zip`.

Press Enter. Basecase reads the repo's file list and fetches only the files it needs. The robot comes in already selected, and a toast shows how many joints it found, with a Pose button to move them.

![Import Robot with the SO-ARM100 repo's link](/changelog/import-robot-repos-and-zips/link.png)

## When a repo has several robots

Basecase looks for the robot's description on its own. It prefers an MJCF model, then a URDF, and it skips the ROS package files around them.

If one description is left, it imports. If several sit side by side, like the three SO-101 variants in SO-ARM100, Import Robot lists them all. Pick one and click Import.

![The three SO-101 models in SO-ARM100, with so101_new_calib.xml picked](/changelog/import-robot-repos-and-zips/choose.png)

A link to a single file in a Hugging Face repo imports that file and nothing else. If the link has no robot in it, or the repo is private or missing, you get one toast saying so. Repos must be public, and a zip link can be up to 200 MB.

## Xacro packages

Import Robot also opens xacro. A robot exported from Fusion 360 with fusion2urdf comes in with its joints and limits, and so does a ROS description package built from xacro macros. Choose the package folder or paste the repo link.

Basecase expands includes, properties, macros, `xacro:if` and `xacro:arg` defaults in the app. If there's a plain `.urdf` beside the xacro, the `.urdf` still wins.

![A desk arm exported with fusion2urdf, inserted with its 2 joints and selected in the scene](/changelog/import-robot-repos-and-zips/fusion-arm.png)

## From your computer

Drag a robot's folder, zip, URDF, xacro or MJCF file onto the canvas, and the robot stands where you drop it. Basecase searches a dropped folder the same way as a repo, skipping `.git` and `node_modules`.

To pick a folder from a file picker instead, click Choose Folder in the Import Robot sheet.

## After it's in

Each piece of the robot that has a shape becomes a mesh part. Each revolute or prismatic joint keeps its axis and limits, so the robot is ready for the Pose tab, Simulate and Operate.

Robots you import from a link are kept in **Robots** ▸ **Imported** with a preview, and you can add them to any scene from there with one click.

Read [Import a robot](/help/import-a-robot) in the help center for the steps.
