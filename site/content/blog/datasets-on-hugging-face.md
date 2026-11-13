---
title: From a passed try to a Hugging Face dataset
date: 2026-11-12
---

Basecase now publishes the tries a robot passed in simulation to the Hugging Face Hub, as a dataset that LeRobot and GR00T can train on. LeRobot is Hugging Face's robot-learning library; GR00T is NVIDIA's robot foundation model. This post is about the choices behind the button: the format, the repo name, the tag and the token.

## Where the tries were stuck

A Case is a world and a goal a robot tries in simulation. Touch the Dots, for one, asks it to touch each dot in order with the end effector. Every try records the robot's joint positions and actuator targets, 50 times a second.

Before this, a passed try left Basecase as a zip from Export Dataset. To train on it on a rented GPU, you unzipped it, made a dataset repo and uploaded the files yourself. The videos needed large-file storage. Now, after pasting a token once, it's one click in Results.

## One writer for both buttons

Publish to Hugging Face sends the files Export Dataset zips, built by the same call in a worker. Export zips them; Publish hands them over as they are. A fix to the parquet schema reaches both, because there's no second copy of it to forget.

The dataset keeps every second recorded frame, so episodes run at 25 frames a second. Each camera renders at 640 × 480 and encodes as H.264, falling back to VP9 and then AV1, with one key frame a second. Videos render when you export or publish, never while a try records.

## Why v2.1, when LeRobot reads v3

GR00T reads only LeRobot's v2 format. LeRobot 0.4 and later read v3, and convert v2.1 with their own script. We chose v2.1 so a single dataset loads in GR00T with no conversion. The cost falls on people using a recent LeRobot, who run that conversion first.

The repo carries a `v2.1` tag, because LeRobot's reader looks for a dataset at its version tag. Each publish deletes the tag and sets it again on the new commit.

## One repo per Case, per scene

Touch the Dots is a template, so anyone can add it to any scene. A repo named after the Case alone would let a publish from a second scene replace the first scene's dataset.

So the name is the Case's name plus six hex characters from a SHA-256 of the scene and the Case: `touch-the-dots-e09403`. Publishing again from the same scene updates that repo. Files the new set lacks under `data/`, `videos/` and `meta/` are deleted, and a `README.md` you wrote yourself stays.

## Only passed tries, only from this design

A dataset here is a set of demonstrations of the task done right, so failed tries never go in. Each try also stores a SHA-256 of the model it ran on, world included. A passed try only counts when that hash matches the model now. A try from before you moved a servo shows a robot that no longer exists, and the toast says how many were left out.

## The token never reaches the page

You paste a token once, in Settings ▸ Accounts. The app's main process asks the Hub whose it is and refuses one that can only read. It's stored sealed by Electron's `safeStorage`, or kept in memory only where the system can't encrypt it. The page that draws the app learns two things: whether you're signed in, and your account name.

Every Hub API request is checked to stay on huggingface.co, and redirects are refused. The Hub hands back upload addresses on other hosts for the large files, and those requests carry no token. Hub error messages have the token removed before they're shown.

## How a publish runs

The main process creates the repo and lists what's in it. Then it asks the Hub which files go through large-file storage: the parquet files and the videos. Up to four upload at once, in parts when the Hub asks for parts. Then one commit adds every file and deletes the stale ones, and the tag moves. If an upload fails before that commit, the dataset stays as it was.

## What it doesn't do

Datasets are public, on your own account; there's no private option and no organization picker. Basecase writes no dataset card. Only the first robot in the scene goes into the state and action columns. The app shows a toast while it publishes, with no progress bar and no resume. It needs the desktop app and a computer that can encode video.

The steps are in [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face), and the short version is the changelog entry [Publish datasets to Hugging Face](/changelog/2026-11-12-publish-datasets-to-hugging-face).
