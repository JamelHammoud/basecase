# TowerPro MG996R

Modeled by the studio agent on 2026-10-16 from the official drawings in tools/parts/specs/towerpro-mg996r/.

Envelope: 54 × 42.7 × 20 mm (studio frame, Y up).

Every dimension in record.json checks out on the model, so I made no changes. The spline sits on the case top face, the tabs are joined to the case walls, nothing is buried or floating, and check_scene found no issues. The front, side and top renders confirm this.

| Record item | Official | Measured on model | Status |
|---|---|---|---|
| Case length B (X) | 40.9 mm | 40.9 mm (−20.45 to +20.45) | OK |
| Case width D (Y) | 20 mm | 20 mm (−10 to +10) | OK |
| Case height excl. spline C | 37 mm | 37 mm (z 0 to 37) | OK |
| Height incl. spline A | 42.7 mm | Spline runs z 37 to 42.7: it stands 5.7 mm on the case top face and its top is at 42.7 mm | OK |
| Length across tabs E | 54 mm | 54 mm (−27 to +27) | OK |
| Tab height F (case bottom to tab underside) | 26.8 mm | Tab underside at z = 26.8 mm | OK |
| Shaft location | Not given (brief: +X half, pointing +Z) | Axis at x = +10, y = 0, pointing +Z | OK for pose |
| Headline spec 40.7 × 19.7 × 42.9 mm | Second set of figures on the same TowerPro page | Not used; configure-table values used instead | Noted |
| Tab hole pitch and diameter | null (not published) | No holes modeled | — |
| Output shaft offset | null | Estimated, see below | — |
| Spline teeth | null | Plain cylinder | — |
| Horn and screw sizes | null | Not modeled | — |
| Connectors and lenses | None in the record | None | — |

**Not dimensioned**
- **Tab mounting holes:** pitch, diameter and slots aren't published, so the tabs are plain. Measure a genuine unit before designing a bracket.
- **Tab thickness:** I used 2.5 mm as an estimate. The tabs run the full 20 mm case width, as the key image shows.
- **Shaft position:** I put it 10 mm toward +X from the case centre, read off the generic key image.
- **Spline:** a plain Ø6 cylinder with no teeth. TowerPro only says it fits Futaba arms, and the usual Futaba spline is 25 teeth.
- **Split between spline and collar:** only their combined 5.7 mm height is known, so they are one cylinder.
- **Raised gear-cover step and case seams:** the case is the full envelope box, which is the safe size for pockets.
- **Horn and screws:** sizes not published, so there's no horn.
- **Edge rounding:** the 0.5 mm radius is cosmetic only.
- **Cable exit:** left out, as you asked.
