# Generative 3D as evidence, and the AI CAD product landscape

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Builds on `docs/research/LLM robot design and BOM/llm_cad_generation_verification.md` §2 (Zoo, Onshape, MCP servers, CADGenBench). Prices change often. Items marked **[unverified]** come from single secondary sources.

## Takeaway

1. **Image-to-3D models are now good enough to be evidence, not output.** The best open models run on a 24 GB M-series Mac in about 2.5–6 minutes per object through community ports; hosted APIs cost $0.02–0.80 per object and accept 4–8 views. None gives true scale, and every one invents the hidden sides. Use a generated mesh as a score target and a source of missing views, never as dimensions.
2. **Mesh-to-CAD reverse engineering isn't a usable output path for shells.** The best method (CADFit) takes 4–15 minutes per part and fails on smooth high-curvature geometry; several are non-commercial. Keep the LLM writing replicad/OpenSCAD and use meshes to score.
3. **Tools and a visual target matter more than the model.** CADGenBench (25 Oct 2026): Claude Opus 5.5 driving build123d-mcp scores 86.9% against 37.3% for a plain Claude entry. BlenderAlchemy: a generated target image improves program edits when the brief is only text.
4. **No product combines a real parts catalog, moving assemblies with joints, physics, a BOM and buildability checks.** That loop is Basecase's.

## Image/text-to-3D generators

| Model | Licence | Local on an M-series Mac | Multi-view input | Notes |
|---|---|---|---|---|
| TRELLIS.2 (Microsoft, 4B) | MIT, but the default pipeline pulls RMBG-2.0 (CC BY-NC) and DINOv3; swap the background remover | Yes via [trellis-mac](https://github.com/shivampkumar/trellis-mac) (~3.5–5 min, M4 Pro 24 GB) or an MLX 8-bit bundle (~152 s, single run) | No | Low arena rank; worse than Hunyuan3D as CAD-fitting input (CADFit) |
| Hunyuan3D 2.1 / 2mv / 2mv-turbo (Tencent) | Tencent Community Licence: EU, UK and South Korea excluded; large-MAU products need a separate licence | Yes via [hunyuan3d-2.1-mac](https://github.com/VladimirTalyzin/hunyuan3d-2.1-mac) (shape 344 s) | Yes, 2mv takes front/left/back(/right); 2mv-turbo on fal ≈ $0.015 | Best open input for CAD fitting in CADFit's ablation (IoU 0.692 vs 0.202 for TRELLIS, easy split) |
| Hunyuan3D 3.0 / 3.1 | API only | No | 8 images | fal $0.225–0.375 |
| Hunyuan3D-Omni (3.3B) | Tencent licence | CUDA only | Image plus bbox, point cloud, voxel or skeleton control | Could be conditioned on the block-out bounds or a published skeleton |
| Step1X-3D | Apache-2.0 | CUDA **[unverified]** | Single | Watertight geometry |
| TripoSG / TripoSF | MIT | Not ported | Single | PartCrafter builds on it |
| Tripo v3.1 (API) | Commercial | No | Multiview, $0.10–0.30 | #1 on the Top3D arena (texture looks, not geometric fidelity) |
| Meshy 7.1 (API) | Commercial, paid plan | No | 1–4 images | Text2Robot used Meshy |
| Rodin Gen-2.5 (API) | Commercial, $120/mo for API | No | Up to 5 images | 10M+ polygons, needs decimation |
| Hi3D v1.0 (open-sourced 23 Oct 2026) | Custom: credit line required, licence past 200K MAU | No (Linux, NVIDIA ≥ 8.0) | Refiner takes a coarse mesh + image | — |
| SAM 3D Objects (Meta) | SAM Licence | No (32 GB NVIDIA) | Single + mask | For in-the-wild, occluded photos |

Part-aware: [PartCrafter](https://github.com/wgsxm/PartCrafter) (MIT, up to 16 part meshes from one image), [OmniPart](https://github.com/HKU-MMLab/OmniPart) (MIT, plans part boxes first), [Hunyuan3D-Part](https://github.com/Tencent-Hunyuan/Hunyuan3D-Part) (P3-SAM segments any mesh into parts), [Marching-Primitives](https://github.com/ChirikjianLab/Marching-Primitives) (MIT, SDF to superquadrics, CPU). Avoid PrimitiveAnything (GPL) and Era3D (AGPL); treat PartPacker (NVIDIA) as research-only.

## How the agent could use a generated mesh

Ranked by evidence:
1. **Fit target scored like the bench's URDF meshes.** `scoreModels` in `bench/score.mjs` (silhouette IoU at best yaw, Chamfer, height and width/depth proportions) can become an agent tool against a generated mesh, giving photos-only tasks the objective signal URDF tasks have (photos-only G1 spans 43.1–84.4 because nothing anchors it). Scale comes from the target height or a known catalog part. Weight unseen views low and let photos win on conflict: our own Memo result shows chasing a flawed reference lowers held-out accuracy.
2. **Render the views the user didn't provide** as clean orthographic front, side, top and back renders, labelled "generated": the ideal input for `compare`'s silhouette bands, without perspective.
3. **Proportion table and block-out seed** from per-tenth-of-height profiles or a superquadric decomposition.
4. **Part decomposition** (P3-SAM, PartCrafter) matched to block-out parts by box overlap. Unproven on robots.
5. Text2Robot used Meshy meshes and found joints at cross-section extrema, but filtered by hand for symmetry and limb count: generators are unreliable at both.

## Mesh/point cloud to CAD

| Method | Licence | Usable? |
|---|---|---|
| CADFit (ICML 2026) | CC BY-NC 4.0 | Median IoU 0.979 on Fusion360; 235–900 s per shape; no loft or sweep; fails on smooth geometry |
| cadrille (ICLR 2026) | Apache-2.0 | Prismatic DeepCAD-style parts; Mac support unverified |
| CAD-Recode (ICCV 2025) | CC BY-NC 4.0 | Research only |
| Point2CAD, ComplexGen | Apache-2.0 / MIT | Research; CUDA |
| Fusion Mesh→BRep, Geomagic Design X, Backflip ($20–380/mo) | Commercial | Faceted or prismatic/CNC only |

Verdict: only for prismatic brackets and plates, which the LLM already writes well.

## Concept art as a target for new designs

- BlenderAlchemy (ECCV 2024): a text-to-image "visual imagination" step improves program refinement; abstract language alone yields poorer edits. Our concept tasks score lowest on the judge (62–66) and have no reference at all.
- Multi-view generators: [MV-Adapter](https://github.com/huanngzh/MV-Adapter) (Apache-2.0, orthographic renders at 0° elevation), Zero123++ (Apache-2.0, perspective, not strictly consistent), Qwen-Image-Edit-2511 with fal's multi-angle LoRA (96 camera poses; some colour shift). Frontier image models chain "same object, side view" turns but drift across angles.
- Risk: concept art invents mechanisms that can't be built. Use it as a silhouette and proportion target only; mechanisms come from the catalog and the checks.

## Products, October 2026

| Product | What it does | Representation | Limits users report |
|---|---|---|---|
| Zoo (Text-to-CAD, Zookeeper, Design Studio) | Text to part; Zookeeper plans parameters, then models; MCP server | KCL on Zoo's B-rep kernel | Wevolver test: a 24-tooth gear wrong, a manifold block failed; single parts, no assemblies or DFM |
| Adam (CADAM + Copilot) | Text/image to parametric part; Onshape and Fusion copilot that edits the feature tree | CADAM: OpenSCAD + BOSL2 in WASM, GPL-3.0, 5.3k stars | Complex designs need cleanup; no assemblies |
| Onshape (PTC) | AI Advisor (help); FeatureScript MCP in early access; agents "in development" | FeatureScript | Agents not shipped |
| Autodesk Fusion | Assistant runs API scripts (tech preview); Fusion MCP; AutoConstrain; Neural CAD announced, not shipped | Fusion API, neural B-rep | "Doesn't feel useful yet" for modeling; MCP can't read existing designs |
| SOLIDWORKS (AURA, LEO, MARIE) | Docs assistant; LEO and MARIE in Labs beta; assembly structures from prompts | Native | Text-only at launch |
| Siemens NX / Solid Edge | Copilot is a RAG support chatbot; Solid Edge magnetic snap assembly | Native | "We're not there yet" on agents |
| Leo AI | Engineering Q&A, search over 120M vendor parts, cited calculations | Text, images | No editable geometry |
| Backflip | Mesh or scan to native feature history | SolidWorks / Fusion | CNC and turned parts only |
| MCP servers | build123d-mcp (Apache-2.0: execute, render, measure, validate, find_candidates, edit_feature, compare), OpenSCAD MCPs, freecad-mcp, Fusion MCP | Code | build123d-mcp + Opus 5.5 = 86.9% on CADGenBench, #1 |
| Robotics tools | Artifex (text to URDF with screenshot checks), URDF-Studio (Apache), onshape-to-robot | URDF/MJCF with primitive geometry | None designs printable geometry around real parts, or checks torque, BOM or printability |

What users complain about everywhere: fine on simple parts, failing on medium ones (gears, manifolds); weak on organic shapes; no assemblies or system-level reasoning ("probably doesn't stand a chance on a full robot", an FRC mentor on the Fusion MCP); bad CAD is harder to fix than bad code; token cost of iterating on a whole robot ([Chief Delphi](https://www.chiefdelphi.com/t/what-is-your-opinion-with-ai-in-cad-use/522564)).

Gaps Basecase can own: COTS-first robot design with brackets around real parts; assemblies with joints and motion checks; physics in the loop; buildability (BOM, budget, printability, build guide, assembly order); objectively scored replicas from photos or URDFs; parallel subagents on subassemblies.

## Recommendations

1. An optional reference-mesh stage for photos-only tasks: `reconstruct_reference(refs)` → `refmesh-N`, and `fit_reference(ids?)` returning global and per-part fit by sharing `bench/score.mjs` (move its pure parts to `src/utils`). Multi-view Hunyuan-class first.
2. Back ends by availability, all optional, through uv like the trainer: hosted APIs with the user's key (stored with `safeStorage` like the Gemini key), or local on Macs with ≥ 24 GB in a worker process. Never bundle weights.
3. Licence policy before shipping: don't distribute or default to Hunyuan weights (territory exclusion); replace RMBG-2.0 in TRELLIS pipelines; CAD-Recode, CADFit and PartPacker are research-only; avoid GPL/AGPL.
4. Generated missing views, labelled, fed to `compare`; flag only bands > 15% off in unphotographed views; photos win on conflict.
5. Proportion table and block-out seed from the mesh.
6. Per-part correspondence only after the global fit proves itself, behind an experiment flag.
7. A concept turnaround sheet for new designs (user picks one), then treated as reference images.
8. A/B every one of these on the bench (≥ 5 runs, mean and worst) before enabling by default; gains must show on held-out metrics (Memo's drawing IoU, the judge), not just fit to the generated mesh.
9. Don't build mesh-to-CAD for shells.
10. Condition generation on what the agent knows (Hunyuan3D-Omni bbox or skeleton) where an API allows.
11. Submit Basecase's part agent to CADGenBench, and publish the robot-level benchmark.
12. Show the reference mesh as a ghost overlay on the canvas (like the Measure tool's scale figures), so the user sees what the agent is fitting.

## Unverified

Zoo hands-on reviews beyond Wevolver's test; PartPacker's and SV3D's licence texts; Godela's system; Mac timings are single-machine author reports; API prices partly from resellers; nobody has published generated meshes as a fitting target for a robot CAD agent.
