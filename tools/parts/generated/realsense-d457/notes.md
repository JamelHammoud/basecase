# Intel RealSense D457

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/realsense-d457/.

Envelope: 124 × 29 × 36 mm (studio frame, Y up).

I checked every dimension in record.json against the model and found one fault: the FAKRA jack was floating. It started at x = 43.2, 0.2 mm short of the tunnel's back wall. I moved it back to x = 43 so it sits on that wall. Every other row already matched. `check_scene` finds no issues and the overall size is 124 × 36 × 29 mm.

The D457 has no shaft, spline, horn, pilot or mounting tabs, so those rows don't apply.

| Dimension / feature | Official | Measured on model | Result |
|---|---|---|---|
| Envelope X (width) | 124.00 +0.30/−0 | 124.0 (−62…+62) | OK |
| Envelope Y (depth) | 36.00 ±0.20 | 36.0 (−18…+18) | OK |
| Envelope Z (height) | 29.00 +0.50/−0 | 29.0 (0…29), on the floor | OK |
| Imager spacing (baseline) | (95.00) | 95.0 (optics' outer edges ±51.4 with Ø7.8 discs, so centres at ±47.5) | OK |
| 1/4‑20 centreline to left imager | 47.50 ±0.10 | 47.5 (1/4‑20 at x = 0, left imager at x = +47.5) | OK |
| Left imager to RGB | (37.50) | 37.5 (RGB at x = +10.0) | OK |
| Left imager to emitter | (59.00) | 59.0 (emitter at x = −11.5) | OK |
| Imager height | (14.50) | 14.5 (optics z 10.6…18.4) | OK |
| Lenses / window | flush in the front face | front at y = −18.0, back face on the recess floor at −16.5 | OK |
| Rear M4 spacing | 61.50 | 61.5 (x = +23.75 / −37.75) | OK |
| Rear M4 depth | max 6 | 6.0 into the rear face at y = +18 | OK |
| Bottom 1/4‑20 depth | max 9 | 9.0 from z = 0 | OK |
| 1/4‑20 position | on the dimensioned centreline | x = 0 | OK |
| FAKRA axis to rear face | (9.50) | 9.5 (jack y 3.9…13.1, centre 8.5) | OK |
| FAKRA axis height | (14.50) (side view) | 14.5 (z 9.9…19.1) | OK |
| FAKRA boss inner end | (43) | was 43.2 (floating, 0.2 gap) → **now 43.0, sitting on the tunnel wall** | fixed |
| FAKRA mating face | (57.6) | 57.6, set 4.4 back from the +X end and open to that end | OK |

Placement: the front window and the lens discs sit in their recess, flush with the front face. The FAKRA jack is inside its tunnel and visible from the +X end. Nothing that should be on the outside is buried, nothing floats, and nothing passes through another part.

**Not dimensioned.** The drawings give no number for these:
- **M4 holes along X:** only the 61.5 spacing is official. Their placement (pair offset about 7 mm off the centreline) and their height (z = 14.5) are scaled from the drawing, roughly ±1 mm.
- **1/4‑20 front‑to‑back position:** y = −2.7, scaled from section A‑A, roughly ±2 mm.
- **Hole sizes:** the M4 holes are Ø4.0 nominal and the 1/4‑20 is Ø6.35. No tap or insert diameter is given.
- **Case shape:** the R14.5 stadium ends, the R3 front and R1 rear edge rounding, and the shape of the FAKRA boss and its tunnel (9.6 mm square) are mine.
- **Front window:** the 114 × 22 outline and the 1.5 mm recess are mine.
- **Lenses:** the Ø8 apertures are mine.
- **FAKRA jack:** the 9.2 mm square section, the Ø6 mating cavity and the centre pin are mine.
- **Left out entirely:** the USB‑C debug port with its 2× M2 screw‑locks, the sync connector, the GMSL/USB boot switch and the label recess.
