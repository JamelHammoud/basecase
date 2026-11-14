---
title: Put a robot on the real Earth
date: 2026-11-13
image: /changelog/place-a-robot-on-a-map/cover.png
---

You can now draw a real place under the robot from Google's photorealistic 3D tiles. It works in the desktop app, with your own Map Tiles key in Settings ▸ Accounts.

An outdoor rover designed on an empty grid hides what it will meet. The curb, the slope of the drive and the width of the path only show up on the real street.

**Place on Map**, in the canvas menu and [[⌘K]], takes coordinates or a Google Maps link. East runs along the canvas's X axis and north along -Z, in millimeters. A point 10 m north of the spot lands 10 m along the scene's north. The floor sits on the tiles' surface under the spot, read from the tiles themselves, and **Height offset** moves it.

Tiles stream finer near the camera and coarser away from it. The canvas redraws only when a tile arrives or the view moves. The tiles never show in the captures that Checks and the agent read. Every request goes through the app's main process to tile.googleapis.com, and the key never reaches the page.

The tiles are a backdrop: the simulated robot doesn't drive on them, and the web studio doesn't draw them.

Steps are in [Place a robot on a map](/help/place-a-robot-on-a-map).
