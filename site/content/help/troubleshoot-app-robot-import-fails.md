---
title: A robot won't import from a link or folder
date: 2026-11-13
updated: 2026-11-14
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
  - import-robot-data-as-tries
covers:
  - src/components/ImportRobotSheet.tsx
  - src/workspace/useRobotInsert.ts
  - src/utils/robotImport/
---

Import Robot needs two things to bring in a robot: a URDF or MJCF description it can reach, and the mesh files that description names. Find the message Basecase shows below, then follow the steps under it.

## Import stays grayed out

Basecase can't read the link you pasted. It accepts:

- A GitHub repo or folder
- A Hugging Face link
- An `https` link that ends in `.urdf`, `.xml`, `.mjcf` or `.zip`

1. Copy the link from the repo's page or from the file itself.
2. Paste it into **Import Robot**.

## “Couldn’t open … Link to a public repo or folder.”

Basecase shows this when:

- The repo is private.
- The link points to a branch or folder that doesn't exist.
- GitHub turned the request away. GitHub limits how often a computer can list repos without signing in.

1. Open the link in a browser and check that it shows the files.
2. Wait a few minutes, then press [[↩]] in **Import Robot** again.
3. If it still fails, download the repo, click **Choose Folder** and select it.

## “Couldn’t find a .urdf or MJCF .xml file in …”

The link is public, but it doesn't hold a robot description. Link to the folder that has the `.urdf` or `.xml` file, or to the file itself.

If you chose a folder on your computer, you'll see “Choose a folder with a .urdf or MJCF .xml file.” instead.

## “Couldn’t load its … meshes. Choose the folder with the robot’s mesh files.”

The description names mesh files that aren't next to it. Many repos keep their meshes in a separate folder.

1. Download the whole repo.
2. Click **Choose Folder** and select the repo's top folder, which also holds the meshes.

If only some of the meshes load, the robot still imports, and the toast tells you how many files are missing.

## Other messages

| Message | What to do |
|---|---|
| “That zip is too large. Unzip it and choose the folder.” | Basecase can't open a zip over 200 MB, or one over 600 MB once unpacked. Unzip it and use **Choose Folder**. |
| “Couldn’t open that zip. Unzip it and choose the folder.” | Unzip it on your computer, then use **Choose Folder**. |
| “Choose a URDF or MJCF file. That one isn’t valid XML.” | The file is damaged. Download it again. |
| “Choose a URDF or MJCF file.” | The file is XML, but it isn't a robot description. |
| “Nothing to show: the description has no meshes or shapes.” | The description has joints but no geometry to draw. |

**Note:** A Hugging Face dataset link, or a folder or zip that holds a LeRobot dataset or a ROS 2 recording, comes in as tries instead of a robot. Their messages name the dataset's file and tell you what's wrong with it. See [Import robot data as tries](/help/import-robot-data-as-tries) for what Basecase reads and its limits.

For the usual import steps, see [Import a robot](/help/import-a-robot).
