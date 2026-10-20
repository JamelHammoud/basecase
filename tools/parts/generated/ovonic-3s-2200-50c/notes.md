# Ovonic 3S 2200 mAh 50C LiPo

Modeled by the studio agent on 2026-10-20 from the official drawings in tools/parts/specs/ovonic-3s-2200-50c/.

Envelope: 105 × 21 × 33 mm (studio frame, Y up).

The model matches every number in `record.json`, so I didn't change anything. The scene has one part, `ovonic-3s-2200-pack`, placed at the origin with no rotation. Its bounds run from (−52.5, −16.5, 0) to (52.5, 16.5, 21).

| Feature in record.json | Official value | Measured on model | Result |
|---|---|---|---|
| Length (X) | 105 mm (±5) | 105.0 mm (x −52.5 to +52.5) | OK |
| Width (Y) | 33 mm (±2) | 33.0 mm (y −16.5 to +16.5) | OK |
| Height (Z) | 21 mm (±2) | 21.0 mm (z 0 to 21) | OK |
| Pose | Flat on largest face, long side along X, lead end at +X | Bottom face at z = 0, 105 mm side along X, centred on x = 0 and y = 0; lead end set at +X | OK |
| Body shape | One shrink-wrapped block, flat faces, rounded long edges | One solid with flat faces and 2 mm rounding on the 4 long edges (the edges along X) | OK |
| Volume (sanity check) | 72,765 mm³ for a sharp-edged box, minus about 360 mm³ for the 2 mm edge rounding | 72,396 mm³ | OK |
| Protrusions, tabs, mounting holes, connector positions | None in the record | None modeled | OK |

**Placement:** There is only one body. It sits on the floor, with nothing floating, buried or passing through it. `check_scene` reported no issues before or after this check. The front and top renders show the rounded long edges and flat ends as intended.

**Not dimensioned**
- **Long-edge radius:** Ovonic gives no number, so I used a plain 2 mm. The short-end edges are left square.
- **Lead-end tab fold under the wrap:** its shape and bulge aren't given, so the end face is modeled flat.
- **Lead exit positions and lead lengths:** not published, so they aren't modeled.
- **XT60 and JST-XH plug positions:** they hang on loose leads, so they aren't modeled.
- **Label:** printed on the top face with no raised or recessed shape, so it isn't modeled.
