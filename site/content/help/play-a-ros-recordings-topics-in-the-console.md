---
title: Play a ROS recording's topics in the console
date: 2026-11-14
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 17
keywords:
  - ros
  - ros 1
  - ros 2
  - mcap
  - rosbag
  - bag
  - topics
  - rosout
  - log
  - diagnostics
  - imu
  - odometry
  - protobuf
  - foxglove
related:
  - import-robot-data-as-tries
  - play-a-try-through-its-console
covers:
  - src/topics/
  - src/datasets/import/recordingFiles.ts
  - src/datasets/import/recordingRead.ts
  - src/datasets/import/rosbag1.ts
  - src/datasets/import/decode/
  - src/workspace/useCaseRun.ts
  - src/workspace/useDataLayers.ts
  - src/components/caseRun/panels/LogPanel.tsx
  - src/components/caseRun/panels/DiagnosticsPanel.tsx
  - src/components/caseRun/panels/MessagePanel.tsx
  - src/components/caseRun/panels/StatesPanel.tsx
  - src/components/caseRun/panels/PlotPanel.tsx
---

You can open a ROS 1 bag or an MCAP file and read its logs, diagnostics, modes and sensor data on one timeline, next to your robot.

1. Open the scene with the robot from the recording.
2. Right-click an empty spot on the canvas, then choose **Import**.
3. Pick the recording's `.mcap` or `.bag` file. To play several files on one timeline, select them all at once.
4. Click **Library** in the view rail on the left, then click your robot under **Tries**.

![Library ▸ Tries with the imported recording's tile, named after its file](/help/play-a-ros-recordings-topics-in-the-console/tries.png)

5. Click the recording's try. The timeline opens below the canvas, and a column of cards for the recording's topics opens on the right.
6. To move through the recording, drag on a plot or on the timeline. Every card shows the recording at the playhead.

![A recording at 9.6 s, with its log, the motor driver's diagnostics in error, the mode as colored states, the IMU plot and odometry x against y](/help/play-a-ros-recordings-topics-in-the-console/console.png)

7. To show only warnings and worse, click **warn** above the log. To find a message, type in the search field above the log.
8. To jump to a log message, click it.
9. To stop playing, click **Done** or press [[Esc]].

## What the cards show

The column has one card for each kind of topic in the recording:

- **Log**: every `/rosout`, `rcl_interfaces/Log`, `rosgraph_msgs/Log` and `foxglove.Log` message up to the playhead, with its time, level and node.
- **Diagnostics**: the newest status for each name in a `diagnostic_msgs/DiagnosticArray`. For example, you can see a motor driver change from ok to error.
- **States**: a `std_msgs/String` topic such as `/mode`, shown as colored spans across the whole recording.
- **Plots**: the angular velocity of the first IMU, and the x of the first odometry against its y, which draws the path.
- **Message**: the newest message on one topic at the playhead, shown as a tree.

Laser scans, point clouds, TF frames, odometry, paths, markers and occupancy grids also draw on the canvas at the playhead. Each one gets its own row in **Layers**. An IMU sets the robot's tilt, and odometry sets its path on the map.

Recordings with laser scans, point clouds or depth images also build a height-colored **Map** layer from the whole run. It stays complete while the topic layers follow the playhead. Depth images need matching camera calibration and recorded transforms. See [Map a robot run](/help/map-a-robot-run) for placement requirements and scan matching.

Every field of every topic is also a signal. Its name is `topic.` followed by the topic and the field, for example `topic./imu.angular_velocity.z`. To pick one item of a list, add `[2]`. To pick all of them, add `[:]`, as in `topic./joint_states.effort[:]`. A Case's console and the agent can read these signals too.

## Limits

- Basecase reads ROS 1, ROS 2, Protobuf, JSON and FlatBuffers channels. FlatBuffers requires an embedded binary reflection schema.
- Custom topics open with a message tree, a scalar plot and a text field as states when those fields exist.
- Large 64-bit integers stay exact in Message and States. Values outside JavaScript’s safe integer range leave gaps in numeric plots.
- A recording can be up to 10 minutes long. Each file can be up to 512 MB.
- The scene must have a robot in it, even if the recording has no joints.
- Basecase keeps camera images, but the cards don't show them.

To import LeRobot datasets and ROS joints onto your robot, see [Import robot data as tries](/help/import-robot-data-as-tries).
