# TowerPro SG90

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/towerpro-sg90/.

Envelope: 32.3 × 30.3 × 12.2 mm (studio frame, Y up).

Every official number in record.json matches the model, so I didn't change anything. check_scene reports no issues and the front and side renders look right.

**1. Official numbers vs model** (measured from the scene bounding boxes and the case code)

| record.json item | Official | Measured on model | Result |
|---|---|---|---|
| Envelope x – case length (B) | 22.7 | Main body x −11.35 … +11.35 = 22.7 | OK |
| Envelope y – width (D) | 12.2 | y −6.1 … +6.1 = 12.2 | OK |
| Envelope z – case height excl. spline (C) | 27.0 | Top of case and gear tower z = 27.0 | OK |
| Overall height incl. spline (A) | 30.3 | Spline top z = 30.3 (27.0 + 3.3 proud) | OK |
| Length across tabs (E) | 32.3 | x −16.15 … +16.15 = 32.3 | OK |
| Tab height from bottom (F) | 17.0 | Tab underside z = 17.0 | OK |
| Headline size | 23 × 12.2 × 29 (rounded) | 22.7 × 12.2 × 27 / 30.3 | OK (rounded headline; the configure table is more precise and wins) |
| Mounting holes / tab hole pitch | not published (null) | No holes modeled | OK (nothing invented) |
| Output shaft offset | not published (null) | Placeholder x = +5.25, y = 0 (on the +X half as you asked) | OK (my placeholder, not a TowerPro number) |
| Output spline teeth | not published (null) | Plain cylinder | OK |
| Horn / screw sizes | not published (null) | Not modeled | OK |
| Connector position | not published | Not modeled | OK |

**2. Placement**
- **Spline:** its base sits on the gear tower's top face at z = 27.0, so it's neither buried nor floating. Its footprint (x 2.85 … 7.65, y ±2.4) is fully inside the tower top (x −3.65 … 11.35, y ±6.1).
- **Tabs:** they run z 17.0 … 19.5. That's below the main body top (22.0), so they join the body's end faces along their full height and stick out 4.8 mm at each end.
- **Case:** its bottom is at z = 0. Long side along X, spline pointing +Z on the +X half.
- **Side view:** the tabs look slightly wider than the case, but they aren't. Both are exactly 12.2 mm; only the case has 0.4 mm rounded vertical edges.

**Not dimensioned** (no official number, so these are plain placeholders or left out)
- **Tab mounting holes and slots:** pitch, diameter and slot width aren't published, so the tabs are solid.
- **Tab thickness:** 2.5 mm placeholder, so the tab top at z = 19.5 is an estimate. Only the underside at z = 17 is official.
- **Output shaft position:** x = +5.25, y = 0 is a placeholder.
- **Spline diameter (4.8 mm) and tooth count:** not published. Only its height comes from TowerPro (A − C = 3.3 mm).
- **Horn and horn screw:** not modeled.
- **Gear tower:** the 15 mm length and the 22 mm body height under it are estimates.
- **Case splits, bottom chamfer and the cone collar under the spline:** left out.
- **Cable exit and JR plug:** the 25 cm lead is listed, but there's no exit position or plug size, so neither is modeled.
