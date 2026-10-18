# Velodyne Puck (VLP-16)

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/velodyne-vlp-16/.

Envelope: 103.3 × 71.7 × 116 mm (studio frame, Y up).

Every dimension in record.json matches the model, so I made no changes. check_scene still reports no issues (4 parts, 103 × 116 × 72 mm). I re-measured from get_scene (part bounds and positions) and from the lower housing's code (holes are cut into the part, so they don't show in bounding boxes). The bottom view confirms 3 holes on the X axis at the expected spacing.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Body diameter (x/y) | Ø103.3 | 103.3 × 103.3 (±51.65) | OK |
| Height (z) | 71.7 | 0 → 71.7 | OK |
| Mounting face | bottom face at z = 0 | housing min z = 0.00 | OK |
| Lower housing band | 18.8 | z 0 → 18.8 | OK |
| Active window height | 38.1 | z 18.8 → 56.9 = 38.1 | OK |
| Optical centre | 37.8 above bottom | window midpoint 37.85 | OK (0.05 off, within the datasheet's rounding) |
| Top cap | 71.7 − 18.8 − 38.1 = 14.8 | z 56.9 → 71.7 = 14.8 | OK |
| ¼-20 mount, position | bottom centre | (0, 0) | OK |
| ¼-20 mount, depth | 7.1 | 7.1 | OK |
| Locating holes, diameter | 2× Ø4.06 | Ø4.06 | OK |
| Locating holes, depth | 5.5 | 5.5 | OK |
| Locating holes, spacing | 88.9 on a diameter through the centre | x = ±44.45 (88.9), y = 0 | OK |
| Locating holes, axis | 90° axis, perpendicular to cable exit | on X; cable is on +Y | OK |
| Cable exit direction | 0°, side exit | +Y (back) | OK |
| Gland protrusion | ≤ 12.7 radially | 51.65 → 64.35 = 12.70 | OK (at the max) |
| Gland width | ≤ 12.7 | Ø12.7 (x ±6.35) | OK (at the max) |
| Overall envelope incl. gland | 103.3 × (103.3 + 12.7) × 71.7 | 103.3 × 116.0 × 71.7 | OK |

**Where each part sits**
- **Window:** rests exactly on the lower housing at z = 18.8.
- **Top cap:** rests exactly on the window at z = 56.9.
- **Gland:** its outer face starts at the body surface (y = 51.65). A Ø12.4 shank goes 3 mm into a Ø12.7 hole in the housing, so it is held and doesn't float. Its height range (z 3.05 → 15.75) sits inside the lower band (0 → 18.8).
- **Placement:** nothing is buried and nothing is below z = 0.

**Not dimensioned**
- **Gland height:** z = 9.4 is my estimate (mid-band, as drawn).
- **Gland shape:** a plain cylinder at the maximum size. The real hex and ribbed sections and the hole it sits in aren't dimensioned.
- **¼-20 thread:** not modelled. The hole is a plain Ø5.1 bore (#7 tap drill size), not the Ø6.35 nominal thread size.
- **Window inset:** the drawing shows the window slightly narrower than the cap and base, but gives no number. I kept it flush at Ø103.3.
- **Window wall:** the 3 mm thickness is a placeholder; the inside isn't modelled.
- **Top edge:** the 1 mm rounding is my estimate. The bottom edge is left sharp.
- **Not modelled:** the logo, the internal rotor and optics, the optional M12 connector (Ø20, about 56 long) and the cable.
