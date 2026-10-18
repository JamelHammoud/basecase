# Raspberry Pi High Quality Camera (C/CS-mount)

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/raspberry-pi-hq-camera/.

Envelope: 38 × 21.5 × 51.86 mm (studio frame, Y up).

Every dimension in the record and drawing matches the model except the overall depth, and that mismatch comes from the drawing itself, not from a misplaced part. I changed nothing. The final `check_scene` shows one item, which is intended: the rear lip on the mount goes 2.75 mm below the floor because it sits behind the PCB.

Positions and sizes below come from `get_scene` and from the part code.

| # | Feature | Official value | Model | Result |
|---|---|---|---|---|
| 1 | Board X × Y | 38 × 38 | PCB from −19 to 19 in both X and Y = 38 × 38 | OK |
| 2 | Overall depth (record envelope Z) | 18.58 | PCB bottom (z 0) to ring front (z 18.75) = 18.75. Including the rear lip, total depth is 21.5. | **Doesn't match: the drawing contradicts itself** (see below) |
| 3 | PCB thickness | 1.4 | z 0 → 1.4 | OK |
| 4 | Mounting holes | 4× Ø2.5, 4 mm in from each edge (30 × 30) | Ø2.5 at (±15, ±15), 4.0 from each edge | OK |
| 5 | Mount body, PCB front face → back-focus flange | 10.35 | z 1.4 → 11.75 = 10.35; it starts on the PCB top face | OK |
| 6 | Back-focus flange | Ø36 × 1.2 | Ø36, z 11.75 → 12.95; it sits on the mount top face | OK |
| 7 | Front ring | Ø30.75 × 5.8 | Ø30.75, z 12.95 → 18.75 | OK |
| 8 | Lens bore | Ø22.4, centred | Ø22.4 on (0, 0), open down to the PCB | OK |
| 9 | Sensor window | 8.5, centred | 8.5 × 8.5 on (0, 0), sitting on the PCB top at z 1.4 and visible through the bore | OK |
| 10 | Tripod tab width | 13.97 | X ±6.985 = 13.97 | OK |
| 11 | Rear lip | 5.71 × 2.75 | Y −19 → −13.29 = 5.71; Z −2.75 → 0 = 2.75, directly under the PCB | OK |
| 12 | Top clamp (the record calls it the "FPC connector") | 10.16 wide, 0.8 gap | 10.16 wide, 0.8 slit at x = 0 | OK |
| 13 | Clamp depth from the mount face | 5.02 | z 6.73 → 11.75 = 5.02 | OK |
| 14 | 7.62 dimension (tripod block) | 7.62 from the mount face | The tripod hole is centred 3.81 below the mount face, assuming the 7.62 block is symmetric | OK (the drawing shows the 7.62 span but not where the hole sits in it) |
| 15 | 12.04 dimension (mount face → PCB back) | 12.04 | 11.75 (10.35 + 1.4) | **Doesn't match: the drawing contradicts itself** |
| 16 | Tripod thread | 1/4"-20 | Plain Ø6.35 hole in the tab's −Y face | OK (the thread isn't modelled) |

**Placement:**
- The ring sits on the mount face, the flange on the mount, the mount on the PCB top, and the sensor on the PCB top.
- The rear lip and the mount fill the PCB notch without overlapping the board.
- The clamp ear joins the body cylinder, and the tab joins the notch fill.
- Nothing floats or is buried.

**Why rows 2 and 15 can't be fixed:**
- **Row 2:** the drawing labels 5.8 + 1.2 + 10.35 + 1.4 = 18.75 to the PCB back face, and 21.5 including the 2.75 rear lip. Its 18.58 label therefore can't agree with the parts it covers. The record's own notes add a third figure, 18.4 mm, from the docs table.
- **Row 15:** the drawing's 10.35 + 1.4 = 11.75 doesn't equal the 12.04 it labels for the same span.
- I kept the individual labelled dimensions and didn't stretch the model to an arbitrary total. Those individual dimensions also match the drawing's own scale. Please confirm the real depth on a physical camera before saving.

### Not dimensioned
These are plain or scaled from the drawing:
- **Mount body diameter:** about 34.4.
- **Tripod tab:** reaches about 11.4 below the board edge.
- **Tab flare and PCB notch:** widths of about 21.8–23.1. The notch itself is my reading of the drawing, not a stated feature.
- **Clamp ear:** sticks out about 2.5 past the top edge. The clamp screw's diameter and position aren't given, so no screw is modelled.
- **Tripod hole:** 6 mm deep, and the thread isn't modelled.
- **Ring and flange:** the knurl pitch isn't given, so both are plain cylinders at their outer diameters. The CS-mount thread isn't modelled either.
- **Sensor:** height set to a 1.0 mm placeholder.
- **PCB:** corner radius set to 1 mm.
- **Back-side parts:** the board's back-side components and the CSI ribbon connector aren't on the drawing, so they're left out.
