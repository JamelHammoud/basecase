# Benewake TFmini-S

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/benewake-tfmini-s/.

Envelope: 42 × 15 × 16 mm (studio frame, Y up).

Every official dimension in record.json matches the model, so I didn't need to change anything. check_scene again reports no problems (3 parts, 42 × 16 × 15 mm), and the close-up renders confirm where everything sits.

The bosses and ears are part of the housing body, so the scene only gives the housing's overall box. For those features the "measured" values come from the housing code, cross-checked against the lens window positions and the renders.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope length (X, across ears) | 42 | 42 (x −21 … +21) | OK |
| Envelope front-face height (Z) | 15 | 15 (z 0 … 15) | OK |
| Envelope depth incl. lens bosses (Y) | 16 | 16 (y −8 … +8) | OK |
| Body length between ears | 33 | 33 (x −16.5 … +16.5) | OK |
| Body depth from back face | 11 | 11 (y +8 … −3) | OK |
| Ear depth from back face | 5 | 5 (y +8 … +3), seen in top view | OK |
| Mounting holes | 2× Ø2.35 through | Ø2.35, through the full 5 mm ear (seen in back view) | OK |
| Hole spacing | 36 c-c | x = ±18 → 36 | OK |
| Hole height | on horizontal centre line (7.5) | z = 7.5 | OK |
| Lens boss diameters | Ø9.4 / Ø10.4 | Ø9.4 / Ø10.4 (window Ø7.38 / Ø8.38 = OD − 2 × 1 mm wall − 0.02 clearance) | OK |
| Lens centre spacing | 10 | x −5.25 → +4.75 = 10 | OK |
| Lens outer span | 19.9 | −9.95 … +9.95 = 19.9 | OK |
| Lens centre height | 7.5 from edge | z = 7.5 (window centres) | OK |
| Boss protrusion | 16 − 11 = 5 | starts at the body front face y = −3, tip at y = −8 → 5 | OK |

**Seating checks:**
- **Bosses:** they grow out of the body front face (y = −3), with no gap and no step.
- **Lens windows:** they sit inside the open bores (y −7.31 … −6.51), touching the bore floor at y = −6.5. They aren't buried in solid material, and their front faces sit 0.69 mm back from the boss tips.
- **Floor:** the housing stands on z = 0. Nothing floats and nothing overlaps another part.

**Not dimensioned** (unchanged; kept plain or left out):
- **Ear height:** 6 mm, set equal to the R3 end diameter (R3 comes from (42 − 36)/2). The drawing shows the ears tapering wider towards the body, but gives no number.
- **Left–right placement of the lens pair:** I centred the 19.9 span on x = 0. The drawing gives no offset.
- **Edges:** 0.8 mm body edge radii. The top-corner chamfers shown in the side view are left off.
- **Lens recess and window:** 1 mm boss wall, 1.5 mm bore depth and 0.8 mm window thickness. None of these are given, and the drawing doesn't say which lens is the emitter and which is the receiver.
- **Left out:** the cable connector (drawn, but with no position or size), the four front-face screws, and the 92° clearance angles (field-of-view clearance, not geometry).
