# Raspberry Pi Zero 2 W

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/raspberry-pi-zero-2w/.

Envelope: 65 × 4.3 × 31.44 mm (studio frame, Y up).

Every official number in record.json and the drawing matches the model, so there was nothing to fix. `check_scene` found no issues, and the top and front renders show nothing floating or buried. I measured each value from the part bounds in `get_scene` and the PCB code, then converted to drawing coordinates (drawing = world + (32.5, 15); origin at the bottom‑left corner).

| Dimension / feature | Official | Measured on model | Result |
|---|---|---|---|
| Envelope X (long edge) | 65 | PCB from x −32.5 to 32.5 = 65.0 | OK |
| Envelope Y (short edge) | 30 | PCB from y −15 to 15 = 30.0 | OK |
| Envelope Z | not given | PCB 1.0; overall 4.3 to the top of the mini‑HDMI | — (estimate) |
| Mounting hole 1 | (3.5, 3.5) | hole at 3.5 in from both edges, world (−29, −11.5) | OK |
| Mounting hole 2 | (61.5, 3.5) | world (29, −11.5) | OK |
| Mounting hole 3 | (3.5, 26.5) | world (−29, 11.5) | OK |
| Mounting hole 4 | (61.5, 26.5) | world (29, 11.5) | OK |
| Hole pattern | 58 × 23 | 58.0 × 23.0 | OK |
| GPIO 2×20 centre x | 32.5 (29 from the top‑left hole) | 32.5, which is 29.0 from the hole | OK |
| GPIO centre y | on the top hole line (26.5) | 26.5 (rows at ±1.27) | OK |
| Mini‑HDMI centre x | 12.4 | bounds −25.5 to −14.7, centre −20.1, so 12.4 | OK |
| Micro‑USB OTG centre x | 41.4 | bounds 4.7 to 13.1, centre 8.9, so 41.4 | OK |
| Micro‑USB power centre x | 54.0 | bounds 17.3 to 25.7, centre 21.5, so 54.0 | OK |
| Ports on the bottom (front, −Y) edge | yes | all three reach the y = −15 edge and stick out past it | OK |
| Pose | PCB bottom at z = 0, components up, long side along X | PCB z from 0 to 1 | OK |

**Placement:**
- **Seating:** all 4 connectors stand on the PCB top face (z = 1.0). None float and none sink into the board.
- **CSI connector:** its outer edge is flush with the board edge at x = 32.5.
- **Clearance at the mounting holes:**
  - The hole edges reach about 1.4 mm in from x = ±29 (to about ±27.6).
  - The nearest connectors stop short of that: the mini‑HDMI at −25.5 and the power micro‑USB at 25.7.
  - None of the GPIO holes overlaps a mounting hole.
- **Overall size:** 65 × 31.44 × 4.3 mm. The extra 1.44 mm in Y is the micro‑USB flange sticking out past the front edge, as the drawing shows.

**Not dimensioned** (none of these are on the official drawing; values are estimates or were scaled from the drawing; check them before relying on them)
- **PCB thickness:** 1.0 mm (estimate).
- **Mounting hole diameter:** ø2.75. The record says this is the common Zero‑family value but unverified.
- **Corner radius:** R3 (scaled from the drawing).
- **GPIO holes:** 2.54 mm pitch (scaled from the drawing); ø1.0 drill (estimate).
- **Mini‑HDMI body:** 10.8 × 7.5 mm (scaled), sticking out 0.6 mm; 3.3 mm tall (estimate).
- **Micro‑USB bodies:** 7.6 × 5.4 mm with an 8.4 mm wide flange (scaled), sticking out 1.44 mm; 2.8–3.0 mm tall (estimate).
- **CSI connector:** 3.5 × 15.8 mm at drawing x 61.5–65, y 7.1–22.9 (scaled); 1.5 mm tall (estimate).
- **Not modeled:** the SoC, the wireless can, smaller ICs, the underside microSD slot and test pads. The drawing gives none of their sizes or heights. Leave clearance above the top face and under the board.
