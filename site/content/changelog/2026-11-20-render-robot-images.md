---
title: Render robot images
date: 2026-11-20
image: /changelog/render-robot-images/cover.png
---

You can compose and export a PNG of your finished robot inside Basecase, using its saved finishes and current pose.

Render Image opens from the bottom toolbar or the command palette. Its composition panel adjusts lighting, environment rotation and background without changing your editing camera or selection.

For a brushed-metal arm, saved framing lets you make a dark-background image and a transparent version for a build document.

You can export images from 64 to 4096 pixels per side, within 8,388,608 total pixels. We run preparation and PNG encoding in a worker. If you edit the source, change the scene or cancel, we stop pending work before delivering the image. You keep composition settings in saved scenes and portable scene files.

You render raster images with physically based materials, without path tracing or physical material calibration. We exclude editing helpers and transient Case worlds from the image. SimReady parts use their imported colors, without downloaded visual textures. If geometry or Appearance textures are missing, we stop the export.

Follow [Render a robot image](/help/render-a-robot-image) for the controls and download steps.
