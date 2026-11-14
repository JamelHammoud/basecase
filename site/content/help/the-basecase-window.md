---
title: The Basecase window
date: 2026-11-13
updated: 2026-11-14
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
  - src/design-system/ErrorBoundary.tsx
  - src/app/WindowBoundary.tsx
---

The Basecase window has three areas: views on the left, the canvas in the middle, and a panel on the right for whatever you've selected.

![The Basecase window: the view rail with Parts, Play, Layers and Library, Parts open beside it, the canvas in the middle and the right panel](/help/the-basecase-window/window.png)

## The title bar

From left to right, the title bar holds:

- The sidebar button, which shows or hides the left panel ([[⌘B]]).
- The **Scenes** menu, with every scene you've saved ([[⌘O]]).
- A tab for each open scene. To start a new scene, click **+** ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, cut files, STEP, scene files and robot packages.
- The inspector button, which shows or hides the right panel ([[⌘I]]).

On Windows, the File, Edit, View, Window and Help menus are under the **Menu** button at the far left. On a Mac, they're in the menu bar.

## The view rail and the sidebar

The column of icons on the left is the view rail. Click an icon to open its view in the sidebar next to it. Click the open view again to hide the sidebar.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, ISO hardware such as screws and nuts, published robots, and SimReady objects such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

Click the gear at the bottom to open Settings ([[⌘,]]). When an update has downloaded, a blue arrow appears above the gear.

## The canvas and the toolbar

The canvas shows your scene in 3D. Right-click a part or an empty spot to see the commands that apply to it.

The toolbar at the bottom holds **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). Click **Shapes** (A) to open basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**.

## The right panel

The right panel has these tabs:

- **Inspect** edits the selected part's size, position, rotation and look.
- **Pose** appears while a robot is selected. Use it to move the robot's joints.
- **Simulate** appears once the scene has movable joints, and runs the scene under physics.
- **Build** holds the Checks, the bill of materials, the build guide and printing. A red dot on the tab means something is left to fix, and its tooltip shows how many.
- **Agent** is where you talk to the agent. While a Case runs, it's the only tab.

Drag the edge of the sidebar or the right panel to resize it. Double-click the edge to put it back to its default width.

## When part of the window fails

A view, panel or sheet that fails shows its name and “stopped working”, such as “Parts stopped working”, with **Reload**. The rest of the window keeps working. If the whole window fails, **Reload Window** opens it again.

## The command menu

Press [[⌘K]] to search every command, part and saved model by name. For steps, see [Run any command from the keyboard](/help/run-a-command).
