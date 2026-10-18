# Raspberry Pi Global Shutter Camera

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/raspberry-pi-global-shutter-camera/.

Envelope: 39.5 × 25.07 × 51.86 mm (studio frame, Y up).

I checked every number in record.json against the model and changed nothing. Every row whose official value is self-consistent matches exactly. Three rows don't match, but they can't all be met at once because the official numbers contradict each other; I've marked those **Conflict**.

The overall depth is 25.07 mm, the same as the drawing.

| Feature (record.json / drawing) | Official | Measured on model | Status |
|---|---|---|---|
| Board x × y | 38 × 38 | PCB bounds ±19 → 38 × 38 | OK |
| Envelope z | record 19.8 (product brief); drawing 25.07 overall | 25.07 (z −6.32 → 18.75) | Conflict: the record's own note gives 25.07 with the rear cover, so I followed the drawing |
| PCB thickness | 1.4 | z 0 → 1.4 | OK |
| PCB holes | 4× Ø2.5, 4 mm from edges, 30 × 30 pattern | Ø2.5 at (±15, ±15); 19 − 15 = 4 | OK |
| Rear cover outline | 39.5 × 39.5, R4.75 corners | ±19.75, R4.75 | OK |
| Cover corner clearances | Ø5.99 on 30 mm pattern | Ø5.99 at (±15, ±15); 19.75 − 15 = 4.75 | OK |
| Cover holes | 2× Ø2.5, 24.38 apart, 7.56 from edges, at mid-height 19.75 | Ø2.5 at x = ±12.19, y = 0; 19.75 − 12.19 = 7.56 | OK |
| Cover depth | 6.49 (drawing) | 6.32 (z −6.32 → 0) | Conflict: 5.8 + 1.2 + 10.35 + 1.4 + 6.49 = 25.24, not 25.07, so I kept the overall depth |
| Housing, lens face to PCB | 10.35 | z 1.4 → 11.75 = 10.35, sitting on the PCB's top face | OK |
| Knurled flange | Ø36 × 1.2 | Ø36, z 11.75 → 12.95, starts on the housing face | OK |
| Focus ring front | Ø30.75 × 5.8 | Ø30.75, z 12.95 → 18.75 | OK |
| CS bore | Ø22.4, centered | Ø22.4 at (0, 0) through the housing and ring | OK |
| Sensor window | 8.5, centered | 8.5 × 8.5 at (0, 0), on the PCB, visible down the bore | OK |
| Top tab (record: "FPC connector") | 10.16 wide, 0.8 slit, 5.02 deep | 10.16 wide, 0.8 slit centered, z 6.73 → 11.75 = 5.02, fused to the housing | OK |
| Tripod tab width | 13.97 | x ±6.985 | OK |
| Tripod tab depth | 12.04 | 11.75 (z 0 → 11.75) | Conflict: 10.35 + 1.4 = 11.75; going to 12.04 would push 0.29 mm into the rear cover |
| Tripod block | 7.62 | hole axis 3.81 behind the lens-side face (middle of the 7.62 block) | OK |
| Tripod thread | 1/4"-20 | plain Ø6.35 bore in the tab's bottom face | OK (thread not modeled) |

**Placement checks**

- Every part touches the part it mounts to:
  - The housing stands on the PCB's top face, and its tripod tab reaches down to the PCB's bottom face (z = 0).
  - The flange starts on the housing face.
  - The rear cover's top face meets the PCB's bottom face.
- Nothing that should be visible is hidden inside another part, and nothing floats.
- check_scene's only warning is the rear cover sitting 6.3 mm below the floor. That follows from the pose you asked for: the PCB's bottom face is at z = 0, and the cover mounts behind the board.

**Not dimensioned**

- **Rear cover depth:** 6.49 or 6.32 mm (conflicting numbers, above).
- **Tripod tab depth:** 12.04 or 11.75 mm (conflicting numbers, above).
- **Measured off the drawing's scale, not given as numbers:**
  - the tripod tab's drop below the board (to y = −30.36)
  - the width where the tab flares out from the housing (24.1 mm)
  - the top tab's height (y = +21.5) and the slit's depth (to y = +17.5)
- **Tripod hole:** depth assumed at 6 mm; no thread modeled.
- **Top tab identity:** record.json calls it a 10.16 mm FPC connector. The drawing shows a slotted clamp tab with a screw on the lens side, so I modeled a clamp tab. The ribbon connector itself isn't modeled.
- **Plain placeholders:**
  - PCB corner radius (1 mm)
  - sensor height (1 mm)
  - rear cover kept as a full solid block, without its edge notches, curved back, counterbores or logo
- **Left out:** the knurling, the CS thread, the clamp screw and the board components.
