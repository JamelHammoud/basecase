# YDLIDAR X4 Pro

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/ydlidar-x4-pro/.

Envelope: 110.6 × 59.4 × 71.5 mm (studio frame, Y up).

The model matches every number in record.json and the datasheet drawing, so I made no changes. I checked each row against the part positions and bounds from `get_scene`. The last `check_scene` found no interferences and nothing floating. Its only warning is that the left standoff has no mirror twin, which is correct: the real 3-hole pattern isn't symmetric. The renders from underneath and from the side look right.

| Feature (record.json / Fig 1) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (length) | 110.6 | −44.5 … 66.1 = 110.6 | OK |
| Envelope Y (width) | 71.5 | −35.75 … 35.75 = 71.5 | OK |
| Envelope Z | 59.4 (41.4 + 18.0) | 0 … 59.4 | OK |
| Standoff height (mounting face to datum A) | 18.0 ±0.6 | standoffs z 0 → 18.0; PCB underside at z 18.0 | OK |
| Top above datum A | 41.4 ±0.6 | 59.4 − 18.0 = 41.4 | OK |
| Stationary section above datum A | 22.7 ±0.6 | chassis/motor-pod top 40.7 − 18.0 = 22.7 | OK |
| Optical centre above datum A | 31.7 ±0.6 (49.7 above standoff ends) | window centre z 49.7 → 31.7 | OK |
| Window height | 10.5 | z 44.45 … 54.95 = 10.5 | OK |
| Head diameter | Ø68.7 ±0.3 | 68.7 | OK |
| Left hole | 39.9 left of centre, 5.4 below the centre line | (−39.9, −5.4) | OK |
| Upper-right hole | 76.5 right of left hole, 28.1 above the centre line | x −39.9 + 76.5 = 36.6, y 28.1 | OK |
| Lower-right hole | 79.6 right of left hole, 27.7 below the centre line | x −39.9 + 79.6 = 39.7, y −27.7 | OK |
| Hole type | 3× M3 threaded in the standoff ends | Ø2.5 M3 tap-drill holes from z = 0 in each standoff end; Ø3.2 clearance holes in the PCB | OK |
| PH2.0-8P connector | pinout only, no position | not modelled | n/a |

**Placement check:**
- **Standoffs:** they start at the floor and their tops touch the PCB underside (datum A).
- **Chassis:** the frame stands on the PCB top at z 19.6. The motor pod goes through a 0.3 mm clearance cut-out in the PCB without touching it.
- **Head:** it sits on the frame top at z 39.3 with a 0.3 mm radial gap inside the motor pod. Its top reaches 59.4.
- **Window:** it fills the head's 0.8 mm recess flush with the outer Ø68.7, so it isn't buried or standing proud.

**Not dimensioned** (scaled from the drawing or assumed, and kept as plain, conservative solids):
- **Where 110.6 splits around the rotation axis** (−44.5 / +66.1): measured off the drawing.
- **Motor pod:** centre x ≈ 49.8, radius ≈ 16.3, bottom 7.9 below datum A.
- **Head underside:** 21.3 above datum A.
- **Standoffs:** outer diameter ≈ 6 mm and modelled as round. Their real section (hex or round) and the M3 thread depth aren't given.
- **PCB:** 1.6 mm thickness assumed. Its outline is a hull of the Ø71.5 circle and tabs of radius 4.6 around the holes.
- **Window:** how wide it is (front arc from x −29 to +25 here) and where it sits around the circumference. The lens positions aren't given either. The head rotates anyway.
- **Chassis interior:** the belt, pulley, electronics, clips and open underside aren't modelled. The chassis is a solid hull, which is the conservative keep-out envelope.
- **PH2.0-8P connector:** omitted because its position isn't published, so it can't be pointed toward +Y yet.
- **Head runout** (0.8 / 0.5 to datum A) is a tolerance only and isn't modelled.
