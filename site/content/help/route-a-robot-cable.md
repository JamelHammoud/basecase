---
title: Route a robot cable
date: 2026-11-18
collection: build-and-print
type: task
covers:
  - src/components/build/CableRoutesSection.tsx
  - src/components/build/CableRouteEditor.tsx
  - src/components/build/CableAnchorFields.tsx
  - src/workspace/useCableRoutes.ts
  - src/wiring/routeEditing.ts
---

Choose cable stock and attach routing points to the robot's links without changing its connectors or servo IDs.

1. In **Build**, open **Cable reach** under **Checks**.

   ![Cable reach with the connection that needs a longer cable](/help/route-a-robot-cable/finding.png)

2. Beside the affected connection, click **Edit Route**.
3. In **Cable**, choose the stock you will use.
4. Click **Add Point**.
5. In **Link**, choose the part that holds the point.
6. Set the point's **X**, **Y** and **Z** coordinates in millimeters.

   ![The selected 900 mm cable and an adapter-local routing point](/help/route-a-robot-cable/route.png)

7. Click **Done**.
8. In **Checks**, check **Cable reach** again.

You can open a connection from **Wiring** or search for **Edit Route** with [[⌘K]]. Drag a point on the canvas to move it without changing its owner. Use **Move Up** and **Move Down** to change the point order. If you click **Delete**, you’ll need to confirm before removing the point.

To place a point on a link, click **Move Point**, then click the link on the canvas. If you click a surface, you place the point at the position you clicked. If **Cable reach** rejects a surface point, use the coordinate fields or drag the point to move it clear of the link.

Press [[⌘Z]] to undo stock and point edits. Press [[⇧⌘Z]] to restore them. Click **Show Pose** to open the limiting joint position in **Pose**.

With a passing route, you meet the existing conservative cable check. You haven’t certified bend radius or established that the whole robot is ready. You may still have unresolved openings, unsupported linkages and large joint-range combinations.

See [Servo bus or Cable reach is red](/help/troubleshoot-servo-bus) for those limits. In [Build a robot step by step on the canvas](/help/build-along), you can see the retained rest route during assembly.
