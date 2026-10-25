# Core module notes (src/three, utils, agent, sim, data, types)

Knowledge preserved from code comments before they were removed. AGENTS.md covers the product rules; this file keeps the engineering facts, frames and workarounds behind the code.

## Coordinate frames (break silently if changed)

- Agent/CAD frame: Z up, floor z = 0, front −Y, left +X, mm. Scene/viewport frame: Y up, front +Z, left +X. Conversion `scene = (x, z, −y)` (`toScene` in `agent/agentScene.ts`); the basis matrix takes CAD axes (1,0,0),(0,0,−1),(0,1,0).
- Mirrored CAD geometry flips triangle winding; `mirrorParts` mirrors in the part's local frame. Mirror axis maps to a scene axis index (`x`→0, `y`→2, `z`→1).
- Robot description frame (REP-103): meters, X forward, Y left, Z up. Scene: mm, front +Z, left +X, Y up. `robotImport` uses `S = (y, z, x) × 1000`.
- Catalog-part frame from `tools/parts` is `(x, z, −y)` after its `rotate`; `catalogFrame(rotate)` in `robotImport` reproduces it for articulated hands, so hands sit flange down, fingers up.
- MuJoCo frame: Z up, meters, robot faces −Y at rest. Scene → MuJoCo is `(x, −z, y)`; MuJoCo → scene `(x·1000, z·1000, −y·1000)`. Quaternion axes rename the same way: scene `(x, z, −y, w)` from MuJoCo `(w, x, y, z)`; to MuJoCo `[w, x, −z, y]`.
- Scene forward is +Z (robot front faces −Y in the agent frame). Shove directions in `agentSim`: forward `[0,0,1]`, left `[1,0,0]`.
- Gait heading: forward vector `[sin h, 0, cos h]`.
- Agent precision: CAD sizes keep 0.01 mm, positions 0.001 mm. Rounding a centre shifts faces and exact parts mate on them.
- Cad meshes are centered on their bounding box; `originOffset` is where the code origin sits relative to that center. `baseSize` is the generated size, so `dimensions / baseSize` is the user's scale.
- Printability "up" axis (scene Y-up) → agent Z-up: `+y→+z, −y→−z, +z→−y, −z→+y`, x unchanged (`TO_AGENT` in `printReport`).
- STL export is Z up in mm (slicer convention); CAD edge `LineSegments` are removed before export.
- Euler rotations everywhere are XYZ degrees in three.js order. `halfExtents`/`partBounds` use the rotation matrix rows from `makeRotationFromEuler` so bounds of rotated parts are right (checked against `Box3`).

## agent/agentScene

- `specToPart`: a part with `spec.size` gets resized only if it is not `cad_part`/`component`/`hardware` (those keep exact geometry).
- `placementPoint`: CAD parts place by their code origin; other kinds by center. `opTarget` (cursor) uses the top of the CAD bbox above the placement point.
- `supply: "supply:<id>"` makes a part the envelope of a bought supply: not printed, counted as that supply in the BOM, weighs what the supply weighs.
- Catalog keys: `component:<id>[|<variant>]`, `hardware:<type>|<size>|<length>[|<finish>|<drive>]`. `componentVariantFromKey` validates the variant against the catalog.
- `swapWords` renames Left↔Right (and front↔rear for front/back mirrors) on word boundaries only; "Bright" is left alone.
- `agentCatalog(query)`: every word in the query must match; sizes are in the CAD frame (x × y × z).
- `material` accepts `pla|petg|asa|tpu` mapped to `PrintMaterial` via `PRINT_MATERIAL`.

## agent/agentPose

- Tools run in the agent frame (mm, Z up, front −Y, left +X); joint values are degrees (revolute) or mm (prismatic) relative to the modeled pose.
- `scopeOf` picks a robot by name or key, else the selected robot, else the only one. A `Scope` carries that robot's own pose and a `merge` that puts it back into the scene pose without touching other robots.
- `poseCheck` reports only what changes because of the pose: new link clashes (versus the rest pose pairs) and the floor.
- `animate` samples the motion at 120 steps: collisions between links, the floor, and feet sliding while planted. Speed check: no joint may exceed its maker's `velocity` (published robots only).
- IK goal points are relative to where the point sits now (`pointOf` in the rest pose).

## agent/agentSim

- Push strength is a share of the robot's weight, so `buildModel()` must have run (needs masses). Controller strings: `hold` (default), `limp`, `animation:<name>`, `policy:<name>`.
- `restoreCanvas` puts the canvas back after rendering sim frames.

## sim/mjcf (scene → MuJoCo)

- Bodies keep the world's orientation at rest, so a body frame is just its joint pivot and the rest pose maps back with no rotations. Sim deltas for the canvas: `T(p) · R · T(−origin)`.
- Convex hull per part from its rest mesh, vertices only (MuJoCo rebuilds the hull). Big meshes are thinned with a coarse grid keeping one point per cell. Inertia comes from the hull.
- No usable mesh (flat or empty part) falls back to a box of its dimensions.
- Parts without a Build-check mass (hand-modeled odds and ends) get a light plastic estimate.
- Actuator model: position actuator like a servo. `kp = effort / 0.17` rad (about 10°) for revolute, `effort / 0.005` m (5 mm) for prismatic, so full torque is reached about 10° or 5 mm off target.
- Joint `armature = max(0.002, effort × 0.004)` for revolute (0.05 for prismatic). Reflected gearbox inertia keeps light links stable at the 2 ms step.
- Effort source order: servo stall torque, then the maker's published limit (`effortNm`), else an estimate: the weight below the joint held out level from the pivot at about 3× margin. `effortSource` records which.
- Start height: lift above the floor by `−posedFloor + 2` mm so feet clear the floor wherever the canvas pose puts them. The lift goes in the initial state (body `pos` stays the rest place) so Reset lands the same way.
- Robots with legs float (free root); others are welded to the floor unless `fixedBase` says otherwise. Non-robot solid parts are fixed scenery.

## sim/engine

- Pose scene offset (mm, Y up) → MuJoCo (m, Z up) on reset; reset starts just above the floor.
- Grab (canvas gizmo as a hand): the held point is fixed to the body and pulled to the hand on a critically damped spring scaled by the robot's total mass, with the robot's weight held at the point. Holding a foot lifts the whole robot (grab acts on the root body mass). A quick release flings it.
- `xfrc_applied` acts at the body's center of mass, so a force at the held point adds a moment: `arm = point − xipos`.
- Turning the hand turns the body via axis-angle rotation error, damped by spin. `axisAngle` returns the short way round.
- WASM arrays (`qpos`, etc.) are live views into wasm memory: refresh them each step in case memory grew.
- Stats: saturation counts time at ≥ 98% of the actuator limit; `peak` is |force|/limit 0–1; `forward` is displacement along the robot's own forward (−Y at rest); tilt is the angle between the root's up axis and world up (from `xmat`).
- `engine.ts` has no DOM and runs in Node for tests.

## sim/policy (contract with electron/trainer/train.py)

- Observation (robot root body frame, MuJoCo axes, robot faces −Y, left +X): 0–2 gravity direction, 3–5 angular velocity (rad/s), 6–8 linear velocity (m/s), 9–11 command (forward m/s, left m/s, turn rad/s), 12… joint positions − default (rad/m), joint velocities, last action. Action: targets = default + actionScale × action, held for `controlDt`.
- Python and TS build the same observation in the same order. Change one, change both, bump `version`.
- `toBodyFrame` is Rᵀ v for quaternion (w, x, y, z). A free joint's angular velocity in `qvel` is already in the body frame. Weights are row-major out × in; actions are normalized and clipped as in training.

## sim worker, useSimulation, useTraining

- The worker steps real time × speed; if it can't keep up it slows down instead of spiraling (the bar shows rtf, smoothed). `run` steps as fast as possible for agent checks and uses its own worker so a live sim keeps running.
- Bodies are listed root first, so the lowest body index containing a selected part is nearest the robot's root (used for grabbing).
- Shove: half the robot's weight (`mass × 9.81 × 0.5` N) sideways in a random direction for 0.15 s.
- A scene change under a running sim makes its model stale, so the sim ends.
- Training: only the job this tab started is adopted (a reloaded page ignores an older one). `rootOffset` converts scene mm to MuJoCo m `[x, −z, y]/1000`; `ctrlDefault` holds other robots at their pose.

## three/buildPartMesh

- `MIN_LIGHTNESS = 0.13`: CAD paints black plastic pure black (STS3215 is `#020202`); at zero albedo no light shows shape, so near-black renders as about `#222`, hue and saturation kept.
- Faces use polygon offset so edge lines drawn on another surface (flush panel, coincident face) don't flicker.
- Image textures are cached by data URL so scene rebuilds don't reload photos.
- CAD parts: creased normals at 32° (smooth curves, crisp feature edges). `creaseEdgesOnly` keeps a B-rep edge segment only where the faces either side meet at > 20°, or where the mesh has no matching edge (kept to be safe); smooth seams (loft sections, spline joins, tangent fillets) otherwise striped lofted shells.
- Component and hardware meshes draw edges only when selected or a cutout (dense feature edges showed through enclosing shells as dark specks). Hardware sub-meshes use a 40° crease threshold. Imported robot `mesh` parts do the same (dense meshes speckle).
- Components while loading: a faint box at the exact envelope keeps placement and picking working. Component geometry is shared (`userData.shared`): never dispose or scale it.
- Pyramid base fills the footprint like a box (scaled by √2 in x/z). `CapsuleGeometry` height = length + 2r, normalized then scaled to the part box.
- Sculpt: parts with `sculptMesh` render that mesh directly.

## three/componentMeshes

- GLBs carry no normals: creased normals at 30°.
- Finish: near-white is plastic (housings); light neutral greys (`s < 0.12`, `0.55 < l < 0.85`) and golds read as metal (connectors, shields).
- `getComponentMesh` returns null and starts loading; `useComponentMeshVersion` changes when any load finishes so the scene rebuilds.

## three/hardwareMesh

- Thread is a lathe of a sawtooth profile (reads as thread at any zoom); ring count capped (`pitch ≥ length/120`) for long fine-pitch screws. Threaded shanks draw no CAD edges (would be all lines).
- Recess outlines: ISO 10664 hexalobular between the A (point-to-point) and B (across-lobes) circles; ISO 4757 cross is two wings of width m/6 across width m; Pozidriv adds a short rib on each diagonal (T = 0.26 m).
- Recess cutter runs from `depth` below the head top to 1 mm above (clears domed heads). Cross cones taper like the real gauge: factor 0.75 (Phillips), 0.6 (Pozidriv, straighter wings).
- Depth: minimum key engagement `t` from each head standard (ISO 4762 / 7380 / 10642 / 14579 / 14581 / 14583 / 1580 / 2009); Phillips/Pozidriv use the ISO 4757 gauge depth. Only countersunk heads let the cone run on into the shank; others stop at `0.8 k`. When the cone passes the head, head and shank core are cut together.
- Pan head: ISO 7045/14583 straight side then dome (side fraction 0.5); slotted ISO 1580 has a flatter top (0.75).
- CSG: `clean()` drops position-and-normal-only, removing zero-area triangles that lathes leave at their poles (they break CSG). `cutRecess` uses a real boolean (three-bvh-csg); the new walls and floor come back as a separate dark piece.
- Output is centered on the bounding box (position = center) and must match `hardwareDimensions(spec)` exactly. Y is the axis, screws head up.

## three/infiniteGrid

- Camera-following plane; shader draws 1/10/100/1000 mm lines by on-screen density. `toneMapped: false` because the scene uses ACES and line contrast must stay exact. `renderOrder = -1`.
- Fade distance `clamp(d × 7, 1200, 70000)` mm so it stays inside the camera far plane.

## three/interference

- Parts may touch but never interpenetrate. Inside tests use majority vote of ray parity in three directions (robust to small gaps in imported meshes).
- Samples are vertices plus triangle centroids (catch thin parts whose vertices all lie on the other part's surface). Sliver triangles are dropped.
- Coplanar (z-fight) = same-facing surfaces within 0.05 mm; facing pairs are contact and fine. Area is measured from the part with less surface (finer sample).
- With a `focus` set only parts near the focused ones are meshed.

## three/meshMeasure and partThumbnails

- Volume from signed tetrahedra (exact for closed meshes); open or degenerate meshes have no volume and fall back to the bounds center.
- Thumbnails render at 480 × 360 (2× the largest display size, for Retina) in one shared offscreen renderer. A PMREM studio room is needed or metals (screws, bearings) render black. Dark parts are lifted/exposed more to read on dark tiles. Component meshes are shared (don't dispose `userData.shared`).
- Assembly thumbnails frame looser (tightness 1.0). Hooks render one frame late so a grid doesn't render all at once while the panel opens; components wait for their mesh.

## three/printability (P1S estimates, no slicer)

- Plate 256 × 256 × 250 mm, 18 × 28 mm keep-out front-left (`bed_exclude_area` in Bambu Studio's printer profile). Long parts are fit across the diagonal (yaw 5–85°, up to about 362 mm); the long side runs back-left to front-right, along the diagonal that misses the keep-out; corners must also clear the keep-out.
- Overhang rule 45° from vertical; support threshold 30° from horizontal (stock P1S profile). Support volume = projected area × drop to whatever is below (part or bed), after Morgan 2016.
- Min wall 0.84 mm (two perimeters of a 0.4 mm nozzle; lines are 0.42 mm). Walls measured by inward rays from area-weighted face samples; count a wall only when the ray leaves through a face pointing back at it (an opposite wall).
- Orientation score: `fits ? 0 : 1e12 + support − 0.5·contact + 0.01·height`. Bed contact = faces within `facing > 0.99`.
- Print time: Bambu caps volumetric flow near 21 mm³/s (PLA), but accelerations, slow outer walls and travel keep the average far lower: about 7 mm³/s for walls, 12 mm³/s for sparse infill, plus a few seconds per layer for travel and wipe.
- `packPlates` shelf-packs onto 256 × 256 with 6 mm gaps; the first shelf starts after the keep-out. A part turned across the diagonal takes the whole plate (`printReport`).
- Cached per part shape (`shapeKey`), not position: checks run in the part's own frame.
- `SUPPORT_FILL = 0.2`: share of support volume that becomes filament.

## three/sculptAndBooleanEngine

- Sculpt data positions are normalized to [−0.5, 0.5] and scaled by dimensions. Welding strips UV/normals first so UV seams can't prevent welding; brushes then never split seams.
- Brush falloff is smooth cosine `0.5(1 + cos(π d / r))`. Smooth/flatten use the average position of affected vertices.
- Deformers apply in order: roundness (spherify), taper (scales X/Z from bottom to top), twist about Y, bend along Y into an X arc, using normalized height t in [−0.5, 0.5].
- CSG brush from a part group needs UV and normal attributes present or three-bvh-csg fails.

## data/hardware (sources and standards)

- Dimensions are nominal ISO/DIN values cross-checked against bd_warehouse (Apache-2.0), BOSL2 (BSD-2) and FreeCAD Fasteners tables, plus CNC Kitchen/Ruthex insert sheets and NSK/SKF bearing data. "Commercial" values aren't covered by ISO. mm.
- Tables: thread/pitch ISO 261/262; clearance ISO 273 (medium) and tap drills; ISO 4762 socket, ISO 7380-1 button (M2/M2.5 commercial), ISO 10642 countersunk 90° (M2/M2.5 per DIN 7991), ISO 14579 Torx socket, ISO 7380-1 TX (commercial: M3 T10 per McMaster/Lemu, larger sizes follow the 14579 progression), ISO 14581 / 7046-1 / 2009 countersunk, ISO 7045 / 14583 / 1580 pan, ISO 4017 hex bolt, ISO 4026 set screw key, ISO 4766 slotted set screw (2011 edition), ISO 4032 nut, DIN 985 / ISO 10511 nylon lock nut (M2/M2.5 commercial), DIN 562 thin square nut, ISO 7089 / 7093 washers, ISO 8734 dowels, ISO 10664 Torx recess A/B, ISO 4757 cross recess (Phillips H, Pozidriv Z; width m and depth simplified per size).
- ISO 7045 and 7046-1 give H and Z heads the same size and recess number (Pozidriv tables reuse Phillips ones via `pozidrivOf`).
- Cross number per size: M2 0, M2.5 1, M3 1, M4 2, M5 2, M6 3, M8–M12 4. Slot width per size follows ISO 1580/2009 (M3 1.0 … M12 3.06).
- Set screw Torx (commercial): size whose point-to-point A matches the ISO 4026 hex key's corners. Set screw recess depth: `min(0.6 L, 0.8 s)` (minimum key engagement, ISO 4026). Hex socket pan heads use the button head's key.
- Heat-set inserts (CNC Kitchen standard): printed holes come out about 0.25 mm small, so the cutout adds 0.2 mm (`FIT = 0.2` printed tolerance in `hardwareCutouts`); `heatset_hole` in the SCAD library adds 1 mm depth.
- Lengths: ISO 888 preferred plus common retail in-betweens; `SCREW_LENGTHS` are retail ranges; hex standoffs come in 1 mm steps to 20 mm; custom lengths allowed up to 300 mm in 0.5 mm steps.
- `hexCorners(s) = s / cos 30°`. The hex_prism part has corners along Z at width = depth = e, turned 90° to match a nut in `hardwareCutouts`. Countersink cutouts use a 90° cone, wide end up.
- Default finish and drive go unsaid in names; non-default ones are part of the name and catalog keys. A hex-socket drive is named "Hex Socket" so a hex-socket pan head doesn't read as a hex head.
- `hardwareDimensions`: Y is the axis, screws head on top. Shopping is an Amazon US search (fasteners come from many sellers).
- Hole rows (`hardwareHoleRows`) use the same numbers as `hardwareNote`.

## data/components, supplies, listPrices, catalog

- Studio frame: Y up, mm; `size = [width X, height Y, depth Z]` from the converted mesh (`component-meshes.json`), not hand-entered.
- `kgcm(v)` = N·m from kg·cm (× 0.0980665, 3 decimals).
- Actuator: `stallNm` at `atVolts`; `ratedNm` continuous (Feetech rates about a third of stall); `volts` is the specified input range; `dualShaft` means output on both faces (rear idler boss that takes a horn), so a U-bracket on both is supported on both sides.
- `source` on models: `manufacturer`, `checked` (third-party CAD measured against the maker's drawing, `checkedAgainst`), `agent`.
- Variants of one body (voltage, gearing) are different parts to buy; a variant may carry its own Amazon search when the component's listing covers another.
- `componentWeightG` parses the Weight spec text ("55 g", "9 g with headers").
- Supply batteries: nominal/full voltage, capacity, C rating; weights are typical (e.g. 168–174 g across Gens Ace, Tattu, Ovonic listings → 172 g).
- Densities (g/cm³): PLA 1.26, PETG 1.28, ABS 1.04, ASA 1.07, TPU 1.22; PLA, PETG, TPU from Bambu Lab filament profiles (PLA Basic, PETG HF, TPU 95A HF).
- Heat deflection °C (`MATERIAL_SOFTENS_C`): PLA 54, PETG 69, ABS 87, ASA 95, TPU 60. Bus servos run 60–70 °C (STS3215 cuts torque at 70 °C), so servo-holding parts need a material that stays stiff above that.
- List prices (`listPrices`) come from maker and US distributor stores, never Amazon; hardware may be keyed by type and size (`hardware:heat_insert|M3`) covering every length and finish. Lookup is exact first, then type+size. Source: `docs/research/Printable humanoid engineering/us_list_prices.md`.
- `BLOCKOUT_ONLY` stand-ins are generic and estimated; kept for agent block-outs and old scenes.
- Drag payload types (`dnd.ts`) are `application/x-robotics-part|model|robot`; robot payload is JSON `{ url, name }`.
- Articulated hands (`articulatedParts`): turns match `rotate` in `tools/parts/sources.json`; some descriptions carry simulation debug colors, so a single `color` overrides all links.

## utils/bom

- `STALE_DAYS = 60`; `FILAMENT_MARGIN = 0.15` (purge, brims, failed print). Shell = `SHELL_MM = 0.9` (2 walls × 0.42 mm + 4 layers × 0.2 mm ≈ 0.9 per surface model); filament grams = shell at full density + interior at infill fraction.
- Filament assumed 1 kg spools. Packs need the record's pack size. Estimated (list-price) totals never count toward the checked total.
- `localDate`: a check made this evening is dated today in local time, not tomorrow's UTC date.
- `parseAsin` handles `/dp/…`, `/gp/product/…`, `/gp/aw/d/…`.
- Posable catalog parts (hands) are links as `mesh` parts; the palm carries `componentId`, so the hand counts once.
- Made-elsewhere tags (CNC, laser-cut, "Off-the-shelf COTS") flag parts needing a source other than a listing.
- Hardware keys spell out default finish and drive (`hardwareKey`).

## utils/engineering (checks computed, never judged)

- Frame: scene (mm, Y up, gravity −Y). Thresholds: Robotis designs loads ≤ 1/5 of stall; Feetech rated ≈ 1/3 of stall; bus servo case 65 °C (`SERVO_CASE_C`).
- Mass sources: `catalog`, `published` (maker mass and `com`, else mesh centroid), `printed`, `hardware`, `supply`, `estimate`. Unlisted weights: enclosed volume × 1.2 g/cm³ (populated board or housing, estimate).
- Floor contact: solid parts with lowest point under 2 mm.
- Torque: worst of holding the distal side across the range and, for legs, standing on that leg (ground reaction under the stance foot, COM shifted over the foot, distal links still hanging from the joint). Pass ≤ 1/5 stall, Warn ≤ rated, Fail above. Published robots: the maker's `effortNm` is a peak, so Pass ≤ half of it.
- Range of motion: published limits are the motor's, links meet at hard stops and simplified meshes overlap a few mm there, so contact counts only over 5 mm (0.3 mm for designed joints). Legs push into the floor by design when turning; other limbs must clear it.
- Dual-shaft servo carries a link on both faces when the link reaches past both ends along the axis. Alignment/support checks run only for joints with servos.
- Power: load-bearing (leg) servos at rated current, the rest idle, plus the computer.
- Stability: COM over the support polygon from the feet's convex hull; margin = distance to polygon boundary (positive inside).
- Names are readable ("Left shoulder roll"), never ids.

## utils/kinematics

- Everything is in the scene frame of the modeled (rest) pose: a joint turns its child about its rest axis through its rest origin, composed from the base outward. Joint motion = `T(o) · R · T(−o)`.
- `anchorJoint` stores the pivot in the first parent part's frame (else first child's), so moving or undoing the robot keeps joints in place; `resolveJoints` reads it back.
- `ownerOf`: each part moves with the deepest joint listing it as child. A joint's mount moves with the joint above it. An unlisted part follows its group only when the whole group moves with one joint (a group spanning a whole robot says nothing).
- Robots: joints are one robot when a joint sits on another or they share a part; unlisted parts grouped with one robot's parts (screws on the base) belong to it. Name from the parts' group, else "Robot"; duplicates are "Unitree G1", "Unitree G1 2". Key = first base joint's id. A single-robot scene's legacy `root` offset belongs to that robot.
- `uniqueJointIds`: robots from the same maker share names (`left_knee_joint`), so later robots' repeats get `_2` and their `parentJoint` links are renamed; batches are runs of joints that don't repeat an id inside themselves (one import each).
- `jointsWithoutParts`: joints mounted on a removed joint fall to the robot's base; then joints with no parts at all (links imported without geometry) that nothing hangs from are dropped. Returns the same array when nothing changed.
- IK: damped least squares / Levenberg–Marquardt, λ grows after a bad step and shrinks after a good one; normal equations `(JᵀWJ + λ + μ)Δ = JᵀW r + μ(prefer − x)`. Torso/waist/spine joints get weight 2000 so limbs reach first. Stops when the last step barely helped.
- `preBend`: knees and elbows straight at rest are singular (solver can't tell which way to bend). Joints whose range opens mostly one way start 20° bent that way (only those at 0).
- Name parsing: sides from `left_knee`, `l_knee`, `lThigh`, `LL_KFE`, `FL_hip`, `knee.R`; `lhip`/`rshldr` prefix forms handled.
- Pose-tab clicking a part picks its turning joint; a whole robot selected picks none.

## utils/animation, usePosing

- `sampleAnimation`: Catmull-Rom (smooth) or linear (dense mocap); loops wrap last→first. Whole-body turns slerp quaternions (Euler angles jump between equivalent forms).
- IK goal orientation: three points (the point plus two 40 mm forward/sideways, moved by the same offset) hold the rest orientation, e.g. feet flat.
- `goalParts`: the part itself, or every part a joint moves directly.
- Gait: any number of feet with phases (biped 0, 0.5; quadruped trot 0, 0.5, 0.5, 0); joints above the hips stay put; two passes, the second starting from the end of the first so the loop closes cleanly.
- `detectFeet`: a foot is a leg joint with no leg joint below it; ordered front (+Z) before back, left (+X) before right.
- Playback: other robots hold the pose from when playback started (`playBase`); the canvas can still show a playback frame the state already equals, so it is reset explicitly. Same name on the same robot replaces an animation (agent revising its walk).
- Pose edits fold into one undo step if < 700 ms apart; playback, scrubbing and pausing aren't recorded.

## utils/mocap

- Motion is moved by direction, not joint angle: each robot segment points the way the matching human segment points, at the robot's own segment length, then IK finds joint values. Body moves by the performer's hips scaled by leg length (robot hip→ankle over performer's, from the bind pose).
- Performer is turned to face the robot front (+Z), left toward +X. Height is relative to the first frame (bind-pose roots often sit at 0). In-place keeps the body over the origin (treadmill).
- Limb ends with no joint use the last link's far point; toe sits forward of the ankle along the foot (front +Z). A joint's origin moves with the link above it, so pull on the parent joint's link.
- Feet on the floor: lift any frame whose lowest sole dips below, and settle frames where the performer stands (an ankle within 4% of leg length of its lowest point).
- Torso and head solve first (from the hips), then limbs out from where shoulders and hips are now.
- Chest bone = the spine bone both arms hang from (common ancestor). Robot joints per landmark: first of that kind each side (shoulder pitch before roll). BVH is read whole (40 MB cap vs the normal text cap).

## utils/robotImport (URDF/MJCF)

- Colors in URDF/MJCF are display values (what RViz/MuJoCo show): read as sRGB; as linear light they wash robots out to mid grey. No color: default light grey `#b3b3b3`.
- URDF rpy: fixed-axis, `R = Rz(yaw) Ry(pitch) Rx(roll)` (three.js Euler 'ZYX').
- MJCF: orientation via quat/axisangle/euler/xyaxes/zaxis; `eulerseq` lower case = intrinsic (rotating axes). Defaults classes by class → tag → attributes. `<frame>` elements add transforms; children are looked up through them. `<include>` is inlined (scenes include the robot file), keeping what's inside the included `<mujoco>` root. Several hinges on one body chain; the last joint into a link moves it. Torque limits from `forcerange`, or a motor's control range × gear, when joints lack them.
- Visual geoms: never collision-class or group-3 (name or class matching collision); of the rest, those in a "visual" class or that never collide when the file marks them.
- Meshes: STL/OBJ/DAE/GLB. Collada: ROS-style files use their own axes, so undo the loader's Z-up turn (keep units). Cylinders run along Z in robot frames.
- Mesh lookup: `candidates(ref)` ordered most likely first; a raw GitHub path `/owner/repo/branch/…` often has the package as the repo itself (`package://` resolves against it); the rule that found the last mesh is tried first; last resort is the same file name anywhere in the folder. Git LFS pointers (< 300 bytes) trigger fetching the real file. `github.com/…/blob/…` maps to raw.githubusercontent.com.
- Simplify (meshoptimizer): weld, then target about 220k triangles total in proportion to each link, never past 0.2% error. Published meshes are often already decimated cracked shells (Apollo torso: 50k open edges); forcing the target tore them, so those keep more triangles (a soft limit).
- The imported robot is shifted to stand on the floor, centered on the origin. A link with no geometry folds into the nearest link above with a part (mass and COM), and a link several joints deep with no geometry between still has its parts owned by the joint above.
- `ROBOT_DATA_VERSION = 2`: bump when imports capture more of the maker's data; older robots are upgraded from their description on open (`upgradeRobots`, matched by link and joint name so poses and edits are kept). Part positions at import are reconstructed from a joint anchored to a part: the joint's file origin minus its offset in that part, then other parts by offsets from it. Parts record `robotLink` for this.
- Presets: each checked to import whole (every mesh found, joints with limits). `rotate` takes turns in the file's own Z-up frame (axis, degrees) before Z-up → Y-up, like `tools/parts`; without it the robot faces front by REP-103 (X forward).

## utils/hardwareCutouts, libraryParts, selection

- Cutouts are positioned relative to the hardware part's center before its rotation, in world space following position and rotation (`hardwareCutoutParts`).
- Older library saves kept only each part's box; CAD parts lost their shape (come back as boxes).
- `alignParts`: several parts align to shared bounds, one part to the origin (bottom to the floor on Y). `distributeParts` keeps the outermost parts fixed.

## utils/silhouette, imageTo3DAnalyzer, svgTo3DParser, keySpecs, imageFile

- Silhouette: photo segmented by flood-filling a plain background from the border; the model render is white-on-black. Both reduce to span width per tenth of height as a fraction of height (scale-free).
- Image tracing: radial outer boundary in 48 angular sectors around the centroid gives a watertight, self-intersection-free contour; Ramer–Douglas–Peucker simplification; background from the corners; flood-fill exterior from the border, remaining unvisited 0-pixels inside the bbox are holes (up to 6); nearly empty/full-frame photos fall back to a chamfered octagon plate; image Y is flipped.
- SVG: Y is inverted (SVG Y points down); shapes are normalized into [−0.5, 0.5] of the whole SVG bounding box so multi-path SVGs stay aligned; `fill="none"` paths are skipped unless they are the only paths (stroked-only fallback).
- Key specs: torque shown as the load held on a 10 cm arm (19.5 kg·cm → "Up to 2 kg at 10 cm"); the torque regex skips constants like "Kt 0.055 N·m/A".
- Reference images are downscaled to JPEG (quality 0.86 default) to keep agent payloads small. Claude reads images at up to 1568 px; larger only costs time.

## utils/evidenceFiles, platformBridge, misc

- Drop handling: `collectDrop` must run inside the drop handler (entries must be taken before the event returns).
- STL evidence is summarized as text with exact size (agent reads text, not meshes).
- `closeAcpWorkspace` swallows errors: the session ends with the agent process anyway. Storage failures (full/blocked) in `robotPreview` keep the imported list for this session only. Preview image: render frames a bounding sphere, which leaves tall humanoids small in a 4:3 tile, so the image is cropped to the robot's own pixels plus a margin.
- `useStoplights`: stoplights draw over the title bar only in the Electron window on macOS and not in full screen; browser and full screen have none.

## types/robotics (units, frames, semantics)

- `ScenePart.dimensions` are mm (bbox, W/H/D). `taper` −0.8…+1.0 (top X/Z relative to bottom), `bendDeg` ±120 (arc along Y/X), `twistDeg` ±180 (about Y), `roundness` 0…1 (spherify box corners). Sculpt positions are in local normalized [−0.5, 0.5] coordinates scaled by dimensions; sketch loops are normalized [−0.5, 0.5] in the X–Z plane; revolve profiles are [radius 0…0.5, height −0.5…0.5].
- `cad`: scene frame, centered on the part's bbox; `edges` are exact B-rep segments from replicad. `mesh`: scene frame, centered on its bbox, `baseSize` as for CAD.
- `massG` (grams) and `com` (mm from the bbox center, part's own frame) are the maker's published values for imported links.
- `robotLink.version` below `ROBOT_DATA_VERSION` is upgraded from the description on scene open.
- `RobotJoint`: revolute degrees / prismatic mm; `parent`/`child` part ids (the child side moves); `parentJoint` is needed when links between joints have no geometry; `frame` stores origin/axis in a part's own frame (origin/axis are refreshed from it); `range` is from the modeled pose; `actuators` are servo part ids (two opposed servos share load); `effortNm` N·m (N for prismatic); `velocity` deg/s (mm/s); `published` marks a published robot's joint (range is the motor's, not a clearance); `limb` sets torque margin (legs 3×, others 2×).
- Pose: `JointValues` are relative to the modeled pose; `RootOffset` is mm and XYZ degrees about the base in the scene frame; `roots` by robot key for multi-robot scenes, `root` for one robot.
- Animation keyframes are sorted by `t` and each lists every animated joint; `interpolation` smooth = Catmull-Rom, linear for dense mocap; keyframe roots belong to `robot`.
- Policy command is forward m/s, left m/s, turn rad/s; `eval.fellAt` null = never fell.
- `PurchaseRecord`: what the user saw on a listing, recorded by hand (never fetched or generated); `packQty` pieces per listing; `checkedAt` ISO date.
- Annotation pins follow their part by `offset`; position is the world position when created.

## guide (build guide rendering)

- `GuideStage.draw` returns the PNG as a promise: the WebGL canvas is copied to a 2D `OffscreenCanvas` at once (so the next render can start) and encoded with `convertToBlob`, with at most 3 encodes in flight (`ready()`). `GuideRenderer.draw` returns a `Drawing` whose `dataUrl` fills in when its encode finishes; `drawGuide` awaits `flush()` before the drawings are used. Never copy a drawing with a spread before then: the copy keeps the empty `dataUrl` (step details were blank PDF images this way).
- Cache keys are `JSON` of what a drawing depends on plus the sorted part keys it shows, never `step.number` (inserting a step would invalidate every later one). A run's cache entries are kept only if the run finishes (`commit`); a stopped run keeps the previous run's.
- First run of a 60-part scene under SwiftShader: about 80 s with no main-thread long tasks; the same scene unchanged: about 2 s.
- Guide viewer: turn scroll snapping off before any flight. Chrome treats a page's transformed box as its snap area, so a page flying back to the thumbnail made the viewer re-snap mid-flight and the page landed in the wrong place (only when scrolled past page 1). Zooming above 100% also turns snapping off.
- Guide viewer flights measure the thumbnail at open with its hover lift and tilt (it's under the pointer), and at close as it rests (hidden, untilted).
