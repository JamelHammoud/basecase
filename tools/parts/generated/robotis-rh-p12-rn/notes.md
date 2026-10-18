# ROBOTIS RH-P12-RN(A)

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/robotis-rh-p12-rn/.

Envelope: 151 × 116.3 × 57 mm (studio frame, Y up).

I checked the model against record.json and the drawing and found two errors, both now fixed:
- **Fingertip mount width:** it was 21.1 mm in X instead of 21.9. I moved the pad and the fingertip's inner face inward by 0.8 mm and rebuilt both fingers.
- **Floating connectors:** their pockets were 0.4 mm too big, so the connectors touched nothing. The pockets are now exactly the connectors' size.

After the fixes, check_scene reports no issues and nothing is floating or below the floor. The overall size is 151 × 57 × 116.3 mm.

| Item (record.json / drawing) | Official | Model (measured) | Status |
|---|---|---|---|
| Envelope X (fingers open) | 151 | 151.0 (fingertips at X ±75.5) | OK |
| Envelope Z | 116.3 | 116.3 (base boss underside at 0, fingertips at 116.3) | OK |
| Envelope Y | 54 | Housing 54.0; overall 57.0 | Different, kept (see note) |
| Base taps: count / thread | 12× M3, 6 per side | 12 holes, Ø2.5 tap drill, 6 on each ±X face of the boss | OK |
| Base taps: height | 3 above the bottom face | z = 3.0 | OK |
| Base taps: spacing | "6", span 36 | Y = ±6, ±12, ±18 (6 mm apart, 36 mm span) | OK against the drawing (see note) |
| Face taps: count | 8× M3, 4 on front and 4 on back | 4 on the front (Y −27), 4 on the back (Y +27) | OK |
| Face taps: upper pair | 24 apart | X ±12 | OK |
| Face taps: lower pair | 32 apart | X ±16 | OK |
| Face taps: rows apart | 42 | z 55.4 − 13.4 = 42.0 | OK |
| Top taps | 2× M2.5, 22 apart | Ø2.05 holes at Y ±11 on the top face (z 58.4) | OK |
| Fingertip mount: depth | 26 | 26.0 (Y ±13) | OK |
| Fingertip mount: width | 21.9 | 75.5 − 53.6 = 21.9 | **Fixed** (was 21.1) |
| Fingertip holes, across the finger | 14 apart (±7 from the centerline) | Y ±7 | OK |
| Fingertip holes, from the outer edge | rows at 3 and 3 + 10 | X 72.5 and 62.5 (outer face at 75.5) | OK |
| Fingertip bolts | 3× M3×6 per finger, 6 total | 3 holes Ø3.2 per finger, 6 total | OK |
| Pad height | 20 | z 96.3–116.3 = 20.0 | OK |
| Tip to linkage | 36 | 116.3 − 80.3 = 36.0 | OK |
| Gap between pads (open) | 109 (e-Manual) / 106 (units after Nov 2019) | 107.2 (= 151 − 2 × 21.9) | OK: in range, follows from the official 151 and 21.9 |
| Connectors | JST B4B-EH-A and Molex 53047-0610; no position given | Flush with the housing underside behind the boss, now touching their pockets | **Fixed** (were floating) |

**Placement check:**
- The rear plate starts at the back face (Y 27).
- Each fingertip sits on its finger base at z 80.3, and each pad sits against its fingertip.
- The links pass through slots in the housing and the finger bases.
- Nothing that should be on the outside is hidden inside another part.

**Two numbers to settle before saving:**
- **Envelope depth:** the record says 54, but the drawing's 54 only measures the housing. The drawing's top and side views also show a plate on the back that sticks out about 3 mm, so I kept it. Delete `rear-plate` if your library should use exactly 54.
- **Base tap layout:** the record says "6 mm from edge", but in the drawing the 6 is the gap between neighbouring holes. With a boss about 42 mm deep, the outer holes sit about 3 mm from its edge. I followed the drawing.

**Not dimensioned** (measured from the drawing at 3.355 px/mm, or kept plain):
- **Boss and housing:**
  - Boss height (9.2) and footprint (42 × 42).
  - Housing width (80.5), top height (58.4), corner radii and bottom chamfers.
  - Absolute heights of the face taps (only the 42 mm between rows is given).
- **Finger linkage:** pivot positions, link widths and the 16 mm link depth, the ears on the housing that hold the links, the finger-base shape, and the 4.8 mm pad thickness. Pins are left out.
- **Fingertip bolt holes:** the direction the holes point (modeled vertical; only their positions seen from above are given).
- **Rear plate:** about 22 × 12 × 3 mm. Its screws and the round opening below it are left out.
- **Connectors:** their position, their 6 mm height, and which one is the RS-485 port and which is the external port.
- **Left out entirely:** the front label recess, the screw heads on the front and back, and the slot in the back.
