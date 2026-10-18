# NEMA 17 Stepper 17HS4401

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/nema17-17hs4401/.

Envelope: 42.3 × 64 × 42.3 mm (studio frame, Y up).

Every dimension in record.json matches the model, so I didn't need to change anything. A final `check_scene` found no issues, and the front and angled renders look right.

| Feature (record.json) | Official | Measured on model | Result |
|---|---|---|---|
| Frame (x × y) | 42.3 × 42.3 max | case spans x and y −21.15 → 21.15, so 42.3 × 42.3 | OK |
| Body length L (behind flange face) | 40 | case runs from z 0 to the flange face at z 40 | OK |
| Pilot boss diameter | Ø22 (0/−0.033) | Ø22, centred on the shaft | OK |
| Pilot boss height | 2.0 above flange face | z 40 → 42, so 2.0 | OK |
| Shaft diameter | Ø5 (0/−0.012), round | Ø5, round (bounds ±2.5) | OK |
| Shaft length from flange face | 24 ± 0.5 | top at z 64, which is 64 − 40 = 24.0 | OK |
| Mounting hole pattern | 31 ± 0.1 square, centred on the shaft | holes at x, y = ±15.5, so 31.0 square, centred | OK |
| Mounting hole size and depth | 4× M3, 4.5 min deep | 4× Ø3.0, 4.5 deep from the flange face (z 40 → 35.5) | OK |
| Envelope including shaft | ~64 overall | 42.3 × 42.3 × 64.0 | OK |
| Leads | 300 mm AWG26 UL1007, exit at the rear end cap side | not modelled, because no exit position is given | Not dimensioned |

**Where the parts sit:**
- **Case:** it stands on the floor (z = 0), and the pilot boss starts right at the flange face (z 40).
- **Shaft:** it sticks out 24 mm above the flange face and 22 mm above the boss top. Its lower 1 mm (z 39 → 40) sits in a matching Ø5 hole in the case, so it isn't buried in solid material. Its 24 mm length is measured from the flange face, as the drawing does.
- No part floats and nothing is below the floor.

**Not dimensioned:**
- **Frame corner chamfers:** the drawing shows them but gives no size, so the frame is a plain 42.3 mm square. That's slightly larger than the real motor at the corners, which is the safe side for pockets.
- **End caps vs. stator band:** the catalog photo shows separate bands, but there are no lengths, so the case is one body.
- **Shaft D-flat:** the drawing shows a round shaft. Many retail units have a D-cut, so check yours.
- **M3 threads:** they're plain Ø3.0 holes. No thread or tap-drill size is given.
- **Bearing boss or rim inside the pilot:** not modelled.
- **Rear face features:** none given; the face is flat.
- **Lead exit position and grommet:** not modelled. Leave room for the cable exit at the rear end cap.

Resellers sell motors under the 17HS4401 name with lengths from 38 to 40.4 mm. If your rear pocket is tight, measure the motor you actually have.
