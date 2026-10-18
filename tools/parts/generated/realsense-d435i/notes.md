# Intel RealSense D435i

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/realsense-d435i/.

Envelope: 90 × 25 × 25.05 mm (studio frame, Y up).

Every official number in record.json matched the model on the first check. The check did find two parts physically floating, which `check_scene` had not flagged: the four lens modules had a 0.8 mm gap behind them, and the USB-C receptacle had a 0.5 mm gap behind it. I made the lens bores 3.2 mm deep and the USB-C pocket 7.0 mm deep, so each part now rests against the case. After the fix the envelope is unchanged and `check_scene` reports no issues. The renders show the two rear M3 holes, the bottom tripod hole, and the lenses in the drawing's order.

None of the parts protrude from the case, so there is no spline, boss, shaft or tab height to check.

| Feature | Official (record.json / Fig 10-9) | Measured on model | Result |
|---|---|---|---|
| Envelope X (width) | 90 ±0.15 | 90.00 (case x −45 … +45) | OK |
| Envelope Y (depth) | 25 ±0.15 (drawing 25.05) | 25.05 (y −12.525 … +12.525) | OK |
| Envelope Z (height) | 25 ±0.15 | 25.00 (z 0 … 25) | OK |
| Rear M3 holes: count, spacing | 2×, 45 apart | 2×, x = −22.5 / +22.5 → 45.0 | OK |
| Rear M3: horizontal position | centred | symmetric about x = 0 | OK |
| Rear M3: height | centre of 25 → 12.5 | z = 12.5 | OK |
| Rear M3: face, depth | back face, max insertion 3 | open at y = +12.525, 3.0 deep | OK |
| 1/4-20 tripod: face | bottom | open at z = 0 | OK |
| 1/4-20 to left imager | 17.5 | 17.5 − 0 = 17.5 | OK |
| Left imager (depth origin) | 17.5 right of centre (from front), on centreline | x = +17.5, z = 12.5 | OK |
| Baseline, left to right imager | 50 | 17.5 − (−32.5) = 50.0 | OK |
| Projector from left imager | 29, toward the right imager | 17.5 − (−11.5) = 29.0 | OK |
| RGB beyond left imager | 15, outboard | 32.5 − 17.5 = 15.0 | OK |
| Lens order seen from front | right IR, projector, left IR, RGB | −32.5, −11.5, +17.5, +32.5 | OK |
| Depth origin | 4.2 behind front glass | glass front at y = −12.525 → origin y = −8.325 (reference point only, no geometry) | OK |
| USB-C side | one short end | +X end | OK (only the side is official) |
| Flatness | 0.15 max | not applicable (the model is ideal geometry) | — |
| Weight | 75 g ±10% | not applicable (the case is solid, not hollow) | — |

**Part seating after the fix**
- **Cover glass:** front face is flush with the case front at y = −12.525, and its back rests on the 1 mm recess floor. Nothing sticks out.
- **Lens modules:** front faces sit 0.2 mm behind the glass front, inside the glass openings, so they are visible and not buried. Their backs now rest on the bore floors at y = −9.325.
- **USB-C receptacle:** its mouth is 0.5 mm inside the +X end face, so it stays within the envelope. Its back now rests on the pocket floor at x = 38.

**Not dimensioned** (kept plain; don't design to these)
- **USB-C:** position on the end face (modelled centred), orientation (long axis along Y), 0.5 mm recess and pocket size (standard 8.94 × 3.26 opening plus clearance).
- **Tripod hole:** front-to-back position (centred), depth (5.5 mm) and bore (Ø6.35 nominal, no thread).
- **M3 holes:** diameter shown at Ø3.0 nominal with no thread. The 3 mm depth is the maximum screw insertion, not the measured hole depth.
- **Lens apertures:** diameters (imagers Ø10, projector Ø7, RGB Ø8) are scaled from the drawing, and so are the lens module lengths. Only the lens centres are official.
- **Front glass:** inset (2 mm), thickness (1 mm) and the oval mask around the projector.
- **Housing shape:** the 1 mm edge rounding, the curved front seen in the side view, and the top and bottom vent grilles (the grilles are not modelled).
- **Internal parts:** the PCB, IMU (BMI055/BMI085) and other internals are not modelled, because no geometry is published for them.
