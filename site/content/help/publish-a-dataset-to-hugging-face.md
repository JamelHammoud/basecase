---
title: Publish a dataset to Hugging Face
date: 2026-11-12
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 6
popular: true
keywords:
  - hf
  - hub
  - upload
  - share dataset
  - access token
  - sign in
related:
  - make-a-dataset-from-tries
  - export-a-lerobot-dataset
  - lerobot-dataset-contents
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/tries/DatasetPane.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/datasetCommands.tsx
  - src/hub/hubBridge.ts
  - src/workspace/useDataImport.ts
  - electron/hub/
---

You can publish a dataset's passed tries and labeled images to the Hugging Face Hub for training.

**Note:** Publishing works in the desktop app. The dataset is always public.

1. On huggingface.co, go to **Settings** ▸ **Access Tokens** and create an access token with write access.
2. In Basecase, press [[⌘,]], then choose **Accounts**.
3. Paste the token into **Access token**, then press [[↩]]. When the Hub accepts the token, your account name appears under it.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and use **Try It** to record tries until at least one passes. See [Try a Case](/help/try-a-case) for the steps.
5. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
6. Click **Publish to Hugging Face**.
7. When the toast says "Published to" followed by the dataset's name, click **Open** to see the dataset on the Hub.

You can also find **Publish to Hugging Face** in [[⌘K]] while a dataset is open. If you're signed out, it opens **Accounts** instead. If the Hub refuses your token, click **Open** in the message, then paste a new token in **Accounts**.

## What gets published

Basecase publishes the dataset to a repo on your account. The repo is named after the dataset, plus a 6-character code for it, for example `touch-the-dots-1a2b3c`. Each dataset gets its own code, so two datasets named Touch the Dots publish to two repos.

Image members publish in `coco/` and `yolo/` folders with the same splits as their zip export. To create them, see [Make training images](/help/make-training-images).

For try members, the repo's main branch holds LeRobot v3.0, tagged `v3.0`. LeRobot 0.4 and later can load it by name without converting it: `lerobot-train --dataset.repo_id=<account>/touch-the-dots-1a2b3c`. To stream the dataset from the Hub instead of downloading it, add `--dataset.streaming=true`.

The `v2.1` tag holds a LeRobot v2.1 copy that includes GR00T's `meta/modality.json`. GR00T only reads v2, so for GR00T, download that revision: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision v2.1`. For a list of the files in both versions, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

## Publishing again

If you publish the same dataset again, Basecase uploads its current passed tries and image members. For try members, it rewrites the `data/`, `videos/` and `meta/` folders. Image members go in `coco/` and `yolo/`.

Tries from your real robot are left out, and so are tries on another robot and tries recorded before the robot last changed. The toast shows how many tries were skipped.

Each publish tags its commit with the dataset's version, such as `dataset-v2`. Publishing unchanged tries, image members and split seed again keeps the same version. To download an earlier version, use its tag: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision dataset-v1`. LeRobot ignores these tags and keeps loading `v3.0`.

## Where the token lives

Your token stays in the app's main process, sealed on disk, and Basecase never passes it to the page you work in. That page only learns whether you're signed in and what your account name is.

Publishing a ready skill uses the same token. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

When you're signed in, Basecase also sends the token when it downloads a dataset or a skill, so you can import your own private datasets. To import one, see [Import robot data as tries](/help/import-robot-data-as-tries).
