# Ovonic 6S 5000 mAh 120C LiPo

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/ovonic-6s-5000-120c/.

Envelope: 156 × 48 × 44 mm (studio frame, Y up).

I checked the model against every entry in record.json and nothing was wrong, so nothing needed fixing. A fresh `check_scene` reports no issues. The scene is one part, `ovonic-6s-5000-pack`, with no rotation and its base centre at [0, 0, 0].

| record.json entry | Official value | Measured on model | Result |
|---|---|---|---|
| Envelope length (X) | 156 mm (±5) | 156 mm (x −78 to +78) | OK |
| Envelope width (Y) | 44 mm (±2) | 44 mm (y −22 to +22) | OK |
| Envelope height (Z) | 48 mm (±2) | 48 mm (z 0 to 48) | OK |
| Pose: label face (156 × 44) up, 48 mm along Z | as stated | bottom 156 × 44 face at z = 0, top at z = 48 | OK |
| Lead end toward +X | as stated | the +X end is reserved for leads; no leads modelled | OK |
| Body shape: soft rectangular pack, rounded long edges, flat faces | radius not given | flat faces, 3 mm edge rounding | OK (radius is my choice) |
| Leads and plugs not modelled | as stated | none in scene | OK |
| Label printed on top face, no geometry | as stated | no label geometry | OK |
| Holes, tabs, bosses, shafts, splines, connector positions | none in record | none modelled | OK (nothing to place) |

**Placement:** With only one body, nothing is buried inside another part and nothing floats. The pack sits on z = 0 and is centred in X and Y. The model's volume (327,547 mm³) is a little under the full box (329,472 mm³), which is what the 3 mm edge rounding should remove, so nothing was lost in the modelling.

**Not dimensioned**
- **Edge radii:** the photos show rounded long edges, but no radius is given. I used a small, conservative 3 mm.
- **Lead end:** the cell-tab fold and any bulge under the wrap aren't dimensioned, so that end is a plain flat face.
- **Lead exit points:** the main EC5 / 12 AWG leads and the JST-XH 7-pin balance lead have no published exit positions or lengths, and they are not modelled.
- **Tolerances:** the model is the nominal size. Pockets need clearance for up to 161 × 46 × 50 mm.
