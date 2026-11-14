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

You can import teleop recordings from LeRobot or ROS 2. Basecase turns each episode into a try on the robot in your scene.

1. Open the scene with the robot from the recording.
2. Right-click an empty spot on the canvas, then choose **Import**.
3. Pick a `.mcap` file, or a zip of a LeRobot dataset.
4. If the data's joint names differ from your robot's, the **Match Joints** sheet opens with a guess for each joint. Fix any wrong guesses, then click **Import**.

![The Match Joints sheet pairing joint1 to joint6 from an MCAP file with the arm's joints](/help/import-robot-data-as-tries/match.png)

5. To find your tries, click **Library** in the view rail on the left, then click your robot under **Tries**. Each try shows its task and the file or repo it came from.

![Tries with three episodes from a zip, one from an MCAP file and one from Hugging Face](/help/import-robot-data-as-tries/tries.png)

6. Click a try to step through its joints on the timeline (see [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline)).

![An imported try open on the timeline with a lane for each of six joints](/help/import-robot-data-as-tries/timeline.png)

In the desktop app, you can also import a dataset from Hugging Face. Press [[⌘K]], choose **Import Robot**, paste the dataset's link, then press [[↩]].

![The Import Robot sheet with a Hugging Face dataset link](/help/import-robot-data-as-tries/link.png)

To import a LeRobot or rosbag2 folder, drop it on the canvas or click **Choose Folder** in the Import Robot sheet.

## What comes in

- **LeRobot** datasets in v2.0, v2.1 and v3.0. Each try takes the name of its episode's task, and a v3 file with many episodes gives you one try per episode.
- **ROS 2** recordings, as a `.mcap` file or a rosbag2 folder whose `metadata.yaml` lists MCAP storage. A rosbag2 folder becomes one try, and each `.mcap` file you pick on its own becomes its own try. Joint positions from `sensor_msgs/JointState` are resampled to 50 frames per second.
- **Units** in radians, degrees or raw Feetech servo counts. Basecase tells them apart by the range of the values.
- **Videos** for each camera. A try keeps each camera's file and the time span of its episode, without copying or re-encoding the video. Basecase doesn't decode camera images inside an MCAP file.

Joints are matched by name, so an ALOHA's left and right arms land on two robots in the scene. Any match you make in the Match Joints sheet carries over to the next time you import the same data. If you import the same data twice onto the same robot in the same scene, the second import adds nothing.

If no joint matches and the dataset names a robot that isn't in your scene, such as an SO-101 or a Unitree G1, you see a message with **Import Robot**. Add the robot to your scene, then repeat the import.

An episode that breaks your robot's joint limits on every frame is skipped. One that breaks them on only some frames comes in.

## Limits

- A Hugging Face dataset can be up to 1 GB and 2,000 files, with each file up to 256 MB. For a larger dataset, download it and import its folder.
- Files on your computer can be up to 512 MB, and episodes up to 10 minutes long.
- Basecase opens uncompressed and zstd MCAP files, but not LZ4.
- Because units are guessed from their range, the guess can be wrong. SO-101 data in LeRobot's −100 to 100 range reads as degrees, and degrees that all stay within 6.6 of zero read as radians. Either way, the try replays at the wrong angles.
- If any value in a file isn't a number, Basecase rejects the whole file.
