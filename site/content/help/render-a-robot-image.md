---
title: Render a robot image
date: 2026-11-20
collection: files-and-sharing
type: task
covers:
  - src/workspace/RenderCompositionPanel.tsx
  - src/workspace/useRenderComposition.ts
  - src/three/composition/render.ts
---

Create a PNG of your robot with its finishes, lighting and background while keeping your editing view.

1. In the bottom toolbar, click **Render Image**.
2. In **Lighting**, set the light strength.
3. In **Background**, choose a color.
4. In **Width**, set the output width in pixels.
5. In **Height**, set the output height in pixels.
6. Click **Frame Scene** to fit the posed robot.

![A finished metal arm with its composition controls and opaque preview](/help/render-a-robot-image/composition.png)

7. Turn on **Transparent** to remove the background.
8. Click **Preview** to check the composed image.
9. Click **Export PNG** to download the image.
10. Click **Done** to close the panel.

![The arm preview with Transparent enabled](/help/render-a-robot-image/transparent.png)

You can open **Render Image** through [[⌘K]]. Orbit the CAD view and click **Use Current View** to copy its framing. Set **Environment rotation** to turn the lights and reflections around the robot. Use **Exposure** to change image brightness.

You can set each side to 64 to 4096 pixels, with a total limit of 8,388,608 pixels. You render with native physically based raster materials, without path tracing or measurements of physical material accuracy.

You render visible solid robot parts in their current pose. You won’t see editing helpers or transient Case worlds in the image. If you have missing geometry or textures, you can’t export the image. Replace missing images through [Apply finishes and textures](/help/apply-finishes-and-textures).

You keep your composition settings with the scene when you save and reopen it. To stop a pending render, edit the source, switch scenes, close the panel or click **Cancel**. You keep your editing camera, selection and geometry intact.
