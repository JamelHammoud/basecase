---
title: Attach photos, files and sketches
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: task
order: 4
keywords:
  - upload
  - image
  - reference photo
  - drawing
  - paste
  - drag and drop
  - folder
  - datasheet
  - urdf
related:
  - design-a-robot-with-the-agent
  - point-the-agent-at-a-part
covers:
  - src/components/agent/AttachMenu.tsx
  - src/components/agent/useAttachments.ts
  - src/utils/evidenceFiles.ts
  - src/components/agent/sketch/
  - src/workspace/useAgentSession.ts
  - src/workspace/slashPaletteCommands.tsx
---

You can give the agent photos, a folder of files, or a quick drawing, so it can build what you mean.

## Attach photos

1. In the **Agent** tab, click **+** at the left of the composer.
2. Choose **Attach Images**, then pick up to 20 images.
3. Type your message, then press [[↩]].

You can also paste an image into the composer or drop it on the Agent tab. Or choose **Attach Images** in [[⌘K]]. Basecase shrinks each image to 1,568 pixels on its longest side before sending it.

## Attach a folder

1. Click **+** in the composer, then choose **Attach Folder**.
2. Pick the folder.

The agent can read text files, such as URDF, Markdown, CSV, JSON, and code, and it reads STL meshes as a summary. It reads up to 400 files from a folder and skips the rest, such as PDFs. The chip under the composer shows how many files it read and how many it skipped.

## Draw a sketch

1. Click **+** in the composer, then choose **Attach Sketch**.
2. Draw on the canvas. To change the pen, click **Color**.
3. Click **Done**.

Your drawing attaches as `Sketch.png`. To leave without attaching it, click **Back**. Basecase closes the sketch without asking. You can also choose **Attach Sketch** in [[⌘K]].

To point the agent at something that's already in the scene, see [Point the agent at a part](/help/point-the-agent-at-a-part).
