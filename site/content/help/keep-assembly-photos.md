---
title: Keep assembly photos with a robot build
date: 2026-11-20
collection: build-and-print
type: task
order: 12
related:
  - resume-a-robot-build
  - build-along
covers:
  - src/components/build/BuildPhotoImport.tsx
  - src/components/build/BuildPhotosPanel.tsx
  - src/components/build/BuildPhotoImage.tsx
  - src/workspace/useBuildPhotos.ts
  - src/kit/buildPhotos.ts
  - src/kit/photoImage.ts
---

Compare your assembly photos with the saved CAD step. You can keep each robot's photos separate.

You keep photos on this device in the current app or browser profile. You can import PNG or JPEG files up to 20 MB and 16 megapixels each.

1. In the right panel, click **Build**.
2. Under **Builds**, click the name of a [saved robot build](/help/resume-a-robot-build).
3. In Build Along, use **Next step** or **Previous step** to display the step you photographed.
4. In the toolbar, click **Import Photos**.
5. In the file chooser, choose your photos.

![Arm one's first step with an imported bracket.png thumbnail beside the saved CAD assembly](/help/keep-assembly-photos/thumbnails.png)

6. In the photo strip, click a thumbnail to enlarge it beside the CAD assembly.

![The generated bracket fixture enlarged beside Arm one's frozen CAD assembly](/help/keep-assembly-photos/comparison.png)

You can open **Import Photos** from [[⌘K]] while you have a saved build open. Click **Cancel** to stop an import in progress.

Reopen the same build and step to see its photos. You keep them when you complete a step or click **Mark Incomplete**. If you edit the source design, you keep the photos with the original Kit.

To remove a photo, open its thumbnail and click **Delete**. In the confirmation, click **Delete** to remove it or **Cancel** to keep it.

![The Delete bracket.png confirmation over the enlarged image](/help/keep-assembly-photos/deletion.png)

You can keep up to 20 different photos on each step. If you import a file with identical bytes on that step, you keep one attachment. You can use the same image on other steps and builds.

You have a separate photo storage allowance of 256 MB of shared image content and 2,000 attachments. If you delete a build, you remove its attachments. You keep the shared bytes while another attachment uses them.

You can use photos as a record of what you imported. Importing photos doesn't check assembly correctness, complete steps, change Checks, reserve materials or permit robot movement.
