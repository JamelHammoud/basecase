# HC-SR04 Ultrasonic Sensor

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/hc-sr04/.

Envelope: 45 × 15 × 26 mm (studio frame, Y up).

The model matches every official number in record.json, so nothing needed fixing. I re-ran `check_scene` (no issues) and looked at it from the front-right and the side.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (board length) | 45 mm | PCB from x = −22.5 to 22.5 → 45.0 | OK |
| Envelope Y (board height) | 20 mm | PCB from y = −10 to 10 → 20.0 | OK |
| Envelope Z (PCB back to transducer front) | 15 mm | PCB bottom at z = 0, can tops at z = 15.0 → 15.0 | OK |
| Overall bounding box | 45 × 20 × 15 | 45 × 26 × 15; the extra 6 mm in Y is the header pins sticking out past the −Y edge, which the datasheet size doesn't count | OK |
| Mounting holes: count | 4, one per corner | 4, at (±20, ±7.5) | OK |
| Mounting holes: spacing along X | 40 mm | 20 − (−20) = 40.0 | OK |
| Board length conflict (Cytron drawing says 43) | 45 in the text of both sources | 45 used | OK (followed the text) |
| Header: pin count and pitch | 4 pins, 2.54 mm | 4 pins at x = ±1.27, ±3.81 → 2.54 pitch | OK |
| Header: position | centred on the bottom edge, between the transducers | centred at x = 0, rows at y = −8.4, near the −Y edge; the cans' inner edges are at x = ±5, outside the header's x = ±5.08 span since the header sits below them | OK |
| Transducers | no official number | Ø16 at x = ±13 | not dimensioned |

**Placement checks**
- **Transducer cans:** they stand on the top face of the PCB (z = 1.6) and rise to z = 15. They miss the corner holes: the nearest hole edge is 10.26 mm from each can's centre, more than the 9 mm needed.
- **Crystal:** it sits on the PCB top face (z = 1.6 to 5.1) and doesn't touch either can.
- **Header:** the vertical pin legs pass through the matching Ø1.0 holes in the PCB and end flush with its back face (z = 0). The bent legs run at z = 2.85 out to y = −16, and the plastic body sits on the PCB top face.
- Nothing is buried inside another part, nothing floats, and nothing goes below z = 0.

**Not dimensioned** (no official number; measure a real board with calipers before designing a tight mount)
- **Mounting hole diameter:** I used Ø2.0 mm.
- **Mounting hole spacing along Y:** I used 15 mm, scaled from the Cytron drawing.
- **Transducer cans:** I used Ø16 mm at x = ±13, y = 0, as plain cylinders.
- **PCB thickness:** I assumed the standard 1.6 mm.
- **Header details:** the 10.16 × 2.5 × 2.5 mm plastic body, the pins sticking out 6 mm past the −Y edge, and the pin row at y = −8.4.
- **Crystal Y1:** a plain 10 × 4 × 3.5 mm block at (0, 6).
- **Surface-mount parts on the back:** left out.
