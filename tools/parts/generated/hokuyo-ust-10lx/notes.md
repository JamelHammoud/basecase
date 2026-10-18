# Hokuyo UST-10LX

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/hokuyo-ust-10lx/.

Envelope: 50 × 70 × 52.8 mm (studio frame, Y up).

I checked the model against every number in record.json and the drawing, and nothing needed fixing. check_scene finds no interference, floating parts or leftover blocks, and the renders look right from the back, the underside and the side. Positions come from get_scene; hole positions and depths come from the part code and match the underside render.

| # | Feature | Official | On the model | Status |
|---|---|---|---|---|
| 1 | Envelope width (x) | 50 | 50.0 (−25 → 25) | OK |
| 2 | Envelope depth (y), body | 50 | 50.0 (−25 → 25) | OK |
| 3 | Envelope height (z) | 70 | 70.0 (0 → 70) | OK |
| 4 | Base block height | 35 | 35.0 (0 → 35) | OK |
| 5 | Optical window | 28.7 tall, starting at 35 | 35.0 → 63.7, 28.7 tall | OK |
| 6 | Top cap | top at 70 | 63.7 → 70.0 | OK |
| 7 | Optical centre height | 47.4 | 47.4 (inside the window band, noted on the part) | OK |
| 8 | Bottom hole square | 40 × 40, centred | holes at ±20, ±20 | OK |
| 9 | Bottom M3 holes | 2× M3, depth 6, one diagonal | (+20, −20) and (−20, +20), Ø2.5 tap drill, depth 6 | OK |
| 10 | Bottom Ø3 locating holes | 2× Ø3, depth 2.8, other diagonal | (+20, +20) and (−20, −20), Ø3, depth 2.8 | OK |
| 11 | Rear M4 holes, spacing | 42 apart | x = ±21 | OK |
| 12 | Rear M4 holes, height | 17.5 above the bottom | z = 17.5 | OK |
| 13 | Rear M4 holes, depth | 6 | 6 into the rear face (y = 25 → 19) | OK |
| 14 | Cable plate width | 24 | 24 (x −12 → 12) | OK |
| 15 | Cable plate height | 4 → 17 (13 tall, drawing) | z 4.0 → 17.0 | OK |
| 16 | Gland spacing | 11.5 | x = ±5.75 | OK |
| 17 | Gland centre height | 10.5 (drawing) | z = 10.5 | OK |
| 18 | Cable exit behind the body | 2.8 | rear face y = 25 → gland tips y = 27.8 | OK |

**Where each part sits:**
- The optical window starts exactly on the base top (z = 35).
- The top cap starts exactly on the window top (z = 63.7).
- The cable plate starts exactly on the rear face (y = 25) and sticks out behind it; nothing is buried inside the base.
- Everything is centred on x = 0, the base face is on z = 0, and nothing floats.

The overall bounding box is 50 × 52.8 × 70. That is the official 50 × 50 × 70 body plus the 2.8 mm cable exit the drawing dimensions.

**Not dimensioned:**
- **Head size:** 42 × 42, scaled from the drawing. The real head's rounded top and the rib on its back are not modeled.
- **Base details:** the stepped corner tabs around the rear M4 holes and all edge radii (plain 1 mm used).
- **Cable plate details:** plate thickness (1 mm used) and gland diameters (Ø6 and Ø5 used). The plate's two screws are not modeled.
- **Front features:** the indicator lamp and logo plate positions (not modeled).
- **Window extent:** the real window is clear over about 270°; I modeled it as a full opaque band.
- **Which diagonal is M3:** I read this from the drawing image. Confirm it against Hokuyo's official STEP file before relying on it.
