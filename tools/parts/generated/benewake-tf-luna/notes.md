# Benewake TF-Luna

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/benewake-tf-luna/.

Envelope: 35 × 21.25 × 13.5 mm (studio frame, Y up).

I checked every number in record.json against the model and found two problems: the lens windows were the wrong size, and the connector stopped short of its stated position. Both are fixed. After the fixes, `check_scene` reports no issues and the overall size is 35 × 13.5 × 21.25 mm, matching the record envelope.

**What I fixed**
- **Lenses:** they were Ø8.4 windows in a Ø8.5 recess, but the record says Ø10.5. They are now Ø10.5 discs in Ø10.5 seats 1 mm deep in the boss. Because the lenses are 10.5 apart, the two Ø10.5 seats just touch, which matches the drawing.
- **Connector:** it only reached 5.65 mm from the back face. It now reaches exactly 6.8 mm.

| Feature (record.json) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X (across ears) | 35 | 35.00 (−17.5…17.5) | OK |
| Envelope Y (depth incl. lens boss) | 13.5 | 13.50 (−6.75…6.75) | OK |
| Envelope Z (front-face height) | 21.25 | 21.25 (0…21.25) | OK |
| Body depth (no boss) | 12 | 12.0 (front face y = −5.25 → back face y = 6.75) | OK |
| Lens boss | 1.5 out from the body front face | from y = −5.25 to −6.75, so 1.5 | OK |
| Body width at lenses | 26.5 | 26.5 | OK |
| Bottom block width | 18 | 18 | OK |
| Mounting holes | 2× Ø2.2, 30.5 c-c, symmetric | Ø2.2 through, x = ±15.25 | OK |
| Ear end radius | R2.25 | R2.25, ear tip at x = ±17.5 (15.25 + 2.25) | OK |
| Ear thickness | 2 | 2 (y 4.75…6.75, flush with the back face) | OK |
| Lens diameter | Ø10.5 | was Ø8.4, now Ø10.5 (bbox 10.5 × 10.5) | was wrong, fixed |
| Lens spacing | 10.5, symmetric | centres x = ±5.25 | OK |
| Lens centre from top edge | 9 | z = 12.25, which is 21.25 − 9 | OK |
| Connector reach from back face | 6.8 | was 5.65, now 6.80 (y −0.05…6.75 face) | was wrong, fixed |
| Connector type | 6-pin, 1.25 pitch, plug opening on the bottom face | socket opening faces down, 0.4 recessed | OK (plain) |
| Rear PCB height | 19, inside the 21.25 housing | 19.0 (z 1.125…20.125), centred | OK |

**Where each part sits**
- **Lens boss:** it starts at the body's front face (y = −5.25). The lenses rest on the seat floor (y = −5.75) and their faces sit 0.1 behind the boss face, so they don't change the envelope.
- **Ears:** flush with the back face.
- **PCB:** sits in its rear pocket, flush with the back face.
- **Connector:** its top touches the cavity ceiling and its back touches the PCB, so it doesn't float.
- **Envelope:** nothing sticks out past it.

**Not dimensioned**
- **Ear-hole height:** set at the lens-axis height (z = 12.25), read from the drawing; no number is given.
- **Bottom block height:** 1.125 mm, chosen so the 19 mm PCB fits inside the full-width body. The drawing looks closer to 2 mm.
- **Lens seat depth and lens thickness:** seat 1.0 deep, lens 0.9 thick. The record gives only the diameter.
- **PCB:** width 23 and thickness 1.0 are estimates; there are no components on it.
- **Connector:** the body (10.1 wide × 3.6 tall), its cavity (10.5 wide) and the 8.6 × 2.4 plug opening are estimates. No pins or latch are modelled.
- **Edges:** corner and edge radii (1.5 / 0.5) are estimates.
- **Side profile:** the small step in the side view isn't dimensioned and isn't modelled.
- **Envelope depth conflict:** the datasheet text says 12.5 mm but the drawing shows 13.5, and I used 13.5.
