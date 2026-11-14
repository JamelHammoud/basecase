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
  - src/datasets/episodes.ts
  - src/datasets/cameras.ts
  - src/datasets/renderVideos.ts
---

Every file in a dataset from Export Dataset or Publish to Hugging Face, and what each column and camera video holds.

The layout is LeRobot v2.1 with GR00T's `meta/modality.json` added. Each passed try is one episode.

## Files

| File | What it holds |
|---|---|
| `data/chunk-000/episode_000000.parquet` | One row per frame of one episode, one file per episode |
| `videos/chunk-000/observation.images.<camera>/episode_000000.mp4` | One video per camera per episode |
| `meta/info.json` | The dataset's version (`v2.1`), frame rate, columns and cameras |
| `meta/episodes.jsonl` | One line per episode, with its length and task |
| `meta/tasks.jsonl` | The one task: the Case's brief, or its name when it has none |
| `meta/episodes_stats.jsonl` | Each episode's minimum, maximum, mean, standard deviation and count for every column |
| `meta/modality.json` | GR00T's map of the columns: one `joints` group for state and action, each camera, and the task annotation |
| `meta/basecase.json` | The Case, the hash of the model the tries ran on, and each episode's try, margin, `seed` and `source`: the try Multiply made it from, or null for a try you drove |

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
| `task_index` | The task, always the Case's |
| `annotation.human.task_description` | The task again, where GR00T looks for it |

Frames are 25 a second: every second frame of the try's 50 Hz recording. Joints are in the same order and carry the same names as in the robot package's `urdf/robot.urdf` and `joint_map.json`.

## Cameras

| Camera | Where it looks from |
|---|---|
| `scene` | A fixed view of the robot and the Case's world from the front three-quarters, 60° wide |
| One per camera part | The camera's lens, moving with the part it's on; named from the part, such as `wrist_camera` for Wrist Camera |

Camera parts are the ones under **Cameras** and **Depth Cameras** in Parts. A fisheye lens records as a fisheye. Every video is 640 × 480, encoded as H.264, or VP9 or AV1 where H.264 isn't available, with a key frame each second.

## Versions

GR00T reads LeRobot v2 datasets only. LeRobot 0.4 and later read v3, and convert v2.1 with their own conversion script.
