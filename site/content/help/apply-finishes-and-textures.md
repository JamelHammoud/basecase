---
title: Apply finishes and textures
date: 2026-11-20
collection: design
type: task
covers:
  - src/components/inspector/FinishControls.tsx
  - src/components/inspector/TextureControls.tsx
  - src/appearance/model.ts
  - src/appearance/render.ts
---

You can edit the color, surface roughness, metallic reflection and local image textures of robot parts without changing their manufacturing materials.

1. Select the parts on the canvas.
2. In **Inspect**, under **Appearance**, choose a **Finish**.
3. Set **Roughness**, **Metalness** and **Opacity** for the selected parts.
![Two gripper covers selected with Paint and independent finish controls](/help/apply-finishes-and-textures/finish.png)

4. Beside **Base color**, click **Load**.
5. Choose a local PNG, JPEG or WebP image.
6. Choose **Front Projection**, **Top Projection**, **Side Projection** or **Mesh UVs** for the texture mapping.
7. Set **Scale** and **Rotation** for the image.
8. In **Export**, choose **Scene** to save a portable scene file.

![The selected covers with a local checker texture and a 25 mm projection scale](/help/apply-finishes-and-textures/texture.png)

Use textures within 8 MB and four million pixels each. Keep the scene's combined textures within 32 MB and eight million pixels.

Set projection scale in millimeters per repeat. For Mesh UV scale, use UV units per repeat. You need authored UV coordinates to use Mesh UVs.

You can use normal maps with OpenGL or DirectX orientation. For combined roughness and metalness images, use green for roughness and blue for metalness.

Use undo and redo to restore Appearance edits. You retain textures when you save a scene. Choose **Original** to restore the part's original rendering.

You can retain at most 256 MB of encoded textures in a session. If you fill texture memory after repeated imports, reopen Basecase to release unused session content.

You include texture bytes when you save scene files. For library models and geometry-only exports, you keep the existing formats without embedding these images.
