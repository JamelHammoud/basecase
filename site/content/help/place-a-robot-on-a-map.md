---
title: Place a robot on a map
date: 2026-11-13
collection: design
type: task
keywords:
  - google maps
  - 3d tiles
  - photorealistic tiles
  - earth
  - gps
  - coordinates
  - outdoor
  - street
related:
  - add-a-camera-view
covers:
  - src/workspace/useEarthPlace.ts
  - src/components/PlaceOnMapSheet.tsx
  - src/earth/earthOrigin.ts
  - src/three/viewport/earthLayer.ts
  - src/components/settings/AccountsPane.tsx
---

You can draw Google's photorealistic 3D tiles of a real place under your robot, so an outdoor design sits on the street it's built for.

This works in the desktop app, and you need your own Google Map Tiles API key.

1. Press [[⌘,]] and choose **Accounts**.
2. Under **Google Maps**, paste your key into **Map Tiles key**, then press [[↩]]. Basecase checks the key with Google before saving it.

![The Accounts pane with the Map Tiles key field under Google Maps](/help/place-a-robot-on-a-map/accounts.png)

3. Right-click an empty spot on the canvas and choose **Place on Map**.
4. Paste the coordinates of the place, such as `37.7793, -122.4193`, or its Google Maps link.
5. Click **Place**.

![The Place on Map sheet with a Google Maps link pasted and Height offset at 0 m](/help/place-a-robot-on-a-map/sheet.png)

The tiles stream in around the spot, and Google's attribution appears in the corner of the canvas.

![A rover on the placed tiles, with the tiles' attribution in the canvas corner](/help/place-a-robot-on-a-map/placed.png)

East runs along the red X axis, and north runs away from the blue Z axis. The floor sits on the surface of the tiles under the spot. To raise or lower the robot from there, change **Height offset**. To set the height above the WGS84 ellipsoid instead, add a third number after the coordinates.

You can also find **Place on Map** in [[⌘K]]. If you haven't saved a key, it opens **Accounts** at the **Map Tiles key** field. To hide the tiles, choose **Hide Map** in [[⌘K]], or turn off **Show Map** in the canvas menu. The place stays saved with the scene.

The canvas draws tiles up to 80 m from the camera. Basecase can't read a shortened `maps.app.goo.gl` link, so open it in your browser first, then paste the full address.
