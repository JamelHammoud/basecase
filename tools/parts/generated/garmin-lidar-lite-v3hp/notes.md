# Garmin LIDAR-Lite v3HP

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/garmin-lidar-lite-v3hp/.

Envelope: 54.99 × 40.18 × 35 mm (studio frame, Y up).

I checked every dimension in record.json against the model's part positions, sizes and the housing code. All of them match, so I changed nothing. The one exception is item 10 (13.1 mm), which I didn't model; see its row. `check_scene` reports no interference, nothing floating and nothing below the floor.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (width) | 54.99 | 54.99 (−27.495 … +27.495; displayed as −27.49 / 27.50 after rounding) | OK |
| Envelope Y (depth, item 9) | 35 | 35 (−17.5 … +17.5) | OK |
| Envelope Z (height, item 6) | 40.18 | 40.18 (0 … 40.18) | OK |
| Mounting holes, horizontal spacing (item 2) | 36 | x = ±18 → 36 | OK |
| Mounting holes, vertical spacing (item 5) | 32 | z = 4.09 / 36.09 → 32 | OK |
| Hole pattern centred on the body | centred | centre (0, 20.09), the envelope's centre | OK |
| Hole diameter (item 7) | 4 | Ø4, goes all the way through the 3 mm ears (no other part in the way) | OK |
| Optic spacing (item 3) | 27.69 | x = ±13.845 → 27.69 | OK |
| Optic diameter (item 8) | 14.65 | lens bbox 14.65 × 14.65; seat bore Ø14.65 | OK |
| Optical axis below top hole row (item 4) | 16 | 36.09 − 20.09 = 16.00 | OK |
| Rear section (item 10) | 13.1 | not modelled | N/A, see note |

On item 10: record.json calls it "rear section behind the mounting flange". In the side view, though, the flange is the rearmost face and nothing sits behind it. The 13.1 mm callout runs from the harness exit to that back face. That makes it the harness position, and the harness is excluded because it's a cable. Please confirm this reading on a real part.

**Where each part sits**
- **Flange:** it is the rearmost face (y = 14.5 … 17.5), and all four ears stay inside the envelope.
- **Body:** it runs forward from the flange's front face (y = 14.5) to the lens face at y = −17.5.
- **Lens windows:** each sits in a 1.5 mm seat, fully exposed at the front. The front face is 0.5 mm behind the lens face (y = −17) and the back face touches the bottom of the seat (y = −16), so nothing is buried or floating.
- **Ear holes:** they are clear of the body from the front (body top at z = 32.09, hole edge at z = 34.09), so screws can go in from the lens side.

**Not dimensioned** (kept plain and conservative, sizes scaled off the drawing)
- **Rear flange:** 3 mm thick, with a rounded-rectangle core and straight webs out to the ear lobes. Each lobe's 4.09 mm radius comes from the envelope and the hole spacing, not from a callout.
- **Body:** 24 mm tall at the flange, tapering to 52.99 × 22 mm at the front, with 4–5 mm corner radii. The dip in the outline between the two lenses is not modelled.
- **Lens windows:** 1 mm thick, set 0.5 mm back from the front face.
- **Callouts to confirm:** Garmin's drawing doesn't say what items 7 and 8 measure.
  - **Item 7:** read as the hole diameter; it could be the ear radius.
  - **Item 8:** read as the optic diameter; it could be the bezel.
- **Left out:** the wire harness and its ribbed boot (exit point located by item 10), the lens bezel rings, and the step between the body and the flange seen in the side view.
