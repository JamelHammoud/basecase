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
---

Give the agent photos, a folder of files or a quick drawing, so it builds what you mean instead of guessing.

## Attach photos

1. In the **Agent** tab, click **+** at the left of the composer.
2. Choose **Attach Images**, and pick up to 20 images.
3. Type your message and press Enter.

You can also paste an image into the composer, or drop it on the Agent tab. Basecase shrinks each image to 1,568 pixels on its longest side before sending it.

## Attach a folder

1. Click **+** in the composer and choose **Attach Folder**.
2. Pick the folder.

The agent can read text files such as URDF, Markdown, CSV, JSON and code, and STL meshes as a summary. It reads up to 400 files from a folder and skips the rest, such as PDFs. The chip under the composer counts what it read and what it skipped.

## Draw a sketch

1. Click **+** in the composer and choose **Sketch**.
2. Draw on the canvas. Click **Color** to change the pen.
3. Click **Done**.

The drawing attaches as `Sketch.png`. Click **Back** to leave without attaching it; Basecase doesn't ask first. ⌘K also has **Sketch for Agent**.

To point at something already in the scene instead, see [Point the agent at a part](/help/point-the-agent-at-a-part).
