# Slamtec RPLIDAR S2

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/slamtec-rplidar-s2/.

Envelope: 77 × 39.8 × 80.6 mm (studio frame, Y up).

Every dimension in record.json and the drawing matches the model, so I didn't change anything. It's ready to save. `check_scene` reports no problems: nothing floats, nothing is below the floor and nothing overlaps.

| Dimension / feature | Official | Measured on model | Result |
|---|---|---|---|
| Envelope X (base width) | 77 | 77.0 (base −38.5 … 38.5) | OK |
| Envelope Y (base depth) | 77 | 77.0 (base −38.5 … 38.5) | OK |
| Depth including cable exit | 80.6 (drawing) / ~81 (record) | 80.6 (−38.5 … 42.1) | OK |
| Envelope Z (total height) | 39.8 (datasheet v2.4) | 39.8 (enclosure top) | OK |
| Base height | 20.8 | 20.8 (z 0 … 20.8) | OK |
| Optical enclosure height | 19, sitting on the base top | 19.0 (z 20.8 … 39.8); its bottom face sits on the flat base top | OK |
| Strain relief protrusion | 3.6 beyond the rear face (80.6 − 77) | From the rear face at y 38.5 to its tip at 42.1 = 3.6. It is sunk 0.5 into the base so it joins the housing, with nothing buried that should show | OK |
| Strain relief position | Rear centre | x = 0, on the +Y face | OK |
| Mounting hole pattern | 41.7 × 41.7 square, centred | Holes at (±20.85, ±20.85) in the code; the render from below shows them at about ±21 | OK |
| Mounting hole thread | M3 | Ø2.5 bore, the standard M3 tap-drill size, standing in for the thread | OK |
| Mounting hole depth | 4 (maximum screw engagement) | 4.0 from z = 0 | OK |
| Hole location | Bottom (mounting) face | Open at z = 0 | OK |
| Pose | Mounting face on z = 0, cable toward +Y | Base min z = 0; strain relief on +Y | OK |

The height comes from datasheet v2.4. The older 2D drawing and spec page say 38.85, with an 18 mm window instead of 19. If the unit you'll be mounting is from an older batch, check it against 38.85.

**Not dimensioned** (kept plain and conservative):
- **Enclosure diameter:** about 71 mm, a plain cylinder with a 4 mm top rounding. I scaled it from the drawing.
- **Base corners:** about 12 mm chamfers, plus 3 mm corner rounding and 1 mm edge chamfers. All scaled from the drawing or assumed.
- **Strain relief size:** 7 × 5 mm, centred at z = 4.5. Only its 3.6 mm protrusion is official.
- **Optical centre (scan plane) height:** not in either official drawing. The window is somewhere in the enclosure above z = 20.8.
- **Left out entirely:**
  - the rectangular recess in the bottom face and the rectangular feature on the base side face
  - the 8 smaller holes on the bottom (probably case screws)
  - the small recesses on the base shoulder
  - the cable and the XH2.54-5P plug, which you asked me to leave out
