---
title: Trackpad and mouse controls
date: 2026-11-13
updated: 2026-11-13
collection: get-started
type: reference
order: 2
keywords:
  - orbit
  - pan
  - zoom
  - rotate view
  - camera
  - navigation
  - scroll
  - gestures
related:
  - keyboard-shortcuts
  - the-basecase-window
covers:
  - src/three/viewport/wheel.ts
  - src/three/viewport/stage.ts
  - src/three/viewport/keys.ts
  - src/app/storedSettings.ts
  - src/components/SettingsWindow.tsx
  - src/data/cameraViews.ts
---

How to orbit, pan and zoom the 3D view with a trackpad or mouse, and what two-finger scrolling does in each mode.

## Gestures

| Gesture | What it does |
|---|---|
| Drag the canvas | Orbit |
| Right-drag or middle-drag | Pan |
| Hold [[Space]] and drag | Pan |
| Pinch, or [[⌘]] and scroll | Zoom |
| [[⇧]] and drag on an empty spot | Select the parts inside a box |
| Right-click, or two-finger click | Open the menu for what's under the pointer |

## Scrolling

What a two-finger scroll or mouse wheel does depends on the mode in **Settings** ▸ **Canvas** ▸ **Two-finger scroll**. On Windows, the row is called **Scroll**.

| Mode | Scroll | [[⇧]] and scroll |
|---|---|---|
| **Orbit**, the Mac default | Orbits | Pans |
| **Pan** | Pans | Pans |
| **Zoom**, the Windows default | Zooms | Pans |

The same choice is in **View** ▸ **Two-Finger Scroll**, and in [[⌘K]] as **Scroll to Orbit**, **Scroll to Pan** or **Scroll to Zoom**.

## Views

| Key | View |
|---|---|
| [[1]] | Isometric |
| [[2]] | Top |
| [[3]] | Front |
| [[4]] | Side, from the right |
| [[Z]] | Centers the orbit on the selection, or goes back to the home view with nothing selected |

**View** ▸ **Camera** ▸ **Reset View** deselects everything and goes back to the home view. The view zooms between 25 mm and 12 m from what it's looking at.

## Snapping

Moving snaps to 5 mm and rotating to 15° until you change them in **Settings** ▸ **Canvas** ▸ **Snapping**. Hold [[⇧]] while you drag to move or rotate freely.
