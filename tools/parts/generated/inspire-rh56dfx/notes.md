# Inspire Robots RH56DFX

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/inspire-rh56dfx/.

Envelope: 142.568 × 217.8 × 102.949 mm (studio frame, Y up).

I checked every number in record.json against the scene. Three things were wrong; I fixed them and re-checked. `check_scene` now reports no issues and the renders look clean. The overall bounding box is 142.6 × 103.0 × 217.8 mm.

**Fixes made**
1. **Overall length:** the middle fingertip stopped at 217.78 instead of 217.8, because the rounded tip shape lost a little height. I rebuilt the four fingertips so the very top lands exactly on the target.
2. **Finger joints floating:** each finger's lower segment stopped 0.3 mm short of the segment above it, leaving the upper segment floating. The lower segments now run right up to the joint.
3. **GX12 connector partly buried:** its flat Ø12 face sat at y = 24.2, but the curved wrist surface reaches y ≈ 24.7 near the bottom of the connector. That hid part of the face. I moved the face out to y = 25.0 so the whole Ø12 face is visible. It now sits 7 mm deep in the wrist.

**Verification table (after fixes)**

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Overall length, base to middle fingertip | 217.8 | z 0 → 217.80 (`middle-distal` top) | OK (fixed) |
| Palm width (x) | 80.7 | `palm-case` x −40.35 → 40.35 = 80.70 | OK |
| Palm thickness (y) | 31.2 | palm section y −15.6 → 15.6 = 31.2 (z 52–133) | OK |
| Distal finger segment | 49.3 | `middle-distal` z 168.5 → 217.8 = 49.3 | OK |
| Middle finger segment (pivot to pivot) | 32.0 | joints at z 136.5 → 168.5 = 32.0 (see note) | OK |
| Wrist base outer diameter | Ø52.0 | `wrist-flange` 52.0 × 52.0, centred on the axis, z 0 → 8.5 | OK |
| Mounting circle | Ø38.0 | 4 hole centres at (±19, 0) and (0, ±19), so Ø38.0 | OK |
| Hole count and spacing | 4 at 90° | 4 at 0/90/180/270° | OK |
| Mounting face | on the floor | `wrist-flange` bottom at z = 0, holes open downward | OK |
| Case sits on the flange | — | `palm-case` starts at z 8.49 on the flange top (z 8.5); Ø52 sections match | OK |
| GX12 connector diameter | Ø12.0 | 12.0 × 12.0 | OK |
| GX12 location | back of wrist | centre (0, +Y, z 24); face at y 25.0, fully visible, seated 7 mm in | OK (fixed) |
| Fingers start at the palm top | — | all lower segments start at z 133.0 = palm top | OK |
| Finger segments touch, nothing floats | — | each lower segment ends exactly where its upper segment starts (z 168.5 / 166.9 / 166.9 / 162.9) | OK (fixed) |
| Thumb attached | — | thumb root sits inside the palm on the palm side; the two thumb pieces are cut on one shared joint plane | OK |
| Envelope note: thumb sticks out beyond x and y | not given | overall 142.6 × 103.0 with the thumb open | OK, no official value to check |

Note on the 32.0 row: the drawing measures 32.0 between the two joint pivots. In the model the lower finger segment starts at the palm top (z 133), so the lower pivot (z 136.5) sits 3.5 mm up inside that segment.

**Not dimensioned**
- **Mounting holes:** size, thread and depth aren't published; the model uses a placeholder Ø3.2 × 6 mm hole. They may also not sit exactly on the Ø38 circle: in the drawing they look a little inside it, around r ≈ 15.5. Confirm both with Inspire before machining a mating flange.
- **Flange height (8.5):** measured from the drawing.
- **Wrist shape:** the narrow waist (48.5 × 44 at z 34), where it widens into the palm (z 52) and the palm top (z 133) are all measured from the drawing.
- **Small features left out:** a small radial hole in the side of the flange, two small marks near the centre of the base, and a dark feature in the bottom view.
- **GX12 connector:** height z ≈ 24 is measured; how far it really sticks out and its thread aren't given.
- **Fingertip heights for index, ring and little fingers** (≈ 214 / 214 / 204), the finger side-to-side positions, finger thickness, and where the index, ring and little fingers split into segments.
- **Thumb:** the root, joint and tip positions (tip ≈ (100, −74, 123)) and its ≈ 17 mm thickness. The thumb rotates more than 65° in reality, so allow clearance well beyond this open pose.
- **Model handedness and parts not modeled:** the drawing reads as a right hand (−2R); a left hand (−2L) is its mirror image. The 2-DOF wrist on the DFXW version has no drawing, so it isn't modeled.
