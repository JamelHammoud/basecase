# Ovonic 2S 2200 mAh 50C LiPo

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/ovonic-2s-2200-50c/.

Envelope: 87 × 18 × 33 mm (studio frame, Y up).

The model matches every number in record.json, so I made no changes. The scene has one part, `ovonic-2s-2200-pack`, with its origin at [0, 0, 0] and no rotation. Its bounds run from (−43.5, −16.5, 0) to (43.5, 16.5, 18), and `check_scene` still reports no issues.

| record.json item | Official value | Measured on model | Result |
|---|---|---|---|
| Length (X) | 87 mm | 87.0 mm (x −43.5 to 43.5) | OK |
| Width (Y) | 33 mm | 33.0 mm (y −16.5 to 16.5) | OK |
| Height (Z) | 18 mm | 18.0 mm (z 0 to 18) | OK |
| Envelope axes | Length along X, lead end at +X, label face up | Long axis along X, lead end at +X, flat top face at z = 18 | OK |
| Bottom on floor | Lying on its largest face | Bottom at z = 0, centred on x = 0, y = 0 | OK |
| Body shape | One shrink-wrapped block, flat faces, rounded long edges | One solid, flat faces, the 4 long edges rounded | OK |
| Volume | (not published) | 50,990 mm³; a sharp 87 × 33 × 18 box less four R3 edges gives about 51,007 mm³ | Consistent |
| Lead end | Main and balance leads leave the +X end; leads not modeled | +X end is a flat face with no leads | OK |
| Tolerances | Length ±5, width ±2, height ±2 mm | Modeled at nominal (recorded in the part note) | OK |
| Holes, tabs, shaft, spline, connector positions | None in record.json | None modeled | OK |

The position checks also pass. The pack has no protrusions, so nothing needs to start from a face. Nothing is buried inside another part (there is only one), and nothing floats, because the bottom sits at z = 0.

**Not dimensioned**
- **Long-edge radius:** no radius is published, so I kept a conservative 3 mm.
- **Short-end edges:** not dimensioned, so they stay sharp.
- **Lead-end tab fold:** the folded cell tabs under the wrap at the +X end have no published shape, so that end stays a flat face.
- **Leads:** exit positions and lengths are not published for either the XT60 main leads or the JST-XH 3-pin balance lead, and neither is modeled.
- **Wrap seams and the label:** neither is modeled; the label is print, not geometry.
