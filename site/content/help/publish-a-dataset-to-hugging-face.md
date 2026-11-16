---
title: Publish a dataset to Hugging Face
date: 2026-11-12
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
  - src/vision/imageDatasetBuild.ts
  - electron/hub/
---

Publish recorded tries or labeled images to a Hugging Face dataset repo, with LeRobot files for tries and COCO and YOLO packages for images.

**Note:** Publishing works in the desktop app. The dataset is always public.

1. On huggingface.co, go to **Settings** ▸ **Access Tokens** and create an access token with write access.
2. In Basecase, press [[⌘,]], then choose **Accounts**.
3. Paste the token into **Access token**, then press [[↩]]. When the Hub accepts the token, your account name appears under it.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. In **Library** ▸ **Datasets**, click the dataset to publish.
5. Click **Publish to Hugging Face**.
6. When the toast says "Published to" followed by the dataset's name, click **Open** to see the dataset on the Hub.

To make a dataset first, follow [Make a dataset from tries](/help/make-a-dataset-from-tries) or [Import an image dataset](/help/import-an-image-dataset).

You can also find **Publish to Hugging Face** in [[⌘K]] while a dataset is open. If you're signed out, it opens **Accounts** instead. If the Hub refuses your token, click **Open** in the message, then paste a new token in **Accounts**.

## What gets published

Basecase publishes the dataset to a repo on your account. The repo is named after the dataset, plus a 6-character code for it, for example `touch-the-dots-1a2b3c`. Each dataset gets its own code, so two datasets named Touch the Dots publish to two repos.

For a dataset with tries, the repo's main branch holds LeRobot v3.0, tagged `v3.0`. LeRobot 0.4 and later can load it by name without converting it: `lerobot-train --dataset.repo_id=<account>/touch-the-dots-1a2b3c`. To stream the dataset from the Hub instead of downloading it, add `--dataset.streaming=true`.

Datasets with tries also get a `v2.1` tag holding a LeRobot v2.1 copy that includes GR00T's `meta/modality.json`. GR00T only reads v2, so for GR00T, download that revision: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision v2.1`. For a list of the files in both versions, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

Image datasets put COCO files in `coco/` and YOLO files in `yolo/` on the main branch. Their dataset card links both formats and carries the `basecase-image-dataset` tag. A dataset with both tries and images includes both image folders alongside its LeRobot files. See [Make training images](/help/make-training-images).

## Publishing again

If you publish the same dataset again, Basecase updates the folders included in the export. Tries rewrite `data/`, `videos/` and `meta/`, while images rewrite `coco/` and `yolo/` and the image dataset's `README.md` card. Folders outside that export stay as they are.

The working dataset leaves out real-robot tries, failed tries, tries with quality flags and tries on another robot model. The toast shows how many samples were left out. A saved version uses its original samples, robot and scene.

Each publish tags its commit with the dataset's version, such as `dataset-v2`. Publishing freezes the selected frames, labels, recording and image content, exclusions and split assignments. Editing an instruction or segment boundary creates a new version on the next publish. Publishing unchanged samples keeps the same version.

To publish an earlier saved version, choose it in **Dataset version**, then click **Publish to Hugging Face**. Its saved export supplies the files. A version without saved samples can't restore historical labels. Missing saved content stops publishing with an error.

To download an earlier published version, use its tag: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision dataset-v1`. LeRobot ignores these tags and keeps loading `v3.0`.

## Where the token lives

Your token stays in the app's main process, sealed on disk, and Basecase never passes it to the page you work in. That page only learns whether you're signed in and what your account name is.

Publishing a ready skill uses the same token. Installing public skills needs no token, including in the web studio. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

When you're signed in, Basecase also sends the token when it downloads a dataset or a skill, so you can import your own private datasets. To import one, see [Import robot data as tries](/help/import-robot-data-as-tries).
