# Verification methods and industrial design language for small printable humanoids (Oct 2026)

Scope note: Part A covers engineering checks that can be computed automatically from a CAD assembly (joint tree, meshes, masses). Part B covers the design language of friendly humanoids. Anything under "Inferences" is either my engineering synthesis or standard textbook practice that I did not re-verify with a fetched source in this session. It is marked so the report writer can tell sourced facts from proposed defaults.

## A1. Static joint torque from a kinematic tree, and actuator sizing (ToddlerBot, Berkeley Humanoid Lite, Disney BDX; safety factors)

### Takeaway
Static joint torque is the gravity term g(q) of the manipulator equation, plus J^T F for any contact or payload wrench. It can be computed per joint by summing moments of subtree masses about the joint axis and maximized over sampled poses. Small open humanoids size actuators by scaling human torques (ToddlerBot) or by checking simulated gait torques against the actuator's limits (Disney BDX). Berkeley Humanoid Lite's locomotion used only about 30% of its actuators' torque limit, which implies roughly a 3× margin over walking loads. I found no published safety factors for walking, squatting or standing up from a fall in these papers.

### Cited Findings
- Robot statics is τ = Jᵀ(θ)F (space or body frame). If a wrench −F is applied to the last link, the joints must supply τ = JᵀF to resist it. If J has rank k < 6, some wrench components are carried by the bearings, not the motors. — [Modern Robotics slides ch5b](https://hades.mech.northwestern.edU/images/d/d5/MRslides-ch05b.pdf); [Modern Robotics 5.2 Statics of Open Chains](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-2-statics-of-open-chains)
- The standard dynamics form is M(θ)θ̈ + c(θ, θ̇) + g(θ) = τ, where g(θ) is the gravity (potential) term. It can be derived with the Lagrangian or the more efficient recursive Newton-Euler method. — [Modern Robotics slides ch08a](https://hades.mech.northwestern.edU/images/6/6a/MRslides-ch08a.pdf)
- **ToddlerBot torque estimation (Eq. 5):** τ_robot = (h_robot·m_robot)/(h_human·m_human)·τ_human, with human reference torques from Grimmer et al. for running and slope climbing. It assumes 0.5 m and 3.1 kg; the built robot is 0.56 m and 3.4 kg. Results: knee 2.35 Nm, ankle pitch 2.66 Nm, hip pitch 1.77 Nm. No safety factor is stated. — [ToddlerBot arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- **ToddlerBot motors (stall torque at 12 V):** XC330-T288 1.0 Nm (neck, waist yaw, hip yaw, gripper); XC430-T240BB 1.9 Nm (shoulder pitch, ankle roll); XM430-W210 3.0 Nm (knee, ankle pitch); 2XL430-W250 1.5 Nm (shoulder roll/yaw, elbow, wrist); 2XC430-W250 1.8 Nm (hip roll/pitch). The torque limits identified by system ID are much lower than stall: 0.94 / 0.76 / 1.32 / 1.09 / 1.61 Nm for 2XL430 / XC330 / XC430 / 2XC430 / XM430. — [ToddlerBot](https://arxiv.org/html/2502.00893)
- **ToddlerBot mass budget:** 3100 g = 30 motors × 50 g + 600 g (computer, battery, camera) + 1000 g (printed structure and metal hardware). — [ToddlerBot](https://arxiv.org/html/2502.00893)
- ToddlerBot ruled out small BLDC motors (smaller windings mean lower current capacity and torque constant, and they still need high-ratio gearboxes) and linear actuators (insufficient power density, low control frequency). — [ToddlerBot arXiv PDF](https://arxiv.org/pdf/2502.00893)
- **Berkeley Humanoid Lite:** 16 kg, 0.8 m, PLA FDM cycloidal gearboxes on 6512 and 5010 drone BLDC motors. In locomotion the policy used "only 30% of the actuator's torque limit." The paper does not say how torque requirements were set. — [Berkeley Humanoid Lite arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- **Berkeley Humanoid Lite comparison metric:** performance factor p̂ = (1/(N·h·m·g))·Σ|τᵢ_max|, the average peak torque over all N actuated DoF normalized by height h and weight m·g. Performance per dollar φ = p̂ / cost. — [Berkeley Humanoid Lite](https://arxiv.org/html/2504.17249)
- **Berkeley Humanoid Lite durability test:** a 6512 actuator swung a 0.5 kg, 0.5 m pendulum from −45° to +90° at 0.5 Hz for 60 h with no failure. Backlash grew slightly but stayed "within acceptable limits." Transmission stiffness was about 319.49 Nm/rad. — [Berkeley Humanoid Lite](https://arxiv.org/html/2504.17249)
- **Disney BDX bipedal character:** 0.66 m (without antennas), 15.4 kg (torso 5.8, neck and head 2.4, each leg 3.6 kg), 5 DoF per leg plus a 4-DoF neck. Actuators: 34 Nm / 20 rad/s (hips and knee), 24 Nm / 30 rad/s (hip rotation, ankle, lower neck), 4.8 Nm / 6.3 rad/s (head). Joint positions, velocities and torques from the gait tool "feed back into the mechanical design to refine geometry, select actuators, and perform structural analysis." No margins are stated. — [Disney, Design and Control of a Bipedal Robotic Character, arXiv 2501.05204](https://arxiv.org/html/2501.05204)
- **Fauna Sprout:** actuators are "selected and tuned on a per-joint basis" with backdrivable motors and "conservative joint torque limits." Arm payloads are given as max / nominal / rated (e.g., bent elbow 11.2 / 5.0 / 1.1 kg; rated holds indefinitely). — [Fauna Sprout arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- General motor-sizing guides cite safety factors of 1.5–2 ([ThinkRobotics](https://thinkrobotics.com/blogs/learn/basics-of-motor-sizing-and-selection-for-robots-a-complete-engineering-guide)) or 1.3–1.8 ([hobbyist guide](https://hackaday.io/project/158770/log/147542)). These are generic, not humanoid-specific.

### Inferences
- **Static gravity torque algorithm (standard; implementable):** for each joint j with unit axis ẑ_j at point p_j, τ_j(q) = ẑ_j · Σ_{i ∈ subtree(j)} (c_i(q) − p_j) × (m_i·g), where c_i is the world CoM of link i, g = (0, 0, −9.81) in a Z-up frame, and the payload is added as an extra point mass at the gripper. This is the static case of recursive Newton-Euler: one pass from the leaves to the root accumulating subtree mass and first moment (Σm_i, Σm_i·c_i) gives every joint's τ in O(n).
- **Stance legs need the tree re-rooted at the foot.** With the base floating, a leg's joints carry the whole body above them, not the leg below. Two equivalent options: (a) re-root the tree at the stance foot so the "subtree" of a knee is everything above it, or (b) keep the pelvis root, solve the ground reaction F (total weight split between feet in proportion to the CoM's position between them), and use τ = J_footᵀF − g_leg(q). Single-leg stance (the full body weight on one leg) is the walking worst case.
- **Worst-case poses to sample:** (1) single-leg stance across hip and knee ranges; (2) a deep squat (knee 90–120°, CoM over the feet), usually the knee and hip-pitch maximum; (3) arms straight out horizontally holding the payload (shoulder pitch maximum); (4) get-up poses: kneeling, hands-and-knees, and sitting-to-stand. Sample a coarse grid (e.g., 10–15° steps) or 5–10k random poses within joint limits, keep only poses whose CoM projection lies inside the support polygon, and report max |τ_j| with the pose that caused it.
- **Proposed acceptance thresholds (my synthesis):** static worst case ≤ 0.5 × the actuator's usable continuous torque (for Dynamixels, the system-ID limit, not the stall rating); walking dynamic peaks are about 1.5–2× static. Berkeley Humanoid Lite's 30% usage in walking suggests aiming for ~3× headroom over walking loads for printed gearboxes. ToddlerBot's knee (2.35 Nm needed vs 1.61 Nm identified limit / 3.0 Nm stall) shows small Dynamixel robots run close to their limits, so flag less than 1.3× as an error and 1.3–2× as a warning.
- Use the stall or "peak" rating only for short events (fall recovery), and the system-ID or continuous value for standing and walking. Datasheet stall torque overstates usable torque by about 1.6–2× on ToddlerBot's motors (compare its Table 2 with Table 3).
- Also report p̂ (Berkeley's normalized torque) so designs of different sizes can be compared.

### Gaps
- No primary source found for Poppy, ROBOTIS OP3 or LeRobot SO-100 actuator sizing methods.
- No published safety factors found for walking, squatting from a crouch or fall recovery. The 1.5–3× range in the brief is not confirmed by these papers.
- Grimmer et al.'s human reference torque values were not retrieved.

## A2. Mass properties from printed volume × density, plus components; inertia tensors

### Takeaway
ToddlerBot's mass budget shows printed structure is about a third of a small robot's mass (1.0 of 3.1 kg), with motors about half. So per-part mass needs a shell-plus-infill model, not solid volume × density. I found no fetched source giving the FDM mass model or PLA density. Below are standard formulas.

### Cited Findings
- ToddlerBot budget: 30 × 50 g motors + 600 g electronics + 1000 g printed structure and hardware = 3100 g; measured with payload 3484 g. — [ToddlerBot](https://arxiv.org/html/2502.00893)
- ToddlerBot argues printed plastic can match aluminum at this scale with a beam-deflection argument (Section 8.1). — [ToddlerBot](https://arxiv.org/html/2502.00893)
- MuJoCo infers body inertia from attached geoms when inertia is not specified (`inertiafromgeom`); PickNik suggests treating those values as a starting point and checking them with MuJoCo's inertia visualization. — [MuJoCo Modeling](https://mujoco.readthedocs.io/en/stable/modeling.html); [PickNik MuJoCo migration guide](https://docs.picknik.ai/how_to/configuration_tutorials/create_robot_sim_config/migrate_to_mujoco_config/)
- ToddlerBot identifies motor armature (rotor inertia reflected through the gearbox) from spin-down energy: I = 2E/ω². — [ToddlerBot](https://arxiv.org/html/2502.00893)

### Inferences
- **FDM mass model (proposed):** m = ρ·[V_shell + f·(V − V_shell)], where V is the closed mesh volume, V_shell ≈ A·t_wall (A is surface area; t_wall = perimeters × line width for side walls, and top/bottom layers × layer height for horizontal faces), and f is infill fraction. Typical slicer defaults are 2–3 perimeters of 0.42–0.45 mm and 15–20% infill; for walls thinner than 2·t_wall the part is effectively solid. Commonly published densities (not verified here): PLA ≈ 1.24 g/cm³, PETG ≈ 1.27, ABS ≈ 1.04, PA-CF ≈ 1.1–1.2. Compute the shell CoM and the infill CoM separately: for a thin-walled shell the CoM sits nearer the surface-area centroid than the volume centroid.
- **Inertia from meshes:** use the closed-triangle-mesh integration of volume, first and second moments (signed tetrahedra from the origin, Mirtich/Eberly method). Model a part as solid inertia at density ρ_eff = m/V, or as shell + core: I = I_solid(ρ·f) + I_shell, with I_shell from the surface integral × t_wall × ρ. Combine parts with the parallel-axis theorem: I_body = Σ [R_i I_i R_iᵀ + m_i((d_i·d_i)E − d_i d_iᵀ)].
- **Components:** use datasheet masses (servo, battery, board) placed at their mesh's volume centroid unless the maker gives a CoM. Fasteners can be estimated from ISO dimensions × steel density (7.85 g/cm³).
- **Checks to run:** total mass within ±10% of the budget; every link's inertia positive definite and satisfying the triangle inequality (I_xx + I_yy ≥ I_zz and permutations), which MuJoCo enforces; no link lighter than ~1 g (simulation instability); arms + head under ~25% of total mass so the CoM stays low (heuristic).

### Gaps
- No fetched source for PLA/PETG densities or a published infill mass model; values above are commonly cited but unverified in this session.
- No fetched source for mesh-inertia algorithms (Mirtich 1996 / Eberly) or MuJoCo's mesh `inertia="shell"` option text (the XML reference fetch was truncated).

## A3. Static stability, ZMP, foot size and CoM height

### Takeaway
The standard static check is that the CoM's ground projection lies inside the convex hull of the contact points (the support polygon), with a margin equal to the shortest distance to its edge. ZMP extends this to walking: the ZMP must stay inside the support polygon. I found no published rule tying foot size to leg length. Thresholds below are engineering defaults.

### Cited Findings
- A common stability criterion treats a motion as stable while the ZMP stays inside the convex hull of the contact points (the support polygon). The criterion is conservative. — [Dynamic Walking: Toward Agile and Efficient Bipedal Robots, arXiv 2010.07451](https://arxiv.org/pdf/2010.07451)
- The stability margin is the minimum distance from the ZMP to the support-zone boundary. — [Metal Journal MMI 2015 (Xuhui Sun)](https://www.metaljournal.com.ua/assets/Journal/english-edition/MMI_2015_9/008_Xuhui-Sun.pdf)
- Foot breadth and length can be sized from the ZMP excursions of a planned motion. — [JAMRIS 2012](https://yadda.icm.edu.pl/baztech/element/bwmeta1.element.baztech-article-BUJ8-0023-0071/c/httpwww_jamris_org042012saveas_phpquestjamrisno042012p36-44.pdf)
- Static walking must be slow enough to keep the CoM projection inside the polygon, and big feet are generally used to ensure that. — [Atlantis Press](https://www.atlantis-press.com/article/24559.pdf)
- Disney BDX uses rounded soles with molded urethane foam: passive ankle roll with no ankle-roll actuator, plus impact damping. Nominal leg length 0.28 m (extended 0.34 m) on a 0.66 m robot. — [Disney arXiv 2501.05204](https://arxiv.org/html/2501.05204)

### Inferences
- **Support polygon:** gather the contact points of every foot sole at the floor (vertices within ~1 mm of the lowest point), take the 2D convex hull. CoM projection p = (x_com, y_com).
- **Static margin:** s = signed distance from p to the nearest hull edge (positive inside). Proposed thresholds: double stance s ≥ 15–20% of the polygon's smaller dimension; single stance s ≥ 5 mm for robots under 0.6 m.
- **Tipping angle about edge e:** θ_tip = atan(d_e / h_com), where d_e is the horizontal distance from p to edge e and h_com is CoM height. The smallest θ_tip over all edges is how far the robot can be tilted (or the floor sloped) before it falls. Proposed: ≥ 10° in double stance.
- **ZMP (linear inverted pendulum, Kajita):** x_zmp = x_com − (z_c / g)·ẍ_com, and the same for y. For a gait with forward CoM acceleration a, the ZMP shifts by (z_c/g)·a, so the foot must extend at least that far beyond the CoM in front and behind. Given a step time and stride from the planned gait, this gives a minimum foot length.
- **Foot-size heuristic (from proportions, not a published rule):** foot length ≈ 0.35–0.45 × leg length and foot width ≈ 0.4–0.5 × foot length for small position-controlled bipeds. Lateral stance width sets single-stance lateral sway. Report these as warnings, not errors.
- **CoM height:** a lower z_c widens the allowed ZMP excursion for a given acceleration (shift = z_c·a/g). Report h_com / height (typically ~0.5–0.6 for humanoids) and flag heavy heads or high batteries.

### Gaps
- No published foot-to-leg ratio found for small bipeds (ROBOTIS OP3, Nao, ToddlerBot) in fetched sources.
- Kajita's LIPM ZMP equation is cited from textbook knowledge, not fetched here.

## A4. Joint sweep and range-of-motion collision checking

### Takeaway
Published small humanoids handle self-collision mainly through geometry: ToddlerBot shaped each link around human-like ranges and limited specific joints (e.g., shoulder roll ≤ 90°). An automatic check can sample joint angles and test mesh-mesh interference with a BVH, skipping parent-child pairs that legitimately touch at the joint.

### Cited Findings
- ToddlerBot optimized link geometries "to prevent self-collisions" for each DoF using human biomechanics. Shoulder roll is limited to 90° (the same hand-up pose comes from shoulder pitch). Ankle pitch extension partly makes up for a 40° gap in knee pitch. The RL reward includes a collision term (weight 0.1). — [ToddlerBot](https://arxiv.org/html/2502.00893)
- MuJoCo convexifies mesh geoms for collision. — [MuJoCo Modeling](https://mujoco.readthedocs.io/en/stable/modeling.html)
- MuJoCo has a `contact/exclude` element (body1, body2) and an `option/flag/filterparent` flag; a common onshape-to-robot preset sets `filterparent="disable"` and `fusestatic="false"` to allow collision detection with static parts. — [MuJoCo XML reference (index)](https://mujoco.readthedocs.io/en/stable/XMLreference.html); [pib-rocks MuJoCo URDF notes](https://pib-rocks.atlassian.net/wiki/x/AwCLCg)

### Inferences
- **Algorithm:** for each joint, sweep its range at 2–5° steps with the other joints at zero; then sample pairwise sweeps for adjacent joints (hip pitch × knee, shoulder × elbow) and random whole-body poses (1–5k). At each pose, transform each link's mesh and test all link pairs except the parent-child pair at the moving joint (and any pair touching at the zero pose, recorded as an allowed baseline) with a BVH (three-mesh-bvh `intersectsGeometry` or GJK on convex hulls).
- **Outputs:** per joint, the achievable range before the first collision vs the declared limit, the colliding link pair, and the clearance at the declared limits (minimum mesh distance).
- **Proposed thresholds:** clearance ≥ 1.0 mm at the declared limits for printed parts (FDM tolerance is about ±0.5 mm to ±1 mm, see A5); ≥ 2 mm between soft covers and adjacent links; and every declared limit within the collision-free range. Separately, flag any gap under ~8 mm that closes during a sweep as a finger pinch point (heuristic for friendly robots).
- **Simulation export:** add `<exclude>` pairs only for parent-child links that legitimately overlap, so MuJoCo still catches knee-to-thigh collisions.

### Gaps
- No fetched source for specific self-collision margins or pinch-point gap standards (e.g., ISO 13854 minimum gaps for fingers); worth a separate lookup.

## A5. Fabrication and assembly checklists (auto-designed robots, DFMA, FDM rules)

### Takeaway
Auto-design pipelines (Text2Robot) filter candidates with explicit checks: continuous structure, bilateral symmetry, watertight printable meshes, joint placement from geometry and CoM, and electronics fitting inside. Boothroyd-Dewhurst DFA gives a quantitative score: design efficiency compares the theoretical minimum part count with estimated assembly time. FDM guides give numeric wall and clearance rules.

### Cited Findings
- **Text2Robot (Duke):** text-to-3D body shapes must pass checks for continuous structure, bilateral symmetry and a four-legged configuration; invalid meshes are discarded. Meshes are repaired to be watertight and printable, joints are placed from geometry and CoM, and electronics are fitted into the body. Printed on a Creality CR-10 Smart Pro with Hiwonder HTD-45H bus servos; modular design lets assembly take minutes. — [Text2Robot arXiv 2406.19963](https://arxiv.org/abs/2406.19963v3); [Duke Pratt](https://pratt.duke.edu/?p=117308)
- Related LLM design work: a three-agent system (Task Analyst, Robot Designer, RL Designer) produces feasible robots and control strategies ([CVPRW 2025, arXiv 2505.05762](https://arxiv.org/html/2505.05762v1)); RobotDesignGPT uses VLMs for design synthesis ([arXiv 2601.11801](https://arxiv.org/pdf/2601.11801)); LLM soft modular robot design uses simulator feedback in a loop ([arXiv 2411.00345](https://arxiv.org/pdf/2411.00345)).
- **DFA (Boothroyd-Dewhurst):** the theoretical minimum part count lets designers quickly see which parts the end function needs. Criteria for keeping a part include base part or chassis, relative movement, different material, and assembly or disassembly of other items. Design efficiency E = N_min·t₀ / t_total, with t₀ ≈ 3 s per ideal part (another source says 2.93 s). — [Wevolver DFMA explainer](https://www.wevolver.com/article/dfma-design-for-manufacturing-and-assembly-explained); [Clemson DETC2011-47530](https://cecas.clemson.edu/cedar/wp-content/uploads/2017/03/DETC2011-47530.pdf); [dfma.com Dewhurst presentation](https://www.dfma.com/forum/2019pdf/dewhurstpres.pdf)
- **FDM rules:** walls ≥ 0.8 mm (2 × 0.4 mm nozzle), and 0.8 mm is fragile ([Hubs forum](https://www.hubs.com/talk/t/printability-feedback-1mm-for-fdm/9909)); ≥ 0.75–1.0 mm or 3× nozzle ([Xometry](https://xometry.pro/en/?p=22061)). Clearances: snap-fit 0.3–0.5 mm ([Hubs forum](https://hubs.com/talk/t/feedback-request-for-upcoming-fdm-quality-guidelines/8425/90)); sliding fit 0.2–0.3 mm ([Xometry](https://xometry.pro/en/?p=22061)); 0.4–0.5 mm as an untested starting point ([GrabCAD](https://grabcad.com/tutorials/fused-deposition-modeling-fdm-design-guidelines)). FDM holes come out undersized and tight holes are drilled or reamed ([Stratasys FDM guidelines](https://www.secs.oakland.edu/~latcha/ME4999/fdm_design_guidelines_2017-1.pdf)). A draft Hubs quality guideline gave ±1 mm or 1%, whichever is greater ([Hubs forum](https://hubs.com/talk/t/feedback-request-for-upcoming-fdm-quality-guidelines/8425/90)).
- Berkeley Humanoid Lite reinforces printed parts with through-screws and an embedded brass hex standoff in the input shaft; one outlet says its 22 gearboxes fit a 200 × 200 × 200 mm printer (single source). — [Berkeley Humanoid Lite](https://arxiv.org/html/2504.17249); [Interesting Engineering](https://interestingengineering.com/ai-robotics/new-3d-printed-berkeley-humanoid-lite)

### Inferences
- **Automatic fabrication checklist (proposed):**
  1. Every printed part is watertight and manifold, one shell, positive volume.
  2. Fits the build volume (e.g., 220 × 220 × 250 mm) in some orientation; report the best orientation.
  3. Minimum wall ≥ 1.2 mm on structural parts (3 perimeters), ≥ 0.8 mm on covers (ray-cast thickness sampling along inward normals).
  4. Overhangs > 45° from vertical in the chosen print orientation flagged as needing support, as area.
  5. Mating clearances: 0.2–0.3 mm sliding, 0.3–0.5 mm snap-fit, measured as minimum distance between declared mating faces.
  6. Holes for screws: clearance diameter per ISO 273 (M3: 3.4 mm medium), heat-set insert pilot per insert maker; bosses ≥ 2× hole diameter outer.
  7. Load paths: high-load joints (hip, knee) use bearings or metal shafts, not plastic-on-plastic pins.
  8. Electronics fit: every component's bounding mesh inside an enclosure with ≥ 1 mm clearance; cable path exists through each joint (a hole ≥ connector size near the axis).
  9. DFA score: N_min / N_actual and E = 3·N_min / t_est, using a fixed time per screw (~8–10 s) and per snap-fit (~2–3 s) as estimates.
- **Screw accessibility (proposed algorithm):** for each fastener, cast a cylinder (driver shank, e.g., Ø 6 mm for an M3 hex key, plus a 10–15° cone for the hand) from the screw head outward along its axis for ~80–100 mm. The screw is accessible if that volume doesn't intersect parts installed before it.
- **Assembly order feasibility:** build the precedence graph by testing removal ("disassembly by removal"): a part can come off last if some straight-line direction (try ±X, ±Y, ±Z and the fastener axes) frees it from collision with the remaining parts. Repeat; if no part can be removed at some step, the assembly is infeasible (or needs flexible parts/snap fits).

### Gaps
- I found no "Agentic Robot Creation" paper from ShanghaiTech (2026), and did not research RoboMorph or ArtiCAD checklists in detail; their exact checks remain unverified.
- The three classic DFA minimum-part questions were not quoted verbatim by a fetched primary source; the Wevolver/Dewhurst criteria above approximate them.
- No fetched source for tool-access-cone geometry or published screwdriver clearance standards.

## A6. URDF/MJCF export from CAD for MuJoCo standing/walking checks

### Takeaway
A simulation-ready model needs, per link: mass, CoM, a positive-definite inertia tensor, visual and collision geometry; per joint: type, axis, origin, limits, plus actuator torque limits, armature, damping and friction. The main pitfalls are welded bodies (missing joints), visual meshes discarded by default, convexified collision meshes, coupled transmissions, and actuator models that use stall torque.

### Cited Findings
- MuJoCo pitfalls: a body with no joints is welded to its parent, so a missing joint silently removes a DoF; defaults are inherited; `solref` defaults to (0.02, 1) and its timeconst must be at least twice the timestep (enforced unless `refsafe` is disabled); `solimp` defaults to (0.9, 0.95, 0.001, 0.5, 2). `position` actuators use `kp` as gain; `forcerange` clamps actuator output; `actuatorfrcrange` on a joint clamps the total from all actuators on it. — [MuJoCo Modeling](https://mujoco.readthedocs.io/en/stable/modeling.html)
- MuJoCo's URDF import discards visual meshes by default and uses collision meshes; `discardvisual="false"` keeps them. `fusestatic="false"` stops fixed joints merging into their parents. A common onshape-to-robot preset sets `meshdir`, `discardvisual="false"`, `fusestatic="false"`, `filterparent="disable"`. — [PickNik MuJoCo migration](https://docs.picknik.ai/how_to/configuration_tutorials/create_robot_sim_config/migrate_to_mujoco_config/); [pib-rocks MuJoCo URDF notes](https://pib-rocks.atlassian.net/wiki/x/AwCLCg)
- ToddlerBot models spur-gear transmissions with joint equality constraints, coupled bevel gears with fixed tendons and parallel linkages with weld constraints in MuJoCo, and lists inaccurate simulation of these as a drawback. — [ToddlerBot](https://arxiv.org/html/2502.00893)
- ToddlerBot actuator system ID: damping and friction loss from backdriving at constant RPM; armature from spin-down (I = 2E/ω²); nine parameters fit to chirp tracking data (1.3° mean error); passive-to-active ratio about 3 (about 58% gearbox efficiency); encoder 0.09°. Motor temperature isn't modeled. — [ToddlerBot](https://arxiv.org/html/2502.00893)
- Disney BDX used Isaac Gym with custom actuator models identified on a test bench; mean tracking error 0.035 rad standing, 0.123 rad walking. — [Disney arXiv 2501.05204](https://arxiv.org/html/2501.05204)
- Berkeley Humanoid Lite trained a PPO policy in Isaac Gym (observations: base angular velocity, projected gravity, joint positions and velocities, commanded velocity, previous action), deployed as an MLP at 25 Hz with direct sim-to-real transfer. — [Berkeley Humanoid Lite](https://arxiv.org/html/2504.17249)
- Fauna Sprout ships USD, URDF and MJCF in its SDK; actuator models were refined from manufacturer specs, dynamometer data and real-data optimization. — [Fauna Sprout arXiv](https://arxiv.org/html/2601.18963v1)

### Inferences
- **Minimal data to export (proposed):** per link: name, mass (A2), CoM, full inertia tensor, visual mesh (STL/OBJ in metres), collision geometry (convex hull per printed part or primitives for feet); per joint: parent, child, origin xyz/rpy, axis, type (revolute), lower/upper limits from A4, velocity limit, effort limit = the identified/continuous torque (not stall), damping, frictionloss, armature (rotor inertia × gear ratio²); actuators: `position` with `kp`, `forcerange` = effort limit, `ctrlrange` = joint limits.
- **Feet:** use boxes or capsules matching the sole outline for collision instead of the visual mesh, so contact is stable; set `condim="3"` or 6 and friction ~0.8–1.0 (heuristic).
- **Automatic sim checks:** (1) stand at zero pose with position actuators holding for 5 s at a 0.002 s timestep: pass if base height drops < 5% and the trunk tilts < 5°; (2) the same with a small push (e.g., 0.2·m·g for 0.1 s): pass if it recovers; (3) log joint torques during stand and a scripted squat: compare against effort limits (A1 thresholds); (4) quasi-static walking replay of a planned CoM/ZMP trajectory if a gait is available.
- **Frame conventions:** URDF/MuJoCo are Z-up, metres, kilograms, radians. Export in SI even if the CAD works in mm (a 1000× scale error in inertia is a classic failure).

### Gaps
- The MuJoCo XML reference text for `balanceinertia`, `boundmass`, `boundinertia` and mesh `inertia` modes (convex/exact/shell) could not be retrieved (page too long); check the compiler section directly.
- ToddlerBot's CAD-to-URDF export workflow is not described in the paper text retrieved.

## B1. Fauna Robotics Sprout: visual design

### Takeaway
Sprout is a 1.07 m, 22.7 kg developer humanoid wrapped in sage-green foam with a gently curved body and muted matte finish. It has a wide rectangular head with a white face panel, two motorized antenna-like eyebrows and an LED array instead of a screen, and yellow-green accent joints. It cites WALL-E, Baymax and Rosie Jetson as inspirations, and reads "more product than android."

### Cited Findings
- 107 cm tall, 45 cm wide, 21 cm deep, 22.7 kg; 29 DoF including 2 eyebrows; 46.8 V battery, 3–3.5 h runtime; swappable battery and a rear handle. — [Fauna Sprout arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- Short stature keeps it below adult eye level and limits kinetic energy in contact. — [Fox News](https://www.foxnews.com/tech/humanoid-robots-getting-smaller-safer-closer); [urdesignmag](https://www.urdesignmag.com/fauna-robotics-sprout-humanoid-robot-design-indoor-social/)
- "Wrapped in sage-green foam"; design intent is to convey safety and playfulness "through Sprout's gently curved body and muted matte finish." — [search summary of AP/TechSpot coverage](https://www.techspot.com/news/111106-new-york-startup-builds-foam-covered-humanoid-inspired.html) (page returned 403 to direct fetch; the quote comes from the search snippet)
- Inspiration: CEO Rob Cochran cites WALL-E, Baymax and Rosie Jetson; VP of hardware Anthony Moschella said most prototype humanoids look built for factories, not living rooms. — [TechSpot](https://www.techspot.com/news/111106-new-york-startup-builds-foam-covered-humanoid-inspired.html) (via search snippet)
- **Head:** wide, rectangular, with a white face panel; two stereo cameras on the face; reads "more product than android." Two independent motorized antenna-like eyebrows show surprise, attention, curiosity and calm. — [urdesignmag](https://www.urdesignmag.com/fauna-robotics-sprout-humanoid-robot-design-indoor-social/)
- **Face hardware:** LED array, motorized eyebrows and an articulated neck for gaze; four-mic array and speakers. The head supports "cosmetic customization using standardized interlocking toy brick components." — [Fauna Sprout arXiv](https://arxiv.org/html/2601.18963v1)
- Eyebrows "rise and fall" and lift when joyful; LED light animations surround the face. — [designboom](https://www.designboom.com/technology/portable-humanoid-robot-antenna-eyebrows-light-animations-sprout-fauna-robotics/)
- **Colors and parts:** yellow-green accent joints at shoulders and hips; grippers with mint-green and dark-grey fingers and a yellow wrist joint; mint-green ankles with yellow-green rubber soles; the Fauna logo embossed on the ankle discs; aluminum and composite frame under the padding. The article's text says silver-grey body tones while its photo captions say mint-green. Its palette is closer to consumer electronics than the matte-black industrial humanoids, and its proportions are compared to Pixar characters. — [urdesignmag](https://www.urdesignmag.com/fauna-robotics-sprout-humanoid-robot-design-indoor-social/). Other coverage says sage-green ([TechSpot via search](https://www.techspot.com/news/111106-new-york-startup-builds-foam-covered-humanoid-inspired.html)), which supports green over silver-grey.
- **Safety by design:** soft, deformable exterior panels, minimized pinch points, backdrivable motors with conservative torque limits, grip force limited in software to 12 N, time-of-flight obstacle sensors, E-stop; designed to "fall, crawl, and recover without damaging delicate end effectors." — [Fauna Sprout arXiv](https://arxiv.org/html/2601.18963v1)
- Animal-inspired, animated character look rather than industrial. — [Robixone review](https://robixone.com/robots/fauna-robotics-fauna-sprout/) (secondary)

### Inferences
- From 107 × 45 × 21 cm, Sprout's depth-to-width ratio is 0.47 and width-to-height 0.42: a shallow, wide-shouldered body, which reads as stocky and child-like rather than slender.
- The design pattern for an AI agent: one soft-colored body material (matte foam), one contrasting accent color reserved for joints and contact points (soles, wrist), a white face panel framed by the head shell, and expression through a few mechanical features (eyebrows) instead of a screen.

### Gaps
- No exact head:torso:leg proportion numbers, foam material, foam thickness or color codes are published in the sources found. Measure from official images (faunarobotics.com news page) if needed: [Fauna announcement](https://www.faunarobotics.com/news/fauna-robotics-launches-sprout-the-easiest-way-to-build-with-humanoids).
- The urdesignmag silver-grey vs mint-green conflict is unresolved.

## B2. Industrial design principles for friendly robots (NEO, Figure 03, Disney BDX, others)

### Takeaway
The current friendly-humanoid language is soft goods over a hard frame (foam and textiles, tool-less removable and washable), muted furniture-like colorways, below-eye-level stature for small robots, expression through a few dedicated "show" features (eyebrows, antennas, LED eyes) kept separate from the mechanics, and a larger head-to-body ratio for cuteness, without overdoing baby features.

### Cited Findings
- **1X NEO:** 5 ft 6 in, 66 lb, ships in a knit suit in one of three muted colorways and sits "closer to furniture than to equipment." Head of product and design Dar Sleeper rejected chrome-and-LED sci-fi styling, cited Syd Mead, and aimed for a visual quiet; "the references are more like feelings than visual references." — [Cool Hunting interview](https://coolhunting.com/design/1xs-dar-sleeper-wants-the-future-to-feel-familiar/)
- **Figure 03:** multi-density foam at pinch points; covered in soft textiles rather than hard machined parts; soft goods fully washable and removable without tools; optional clothing in cut-resistant materials; 9% less mass and much less volume than Figure 02. — [Figure, Introducing Figure 03](https://figure.ai/news/introducing-figure-03); [Robotics 24/7](https://www.robotics247.com/article/figure_ai_releases_figure_03_its_third_generation_humanoid_robot)
- **Disney BDX:** mechanics are "primarily driven by creative intent and simplicity rather than functional requirements." Animators set proportions and ranges with a rig first; backward-bending knees "as creatively envisioned"; show functions (actuated antennas, LED-array eyes, head lamp) are open-loop and separate from the main actuators so they can be added or removed. — [Disney arXiv 2501.05204](https://arxiv.org/html/2501.05204)
- **Head ratio and cuteness:** a 2025 VR study found a small robot with a larger head-to-body ratio is perceived as cuter, and appearance changes shift its perceived age. — [Guidi et al. 2025, Behaviour & IT](https://ideas.repec.org/a/taf/tbitxx/v44y2025i6p1136-1145.html). Kindchenschema features: relatively large head, large brain capsule, large low-set eyes; for some robot types an excessively high baby schema can backfire. — [NTUST thesis](https://etheses.lib.ntust.edu.tw/thesis/detail/c9808a2fce42db34573633bf2b52614a/)
- Cuteness correlates with positive emotions and caretaking tendencies (152 participants, ABOT images). Baby-schema avatars were rated cuter, more likable and approachable than mature ones (485 participants, Israel and Japan), though preferences vary by culture. — [MDPI Behavioral Sciences 2024](https://www.mdpi.com/2076-328x/14/1/68); [Springer AI & Society 2024](https://link.springer.com/article/10.1007/s00146-024-01878-3/fulltext.html)

### Inferences
- **Proposed measurable style rules for friendly small humanoids (synthesis):**
  - Head height 18–25% of total height (adult humans are about 13%; Sprout-like and BDX-like characters are visibly larger); eyes in the lower half of the face; face panel inset from the head shell.
  - Stature below adult eye level; wide, shallow torso (depth/width ≈ 0.45–0.6).
  - CMF: one main body color (muted, matte, mid-to-light value), one accent color for joints and contact points, one dark neutral for mechanisms and gaps, white or near-black face panel. No more than three colors plus the face.
  - Soft goods or soft-touch shells at contact zones (hands, forearms, knees, torso front), with foam density highest at pinch points (Figure 03).
  - Express emotion through 1–3 dedicated, mechanically separate features (eyebrows, antennas, LED eyes) rather than a screen face.
  - Joint covers: round discs or domes centered on joint axes (Sprout's ankle discs carry the logo), so rotation reads as intentional.

### Gaps
- Apptronik Apollo, Unitree R1, Pollen Reachy 2, Anki Vector, Sony aibo and Boston Dynamics Spot were not researched in this session (tool-call limit); no sourced CMF or construction details for them here.
- No published numeric head-ratio threshold for "friendly" was found.
- Figure 03 and NEO material specs (foam densities, textile types) are not published beyond company statements.

## B3. What makes CAD look amateur vs professional (split lines, gaps, fillets, fasteners)

### Takeaway
Professional surfaces read through consistent highlights: curvature-continuous (G2) blends rather than plain tangent fillets, split lines placed early during form division, parallel split lines with small constant gaps and no flush offset, and equal edge distances. I found no published consumer-electronics numeric gap spec (e.g., 0.3–1 mm). Numbers below are proposed defaults.

### Cited Findings
- Tangent (G1) fillets only guarantee matching highlights at the boundary, with no guarantee the highlight flows without a peak; a curvature comb shows a step. G2 means the surfaces touch, are tangent and have the same curvature where they meet. — [Autodesk Alias, Curvature Continuity](https://help.autodesk.com/cloudhelp/2014/ENU/Alias/files/GUID-9DD73E22-A5EF-4952-BB84-2CEE2109993C.htm); [Onshape Surface Modeling](https://cad.onshape.com/help/Content/PartStudio/surface_modeling.htm)
- Edge blends on surfaces that aren't G2 give contact curves that aren't G1, and blend corners often surprise users. — [Siemens Solid Edge blog](https://blogs.sw.siemens.com/solidedge/the-secret-language-of-surface-design/)
- Gap is measured perpendicular to the surface normal between two parts; flush is the offset along the normal. — [Design Society, Virtual verification of split lines](https://designsociety.org/download-publication/24167/VIRTUAL+VERIFICATION+OF+SPLIT+LINES+WITH+GIVEN+REFERENCES)
- Parallel split lines with small gaps and no flush are usually the desirable outcome; a hidden split line matters little for visual quality. Split lines usually come from industrial design's early form-division work. — [Chalmers, GVMEA for Split Lines](https://research.chalmers.se/en/publication/519817); [Chalmers, Robust Form Division](https://research.chalmers.se/en/publication/50661)
- The distance between all edges should be equal across a product for an aesthetically balanced structure (ICED 2003). — [Design Society, Form division in automotive body design](https://www.designsociety.org/download-publication/19039/form_division_in_automotive_body_design-linking_design_and_manufacturability)
- Figure 03 replaces hard machined exterior parts with soft textiles. — [Figure](https://figure.ai/news/introducing-figure-03)

### Inferences
- **Checkable "professional" rules (proposed defaults for printed shells):**
  1. **Constant gaps:** 0.6–1.0 mm between adjacent printed shell panels (FDM tolerance is ±0.5 mm or worse, so smaller gaps will look uneven), with gap variation along a line ≤ ±0.2 mm and flush offset ≤ 0.3 mm. Measure by sampling points along each split line and computing perpendicular and normal offsets.
  2. **Split lines** follow feature lines (joint axes, the centerline, crease lines) or run straight/parallel to each other; no split line within 3 mm of and parallel to another edge (creates thin slivers).
  3. **Radius ladder:** use 3–4 radii only, in a ratio of about 2:1 (e.g., 1, 2, 4, 8 mm): large radii on main volumes, small on panel edges. Flag a part using more than ~5 distinct radii, and adjacent edges with radii differing by under 25% (looks like an accident).
  4. **Crowned surfaces:** large faces slightly convex (a crown of ~1–2% of span) rather than dead flat; flat faces read as cheap and show print sink.
  5. **Wall thickness** uniform within ±25% across a shell.
  6. **Alignment:** features (eyes, joint centers, panel breaks) share axes; left/right mirrored exactly; holes and vents on a grid.
  7. **Fasteners:** no screw heads on show surfaces (front of torso, face, top of head); fasteners from the back, underside or inside joints, or under removable covers and soft goods. Joints expressed as deliberate discs or domes centered on axes.
  8. **Intentional part breaks:** each shell part has a reason (print size, assembly access, color change, moving part); a break that splits a continuous surface for no reason is a defect (ties to DFA part count in A5).
  9. **Shading test:** render with an environment map (zebra stripes or reflections) and flag highlight breaks at blends, which reveal G1-only fillets.

### Gaps
- No published designer source (Dieter Rams, IDEO, Core77) was fetched with explicit amateur-vs-professional CAD rules; the list above is synthesis.
- No numeric consumer-product parting-gap standard (e.g., 0.3–1 mm) found in a primary source; the only molding number found is a flash-prevention tooling gap (three to five ten-thousandths of an inch), which is a different thing. — [CIPO patent 2399758](https://brevets-patents.ic.gc.ca/opic-cipo/cpd/fra/brevet/2399758/sommaire.html)
- Draft angles are irrelevant to FDM shells but matter if shells move to molding; not researched.
