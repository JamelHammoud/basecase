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

Stand a photo or drawing in the scene at real size, so you and the agent can model against it.

1. Right-click an empty spot on the canvas and choose **Add Reference Image**.
2. Pick one or more image files.
3. In the Inspector, type **W** or **H** under **Size**, in millimeters, so the image matches the real object.
4. Under **Image**, choose **Stand Up** for a backdrop or **Lay Flat** for a blueprint on the floor.
5. Drag **Opacity** down to see parts through the image.

Each image starts upright, 120 mm on its long side, where you right-clicked. Width and height stay locked to the image's shape.

You can also paste an image with [[⌘V]] anywhere outside a text field, or drop image files on the canvas. **Add Reference Image** is in **File** and [[⌘K]] too.

## Tell the agent what to take from it

Open **Notes** in the Inspector and write what matters, such as “match the leg proportions, ignore the colors”. Notes on a part go to the agent with the scene.

## Hide every reference image

Press [[⇧I]], or click the image toggle in the header of **Layers**. Hidden images aren't drawn and can't be clicked. **View** ▸ **Show Reference Images** and [[⌘K]] do the same.

Reference images are never printed, exported to STL or used in Union, Subtract or Intersect. Photos larger than 2048 pixels on a side are scaled down to 2048 when you add them.
