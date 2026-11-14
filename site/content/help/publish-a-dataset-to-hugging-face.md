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
  - lerobot-dataset-contents
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/tries/DatasetPane.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/useDatasetRecords.ts
  - src/workspace/datasetJob.ts
  - src/workspace/datasetCommands.tsx
  - src/hub/hubBridge.ts
  - electron/hub/
---

Put a dataset's passed tries on the Hugging Face Hub in LeRobot format, so LeRobot and GR00T training can load it by name.

Publishing works in the desktop app. The dataset is always public.

1. On huggingface.co, make an access token with write access, under **Settings** ▸ **Access Tokens**.
2. In Basecase, press [[⌘,]] and choose **Accounts**.
3. Paste the token into **Access token** and press [[↩]]. The account name shows under it once the Hub accepts the token.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and record tries with **Try It** until at least one passes. Steps are in [Try a Case](/help/try-a-case).
5. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
6. Click **Publish to Hugging Face**.

7. When the toast says "Published to" and the repo's name, click **Open** to see it on the Hub.

**Publish to Hugging Face** is also in [[⌘K]] while a dataset is open. To publish a dataset you made earlier, open it under **Datasets** in the Library first. Signed out, it opens **Accounts** instead. If the Hub refuses the token, click **Open** in the message to paste a new one in **Accounts**.

## What gets published

The dataset goes to a repo on your account, named after the dataset plus a 6-character code of its own, such as `touch-a-point-1a2b3c`. Two datasets with the same name get different codes, so neither replaces the other's repo.

The repo's main branch holds LeRobot v3.0, tagged `v3.0`. LeRobot 0.4 and later load it by name with no conversion: `lerobot-train --dataset.repo_id=<account>/touch-a-point-1a2b3c`. Add `--dataset.streaming=true` to stream it from the Hub instead of downloading it.

The LeRobot v2.1 copy, with GR00T's `meta/modality.json`, sits at the `v2.1` tag. GR00T reads only v2, so download that revision for it: `hf download <account>/touch-a-point-1a2b3c --repo-type dataset --revision v2.1`. [LeRobot dataset contents](/help/lerobot-dataset-contents) lists the files in both.

## Publishing again

Publishing the same dataset again replaces the repo's dataset with the dataset's passed tries as they are now. Basecase rewrites the `data/`, `videos/` and `meta/` folders and leaves `README.md` and any other files alone. Tries recorded before the robot last changed are left out, and the toast says how many. Tries from your real robot are left out too.

Each publish also tags the commit with the dataset's version, such as `dataset-v2`. The same tries keep the same version, so an earlier version stays one download away: `hf download <account>/touch-a-point-1a2b3c --repo-type dataset --revision dataset-v1`. LeRobot ignores these tags and still loads `v3.0`.

## Where the token lives

The token stays in the app's main process, sealed on disk. The page you work in never sees it; it learns only whether you're signed in and your account name.

A ready skill publishes with the same token; see [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).
