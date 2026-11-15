---
title: Arrange a Case's console
date: 2026-11-14
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 5
keywords:
  - console
  - panels
  - layout
  - plot
  - resize
  - drag
  - columns
related:
  - run-a-case
  - build-a-case-app-with-the-agent
covers:
  - src/cases/console/consoleEdits.ts
  - src/workspace/useConsoleEditing.ts
  - src/components/caseRun/
  - src/workspace/caseCommands.tsx
---

You can move, resize, add, rename and delete the panels around a running Case.

1. Run a Case. See [Run a Case](/help/run-a-case).
2. To move a panel, drag it by its title. If the panel has no title or is a button, drag it by its top edge. A blue line shows where the panel will land.
3. To start a new card, drop the panel at the side of a card or at the side of the canvas.

![The Reach plot dragged from the right card toward the left one, with a blue line under the brief where it will land](/help/arrange-a-case-console/move.png)

4. To make a card wider or narrower, drag the gap between the card and the canvas.
5. To add a panel, right-click a card and choose **Add Panel**. Choose a kind of panel, then choose the signal or setting it shows.
6. To rename a panel, right-click it and choose **Rename**. Type the new name, then press [[↩]].
7. To delete a panel, right-click it and choose **Delete**, then click **Delete**.

You can also press [[⌘K]] and choose **Add Panel**. Basecase adds the panel to the rightmost card.

Each change counts as one step. To undo it while the Case runs, press [[⌘Z]].

Basecase saves the layout with the Case in your `.basecase` file, and a robot you share as a link opens with your layout. If a Case doesn't have its own console, Basecase copies the default layout the first time you change it.

A card can be 200 to 720 pixels wide. A console holds up to six cards, including the canvas, and up to 24 panels. If a change would break the layout, Basecase keeps the layout as it was and shows you why.

You can arrange the console while a try runs, and the try keeps running. You can't change the console while a try plays back, or in a robot shared in the browser.

Camera panels show detection boxes with each object's class and score. The boxes stay out of saved camera images and videos. See [Watch what the robot's cameras see](/help/watch-what-the-robots-cameras-see) for the camera controls and a detection example.

The agent reads your layout along with the scene. It also builds the code panels, such as a joystick or a piano. See [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).
