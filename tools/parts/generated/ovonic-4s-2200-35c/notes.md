# Ovonic 4S 2200 mAh 35C LiPo

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/ovonic-4s-2200-35c/.

Envelope: 77 × 34 × 34 mm (studio frame, Y up).

The model matches every official number in record.json, so I made no changes. The only part is `pack-body`, a single body with no protrusions. It sits on the floor (bottom at z = 0), nothing floats or is buried, and `check_scene` found no issues.

| Feature (record.json) | Official value | Measured on model | Result |
|---|---|---|---|
| Length (X) | 77 mm | 77.0 mm (x −38.5 → 38.5) | OK |
| Width (Y) | 34 mm | 34.0 mm (y −17 → 17) | OK |
| Height (Z) | 34 mm | 34.0 mm (z 0 → 34) | OK |
| Pose: bottom on the floor | z = 0 | min z = 0 | OK |
| Pose: centred | x = 0, y = 0 | centre (0, 0) | OK |
| Pose: long side along X, lead end toward +X | as specified | 77 mm side along X; lead end assigned to +X (both ends look identical, since nothing on the lead end is modeled) | OK |
| Body shape | Rectangular soft pack, rounded long edges, flat faces | Four edges along X rounded, flat faces and ends | OK |
| Volume | (no official figure) | 88,417 mm³, which equals 77 × 34 × 34 minus four 3 mm edge rounds, so no geometry is missing | OK |
| Tolerances | L ±5, W ±2, H ±2 mm | Recorded in the part note, modeled at nominal | OK |
| 76 × 35 × 33 mm (dimension image) | Within tolerance; the record says to use 77 × 34 × 34 | Not used | OK (by design) |
| Mounting holes, tabs, shafts, splines, bosses | None in record.json | None modeled | OK |
| Connector positions (XT60, JST-XH) | Not published; leads not modeled | None modeled | OK |

**Not dimensioned**
- **Long-edge radius:** Ovonic gives no number. I used a conservative 3 mm round.
- **Lead-end shape:** the folded cell tabs under the wrap aren't dimensioned, so that end is a flat face.
- **Lead exit points:** Ovonic doesn't give the main-lead or balance-lead exit positions or lengths. Leads and plugs aren't modeled.
- **Label:** it's printed artwork with no geometry, so it isn't modeled.
