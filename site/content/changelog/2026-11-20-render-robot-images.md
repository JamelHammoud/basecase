---
title: Render robot images
date: 2026-11-20
image: /changelog/render-robot-images/cover.png
---

You can compose and export a PNG of your finished robot inside Basecase. Set its materials, pose, lighting and framing in one native rendering workflow.

Open Render Image from the bottom toolbar or the command palette. In the composition panel, you can adjust lighting, environment rotation and background without changing your editing camera or selection.

For a brushed-metal arm, you can reuse saved framing to make an image with a dark background and a transparent image for a build document. Choose Frame Scene to fit the posed solids, or Use Current View to copy the view you arranged.

You can export images from 64 to 4096 pixels per side, within 8,388,608 total pixels. We run preparation and PNG encoding in a worker. If you edit the source, change the scene or cancel, we stop pending work before delivering the image. You keep composition settings in saved scenes and portable scene files.

You render raster images with physically based materials, without path tracing or physical material calibration. We exclude editing helpers and transient Case worlds from the image. If geometry or textures are missing, we stop the export.

Follow [Render a robot image](/help/render-a-robot-image) for the controls and download steps.
