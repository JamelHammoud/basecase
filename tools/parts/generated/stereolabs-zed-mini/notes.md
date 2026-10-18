# Stereolabs ZED Mini

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/stereolabs-zed-mini/.

Envelope: 125.2 × 26.6 × 30.25 mm (studio frame, Y up).

I checked every dimension and feature in record.json against the model and fixed what was wrong; the table below shows the results after the fixes. I found and fixed three problems: the USB‑C shell and both lens windows were floating inside their recesses, and the corner radius was a guess I've now replaced with a value from the drawing. `check_scene` reports no issues and the renders look right.

**Fixes made:**
1. **USB‑C shell was floating.** It sat in the 9.5 × 3.5 opening without touching the case, with 0.5 mm of air behind it. I lengthened it to 6.52 mm so its back now rests on the floor of the 7 mm opening.
2. **Lens windows were floating.** Each one sat 0.005 mm in front of its recess floor. I made them 0.72 mm thick so they now rest on the floor.
3. **Front‑view corner radius was invented.** I had used 3 mm. The drawing's 23.17 end‑view dimension matches the flat height of the end face if the radius is (26.6 − 23.17) / 2 = 1.715. With that radius the end face is now 23.17 tall.

**Model frame:** rear face at y = +15.125, main front face at y = +2.125, bezel face at y = +0.685, lens boss tips at y = −15.125; floor at z = 0.

| # | Record item | Official value | Measured on model | Result |
|---|---|---|---|---|
| 1 | Envelope X | 124.5 (summary) / 125.2 (drawing) | 125.2 (−62.6 to +62.6) | OK against the drawing; 0.7 more than the summary |
| 2 | Envelope depth (record calls it "z") | 30.5 (summary) / 30.25 (drawing) | 30.25 (−15.12 to +15.13) | OK against the drawing |
| 3 | Envelope height (record calls it "y") | 26.5 (summary) / 26.6 (drawing) | 26.6 (0 to 26.6) | OK against the drawing |
| 4 | Main body depth | 13 | 15.125 − 2.125 = 13.00 | OK |
| 5 | Body + bezel depth | 14.44 | 15.125 − 0.685 = 14.44 | OK |
| 6 | Lens boss protrusion (30.25 − 14.44) | 15.81 | 0.685 − (−15.125) = 15.81; starts on the bezel face | OK |
| 7 | Lens boss Ø, tip | 18.78 | 18.78 (chamfer of 0.875) | OK |
| 8 | Lens boss Ø, base | 20.53 | 20.53 | OK |
| 9 | Lens baseline | 63 | 22.80 − (−40.20) = 63.00 | OK |
| 10 | Gap between bosses, base / tip | 42.47 / 44 | 63 − 20.53 = 42.47 / 63 − 18.78 = 44.22 | OK / +0.22 (the drawing figures themselves don't add up exactly) |
| 11 | Right boss edge to bezel end | 27.82 | 62.6 − 1.72 − 33.065 = 27.82 | OK |
| 12 | "1.72" (record reads it as left boss from end) | 1.72 | Modelled as the bezel inset from each end: bezel spans x = ±60.88 | OK as a bezel inset. Not a boss offset: the boss is 12.14 from the end, both in the drawing and in the model |
| 13 | End face (record: "end view 23.17") | 23.17 | 26.6 − 2 × 1.715 = 23.17 | Fixed (was 20.6) |
| 14 | Two‑hole pattern: count and Ø | 2× Ø2, M2×0.4 | 2× Ø2 | OK |
| 15 | Two‑hole pattern: spacing | 56 | x = ±28.00 | OK |
| 16 | Two‑hole pattern: depth | max 2.3 | 2.3 | OK |
| 17 | Two‑hole pattern: face | record says "top face" | Bottom face (z = 0) | Deliberately different from the record (see below) |
| 18 | Rear holes: Ø and depth | Ø2, M2×0.4, max 2.3 | Ø2 × 2.3 deep from y = 15.125 | OK |
| 19 | Rear holes: pattern | 116.7 × 18.1 | x = ±58.35, z = 4.25 / 22.35 (centred on 13.3) | OK |
| 20 | Rear holes: count | Callout says "02x", 4 are drawn | 4 | OK as drawn; the callout conflicts |
| 21 | USB‑C end | left end face (+X) | Opening on the x = +62.6 face | OK |
| 22 | USB‑C opening | 9.5 tall × 3.5 wide | 9.5 (z 8.55–18.05) × 3.5 (y 6.155–9.655) | OK |
| 23 | USB‑C shell placement | inside the opening, touching the case | x 55.58–62.1, back rests on the opening floor | Fixed (was floating) |
| 24 | Lens window placement | in the boss recess, touching the case | y −14.825 to −14.105, rests on the recess floor | Fixed (was floating) |
| 25 | Tripod thread | not on the drawing | none | OK |

**Row 17 (which face has the two holes):** I kept these holes on the bottom, as I read the drawing, against the record's "top face". The drawing is in first‑angle projection: the end view is placed to the left but shows the right end, and the view below the front view shows the bosses pointing away from it. Under that convention, the view above the front view (the one with these holes) is the bottom. Check this against the Stereolabs STEP before anyone designs a mount that uses these holes.

**Not dimensioned:**
- **Bezel:** inset of 1.72 at top and bottom (the drawing only gives it at the ends) and bezel corner radius of 0.5.
- **Lens glass:** Ø13.9 × 0.72 thick, sitting 0.3 behind the boss tip in a Ø14 × 1 recess.
- **Lens boss taper shape:** modelled as a chamfer at the tip; the actual profile isn't given.
- **USB‑C position and depth:** opening centre at z = 13.3 and y = 7.905, both estimated from the drawing pixels. The opening is 7 deep.
- **USB‑C shell:** outer 8.9 × 3.2 and inner 8.3 × 2.6 are generic USB‑C connector sizes, not Stereolabs figures. It is set back 0.5 mm and has no tongue inside.
- **Two‑hole pattern position front‑to‑back:** placed at the middle of the 13 mm body (y = 8.625).
- **Left out entirely:** the power LED notch, the ZED logo, the grooves on the top and bottom faces, the panel outline on the rear face and the seam line around the middle.
