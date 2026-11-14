---
title: Import robot data as tries
date: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - lerobot
  - hugging face
  - dataset
  - mcap
  - ros 2
  - rosbag2
  - ros bag
  - teleop data
  - episodes
  - so-101
  - koch
  - aloha
  - g1
related:
  - open-a-try-from-any-scene
  - scrub-a-try-on-the-timeline
covers:
  - src/datasets/import/
  - src/workspace/useDataImport.ts
  - src/workspace/dataImportSource.ts
  - src/workspace/importRoute.ts
  - src/components/MatchJointsSheet.tsx
  - src/components/tries/TryTile.tsx
  - electron/hub/datasetRepo.mjs
---

Bring teleop data recorded with LeRobot or ROS 2 into Basecase, one try per episode, on the robot in your scene.

1. Open the scene with the robot the data was recorded on.
2. Right-click an empty spot on the canvas and choose **Import**.
3. Pick a `.mcap` file, or a LeRobot dataset as a zip.
4. If the recorded joint names differ from your robot's, the Match Joints sheet opens with a guess for each. Change any that are wrong, then click **Import**.

![The Match Joints sheet pairing joint1 to joint6 from an MCAP file with the arm's joints](/help/import-robot-data-as-tries/match.png)

5. Click **Library** in the view rail on the left, then click your robot under **Tries**. Each try shows its task and the file or repo it came from.

![Tries with three episodes from a zip, one from an MCAP file and one from Hugging Face](/help/import-robot-data-as-tries/tries.png)

6. Click a try to step through its joints on the timeline, as in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![An imported try open on the timeline with a lane for each of six joints](/help/import-robot-data-as-tries/timeline.png)

To import from Hugging Face, press [[⌘K]], choose **Import Robot**, paste the dataset's link and press [[↩]]. This works in the desktop app only. To import a LeRobot or rosbag2 folder, drop it on the canvas, or click **Choose Folder** in the same sheet.

![The Import Robot sheet with a Hugging Face dataset link](/help/import-robot-data-as-tries/link.png)

## What comes in

- **LeRobot** datasets in v2.0, v2.1 and v3.0. Each episode becomes a try named by its task. A v3 file holding many episodes splits into one try each.
- **ROS 2** recordings: a `.mcap` file, or a rosbag2 folder whose `metadata.yaml` says its storage is MCAP. Joint positions from `sensor_msgs/JointState` are resampled to 50 frames a second.
- **Units** are told apart by their range: radians, degrees, or raw Feetech servo counts.
- **Videos** aren't copied or re-encoded. A try keeps each camera's file and the time span of its episode. Camera images in an MCAP file aren't decoded.

Joints match by name, so ALOHA's left and right arms land on two robots in the scene. A match you make in the Match Joints sheet is kept, and the same data matches the same way next time. Importing the same data again adds nothing.

If no joint matches and the dataset names a robot your scene lacks, such as an SO-101 or a Unitree G1, a message offers **Import Robot**. Import the data again once the robot is in.

An episode outside your robot's joint limits on every frame is left out. One outside them for part of the time is kept.

## Limits

- A Hugging Face dataset can be up to 1 GB and 2,000 files. Download a larger one and import its folder.
- Each file can be up to 512 MB, and each episode up to 10 minutes.
- MCAP files compressed with LZ4 don't open. Uncompressed and zstd files do.
- A file with a value that isn't a number doesn't import at all.
