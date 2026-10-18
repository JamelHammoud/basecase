# LLMs Designing Complete Physical Robots End to End (text brief to built hardware)

Research date: 2026-10-17. Scope: academic pipelines, builder write-ups, multi-agent engineering frameworks, commercial tools, and techniques a desktop CAD app (Claude Code writing OpenSCAD/replicad, placing catalog servos/boards, targeting a Bambu Lab P1S) could adopt. Each item says whether it was physically built or only simulated.

## Academic pipelines: Text2Robot, TU Delft/EPFL tomato gripper, RoboMorph, LASeR, RoboMoRe, Debate2Create, BesiegeField, agentic robot creation (pipeline, representation, what was fabricated, success rates)

### Takeaway
Only a handful of LLM/generative robot-design pipelines have built hardware: Text2Robot (4 printed quadrupeds), the 2023 ChatGPT tomato gripper (human-built), the October 2026 ShanghaiTech "Agentic Robot Creation" Gorilla (8x XL330, printed on a Bambu X1E), and a continuum-robot paper (AID-SR). None of them reports quantitative hardware results, and every built design needed manual correction or filtering. Most "LLM robot design" work (RoboMorph, LASeR, RoboMoRe, Debate2Create, BesiegeField) runs only in simulation and uses grammars, voxels or parametric URDFs, not fabrication-ready CAD.

### Cited Findings

**Text2Robot (Duke General Robotics Lab; arXiv 2406.19963, June 2024; ICRA 2025): BUILT (4 robots)**
- Four stages: text-to-3D mesh, mesh to kinematic model, evolutionary + RL co-optimization, then 3D printing and assembly. Authors: Ringel, Charlick, Liu, Xia, Chen. — [arXiv](https://arxiv.org/pdf/2406.19963)
- The text-to-mesh step uses Meshy, not an LLM writing CAD. The prompt template is "Quadrupedal walking robot resembling a" + a 1–3 word description. Several candidate meshes per prompt are filtered **by hand** for no disjoint bodies, bilateral symmetry and four legs. Mesh generation takes 1–2 min; URDF conversion takes 30 s. — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Mesh to URDF: Fusion 360 repairs the mesh and converts it to BREP. Every body is scaled to 6300 cm³ so all robots share the same initial mass. Joints are placed by slicing along y: cross-section minima become shoulders and maxima become knees (4 shoulders + 4 knees = 8 motors). Knees stop 2 cm above the ground, electronics sit in a central channel, and limbs are offset 4 cm to avoid self-collision. Each base design gets 30 variants (legs scaled in 0.5 cm steps, joint axes varied). — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Evolution keeps the top 100 robots and adds 100 per generation (50 mutation, 50 crossover). Mutation odds: limb length 15%, limb shape 15%, body shape 25%, joint axis 40%. Symmetry is enforced. Fitness is the RL reward. The inner loop is PPO in IsaacGym with 4096 environments and 2.46×10⁷ steps per robot ("a few minutes"). — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Fabrication: PLA on a Creality CR-10 Smart Pro. Each robot uses 8× Hiwonder HTD-45H 45 kg servos, a Raspberry Pi 4B, a 5200 mAh 3S LiPo, a DROK DC-DC converter and a Hiwonder TTL/USB board. Manufacturing takes "approximately a day"; assembly takes "minutes." — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Hardware test: simulated joint commands were played back open-loop at a goal speed of 0.1 m/s. The paper reports only "sufficient performance in locomotion and speed," with no measured speed or success rate. The authors call the sim-to-real transfer "primitive." — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Stated limits: manual mesh filtering and assembly, prompts fixed once optimization starts, quadrupeds with 8 motors only, and arched feet that snag on rough terrain. — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)
- Press: Duke says it goes from a few words to a walking robot within a day. It won first place (innovation) at the ALife Virtual Creatures Competition. WUNC notes the designs are mostly animal-like (frog, bug). — [Duke Pratt](https://pratt.duke.edu/news/text2robot/); [WUNC](https://www.wunc.org/term/news/2025-04-25/text2robot-ai-3d-print-duke-robotics); [heise](https://heise.de/-10351471)

**"How can LLMs transform the robotic design process?" (Stella, Della Santina, Hughes; TU Delft + EPFL; Nature Machine Intelligence 5:561–564, June 2023, DOI 10.1038/s42256-023-00669-7): BUILT by humans**
- This is a commentary built around a case study. ChatGPT guided design "at both the conceptual and technical levels," and the authors propose human–AI co-design strategies. — [TU Delft record](https://research.tudelft.nl/en/publications/how-can-llms-transform-the-robotic-design-process); [EPFL Infoscience](https://infoscience.epfl.ch/record/303686?ln=en)
- Conceptual phase: the team asked ChatGPT about humanity's future challenges, which led to food supply and then to a tomato harvester. Technical phase: ChatGPT proposed a soft silicone/rubber gripper ("to avoid crushing tomatoes") and a Dynamixel motor. Humans did the CAD, fabrication and testing. The result was a working arm that harvests tomatoes, with "promising" initial tests and no published metrics. — [The Robot Report](https://www.therobotreport.com/researchers-use-chatgpt-to-make-a-tomato-picking-robot/); [HortiDaily](https://www.hortidaily.com/article/9536366/chat-gpt-creates-robot-gripper-for-harvesting-tomatoes/); [ScienceDaily](https://sciencedaily.com/releases/2023/06/230607215856.htm)
- The paper describes a spectrum of collaboration. At one extreme the AI provides all the design input and the human "blindly follows it." The risks it names are misinformation, bias, and the LLM giving "the most probable answer." — [EPFL Infoscience](https://infoscience.epfl.ch/record/303686?ln=en); [HortiDaily](https://www.hortidaily.com/article/9536366/chat-gpt-creates-robot-gripper-for-harvesting-tomatoes/)

**Agentic Robot Creation through Generation, Verification, and Revision (Li, He, Liu, Ji, Gu, ShanghaiTech; arXiv 2610.17881, 13 Oct 2026): BUILT (1 robot)**
- Input: a reference image, task descriptions, CAD assets and specs for candidate actuators, and **official assembly examples**. The paper says the assembly examples help the model infer how motors, links and fasteners connect. Output: three linked representations, STEP (editable parts), STL (fabrication) and URDF (simulation and control). — [arXiv HTML](https://arxiv.org/html/2610.17881)
- Pre-fabrication checklist with 23 checks in three groups:
  - **Design & Assembly:** valid single solids, watertight meshes, build-volume fit, mounting and tool access, tolerances, assembly interference.
  - **Mechanical & Actuation:** structural screening, load paths, mass reconciliation, fastener length chains, joint-limit margins, cable clearance. The paper calls these "conditional calculations, not measured strength."
  - **Motion & Task:** model consistency, collision-free motion in the CAD geometry, tracking error, actuator torque and saturation, joint limits, clearance under tracking error.
  — [arXiv HTML](https://arxiv.org/html/2610.17881)
- Checks passed for one Gorilla design per model: GPT6-Astra 15/23, GPT5.6-Terra 6/23, GPT5.6-Sol 5/23, GPT-5.5 4/23 (totals summed from the paper's Table 1). — [arXiv HTML](https://arxiv.org/html/2610.17881)
- Remaining failures were "missing mounting features, self-intersections between links, and insufficient clearance around actuators," which the authors **fixed by hand** before printing. — [arXiv HTML](https://arxiv.org/html/2610.17881)
- Built: an 8-DoF Gorilla with 8× DYNAMIXEL XL330-M288-T, a U2D2 and power hub, and external power. Printed in PLA on a Bambu Lab X1E at 0.2 mm layers and 15% infill. — [arXiv HTML](https://arxiv.org/html/2610.17881)
- Behavior ("RoboForge"): the agent writes procedural motion (root trajectory, end-effector targets), solves IK, checks joint and velocity limits and self-collision, builds a DeepMimic-style reward, and trains PPO. When a policy fails, it diagnoses whether the motion or the reward caused it and retries, up to 3 trials. In a user study (57 raters) it scored 3.97/5, against 3.60 for one-shot motion and 2.10 for Eureka-style. Walking and waving were deployed to hardware with **no quantitative hardware metrics**. — [arXiv HTML](https://arxiv.org/html/2610.17881)
- The paper doesn't say whether the CAD is code or which CAD library generates it (based on the first 100k characters of the paper that were read).

**AID-SR, automated design of continuum robots with LLMs (arXiv 2609.08220, 2026): BUILT (some)**
- Designs are checked for stability in MuJoCo, then the validated ones are 3D-printed and tested. About 26.7% of designs met the success criterion across 14 simulated tasks. — [arXiv](https://arxiv.org/html/2609.08220)
- A third-party summary notes the simulation proxy assumes idealized tendon routing and unlimited actuator power. — [Pith](https://pith.science/paper/2609.08220)

**Simulation-only LLM morphology work**
- **RoboMorph** (arXiv 2407.08626, 2024; ICLR 2025 workshop): the LLM edits a modular robot grammar, using best-shot prompting and an RL controller in a feedback loop. Across four terrains it finds terrain-specialized designs (wheeled quadrupeds, hexapods) that match or beat RoboGrammar. — [arXiv](https://arxiv.org/html/2407.08626v2); [mlanthology](https://mlanthology.org/iclrw/2025/qiu2025iclrw-robomorph)
- **LASeR** (ICLR 2025): the LLM acts as the evolutionary search operator for voxel soft robots. A reflection mechanism (DiRect) uses past search trajectories to improve exploration, diversity, and zero-shot proposals for new tasks. Code: GitHub WoodySJR/LASeR. — [ICLR proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/934eb45b99eff8f16b5cb8e4d3cb5641-Abstract-Conference.html)
- **RoboMoRe** (arXiv 2506.00276, May 2025): jointly optimizes morphology and reward in two stages. It "significantly outperforms human-engineered designs" across 8 tasks (simulated). — [arXiv](https://arxiv.org/html/2506.00276v1)
- **Debate2Create** (arXiv 2510.25850, Oct 2025): LLM agents debate design and reward changes, with physics-based evaluation. On a quadruped benchmark its designs travel 73% farther than the default. — [arXiv](https://arxiv.org/abs/2510.25850v1)
- **BesiegeField / Compositional Machine Design as Program Synthesis** (arXiv 2510.14980, Oct 2025): machines are programs that compose standard parts, scored by simulated behavior. Strong models struggle with "spatially precise assembly," mechanism-level planning, and turning feedback into useful structural edits. RL fine-tuning of Qwen2.5-14B improves the best machine found. — [arXiv](https://arxiv.org/abs/2510.14980)
- **Surveys:** I found no dedicated "LLMs for robot design" survey. The closest are "Embodied Co-Design for Rapidly Evolving Agents" (arXiv 2512.04770, Dec 2025) and a Frontiers research topic, "Foundation Models for Robot Design." — [arXiv](https://arxiv.org/pdf/2512.04770); [Frontiers](https://frontiersin.org/research-topics/70813/foundation-models-for-robot-designundefined)
- Related non-robot work: **LLMto3D** (2025) uses sequential agents, one decomposing the prompt into parts and spatial relations and another writing Rhino.Geometry code for parametric printable objects. Its authors say designs far from the training data remain hard. — [LLMto3D](https://cdml-lab.github.io/LLMto3D/); [IJAC](https://doi.org/10.1177/14780771251353792)

### Inferences
- Every pipeline that reached hardware fixes the actuator choice up front: 8 identical servos plus one controller and battery. The LLM or search then designs links around known parts. This matches the app's catalog-parts approach and suggests using a fixed "actuator kit" per design.
- The October 2026 paper is the closest analogue to this app: assembly examples in the prompt, STEP/STL/URDF outputs, a 23-item checklist, and a Bambu printer. Its best model still failed 8/23 checks, so a structured verification checklist plus human fixes is the state of the art, not an add-on.
- Sim-to-real is the weak point everywhere: no paper reports measured hardware performance.

### Gaps
- No paper reports hardware success rates, measured speeds, print-failure counts or assembly-fit problems for LLM-designed robots.
- Text2Robot's supplement (cost, print times) and the tail of arXiv 2610.17881 (appendix check definitions) were not read in full.
- The TU Delft PDF of the NMI paper returned HTTP 403, so the paper's own wording on the design phases comes from press coverage and repository abstracts.

## Builder write-ups: people using Claude/ChatGPT to design printable robots and parts (BOMs, what went wrong, how they iterated)

### Takeaway
Hobbyist builds succeed with a write → render → inspect → fix loop. The recurring hardware failures are servo mounting and retention, fastener lengths, clearances, print-in-place tolerances, wrong orientation, and invented dimensions. A passing render or manifold check is not proof of fit.

### Cited Findings
- **Claude Code + FreeCAD 5-DOF arm (blog, 2026-04-25), BUILT.** Claude Code wrote one `main.py` of FreeCAD Part-workbench CSG, which FreeCAD re-rendered live as the script changed. MG996R servos are enclosed inside the structural parts, with honeycomb lightening to cut print time. Design, print and assembly took about 30 h total, on the author's first 3D printer. Control runs Whisper + OpenCV + Claude Vision returning JSON, with an ESP32 over serial and 2-link planar IK. — [hiitzroman blog](https://hiitzroman.com/blog/robotic-arm-with-claude-code-and-freecad)
  - Two servos weren't held by their tabs and were taped in place.
  - A lid was glued because the screws were too short.
  - A wall was "a couple of centimetres too long" and blocked rotation, so it was cut.
  - The turntable shaft was too long, so the turntable was reprinted.
  - A print-in-place hinge had too-small offsets, printed solid, and was replaced with a shaft.
  — [hiitzroman blog](https://hiitzroman.com/blog/robotic-arm-with-claude-code-and-freecad)
- **XDA test, Claude Opus 4.8 vs GPT-5.5 in OpenSCAD (June 10, 2026).** Claude Code wrote `.scad`, rendered PNGs from the CLI, reviewed them and exported STLs. — [XDA](https://www.xda-developers.com/asked-claude-gpt-design-3d-prints-failed-opposite-ways/)
  - GPT-5.5 never rotated a phone stand upright, so its 88 mm height lay flat.
  - Claude invented a 35 mm mic radius (the real one is 46.67 mm), putting holes about 12 mm off.
  - Claude claimed a maker publishes no dimensions when they are in its FAQ, and guessed a size about 24 mm too long.
  - GPT-5.5 couldn't read a STEP file in OpenSCAD and sized a shell at 108 mm against a 99 mm board.
  - GPT-5.5 left an anti-tip rib floating 2 mm above the base, yet the export reported a clean manifold.
  - Both models put side buttons on top.
  - Takeaway: the models' self-verification couldn't be trusted.
  — [XDA](https://www.xda-developers.com/asked-claude-gpt-design-3d-prints-failed-opposite-ways/)
- The XDA author recommends parametric code, a render–inspect–fix loop, requiring sourced real dimensions before modeling, checking seating, orientation and connectivity in every render, and not treating "no errors" as success. — [XDA](https://www.xda-developers.com/asked-claude-gpt-design-3d-prints-failed-opposite-ways/)
- Other write-ups found but not read in full: "I Taught Claude to Design 3D-Printable Parts" (Towards AI) and a Classmethod 2026 summer project (Claude Code + OpenSCAD + 3D printing for a non-CAD user). — [Towards AI](https://pub.towardsai.net/i-taught-claude-to-design-3d-printable-parts-heres-how-675f644af78a); [Classmethod](https://dev.classmethod.jp/en/articles/summer-project-2026-claude-code-openscad-3dprint/)

### Inferences
- Most of the arm's failures are checks the app could run before printing:
  - servo retention: tab or screw boss present and engaged on the catalog servo
  - screw length vs. stack-up (fastener length chain)
  - swept-volume interference over the joint range
  - print-in-place gaps of at least about 0.3–0.4 mm on an FDM printer like the P1S (rule of thumb, not sourced)
- Orientation and invented-dimension errors argue for the app's catalog geometry and a "sourced dimensions" table with confidence before modeling.

### Gaps
- I found no detailed public write-up of a Claude- or ChatGPT-designed quadruped or biped that was actually built, with a BOM. Search turned up arms and single parts only.
- No measured tolerance data (e.g. hole shrink on a P1S) from these LLM builds.

## Multi-agent design frameworks for hardware (MechAgents etc.) and feasibility checks

### Takeaway
Multi-agent engineering frameworks split work into roles (planner, coder, executor, critic) and ground claims by running physics code. Applied to robots, the strongest feasibility gate so far is the 23-item pre-fabrication checklist in arXiv 2610.17881, and even that is "conditional calculations, not measured strength."

### Cited Findings
- **MechAgents** (Ni & Buehler, MIT; arXiv 2311.08166, Nov 2023; Extreme Mechanics Letters vol. 67, 2024): an agent pair writes, runs and self-corrects finite-element code for elasticity problems. Harder tasks use a larger team with planning, formulation, coding, execution and critique roles. The authors argue purely data-driven AI lacks physical intuition. — [arXiv](https://arxiv.org/abs/2311.08166v1); [awesomepapers summary](https://awesomepapers.io/ai-agents/papers/2311.08166)
- **Debate2Create** uses multi-agent debate over design and reward with physics evaluation (+73% distance on a quadruped benchmark). — [arXiv](https://arxiv.org/abs/2510.25850v1)
- **BesiegeField** compares single-agent, iterative-editing and hierarchical workflows. Mechanism-level planning and feedback-to-edit remain weak. — [arXiv](https://arxiv.org/abs/2510.14980)
- **Agentic Robot Creation** feasibility checks include actuator torque and saturation, joint-limit margins, mass reconciliation, fastener length chains, cable clearance and tolerance-aware clearance. Motion revision diagnoses whether the motion or the reward caused a failure. — [arXiv HTML](https://arxiv.org/html/2610.17881)
- **Text2Robot** feasibility is enforced by construction (fixed mass, 8 motors, symmetry, electronics channel, limb offsets) plus RL in simulation. — [arXiv HTML v3](https://arxiv.org/html/2406.19963v3)

### Inferences
- A practical decomposition for the app: requirements table → kinematic skeleton (DOF, joint axes, link lengths) → actuator sizing (static torque from mass × lever arm × safety factor) → block-out with catalog parts → detailed CAD → checklist → human checkpoint before printing.

### Gaps
- I found no published multi-agent framework that explicitly does requirements → architecture → detailed robot CAD with torque budgets and fabricates the result, beyond arXiv 2610.17881.

## Commercial products and startups (Zoo/KittyCAD, Leo AI, Flux, Diode)

### Takeaway
Commercial "AI hardware engineer" tools focus on single mechanical parts (Zoo) or PCBs (Flux, Diode). None claims end-to-end robot design, and their performance claims are mostly self-reported.

### Cited Findings
- **Zoo (formerly KittyCAD):** text-to-CAD on its own KCL language and geometry kernel. Its agent "Zookeeper" turns descriptions such as brackets or housings into parametric, editable models. Founders: Jessie Frazelle and Jordan Noone. — [The Built Future](https://thebuiltfuture.substack.com/p/text-to-3d-cad-is-coming-whos-building)
- A competitor's (Leo AI) review says Zoo can't check manufacturability, doesn't see existing parts or PDM history, and handles single parts rather than assemblies. Leo argues retrieving existing designs matters more to professionals. This is a biased source. — [Leo AI blog](https://www.getleo.ai/blog/zoo-text-to-cad-review)
- **Flux:** "AI hardware engineer" agent launched October 2025. It plans from a prompt, researches part pricing and availability, generates the schematic, connects nets and routes the board. It claims "10X faster" (self-reported) and raised $37M including a $27M Series B led by 8VC. — [GlobeNewswire](https://www.globenewswire.com/news-release/2025/10/07/3162463/0/en/AI-hardware-engineer-Flux-turns-text-prompts-into-circuit-board-designs.html); [Pulse2](https://pulse2.com/flux-37-million-raised-for-ai-hardware-design-platform)
- **Diode Computers** (Brooklyn): PCB design and manufacturing with schematics "backed by pythonic code" so LLMs can work on them. Every design is reviewed by experienced EEs before production. Raised an $11.4M Series A led by a16z (July 2025). Its blog says it worked with Anthropic on AI electrical engineering, producing about 250 reference designs (company claim). — [diode.computer](https://www.diode.computer/); [Techleap](https://finder.techleap.nl/news/feed/diode-computers-raises-11-4m-for-ai-pcb-design); [blog](https://blog.diode.computer/)

### Inferences
- Diode's pattern of design-as-code plus a mandatory expert review gate mirrors the academic finding that LLM output needs a checklist and a human fix-up before fabrication.

### Gaps
- No independent benchmark of Zoo, Flux or Diode output quality was found. Leo AI's own capabilities were not verified.

## Concrete techniques a desktop CAD app could adopt

### Takeaway
The evidence converges on a few practices:
1. Fix the actuator and electronics kit from a catalog with exact geometry.
2. Give the model assembly examples showing how motors mount.
3. Build the kinematic skeleton first, then size the links.
4. Generate parametric code in a render-and-inspect loop.
5. Gate printing on an explicit checklist covering mounting, interference, fastener chains, tolerances, build volume and torque.
6. Keep a human checkpoint before printing.

### Cited Findings
- **Assembly examples in the prompt** help the model infer how motors, links and fasteners connect. — [arXiv 2610.17881](https://arxiv.org/html/2610.17881)
- **Three linked outputs** (STEP for editing, STL for printing, URDF for simulation) let one design feed CAD, fabrication and control. — [arXiv 2610.17881](https://arxiv.org/html/2610.17881)
- **A 23-check pre-fabrication list** split into Design & Assembly, Mechanical & Actuation, and Motion & Task. — [arXiv 2610.17881](https://arxiv.org/html/2610.17881)
- **Fixed motor count, symmetry, electronics channel, limb offsets and joint placement from cross-section extrema** as a reliable skeleton heuristic. — [Text2Robot](https://arxiv.org/html/2406.19963v3)
- **Sim-in-the-loop morphology search** with the LLM as mutation or proposal operator plus reflection on past trajectories. — [LASeR](https://proceedings.iclr.cc/paper_files/paper/2025/hash/934eb45b99eff8f16b5cb8e4d3cb5641-Abstract-Conference.html); [RoboMorph](https://arxiv.org/html/2407.08626v2)
- **Write → render → inspect → fix in OpenSCAD**, plus sourced dimensions before modeling and not trusting manifold checks or self-reports. — [XDA](https://www.xda-developers.com/asked-claude-gpt-design-3d-prints-failed-opposite-ways/)
- **Human-in-the-loop as default:** NMI warns against "blindly" following the LLM. Diode keeps an EE review gate. ShanghaiTech hand-corrected designs before printing. — [EPFL Infoscience](https://infoscience.epfl.ch/record/303686?ln=en); [diode.computer](https://www.diode.computer/); [arXiv 2610.17881](https://arxiv.org/html/2610.17881)
- **Print settings used for an LLM-designed robot on a Bambu printer:** PLA, 0.2 mm layers, 15% infill (X1E). — [arXiv 2610.17881](https://arxiv.org/html/2610.17881)

### Inferences
- Mapped to this app:
  - add a `check_fabrication` tool on top of the existing `check_scene`: servo tab/boss engagement, screw length vs. clamp stack, swept-joint interference, minimum wall and clearance, P1S 256 mm build-volume fit, overhang/orientation
  - add a torque-budget table (mass × lever arm vs. catalog servo stall torque, with a margin)
  - add a BOM export from catalog parts and hardware keys
  - require a sourced-dimension table before modeling
- The P1S 256 × 256 × 256 mm build volume is from general knowledge, not from a source read here; verify it.

### Gaps
- No source measured how much each technique improves fabrication success. Tolerance values for P1S print-in-place joints and holes were not sourced in this pass.
