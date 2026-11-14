---
title: Publish a dataset to Hugging Face
date: 2026-11-12
updated: 2026-11-13
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
  - export-a-lerobot-dataset
  - lerobot-dataset-contents
covers:
  - src/components/settings/AccountsPane.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/useDatasetExport.ts
  - src/workspace/caseCommands.tsx
  - src/hub/hubBridge.ts
  - electron/hub/
---

You can publish a Case's passed tries to the Hugging Face Hub as a LeRobot dataset. LeRobot and GR00T training can then load it by name.

**Note:** Publishing works in the desktop app. The dataset is always public.

1. On huggingface.co, go to **Settings** ▸ **Access Tokens** and create an access token with write access.
2. In Basecase, press [[⌘,]], then choose **Accounts**.
3. Paste the token into **Access token**, then press [[↩]]. When the Hub accepts the token, your account name appears below it.

![The Accounts pane with a token saved](/help/publish-a-dataset-to-hugging-face/accounts.png)

4. Open a Case and use **Try It** to record tries until at least one of them passes. See [Try a Case](/help/try-a-case).
5. Under **Results**, click **Publish to Hugging Face**.

![Publish to Hugging Face under Export Dataset in Results](/help/publish-a-dataset-to-hugging-face/results.png)

6. When the toast says "Published to" followed by the dataset's name, click **Open** to view the dataset on the Hub.

You can also find **Publish to Hugging Face** in [[⌘K]]. If you're signed out, it opens **Accounts** instead.

If the Hub refuses your token, click **Open** in the message, then paste a new token in **Accounts**.

## What gets published

Basecase publishes the dataset to a repo on your account. The repo is named after the Case, followed by a 6-character code for the scene, such as `touch-the-dots-1a2b3c`. Each scene gets its own code, so if you publish Touch the Dots from two different scenes, you get two datasets.

The repo's main branch holds LeRobot v3.0 and is tagged `v3.0`. LeRobot 0.4 and later can load it by name with no conversion:

`lerobot-train --dataset.repo_id=<account>/touch-the-dots-1a2b3c`

To stream the dataset from the Hub instead of downloading it, add `--dataset.streaming=true`.

The `v2.1` tag holds a LeRobot v2.1 copy that includes GR00T's `meta/modality.json`. GR00T only reads v2, so if you're training with GR00T, download that revision:

`hf download <account>/touch-the-dots-1a2b3c --repo-type dataset --revision v2.1`

For a list of the files in both versions, see [LeRobot dataset contents](/help/lerobot-dataset-contents).

## Publishing again

If you publish the same Case from the same scene again, Basecase replaces the dataset with the tries that pass now. It rewrites the `data/`, `videos/` and `meta/` folders and doesn't touch `README.md` or any other files in the repo.

Basecase also leaves out these tries:

- Tries from your real robot
- Tries recorded before the robot last changed

The toast shows how many of those older tries were skipped.

## Where the token lives

Basecase keeps your token in the app's main process, sealed on disk. It never passes the token to the page you work in. That page only knows whether you're signed in and what your account name is.

Publishing a ready skill uses the same token. See [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).
