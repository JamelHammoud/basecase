---
title: Browse tries in the Library
date: 2026-11-13
collection: simulate-and-train
type: task
order: 6
keywords:
  - all tries
  - recordings
  - delete tries
  - tries from other scenes
covers:
  - src/components/tries/TriesSection.tsx
  - src/components/tries/TriesCanvas.tsx
  - src/components/tries/TryTile.tsx
  - src/components/tries/triesLibrary.ts
  - src/components/tries/confirmTriesDelete.ts
  - src/workspace/useStoredTimeline.ts
  - src/cases/tryStore.ts
  - electron/library/tryLibrary.mjs
---

See every try you've recorded, from every scene, in one place, and open or delete any of them.

1. In the view rail, choose **Library**.
2. Under **Tries**, click a robot. Each row shows how many tries it has.

![The Library with a Tries section listing one robot and its 4 tries](/help/browse-tries-in-the-library/library.png)

3. The canvas fills with your tries, grouped by robot. Each tile shows the try's filmstrip, its Case, Passed or Missed, and how long it ran. A try made by [Multiply](/help/multiply-a-try-into-demonstrations) has a **Variation** badge, and a [try on your real robot](/help/try-a-case-on-your-real-robot) has a **Real** badge.
4. Click a tile. Its timeline opens under the tiles, one lane per joint, and works as in [Scrub a try on the timeline](/help/scrub-a-try-on-the-timeline).

![Tries from two scenes, with the second one selected and its timeline open](/help/browse-tries-in-the-library/tries.png)

5. ⌘-click a tile to add it to the selection or take it out. ⇧-click adds every tile from the last one you clicked.
6. To delete, right-click a selected tile and choose **Delete**, or press ⌫. Then click **Delete**. Deleting a try deletes its variations too.
7. Press Esc to clear the selection, and Esc again or **Done** to leave.

Type in **Search library** first to narrow the tries by robot, Case, "variation" or "real". ⌘K's **Show Tries** opens the same view.

A tile shows its filmstrip once the try has appeared in a Case's Results. A try on your real robot has none. Tries recorded before this update move into the Library the first time you open their scene. Tries stay on this computer.
