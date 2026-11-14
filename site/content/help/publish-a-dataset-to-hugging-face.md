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

You can publish the passed tries in a dataset to the Hugging Face Hub as a LeRobot dataset. Once it's on the Hub, LeRobot and GR00T training can load it by name.

**Note:** Publishing works in the desktop app. The dataset is always public.

1. On huggingface.co, go to **Settings** ▸ **Access Tokens** and create an access token with write access.
2. In Basecase, press [[⌘,]], then choose **Accounts**.
3. Paste the token into **Access token**, then press [[↩]]. When the Hub accepts the token, your account name appears below it.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and use **Try It** to record tries until at least one passes. To learn how, see [Try a Case](/help/try-a-case).
5. Under **Results**, click **Make Dataset**. The dataset opens over the canvas. To gather tries from other scenes or Cases, see [Make a dataset from tries](/help/make-a-dataset-from-tries).
6. Click **Publish to Hugging Face**.

![Touch a Point open as a dataset, with its total time, Export Dataset, Publish to Hugging Face and Train from Tries](/help/make-a-dataset-from-tries/dataset.png)

7. When the toast says "Published to" followed by the dataset's name, click **Open** to see the dataset on the Hub.

You can also choose **Publish to Hugging Face** in [[⌘K]] while a dataset is open. To publish a dataset you made earlier, open it under **Datasets** in the Library first.

If you're signed out, **Publish to Hugging Face** opens **Accounts** instead. If the Hub refuses your token, click **Open** in the message, then paste a new token in **Accounts**.

## What gets published

Basecase publishes the dataset to a repo on your account. The repo's name is the dataset's name followed by the dataset's own 6-character code, for example `touch-a-point-1a2b3c`. Two datasets with the same name get different codes, so one never replaces the other's repo.

The repo's main branch holds LeRobot v3.0, tagged `v3.0`. LeRobot 0.4 and later can load it by name without any conversion: `lerobot-train --dataset.repo_id=<account>/touch-a-point-1a2b3c`. To stream it from the Hub instead of downloading it, add `--dataset.streaming=true`.

The `v2.1` tag holds a LeRobot v2.1 copy with GR00T's `meta/modality.json`. GR00T reads only v2, so for GR00T, download that revision: `hf download <account>/touch-a-point-1a2b3c --repo-type dataset --revision v2.1`. For the files in both versions, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

## Publishing again

When you publish the same dataset again, Basecase replaces what's in the repo with the dataset's passed tries as they are now. It rewrites the `data/`, `videos/` and `meta/` folders and doesn't touch `README.md` or any other files.

Basecase leaves out these tries:

- Tries from your real robot
- Tries from another Case or scene
- Tries from before the robot last changed

The toast shows how many tries it skipped.

Basecase also tags each publish's commit with the dataset's version, such as `dataset-v2`. If you publish the same tries again, the version stays the same. To download an earlier version, use its tag: `hf download <account>/touch-a-point-1a2b3c --repo-type dataset --revision dataset-v1`. LeRobot ignores these tags and still loads `v3.0`.

## Where the token lives

Basecase keeps your token in the app's main process, sealed on disk, and never passes it to the page you work in. That page only knows whether you're signed in and what your account name is.

Publishing a ready skill uses the same token. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).
