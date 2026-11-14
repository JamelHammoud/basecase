---
title: Add a reference image
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 8
keywords:
  - reference photo
  - image
  - picture
  - blueprint
  - backdrop
  - trace
  - paste image
  - photo
  - drawing
related:
  - measure-a-part
  - comment-and-mark-up-the-scene
covers:
  - src/workspace/usePartCreation.ts
  - src/workspace/partFactories.ts
  - src/utils/imageFile.ts
  - src/components/inspector/partSections.tsx
  - src/components/layers/LayersView.tsx
  - src/workspace/useCanvasDrop.ts
---

Put a photo or drawing in the scene at its real size, so you and the agent can model against it.

1. Right-click an empty spot on the canvas, then choose **Add Reference Image**.
2. Pick one or more image files.
3. In the Inspector, under **Size**, type a **W** or **H** value in millimeters to match the real object.
4. Under **Image**, choose **Stand Up** to use the image as a backdrop, or **Lay Flat** to use it as a blueprint on the floor.
5. To see parts through the image, drag **Opacity** down.

Each image appears where you right-clicked. It starts out selected and upright, 120 mm on its long side, and its width and height stay locked to the image's shape.

You can also:

- Paste an image with [[⌘V]] anywhere outside a text field.
- Drop image files on the canvas.
- Choose **Add Reference Image** from the **File** menu or from [[⌘K]].

## Tell the agent what to take from it

In the Inspector, open **Notes** and write what matters about the image, for example: “match the leg proportions, ignore the colors.” The agent gets a part's notes along with the scene.

## Hide every reference image

Press [[⇧I]], or click the image toggle in the header of **Layers**. You can also choose **View** ▸ **Show Reference Images**, or use [[⌘K]]. Hidden images aren't drawn, and you can't click them.

Reference images are never printed, exported to STL, or used in Union, Subtract or Intersect. A photo larger than 2048 pixels on a side is scaled down to 2048.
