---
title: Publish datasets to Hugging Face
date: 2026-11-12
image: /changelog/publish-datasets-to-hugging-face/cover.png
---

Publish to Hugging Face, next to Export Dataset in Results and in ⌘K, sends a Case's passed tries to a public dataset repo on your account, tagged so LeRobot can load it. Add an access token with write access once in Settings ▸ Accounts.

## Where it is

Run a Case in the Simulate tab with Try It. Once a try passes, Results shows Publish to Hugging Face under Export Dataset. The same command is in ⌘K.

![Results with two passed tries, and Publish to Hugging Face under Export Dataset](/changelog/publish-datasets-to-hugging-face/results.png)

## Signing in

The first time you click it, Settings opens on the new Accounts pane. Make a token with write access on huggingface.co under Settings ▸ Access Tokens, paste it into Access token and press Enter. Your account name shows under the field once the Hub accepts it. A token that can only read is turned away.

![The Accounts pane with a token saved and the account name under it](/changelog/publish-datasets-to-hugging-face/accounts.png)

## What gets sent

The same LeRobot v2.1 dataset Export Dataset zips: one parquet file and one video per camera for each passed try, plus the metadata LeRobot and GR00T read. Videos and parquet files go up through the Hub's large-file storage. The repo is tagged v2.1, because LeRobot loads a dataset at its version tag.

When it's done, the toast names the repo and its Open button takes you there.

![The toast saying Published to your-name/touch-the-dots-e09403, with Open](/changelog/publish-datasets-to-hugging-face/cover.png)

## Publishing again

Each Case gets one repo per scene, named after the Case with a short code for the scene. Publishing it again from the same scene replaces that repo's episodes with the tries that pass now and moves the tag. Tries recorded before the robot last changed are left out, and the toast says how many.

## Your token

The token stays in the app's main process, encrypted on disk. The page only learns whether you're signed in and your account name. It works in the desktop app.
