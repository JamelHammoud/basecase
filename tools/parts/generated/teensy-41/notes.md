# PJRC Teensy 4.1

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/teensy-41/.

Envelope: 61.66 × 4.07 × 17.78 mm (studio frame, Y up).

All 18 rows match the official numbers, so I didn't change anything. `check_scene` reports no issues, and the new renders from the front three-quarter angle and straight at the USB end show nothing buried or floating.

The model is 61.66 × 17.78 × 4.07 mm. Measured values come from the scene bounding boxes and the hole positions in the code. The PCB runs from x = −30.48 to +30.48, y = ±8.89, z = 0 to 1.57; the USB end is at −X.

| # | Feature (record.json / drawing) | Official | Measured on model | Result |
|---|---|---|---|---|
| 1 | PCB length (x) | 60.96 | 30.48 − (−30.48) = 60.96 | OK |
| 2 | PCB width (y) | 17.78 ±0.6 | 8.89 − (−8.89) = 17.78 | OK |
| 3 | PCB thickness | 1.57 | z 0 → 1.57 | OK |
| 4 | Envelope x including USB | 60.96 + 0.7 = 61.66 | −31.18 → 30.48 = 61.66 | OK |
| 5 | Overall height | not given | 4.07 (only the parts that are dimensioned) | n/a |
| 6 | Pin rows | 2 × 24 at 2.54 pitch | 2 × 24 at 2.54, x = −29.21 … +29.21 | OK |
| 7 | Row spacing | 15.24 | y = ±7.62 → 15.24 | OK |
| 8 | Rows in from the long edges | 1.27 | 8.89 − 7.62 = 1.27 | OK |
| 9 | First pin in from the USB end | 1.27 | −29.21 − (−30.48) = 1.27 | OK |
| 10 | Hole Ø0.965 | 59 holes | 48 row + 1 extra + 5 USB host + 5 inner column = 59 | OK |
| 11 | Hole Ø0.762 | 6 holes | 6 Ethernet holes | OK (which holes these are is my inference) |
| 12 | Ethernet pads | 6 holes, 2.0 pitch | 2 × 3 at 2.0, x = −16.24 / −14.24, y = 5.17 / 3.17 / 1.17 | OK |
| 13 | USB host header | 5 holes | 5 at 2.54, x = −22.86 … −12.70, y = −4.57 | OK |
| 14 | USB width | 8.06 | plate y = ±4.03 → 8.06 | OK |
| 15 | USB overhang past the PCB edge | 0.7 | −31.18 vs −30.48 → 0.70 | OK |
| 16 | USB depth | 5.0 | body −30.58 → −25.58 = 5.0 behind the 0.6 front plate (as drawn) | OK, see note |
| 17 | USB top above the PCB | 2.5 | 4.07 − 1.57 = 2.50; body rests on the PCB top at z = 1.57 | OK |
| 18 | USB overall height | 3.07 | plate z 1.00 → 4.07 = 3.07 | OK |
| 19 | Program button position | 41.66 | from pin 1: 12.45 − (−29.21) = 41.66 (42.93 from the USB edge) | OK, see note |
| 20 | Button height (drawing) | 1.8 base, 2.5 top | base 1.57 → 3.37, cap top 4.07 → 2.5 above the PCB | OK |

There are two places where the wording in record.json and the drawing don't quite agree. In both I followed the drawing:

- **Program button (row 19):** the record says "41.66 mm from the USB end". On the drawing, the 41.66 line starts from the same pin-1 centre line as 45.72, 13.97 and 11.43. The 45.72 dimension lands exactly on the inner pin column only if it's measured from pin 1, so 41.66 is from pin 1 too. If you go by the record's wording, the button moves 1.27 mm towards the USB end.
- **USB depth (row 16):** on the drawing, 5.0 is measured from the back of the 0.6 mm front plate, so the connector is 5.6 mm long in total. If "5.0 mm deep" in the record means the whole connector, the back face moves 0.6 mm towards the USB edge.

**How the parts sit:**
- The USB body and the button both stand on the PCB top face at z = 1.57.
- The USB front plate is entirely past the PCB edge (x from −31.18 to −30.58, with the edge at −30.48). Its bottom at z = 1.0 drops below the PCB top only out there, so it doesn't cut into the board.
- None of the 65 holes is covered: the nearest one to the USB body is the extra pin at y = 5.08, outside the body's y = ±3.75.

**Not dimensioned:**
- **Total height, microSD socket, i.MX RT1062 chip and other top-side parts:** no outline or height is given, so they aren't in the model. Allow extra clearance above the board for them.
- **Header pins (_PINS variants):** pin length and spacer height aren't given. Only the holes are modeled.
- **Bottom-side parts:** the PSRAM/flash pads (49.91 / 6.86 / 7.97 / 9.60) are flat copper and aren't modeled. Chips soldered there have no published height.
- **Two small bottom-view holes under the USB connector:** their diameter isn't given and they may be pads, so they're left out.
- **Micro-USB details:** the plug opening and the flange tab shape aren't dimensioned, so the connector is a solid block. The plate sitting flush with the body top is my reading of the drawing.
- **Button footprint:** the base (4.7 × 3.2) and the cap depth (2.0) are scaled off the drawing, not dimensioned.
- **"2.2" dimension next to the button:** I couldn't tell what it refers to, so nothing in the model uses it.
- **Board corners and pad rings:** the corners are square and there are no pad rings.
