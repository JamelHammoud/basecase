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

1. Open the scene with the robot the data was recorded on.
2. Right-click an empty spot on the canvas and choose **Import**.
3. Pick a `.mcap` file, or a LeRobot dataset as a zip.
4. If the joint names in the data don't match your robot's, Basecase opens the Match Joints sheet with a guess for each joint. Fix any wrong guesses, then click **Import**.

![The Match Joints sheet pairing joint1 to joint6 from an MCAP file with the arm's joints](/help/import-robot-data-as-tries/match.png)

5. Click **Library** in the view rail on the left, then click your robot under **Tries**. Each try shows its task and the file or repo it came from.

![Tries with three episodes from a zip, one from an MCAP file and one from Hugging Face](/help/import-robot-data-as-tries/tries.png)

6. Click a try to step through its joints on the timeline. See [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![An imported try open on the timeline with a lane for each of six joints](/help/import-robot-data-as-tries/timeline.png)

In the desktop app, you can also import a dataset from Hugging Face. Press [[⌘K]], choose **Import Robot**, paste the dataset's link, then press [[↩]].

![The Import Robot sheet with a Hugging Face dataset link](/help/import-robot-data-as-tries/link.png)

To import a LeRobot or rosbag2 folder, drop it on the canvas or click **Choose Folder** in the Import Robot sheet.

## What comes in

- **LeRobot** datasets in v2.0, v2.1 and v3.0. Basecase names each try after its episode's task. A v3 file that holds many episodes becomes one try per episode.
- **ROS 2** recordings, either a `.mcap` file or a rosbag2 folder whose `metadata.yaml` lists its storage as MCAP. Basecase resamples joint positions from `sensor_msgs/JointState` to 50 frames per second.
- **Units**: Basecase reads the range of the values to tell radians, degrees and raw Feetech servo counts apart.
- **Videos**: A try holds each camera's file and the time span of its episode. Basecase doesn't copy or re-encode the videos, and doesn't decode camera images in an MCAP file.

Basecase matches joints by name, so ALOHA's left and right arms go to two robots in the scene. Any match you make in the Match Joints sheet is saved, and Basecase uses it again the next time you import the same data. If you import the same data twice, Basecase doesn't add anything the second time.

If no joint matches and the dataset names a robot your scene doesn't have, such as an SO-101 or a Unitree G1, you'll see a message with **Import Robot**. Add the robot to your scene, then import the data again.

If an episode goes outside your robot's joint limits on every frame, Basecase leaves it out. An episode that goes outside them for part of the time still comes in.

## Limits

- A Hugging Face dataset can be up to 1 GB and 2,000 files, and each file can be up to 256 MB. For a larger dataset, download it and import its folder.
- Files on your computer can be up to 512 MB, and episodes up to 10 minutes.
- Basecase opens uncompressed and zstd MCAP files, but not LZ4 ones.
- Basecase can't always tell units apart by range. SO-101 data saved in LeRobot's −100 to 100 range reads as degrees. Degrees that all stay within 6.6 of zero read as radians. Either one replays at the wrong angles.
- If any value in a file isn't a number, Basecase rejects the whole file.
