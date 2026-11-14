---
title: Import robot data as tries
date: 2026-11-14
collection: simulate-and-train
type: task
order: 16
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

You can import teleop data recorded with LeRobot or ROS 2. Basecase turns each episode into a try on the robot in your scene.

1. Open the scene that has the robot the data was recorded on.
2. Right-click an empty spot on the canvas, then choose **Import**.
3. Pick a `.mcap` file, or a LeRobot dataset saved as a zip.
4. If the joint names in the data don't match your robot's, the **Match Joints** sheet opens with a guess for each joint. Fix any wrong guesses, then click **Import**.

![The Match Joints sheet pairing joint1 to joint6 from an MCAP file with the arm's joints](/help/import-robot-data-as-tries/match.png)

5. To find your tries, click **Library** in the view rail on the left, then click your robot under **Tries**. Each try shows its task and the file or repo it came from.

![Tries with three episodes from a zip, one from an MCAP file and one from Hugging Face](/help/import-robot-data-as-tries/tries.png)

6. Click a try to step through its joints on the timeline. To learn more, see [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![An imported try open on the timeline with a lane for each of six joints](/help/import-robot-data-as-tries/timeline.png)

In the desktop app, you can also import a dataset from Hugging Face. Press [[⌘K]], choose **Import Robot**, paste the dataset's link, then press [[↩]].

![The Import Robot sheet with a Hugging Face dataset link](/help/import-robot-data-as-tries/link.png)

To import a LeRobot or rosbag2 folder, drop it on the canvas. Or click **Choose Folder** in the Import Robot sheet.

## What comes in

- **LeRobot** datasets in v2.0, v2.1 and v3.0. Each try is named after its episode's task. A v3 file that holds many episodes becomes one try per episode.
- **ROS 2** recordings, as a `.mcap` file or a rosbag2 folder whose `metadata.yaml` lists its storage as MCAP. Basecase resamples joint positions from `sensor_msgs/JointState` to 50 frames per second.
- **Units** in radians, degrees or raw Feetech servo counts. Basecase tells them apart by the range of the values.
- **Videos** for each camera. A try keeps each camera's file and the time span of its episode. Basecase doesn't copy or re-encode the videos, and it doesn't decode camera images in an MCAP file.

Basecase matches joints by name, so ALOHA's left and right arms go to two robots in the scene. Any match you make in the Match Joints sheet is saved, and Basecase uses it again the next time you import the same data. If you import the same data twice, nothing is added the second time.

If no joint matches and the dataset names a robot that isn't in your scene, such as an SO-101 or a Unitree G1, you'll see a message with **Import Robot**. Add the robot to your scene, then import the data again.

Basecase leaves out any episode that goes outside your robot's joint limits on every frame. An episode that goes outside them for only part of the time still comes in.

## Limits

- A Hugging Face dataset can be up to 1 GB and 2,000 files, and each file can be up to 256 MB. For a larger dataset, download it and import its folder instead.
- Files on your computer can be up to 512 MB, and episodes can be up to 10 minutes long.
- Basecase opens uncompressed and zstd MCAP files. It can't open LZ4 MCAP files.
- Basecase can't always tell units apart by range. SO-101 data saved in LeRobot's −100 to 100 range is read as degrees, and degrees that all stay within 6.6 of zero are read as radians. In both cases, the try replays at the wrong angles.
- If any value in a file isn't a number, Basecase rejects the whole file.
