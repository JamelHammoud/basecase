# LDROBOT LD06

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/ldrobot-ld06/.

Envelope: 38.59 × 33.5 × 38.59 mm (studio frame, Y up).

Every official dimension in record.json matches the model, so I made no changes. I measured each row from the scene bounding boxes, the part code and a bottom view of the base. check_scene reports no interference, nothing floating and nothing below the floor.

| Feature (record.json / datasheet) | Official | Measured on model | Status |
|---|---|---|---|
| Envelope X × Y | 38.59 × 38.59 | 38.59 × 38.59 (base bbox −19.30…19.30) | OK |
| Envelope Z | 33.50 | 33.50 (cap top) | OK |
| Base height (33.50 − 12.80) | 20.70 | 0 → 20.70 | OK |
| Base draft | 92° | 2° per side (top width 37.14) | OK |
| Cap diameter at its base | Ø35.29 | Ø35.29 (bbox ±17.645) | OK |
| Cap height / draft | 12.80 / 91.5° | 20.70 → 33.50 = 12.80, draft 1.5° | OK |
| Cap starts at the base top face | sits on z = 20.70 | cap min z = 20.70, the same as base max z | OK |
| Optical centre | 25.70 (33.50 − 7.80) | lens centre z = (21.75 + 29.65)/2 = 25.70 | OK |
| Optical window band | 10.00 tall | lens spans z 21.75–29.65, inside the cap side | OK |
| Through-holes | 2× Ø2.45, 28.20 × 28.20 (±14.1) | Ø2.45 at (−14.1, +14.1) and (+14.1, −14.1), through the full 20.70 | OK |
| Counterbores | Ø4.80, 11.8 deep from the bottom | Ø4.80, z 0 → 11.80 | OK |
| Blind hole | Ø2.50 × 5.8 at 15.70 / 15.70 | Ø2.50 at (+15.7, +15.7), z 0 → 5.80 | OK |
| Connector | ZH1.5T-4P, 1.5 pitch, on the base side | 4 contacts at 1.5 pitch, centred on the +Y face (x = 0) | OK |
| Shaft, spline, horn, pilot, tabs | none in record.json | none modeled | N/A |

**How the parts sit:**
- The cap stands exactly on the base top face.
- The lens sits in a recess facing forward (−X). Its outer face is 0.05 below the cap surface, so it's flush, not buried.
- The connector header sits in its +Y wall pocket and touches the pocket floor at y = 13.30. Its front face is at y = 19.16. Because the wall is drafted 2°, the face is within ±0.08 of flush over the header's height. I left that as is, since the connector's size isn't dimensioned anyway.

**Not dimensioned** (kept plain, or scaled from the drawing at about 6.95 px/mm):
- **Base corner radius:** 5.5 mm, scaled from the drawing.
- **Cap top edge round:** 0.8 mm, a placeholder.
- **Lens:** Ø8.1, scaled; recess depth 1.2 mm is a placeholder. The cap rotates, so the lens's angle around the axis is only nominal.
- **Connector:** outline 9.35 × 4.2, centre at z = 3.8, scaled. Its depth into the case, the cavity and the contact shapes are simple stand-ins.
- **Features left out:** the seam line about 17.4 mm up the base, the two Phillips screws on the top deck, the small notch on the forward face, the interior and PCB outline seen in the bottom view, and the forward triangle mark.
- **Top face of the base:** modeled flat under the cap; the drawing doesn't say whether there's a recess there.
