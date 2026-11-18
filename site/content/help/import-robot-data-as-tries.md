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
  - ros 1
  - bag
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

You can import teleop recordings from LeRobot, ROS 1 or ROS 2. Each episode becomes a saved try.

1. For recordings with joint positions, open the scene with the recorded robot.
2. Right-click an empty spot on the canvas, then choose **Import**.
3. Pick one or more `.mcap` or `.bag` files, or a zip of a LeRobot dataset.
4. If the data's joint names differ from your robot's, the **Match Joints** sheet opens with a guess for each joint. Fix any wrong guesses, then click **Import**.

![The Match Joints sheet pairing joint1 to joint6 from an MCAP file with the arm's joints](/help/import-robot-data-as-tries/match.png)

5. To find your tries, click **Library** in the view rail on the left, then click your robot under **Tries**. Each try shows its task and the file or repo it came from.

![Tries with three episodes from a zip, one from an MCAP file and one from Hugging Face](/help/import-robot-data-as-tries/tries.png)

6. Click a try to step through its joints on the timeline (see [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline)).

![An imported try open on the timeline with a lane for each of six joints](/help/import-robot-data-as-tries/timeline.png)

In the desktop app, you can also import a dataset from Hugging Face. Press [[⌘K]], choose **Import Robot**, paste the dataset's link, then press [[↩]].

![The Import Robot sheet with a Hugging Face dataset link](/help/import-robot-data-as-tries/link.png)

To import a LeRobot or rosbag2 folder, drop it on the canvas or click **Choose Folder** in the Import Robot sheet.

A dataset with image annotations adds labeled images to the Library. If it also holds LeRobot episodes, Basecase imports both, with tries on the matching robot. See [Import an image dataset](/help/import-an-image-dataset).

## What comes in

- **LeRobot** datasets in v2.0, v2.1 and v3.0. Each try takes the name of its episode's task, and a v3 file with many episodes gives you one try per episode. Training, validation and test assignments in `meta/info.json` stay with their episodes when you export or train a dataset.
- **ROS 1 and ROS 2** recordings, as `.mcap` files, ROS 1 `.bag` files, or a rosbag2 folder whose `metadata.yaml` lists MCAP storage. A rosbag2 folder becomes one try, and so do several files you pick together, on one timeline. Joint positions from `sensor_msgs/JointState` are resampled to 50 frames per second. MCAP topics encoded as ROS 1, ROS 2, Protobuf, JSON or FlatBuffers come in too (see [Play a ROS recording's topics in the console](/help/play-a-ros-recordings-topics-in-the-console)). FlatBuffers topics must carry an embedded binary reflection schema.
- **Units** in radians, degrees or raw Feetech servo counts. Basecase tells them apart by the range of the values.
- **Videos** for each camera whose file is included in the import. Basecase saves a local copy and keeps each episode's time span without re-encoding. Topic-only playback and comparison also show supported images retained inside an MCAP file.

Joints are matched by name, so an ALOHA's left and right arms land on two robots in the scene. Any match you make in the Match Joints sheet carries over to the next time you import the same data. If you import the same data twice onto the same robot in the same scene, the second import adds no tries. It can attach a split assignment to a try that had none. Conflicting assignments for an existing try stop the import with an error.

Saved camera videos follow the timeline's playhead. Their tiles show detections from that image, as in [Watch what the robot's cameras see](/help/watch-what-the-robots-cameras-see).

Recordings without joint channels open without a scene robot. You can also [Compare saved tries](/help/compare-saved-tries).

If no joint matches and the dataset names a robot that isn't in your scene, such as an SO-101 or a Unitree G1, you see a message with **Import Robot**. Add the robot to your scene, then repeat the import.

An episode that breaks your robot's joint limits on every frame is skipped. One that breaks them on only some frames comes in, and once you open it, its tile shows an amber warning mark.

## Limits

- A Hugging Face dataset can be up to 1 GB and 2,000 files, with each file up to 256 MB. For a larger dataset, download it and import its folder.
- Files on your computer can be up to 512 MB, and episodes up to 10 minutes long.
- Basecase opens uncompressed, zstd and LZ4 MCAP files, and uncompressed and LZ4 ROS 1 bags. It doesn't open bz2 bags.
- Because units are guessed from their range, the guess can be wrong. SO-101 data in LeRobot's −100 to 100 range reads as degrees, and degrees that all stay within 6.6 of zero read as radians. Either way, the try replays at the wrong angles.
- If a joint position in a file isn't a number, Basecase rejects the whole file.
