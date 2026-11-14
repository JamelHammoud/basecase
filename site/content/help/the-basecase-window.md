---
title: The Basecase window
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: concept
order: 3
keywords:
  - interface
  - layout
  - sidebar
  - view rail
  - inspector
  - right panel
  - toolbar
  - panels
related:
  - run-a-command
  - keyboard-shortcuts
covers:
  - src/workspace/ViewRail.tsx
  - src/app/TitleBarTabs.tsx
  - src/workspace/TitleBarActions.tsx
  - src/workspace/RightPanelTabs.tsx
  - src/components/ViewportToolbar.tsx
  - src/components/LeftSidebar.tsx
  - src/components/PlayTabs.tsx
  - src/design-system/PanelResizer.tsx
---

Find your way around the studio: views on the left, the canvas in the middle, and the panel for what you've selected on the right.

![The Basecase window: the view rail and Parts on the left, the canvas in the middle and the right panel](/help/export-a-robot-package/exported.png)

## The title bar

From left to right, the title bar holds:

- The sidebar button, which shows or hides the left panel ([[⌘B]]).
- The **Scenes** menu, a list of every scene you've saved ([[⌘O]]).
- A tab for each open scene, and **+** for a new one ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, scene files and robot packages.
- The inspector button, which shows or hides the right panel ([[⌘I]]).

On Windows, a **Menu** button at the far left opens the File, Edit, View, Window and Help menus. On a Mac they're in the menu bar.

## The view rail and the sidebar

The column of icons on the left is the view rail. Each icon opens a view in the sidebar beside it, and clicking the open view again hides the sidebar.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, and ISO hardware such as screws and nuts |
| **Robots** | Published robots to insert, and robots you've imported |
| **Objects** | SimReady objects to put in a robot's world, such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

The gear at the bottom opens Settings ([[⌘,]]). When an update has downloaded, a blue arrow appears above it.

## The canvas and the toolbar

The canvas shows the scene in 3D. Right-click a part or an empty spot for the commands that apply there.

The toolbar at the bottom holds **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). **Shapes** (A) opens basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**.

## The right panel

The right panel has a tab for each job:

- **Inspect** edits the selected part's size, position, rotation and look.
- **Pose** moves a robot's joints. It shows while a robot is selected.
- **Simulate** runs the scene under physics. It shows once the scene has movable joints.
- **Build** holds the Checks, bill of materials, build guide and printing. A red dot on it means something is left to fix. Its tooltip says how many.
- **Agent** is where you talk to the agent. While a Case runs, it's the only tab.

Drag the edge of the sidebar or the right panel to resize it. Double-click the edge to put it back to its default width.

## The command menu

Press [[⌘K]] to search every command, part and saved model by name. Steps are in [Run any command from the keyboard](/help/run-a-command).
