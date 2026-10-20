# Molicel INR-21700-P42A

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/molicel-p42a/.

Envelope: 70.15 × 21.55 × 21.55 mm (studio frame, Y up).

The model matches every official number in `record.json` and the datasheet, so nothing needed fixing. I measured each value from the parts' exact positions and sizes. `check_scene` found no issues and the renders look right.

| Dimension or feature (record.json) | Official | Measured on model | Result |
|---|---|---|---|
| Envelope X (cell height, + terminal at +X) | 70.15 mm | Negative base at x = −35.075, cap top at x = +35.075, so 70.15 mm | OK |
| Envelope Y (diameter) | 21.55 mm | y −10.775 to +10.775 = 21.55 mm | OK |
| Envelope Z (diameter, resting on floor) | 21.55 mm | z 0 to 21.55 mm, axis at z = 10.775 | OK |
| Diameter | 21.55 mm (Max) | Can is 21.55 mm across | OK |
| Height, terminal to base | 70.15 mm (Max) | 69.65 mm can + 0.5 mm cap above the can end = 70.15 mm | OK |
| Can | Steel, cylindrical | One cylinder body | OK |
| Weight | 70 g (Max) | Not a geometric value | n/a |
| Positive terminal | No value given ("keep plain, within stated height") | Plain disc 10 mm across, on the cell axis (y 0, z 10.775), 0.5 mm above the can end face, top exactly at 70.15 mm | OK (placeholder, within the envelope) |
| Orientation | Axis along X, + terminal toward +X, touching z = 0 | Rotation [0, 90, 0]; cap at +X; lowest point z = 0 | OK |

The scene reports the length as 70.16 mm only because it rounds each end to 35.08. The exact placements give 70.15 mm.

**Placement checks:**
- **Cap:** it starts at the can's positive end face and sits 0.2 mm down in a matching seat cut into the can. The seat is 10.4 mm across and the cap 10 mm, so they don't overlap.
- **Nothing buried:** no part that should show is hidden inside another.
- **Nothing floats:** the can rests on the floor and the cap is carried by the can.
- **Overlaps:** `check_scene` found no interference and no flush faces.

**Not dimensioned** (Molicel publishes no number for these, so they are kept plain and inside the maximum envelope):
- **Positive cap size:** 10 mm across and 0.5 mm high are my placeholders.
- **Insulating ring around the positive cap:** not modeled.
- **Crimp groove and rolled shoulder at the positive end:** shown only as a 0.4 mm chamfer on both end edges, also a placeholder.
- **Wrap thickness and the bare steel can diameter:** not separated; the can and wrap are one body.
- **Vent or scoring on the ends, and markings:** omitted.
