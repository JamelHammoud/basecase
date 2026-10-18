# Feetech SCS0009

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/feetech-scs0009/.

Envelope: 32.5 × 28.45 × 12.1 mm (studio frame, Y up).

Every dimension I modelled matches the official numbers, so I didn't need to change anything. The spline starts on the case top face, both mounting holes go fully through the tabs, nothing floats and nothing that should show is hidden inside the case. `check_scene` reports no issues and the overall size is 32.5 × 12.1 × 28.45 mm.

One row is still open: the record's "secondary boss 2.9 mm high" isn't modelled, because the drawing doesn't make its geometry clear enough to model.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (across tabs) | 32.5 | 32.5 (case x −16.25 to 16.25) | OK |
| Envelope Y | 12.1 | 12.1 (y −6.05 to 6.05) | OK |
| Envelope Z (without spline) | 25.25 | 25.25 (case top face) | OK |
| Case length | 23.3 on the drawing (23.2 in the spec table) | 23.3 (in the code, x = ±11.65) | OK, uses the drawing value |
| Top of main body (below the gear cap) | 21.45 | 21.45 | OK |
| Tab underside / top | 16.8 / 18.4 | 16.8 / 18.4 (1.6 thick) | OK |
| Tab ends | ±16.25 from case centre | ±16.25 | OK |
| Mounting holes | 2 × Ø2 at ±14.25 (28.5 apart) | Ø2 at x = ±14.25, through the tab | OK |
| Shaft axis | 5.7 from case centre, 8.55 from the nearer hole, centred across the width | x = 5.705, y = 0; 14.25 − 5.7 = 8.55 | OK |
| Spline outer diameter / teeth | Ø3.95, 20 teeth | Ø3.95 (x 3.73 to 7.68), 20 teeth | OK |
| Spline height above top face | 3.2 | base at 25.25 (0.01 overlap into the case), top at 28.45, so 3.2 | OK |
| Height including spline | 28.45 | 28.45 | OK |
| Horn screw | M2 internal thread | Ø1.6 tap bore on the shaft axis | OK, depth assumed |
| Secondary boss | "2.9 mm high on the top cap" | not modelled | Open |
| Connector | 5264-3P; no position given | not modelled | Nothing to check |

**Not dimensioned**
- **Secondary boss:** the drawing's 2.9 dimension starts from the spline top, and the boss it seems to point to sits below the 25.25 top face in the side view. Its diameter, base face and height reference are all unclear. It's at roughly x ≈ +0.3, but I left it off rather than guess.
- **Gear-cap length:** the cap ends at x ≈ −3.75, scaled from the side view.
- **Spline tooth depth:** assumed 0.25 mm.
- **Tap bore depth:** assumed 3 mm.
- **Edge rounding:** small edge breaks of 0.5–0.6 mm.
- **Connector:** no position or exit point is published, so it isn't modelled. Cables aren't modelled either.
- **Case details:** the bottom feet, case split lines and the shape of the cover around the shaft and boss aren't dimensioned, so they aren't modelled.
