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

Publish the passed tries in a dataset to the Hugging Face Hub as a LeRobot dataset, and LeRobot and GR00T training can load it by name.

**Note:** Publishing works in the desktop app. Every dataset you publish is public.

1. On huggingface.co, go to **Settings** ▸ **Access Tokens** and create an access token with write access.
2. In Basecase, press [[⌘,]], then choose **Accounts**.
3. Paste the token into **Access token**, then press [[↩]]. When the Hub accepts the token, your account name appears under the field.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and record tries with **Try It** until at least one passes. To learn how, see [Try a Case](/help/try-a-case).
5. Under **Results**, click **Make Dataset** to open the dataset over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
6. Click **Publish to Hugging Face**.
7. When the toast shows "Published to" followed by the dataset's name, click **Open** to view the dataset on the Hub.

With a dataset open, you can also choose **Publish to Hugging Face** from [[⌘K]]. If you're signed out, the command opens **Accounts**. If the Hub refuses your token, click **Open** in the message and paste a new token in **Accounts**.

## What gets published

Basecase publishes to a repo on your account. The repo is named after the dataset plus the dataset's own 6-character code, such as `touch-the-dots-1a2b3c`. Two datasets with the same name get different codes, so each one keeps its own repo.

The repo's main branch holds LeRobot v3.0, tagged `v3.0`. LeRobot 0.4 and later loads it by name with no conversion: `lerobot-train --dataset.repo_id=<account>/touch-the-dots-1a2b3c`. To stream the dataset from the Hub instead of downloading it, add `--dataset.streaming=true`.

The `v2.1` tag holds a LeRobot v2.1 copy with GR00T's `meta/modality.json`. GR00T needs v2, so to train with GR00T, download that revision: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision v2.1`. [LeRobot dataset contents](/help/lerobot-dataset-contents) lists the files in both versions.

## Publishing again

When you publish the same dataset again, Basecase replaces the repo's contents with the dataset's current passed tries. It rewrites the `data/`, `videos/` and `meta/` folders and leaves `README.md` and any other files alone.

Some tries are never published: tries from your real robot, tries on another robot, and tries from before the robot last changed. The toast shows how many tries were skipped.

Each publish tags its commit with the dataset's version, such as `dataset-v2`. Publishing the same tries again keeps the same version. To download an earlier version, use its tag: `hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision dataset-v1`. LeRobot ignores these tags and keeps loading `v3.0`.

## Where the token lives

Basecase keeps your token in the app's main process and seals it on disk. The page you work in never receives the token. That page sees only whether you're signed in and your account name.

Publishing a ready skill uses the same token. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

While you're signed in, Basecase also sends the token with dataset and skill downloads, so you can import your own private datasets. To learn how, see [Import robot data as tries](/help/import-robot-data-as-tries).
