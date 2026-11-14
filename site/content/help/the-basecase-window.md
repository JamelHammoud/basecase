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

The Basecase window has views on the left, the canvas in the middle, and a panel on the right for whatever you've selected.

![The Basecase window: the view rail with Parts, Play, Layers and Library, Parts open beside it, the canvas in the middle and the right panel](/help/the-basecase-window/window.png)

## The title bar

The title bar holds these controls, from left to right:

- The sidebar button, which shows or hides the left panel ([[⌘B]]).
- The **Scenes** menu, with every scene you've saved ([[⌘O]]).
- A tab for each open scene. To start a new scene, click **+** ([[⌘T]]).
- **Undo** and **Redo** ([[⌘Z]] and [[⇧⌘Z]]).
- **Export**, for STL, 3MF, scene files and robot packages.
- The inspector button. Click it to show or hide the right panel ([[⌘I]]).

On Windows, the File, Edit, View, Window and Help menus are behind the **Menu** button at the far left. On a Mac, they're in the menu bar.

## The view rail and the sidebar

The column of icons on the left is the view rail. Click an icon to open its view in the sidebar next to it. To hide the sidebar, click the open view again.

| View | What it holds |
|---|---|
| **Parts** | Real servos, motors, boards, sensors and cameras, ISO hardware such as screws and nuts, published robots, and SimReady objects such as furniture and props |
| **Play** | **Cases**, **Routines** and **Operate** |
| **Layers** | Every part in the scene, as a tree |
| **Library** | Models you've saved to use in any scene |

To open Settings, click the gear at the bottom ([[⌘,]]). If an update has downloaded, a blue arrow appears above the gear.

## The canvas and the toolbar

The canvas shows your scene in 3D. Right-click a part or an empty spot to see the commands that apply to it.

The toolbar at the bottom holds **Move** (V), **Rotate** (E), **Scale** (R) and **Comment** (M). For basic shapes, **Sketch**, **Measure**, **Annotate** and **Import SVG**, click **Shapes** (A).

## The right panel

The right panel has a tab for each job:

- **Inspect** edits the selected part's size, position, rotation and look.
- **Pose** moves a robot's joints. The tab appears while a robot is selected.
- **Simulate** runs the scene under physics. You'll see it once the scene has movable joints.
- **Build** holds the Checks, the bill of materials, the build guide and printing. If there's something left to fix, a red dot appears on the tab. To see how many things are left, hold your pointer over the tab.
- **Agent** is where you talk to the agent. While a Case runs, it's the only tab.

To resize the sidebar or the right panel, drag its edge. Double-click the edge to return it to its default width.

## When part of the window fails

A view, panel or sheet that fails shows its name and “stopped working”, such as “Parts stopped working”, with **Reload**. The rest of the window keeps working. If the whole window fails, **Reload Window** opens it again.

## The command menu

To search every command, part and saved model by name, press [[⌘K]]. For steps, see [Run any command from the keyboard](/help/run-a-command).
