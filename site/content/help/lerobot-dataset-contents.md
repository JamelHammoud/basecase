---
title: LeRobot dataset contents
date: 2026-11-13
updated: 2026-11-14
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
  - src/datasets/language.ts
  - src/datasets/cameras.ts
  - src/datasets/renderVideos.ts
---

Every file in a dataset from Export Dataset or Publish to Hugging Face, and what each column and camera video holds.

Each passed try is one episode. The dataset comes in two layouts: LeRobot v3.0 at the top, and LeRobot v2.1 with GR00T's `meta/modality.json` in a `v2.1` folder. On the Hub, v3.0 is the main branch and v2.1 is the `v2.1` tag.

## Files in v3.0

| File | What it holds |
|---|---|
| `data/chunk-000/file-000.parquet` | One row per frame, for many episodes. A new file starts before one passes 100 MB |
| `videos/observation.images.<camera>/chunk-000/file-000.mp4` | Every episode's video for one camera, one after another. A new file starts before one passes 200 MB |
| `meta/episodes/chunk-000/file-000.parquet` | One row per episode: its task, length, rows, the file and time span of each camera's video, and its statistics |
| `meta/tasks.parquet` | Every task and subtask. Each episode's task comes first: the try's own instruction, else the Case's brief, else its name. Then each segment's words follow |
| `meta/stats.json` | The minimum, maximum, mean, standard deviation and count of every column across all episodes |
| `meta/info.json` | The dataset's version (`v3.0`), frame rate, file size limits, columns and cameras |
| `meta/basecase.json` | The Case, the hash of the model the tries ran on, and each episode's try, margin, `seed` and `source`: the try Multiply made it from, or null for a try you drove |

The joined videos aren't encoded again. Basecase copies each episode's frames into the camera's file as they are. An episode encoded with other settings starts a new file.

## Files in v2.1

| File | What it holds |
|---|---|
| `data/chunk-000/episode_000000.parquet` | One row per frame of one episode, one file per episode |
| `videos/chunk-000/observation.images.<camera>/episode_000000.mp4` | One video per camera per episode |
| `meta/info.json` | The dataset's version (`v2.1`), frame rate, columns and cameras |
| `meta/episodes.jsonl` | One line per episode, with its length and task |
| `meta/tasks.jsonl` | The same list as `meta/tasks.parquet` in v3.0, in the same order |
| `meta/episodes_stats.jsonl` | Each episode's minimum, maximum, mean, standard deviation and count for every column |
| `meta/modality.json` | GR00T's map of the columns: one `joints` group for state and action, each camera, and the task and subtask annotations |
| `meta/basecase.json` | The same as in v3.0 |

GR00T works out its own `stats.json` from these.

## Columns

| Column | What it holds |
|---|---|
| `observation.state` | Each joint's position, in radians, or meters for a sliding joint |
| `action` | Each joint's command at the same frame: the position target, or the speed for a wheel |
| `timestamp` | Seconds since the episode began |
| `frame_index`, `episode_index`, `index` | The frame within its episode, the episode, and the frame across the whole dataset |
| `next.reward` | 1 on the last frame, 0 before it |
| `next.done` | True on the last frame |
| `task_index` | The episode's task |
| `annotation.human.task_description` | The task again, where GR00T looks for it |
| `annotation.human.action.task_description` | The subtask of the segment the frame is in, as an index into the task list |
| `language_persistent` | In v3.0 only: the episode's subtasks, each with the time it starts, where LeRobot 0.7 reads them |

Frames are 25 a second: every second frame of the try's 50 Hz recording. Joints are in the same order and carry the same names as in the robot package's `urdf/robot.urdf` and `joint_map.json`.

## Cameras

| Camera | Where it looks from |
|---|---|
| `scene` | A fixed view of the robot and the Case's world from the front three-quarters, 60° wide |
| One per camera part | The camera's lens, moving with the part it's on. Named from the part, such as `wrist_camera` for Wrist Camera |

Camera parts are the ones under **Cameras** and **Depth Cameras** in Parts. A fisheye lens records as a fisheye. Every video is 640 × 480, encoded as H.264, or VP9 or AV1 where H.264 isn't available, with a key frame each second.

## Versions

LeRobot 0.7 and later read v3.0 and stream it from the Hub. Earlier versions refuse it, because they don't know the `language_persistent` column. GR00T reads LeRobot v2 only, so it takes the v2.1 copy. Both hold the same rows, so their episode counts, frame counts and statistics match.
