---
title: From a passed try to a Hugging Face dataset
date: 2026-11-12
---

Basecase now publishes the tries a robot passed in simulation to the Hugging Face Hub, as a dataset that LeRobot and GR00T can train on. LeRobot is Hugging Face's robot-learning library, and GR00T is NVIDIA's robot foundation model.

Getting there meant choosing a format, a repo name and a tag, and deciding how to handle your token.

## Where the tries were stuck

A Case is a world and a goal that a robot tries in simulation. Touch the Dots, for example, asks the robot to touch each dot in order with its end effector. Every try records the robot's joint positions and actuator targets, 50 times a second.

Until now, a passed try left Basecase as a zip from Export Dataset. To train on it on a rented GPU, you unzipped it, made a dataset repo and uploaded the files yourself, and the videos needed large-file storage. Now you paste a token once, and after that it's one click in Results.

## One writer for both buttons

Publish to Hugging Face sends the same files Export Dataset zips, and one call in a worker builds them for both. Export puts them in a zip, and Publish uploads them as they are. The code that writes the parquet schema exists once, so when we fix it, both buttons get the fix.

The dataset keeps every second recorded frame, so episodes run at 25 frames a second. Each camera renders at 640 × 480 and encodes as H.264, falling back to VP9 and then AV1, with one key frame a second. Videos render when you export or publish, never while a try records.

## Why v2.1, when LeRobot reads v3

GR00T only reads LeRobot's v2 format. LeRobot 0.4 and later read v3, and they convert v2.1 with their own script. We picked v2.1 so one dataset loads in GR00T with no conversion. If you use a recent LeRobot, you pay for that choice: run the conversion first.

Basecase tags the repo `v2.1`, since LeRobot's reader looks for a dataset at its version tag. On each publish, it deletes the tag and sets it again on the new commit.

## One repo per Case, per scene

Touch the Dots is a template, so anyone can add it to any scene. If the repo were named after the Case alone, publishing from a second scene would replace the first scene's dataset.

The repo name is the Case's name plus six hex characters from a SHA-256 of the scene and the Case, like `touch-the-dots-e09403`. Publish again from the same scene and you update that repo. Files under `data/`, `videos/` and `meta/` that the new set doesn't have get deleted, and a `README.md` you wrote yourself stays.

## Only passed tries, only from this design

A dataset here holds demonstrations of the task done right, so failed tries are left out.

Each try also stores a SHA-256 of the model it ran on, world included. A passed try only counts when that hash matches the model as it is now, because a try from before you moved a servo shows a robot that no longer exists. The toast tells you how many tries were left out.

## The token never reaches the page

You paste a token once, in **Settings** ▸ **Accounts**. The app's main process asks the Hub whose token it is, and refuses one that can only read. Electron's `safeStorage` seals the token for storage. On a system that can't encrypt, the app keeps it in memory only. The page that draws the app learns two things: whether you're signed in, and your account name.

Every Hub API request has to stay on huggingface.co, and Basecase refuses redirects. For the large files, the Hub hands back upload addresses on other hosts, and those requests carry no token. Hub error messages have the token stripped out before you see them.

## How a publish runs

The main process creates the repo and lists what's already in it. Then it asks the Hub which files go through large-file storage: the parquet files and the videos. It uploads up to four at once, in parts when the Hub asks for parts. One commit then adds every file and deletes the stale ones, and the main process moves the tag.

If an upload fails before that commit, your dataset on the Hub stays as it was.

## What it doesn't do

Basecase publishes datasets as public, on your own account, with no private option and no organization picker. It doesn't write a dataset card. The state and action columns hold only the first robot in the scene. While it publishes, the app shows a toast, with no progress bar and no resume. You need the desktop app and a computer that can encode video.

For the steps, read [Publish a dataset to Hugging Face](/help/publish-a-dataset-to-hugging-face). For the short version, read the changelog entry [Publish datasets to Hugging Face](/changelog/2026-11-12-publish-datasets-to-hugging-face).
