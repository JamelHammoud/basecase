---
title: Register a Fleet facility
date: 2026-11-16
collection: operate
type: task
covers:
  - src/fleet/browser/FleetInventory.tsx
  - src/fleet/browser/FleetSite.tsx
  - src/fleet/browser/RegistrationForm.tsx
  - src/fleet/sites/facility.ts
  - src/fleet/sites/registration.mjs
  - electron/simready/localFacility.mjs
related:
  - open-basecase-fleet
  - host-basecase-fleet
---

Place a floorplan or local facility export on the globe and keep its source heights.

You need a [Fleet account](/help/open-basecase-fleet) with permission to manage the site and two known control points. Keep your package within 32 MiB. You can import local USD exports without connecting to Nucleus.

1. In **Site**, choose the facility's site.
2. In **Source units**, choose the file's units.
3. In **Source up axis**, choose the file's vertical axis.
4. Click **Upload Facility**.
5. Select the exported file and its local dependencies.

![Factory floorplan with two control points entered and a WGS84 ellipsoid vertical frame](/help/register-a-fleet-facility/registration.png)

6. In **Site registration**, enter two control points in facility meters and WGS84 coordinates.
7. In **Vertical frame**, choose the convention used by the control-point altitudes.
8. For orthometric or local heights, enter **Vertical reference**.
9. For orthometric or local heights, enter **Offset to ellipsoid (m)**.
10. Click **Register Site**.

You supply a signed, constant offset for this facility. To calculate ellipsoid height, add the offset to your declared altitude.

![Registered Factory floorplan with replay-fed Rover 01 and Rover 02](/help/register-a-fleet-facility/facility.png)

In **Site**, choose **All sites** to select a robot or registered site on the globe. Select a robot to see its position timestamp, status, current work and declared next work. Click **Open Facility** to return to its site.

![Rover 01 selected on the globe with current and declared next work](/help/register-a-fleet-facility/globe.png)

You can import ASCII lines and straight lightweight polylines from DXF files. Flatten curves and blocks before exporting. You keep source elevations when you import GLB, glTF and OBJ files. You can import PLY point clouds, including recorded LiDAR maps exported as PLY. Use meshes with up to 200,000 triangles and maps with up to one million points.

For a package with several USD layers, enter the starting filename in **Root file** before uploading. If you do not specify a root, include one USD or USDZ file in the package.

For USD and USDZ imports, you use the file's stage units and up axis. For a USD stage without authored units, you use centimeters. In the converted twin, you can see the source metric and hashes. You see the geometry without source textures or articulated fixtures.

![Local facility.usda imported with centimeter units](/help/register-a-fleet-facility/usd.png)

You can declare comma-separated floor names in **Floor identities** before uploading. For DXF imports, you get default names from the layers. Use **Floor** to filter robot positions by the declared identity without cutting the facility mesh into floors.

You can see reported or estimated positions. After 60 seconds, consider them stale. Without registration or position data, you cannot place the robot. If you replace a facility, you clear its registration. Register the new source before using its local robot positions.
