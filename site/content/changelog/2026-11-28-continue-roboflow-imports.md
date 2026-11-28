---
title: Continue a Roboflow import
date: 2026-11-28
image: /changelog/continue-roboflow-imports/cover.png
---

You can continue a Roboflow import while Roboflow prepares the export and keep your selected dataset version.

In Import Robot, you can click Continue from the open sheet while you wait for the export. If you select version 2 and someone generates version 3 before the export finishes, you request version 2 with Continue.

You make one export request with each click. Basecase waits until the COCO archive is ready, downloads it and opens the imported dataset in Library. Reimport the same content and Basecase reuses the saved dataset.

You need the desktop app and a Roboflow API key to import. Keep the sheet open during preparation. Basecase makes no background checks and discards replies that arrive after you click Cancel.

Read [Import an image dataset](/help/import-an-image-dataset) for the steps.
