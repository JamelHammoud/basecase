---
title: LeRobot dataset contents
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: reference
order: 1
keywords:
  - parquet
  - mp4
  - modality.json
  - info.json
  - episodes
  - observation.state
  - action
  - gr00t
  - groot
related:
  - export-a-lerobot-dataset
  - publish-a-dataset-to-hugging-face
covers:
  - src/datasets/lerobot.ts
  - src/datasets/lerobotV3.ts
  - src/datasets/lerobotRows.ts
  - src/datasets/joinVideos.ts
  - src/datasets/episodes.ts
  - src/datasets/cameras.ts
  - src/datasets/renderVideos.ts
---

Export Dataset and Publish to Hugging Face both make a dataset with the files, columns and camera videos below.

Basecase turns each try that passed into one episode. You get each dataset in two layouts: LeRobot v3.0 at the top level, and LeRobot v2.1 with GR00T's `meta/modality.json` in a `v2.1` folder. On the Hub, v3.0 is on the main branch and v2.1 is under the `v2.1` tag.

## Files in v3.0

| File | What it holds |
|---|---|
| `data/chunk-000/file-000.parquet` | One row per frame, for many episodes. Basecase starts a new file before one passes 100 MB. |
| `videos/observation.images.<camera>/chunk-000/file-000.mp4` | Every episode's video for one camera, one after another. Basecase starts a new file before one passes 200 MB. |
| `meta/episodes/chunk-000/file-000.parquet` | One row per episode, with its task, length, rows, statistics, and the file and time span of each camera's video. |
| `meta/tasks.parquet` | The one task: the Case's brief, or its name if it has no brief. |
| `meta/stats.json` | The minimum, maximum, mean, standard deviation and count of every column across all episodes. |
| `meta/info.json` | The dataset's version (`v3.0`), frame rate, file size limits, columns and cameras. |
| `meta/basecase.json` | The Case, the hash of the model the tries ran on, and each episode's try, margin, `seed` and `source`. The `source` is the try Multiply made the episode from, or null for a try you drove. |

Basecase joins the videos by copying each episode's frames into the camera's file as they are, without encoding them again. If an episode was encoded with different settings, Basecase puts it at the start of a new file.

## Files in v2.1

| File | What it holds |
|---|---|
| `data/chunk-000/episode_000000.parquet` | One row per frame, one file per episode. |
| `videos/chunk-000/observation.images.<camera>/episode_000000.mp4` | One video per camera per episode. |
| `meta/info.json` | The dataset's version (`v2.1`), frame rate, columns and cameras. |
| `meta/episodes.jsonl` | One line per episode, with its length and task. |
| `meta/tasks.jsonl` | The one task. |
| `meta/episodes_stats.jsonl` | Each episode's minimum, maximum, mean, standard deviation and count for every column. |
| `meta/modality.json` | GR00T's map of the columns: one `joints` group for state and action, each camera, and the task annotation. |
| `meta/basecase.json` | Same as in v3.0. |

GR00T works out its own `stats.json` from these files.

## Columns

| Column | What it holds |
|---|---|
| `observation.state` | Each joint's position, in radians, or in meters for a sliding joint. |
| `action` | Each joint's command at the same frame: the position target, or the speed for a wheel. |
| `timestamp` | Seconds since the episode began. |
| `frame_index`, `episode_index`, `index` | The frame within its episode, the episode, and the frame across the whole dataset. |
| `next.reward` | 1 on the last frame, 0 before it. |
| `next.done` | True on the last frame. |
| `task_index` | The task, which is the Case's task on every frame. |
| `annotation.human.task_description` | The task again, in the place GR00T looks for it. |

Datasets run at 25 frames a second. Basecase keeps every second frame of the try's 50 Hz recording. Joints keep the order and names from the robot package's `urdf/robot.urdf` and `joint_map.json`.

## Cameras

| Camera | Where it looks from |
|---|---|
| `scene` | A fixed view of the robot and the Case's world from the front three-quarters, 60° wide. |
| One per camera part | The camera's lens, moving with the part it's on. Basecase names each one after its part, for example `wrist_camera` for Wrist Camera. |

Camera parts are the ones under **Cameras** and **Depth Cameras** in Parts. A fisheye lens records as a fisheye.

Every video is 640 × 480 with a key frame each second. Basecase encodes them as H.264, or as VP9 or AV1 where H.264 isn't available.

## Versions

LeRobot 0.4 and later can read v3.0 and stream it from the Hub. GR00T reads only LeRobot v2, so it uses the v2.1 copy. Both copies hold the same rows, and their episode counts, frame counts and statistics match.
