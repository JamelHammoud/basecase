---
title: Browse every try in the Library
date: 2026-11-13
collection: simulate-and-train
type: task
order: 16
keywords:
  - tries
  - recordings
  - episodes
  - library
  - timeline
  - delete tries
related:
  - try-a-case
  - multiply-a-try-into-demonstrations
covers:
  - src/components/library/TriesSection.tsx
  - src/components/tries/TriesMode.tsx
  - src/components/tries/TryTile.tsx
  - src/components/tries/TriesTimeline.tsx
  - src/components/tries/confirmDeleteTries.ts
  - src/workspace/useTriesMode.ts
  - src/cases/tryStore.ts
  - electron/library/tryLibrary.mjs
---

See the tries from every scene together, grouped by robot, and open any of them on the timeline.

1. Click **Library** in the view rail.
2. Under **Tries**, click a robot. Each row shows how many tries it has.
3. Read the tiles that fill the canvas: four frames from each try, **Passed** or **Missed**, how long it took and its Case.
4. Click a try to open it on the timeline under the tiles.
5. Press [[←]] or [[→]] to step a frame, or [[Space]] to play it.
6. Click **Done** to go back to the scene.

![The Library with a Tries section listing one robot, named Robot, with 4 tries](/help/browse-every-try-in-the-library/library.png)

![Tries mode on the canvas with four tiles from two scenes, each marked Passed with its time and Touch the Dots](/help/browse-every-try-in-the-library/tiles.png)

![A selected try with its three joints on the timeline under the tiles, 9.2 s long](/help/browse-every-try-in-the-library/timeline.png)

To select several tries, [[⇧]]-click a range or [[⌘]]-click each one. **Show Tries** in [[⌘K]] opens the same view. The search at the top of the Library also finds tries by Case, robot, scene or source.

## Delete tries

Select the tries and press [[⌫]], or right-click one and choose **Delete**. Basecase asks first. A try's [variations](/help/multiply-a-try-into-demonstrations) are deleted with it.

## Where tries are kept

The desktop app keeps each try in its own folder in `library/tries/` on this computer, with its recording and filmstrip. A scene only points at its tries, so they aren't in shared `.basecase` files. In the web studio, tries stay in the browser.

The timeline here shows each joint's target and position. To see effort and watch the robot move, open the try from **Results** in its own scene; see [Try a Case](/help/try-a-case).
