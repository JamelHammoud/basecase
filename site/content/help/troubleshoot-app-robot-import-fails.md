---
title: A robot won't import from a link or folder
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 9
keywords:
  - urdf
  - mjcf
  - github
  - hugging face
  - zip
  - meshes missing
  - private repo
related:
  - import-a-robot
  - troubleshoot-file-import
covers:
  - src/components/ImportRobotSheet.tsx
  - src/workspace/useRobotInsert.ts
  - src/utils/robotImport/
---

Import Robot needs a URDF or MJCF description it can reach, and the mesh files that description names.

## Import stays grayed out

The link isn't one Basecase can read. It takes a GitHub repo or folder, a Hugging Face link, or an `https` link ending in `.urdf`, `.xml`, `.mjcf` or `.zip`.

1. Copy the link from the repo's page or from the file itself.
2. Paste it into **Import Robot**.

## “Couldn’t open … Link to a public repo or folder.”

The repo is private, the link points at a branch or folder that doesn't exist, or GitHub turned the request away. GitHub limits how often a computer can list repos without a sign-in.

1. Open the link in a browser and check it shows the files.
2. Wait a few minutes, then press Enter in **Import Robot** again.
3. If it still fails, download the repo, then click **Choose Folder** and pick it.

## “Couldn’t find a .urdf or MJCF .xml file in …”

The link is public, but there's no robot description in it. Link to the folder that holds the `.urdf` or `.xml` file, or to the file itself. From a folder on your computer, the message reads “Choose a folder with a .urdf or MJCF .xml file.”

## “Couldn’t load its … meshes. Choose the folder with the robot’s mesh files.”

The description names mesh files that aren't beside it. Many repos keep meshes in a separate folder.

1. Download the whole repo.
2. Click **Choose Folder** and pick the repo's top folder, which holds the meshes too.

When only some meshes load, the robot comes in anyway, and the toast counts the missing files.

## Other messages

| Message | What to do |
|---|---|
| “That zip is too large. Unzip it and choose the folder.” | Zips over 200 MB, or over 600 MB unpacked, are too big. Unzip it and use **Choose Folder** |
| “Couldn’t open that zip. Unzip it and choose the folder.” | Unzip it on your computer and use **Choose Folder** |
| “Choose a URDF or MJCF file. That one isn’t valid XML.” | The file is damaged. Download it again |
| “Choose a URDF or MJCF file.” | The file is XML, but not a robot description |
| “Nothing to show: the description has no meshes or shapes.” | The description has joints but no geometry to draw |

The steps for a working import are in [Import a robot](/help/import-a-robot).
