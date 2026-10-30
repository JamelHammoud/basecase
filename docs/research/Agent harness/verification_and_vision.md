# Verification: VLM limits, judges, photo-to-model alignment and executable assertions

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Builds on `docs/research/LLM robot design and BOM/{llm_cad_generation_verification,design_verification_simulation}.md` (CADCodeVerify's ~65% self-QA accuracy, the layered verification stack, slicer and DFM rules). Items marked **[unverified]** come from secondary sources.

## Takeaway

Frontier VLMs are poor at exactly the spatial judgements the agent makes from photos and renders: metric size, relative distance, orientation, cross-view correspondence, mental rotation. Gains come from moving perception into tools (depth and segmentation models, labels, grids, crops, matched cameras) and from executable checks. The VLM should compare and decide; tools should measure.

## Two findings in our code

1. **Images are smaller than the model can read.** Claude 4.7 and later read up to 2,576 px on the long edge (4,784 visual tokens); older models 1,568 px ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). Above 20 images per request, each must be ≤ 2,000 px. Basecase caps photos and evidence at 1,568 (`EVIDENCE_IMAGE_SIDE` in `src/workspace/agentRequestHandlers.ts:41`, `UPLOAD_SIDE` in `src/workspace/useAgentSession.ts:25`, `src/utils/evidenceFiles.ts:199`, `electron/cad-mcp/webTools.mjs:135`), `look`/`compare` renders at 1,024 (`VIEW_IMAGE_SIDE`) and pose previews at 768 (`TOOL_IMAGE_SIDE` in `src/agent/agentPoseShared.ts:72`).
2. **`compare` never matches the photo's camera.** `captureViews` always uses a 24° perspective camera framed to the bounds (`src/three/viewport/captures.ts:139`). Every width band compared with a perspective photo mixes design error with camera error, which is the Memo trap recorded in AGENTS.md (chasing perspective bands dropped the held-out drawing IoU from 0.87 to 0.73).

## What VLMs get wrong

| Benchmark | Key numbers |
|---|---|
| BLINK ([2404.12390](https://arxiv.org/abs/2404.12390)) | Humans 95.7%; GPT-4V 51.3%, 7–13 points above chance on depth, multi-view, correspondence |
| VSI-Bench ([2412.14171](https://arxiv.org/html/2412.14171v1)) | Relative direction 46 vs 96 (human), relative distance 51 vs 95. ~71% of errors are spatial reasoning. CoT and Tree-of-Thoughts *lowered* scores ~4 points; asking for a cognitive map raised relative distance 46 → 56 |
| 3DSRBench ([2412.07825](https://arxiv.org/html/2412.07825v2)) | Orientation as low as 21.6% for GPT-4o; GPT-5 68.2 and Claude 4 Sonnet 62.0 overall **[secondary table]** |
| MMSI-Bench ([2505.23764](https://arxiv.org/abs/2505.23764)) | Best model 40% vs humans 97% on multi-image spatial reasoning; top failure is grounding |
| MindCube ([2506.21458](https://arxiv.org/pdf/2506.21458)) | Mental model from limited views near chance (~38%) |
| SpatialViz ([2507.07610](https://arxiv.org/pdf/2507.07610)) | 3D mental rotation at chance (GPT-5 30.0, chance 25) |
| OR-Bench ([2610.05715](https://arxiv.org/abs/2610.05715)) | Angle answers collapse to {0, 90, 180}° in 91.8–100% of cases, 97.5% even without the image |
| VLMs are blind ([2407.06581](https://arxiv.org/html/2407.06581v4)) | Line-intersection counting 41–76% |

Mapped to our failures: proportions and head heights are metric estimation and cross-view integration; tapers and shell shape need fine contour comparison; features on the wrong part is grounding; shadows read as geometry has no benchmark (our bench notes are the evidence); inferring an unseen side from a photo is mental rotation, at chance.

## What helps, with measured gains

- **Tools that make intermediate visuals.** Visual Sketchpad ([2406.09403](https://arxiv.org/html/2406.09403v3), Apache-2.0): with a depth model, segmentation, crop and line tools, GPT-4o went 71.8 → 83.9 on BLINK depth, 72.0 → 81.1 spatial, 66.0 → 80.3 on V\*. The depth gain came from a depth model the VLM called.
- **Set-of-Mark labels** ([2310.11441](https://arxiv.org/abs/2310.11441), MIT): numbered marks let GPT-4V zero-shot beat fine-tuned referring models.
- **Coarse correspondences**: the same IDs on the same objects across views gave +20.5% on ScanQA, training-free ([2408.00754](https://arxiv.org/pdf/2408.00754)).
- **Coordinate grids**: Scaffold dot matrices; a labelled 8×8 grid lifted one model's GUI grounding 5.5% → 72.1% **[secondary]**.
- **Known-size references**: "reason via a known-size object" improved Q-Spatial by +6.7 (GPT-4o) to +56 points. Basecase knows the exact size of every catalog part that appears in a photo.
- **Zoom and crop**: ZoomEye +15–35% on V\*/HR-Bench for small models. For Claude, the high-res tier plus a crop parameter is the cheap lever.
- **Programs over free-form reasoning**: VADAR and pySpatial (writing code against depth and detection APIs) beat free-form VLM answers on 3D questions.
- **What doesn't help**: text CoT, self-consistency and ToT on spatial tasks; multi-image input alone.

## VLM-as-judge

| Study | Finding |
|---|---|
| GPTEval3D ([2401.04092](https://arxiv.org/html/2401.04092)) | Pairwise comparison with Elo; Kendall τ 0.710 with humans (geometry details 0.795). One criterion per prompt beats a joint prompt; ensembles reduce variance; expert annotators themselves agree only at κ ≈ 0.53 |
| MLLM-as-a-Judge ([2402.04788](https://arxiv.org/pdf/2402.04788)) | Pairwise agreement 0.773 (without ties) vs absolute scoring 0.490; position, length and high-score biases |
| 3D-DefectBench ([2607.10826](https://arxiv.org/html/2607.10826v2)) | Best geometry agreement MCC 0.30. Model choice matters (~0.17 MCC); view count, normal/depth channels and prompt schema ~0.01–0.02 each. Six oblique RGB views = 14. Judges over-call missing parts (78% of their errors are false positives), pose/placement (77%) and baked shadows (69%) |
| CADTests ([2605.07807](https://arxiv.org/html/2605.07807), NeurIPS 2026) | Executable B-rep tests vs human labels: F1 0.962; a VLM judge F1 0.549 (recall 0.39). AUC: tests 0.928 vs Chamfer 0.663 vs VLM 0.659. Tests written by Claude Sonnet 4.6 from the prompt, hardened against LLM-made mutants over 4 rounds (mutation score ~64% → > 90%, soundness 97–98%). Test-guided generation raised Sonnet 4.6's pass rate 0.715 → 0.810 |
| CADSmith ([2603.26512](https://arxiv.org/abs/2603.26512)) | Kernel metrics + renders sent to a *different* model as judge (Sonnet generates, Opus judges): mean CD 28.37 → 0.74. Removing renders raised complex-part CD from 1.42 to 49.68: renders matter for gross structure, numbers for precision. A repeated issue triggers a different construction approach |
| FunCADBench ([2610.26861](https://arxiv.org/html/2610.26861v1)) | Replacing diagnostic feedback with binary pass/fail dropped one model from 22 to 0 solved tasks; removing vision barely mattered (20 vs 22). Contact/assembly was every model's lowest axis. During repair, agents replaced a failing loaded test with a weaker one |
| LLMForge ([2607.05573](https://www.alphaxiv.org/abs/2607.05573)) | Analytic critique peaks in round 1; VLM critique keeps helping in rounds 2–3 |
| RealCADBench ([2609.03773](https://arxiv.org/html/2609.03773v2)) | An agent harness raised executability and IoU but lowered the semantic judge score; no model led on all metrics. Keep evals multi-metric |

Rules for Basecase's review loop: always pairwise (photo beside a render in the same fitted camera; swap the order once); one criterion per question, generated from the feature inventory with dependencies (DSG-style); any "missing", "misplaced" or "groove" verdict must be confirmed by a number before an edit; no absolute 0–10 self-scores; numbers first, VLM as tiebreaker.

## Photo-to-model alignment

- **Camera fit by render-and-compare.** Standard for known objects (SPARC, MegaPose Apache-2.0). Our case has few parameters (azimuth, elevation, roll, FOV, distance, offset) and a renderer: a coarse grid, then Nelder–Mead or CMA-ES on silhouette IoU plus a distance-transform contour term. No differentiable renderer needed (nvdiffrast is CUDA-only). Seed from the agent's az/el label or EXIF `FocalLengthIn35mmFilm`, read *before* the image is re-encoded. Bound FOV (≈ 15–50° for product photos) so it can't absorb proportion error, and report when IoU is flat across FOV. Not published as an agent tool; engineering inference.
- **Focal length and orientation priors**: Depth Pro (focal from one image), MoGe-2 (MIT; depth, normals, FOV), Orient Anything V1 (CC-BY-4.0; V2 inherits VGGT weights, check the licence chain).
- **Subject masks for any background** (today's border flood-fill only works on plain backgrounds): Apple Vision `VNGenerateForegroundInstanceMaskRequest` (macOS 14+, no model licence; verify on the current SDK), BiRefNet-lite ONNX (MIT, runs in transformers.js on WebGPU), SAM 2.1 (Apache-2.0) with box or point prompts. SAM 3 (SAM Licence, bars ITAR/military use) does text-concept segmentation; it works best behind an LLM that turns language into short noun phrases (empty masks 3.8% → 38.9% without it).
- **Contours and splines**: marching squares, Ramer–Douglas–Peucker, Schneider Bézier fitting; OpenCV.js (Apache-2.0) or VTracer (MIT). Avoid Potrace (GPL). Back-project through the fitted camera for non-straight-on photos.
- **Normals for shadow vs geometry**: a dark band with smooth predicted normals is shadow; a normal discontinuity is an edge. MoGe-2 normals (MIT), Depth Anything V2 Small (Apache; Base and Large are CC-BY-NC), StableNormal (Apache). Return numbers and flags, not extra pictures: extra channels don't help a VLM judge.
- **Multi-photo poses**: Depth Anything 3 Small/Base (Apache), VGGT-1B-Commercial (gated, no military use). DUSt3R/MASt3R are CC BY-NC-SA: out.

## Executable assertions

- CADTests' assertion categories: solid validity; topology counts; geometry types (cylindrical faces, circular edges); dimensions, ratios, feature Ø, wall thickness; volume and fill factor; arrangement (coaxial, symmetric, through vs blind, parallel, perpendicular).
- replicad already exposes what a kernel-side checker needs: `FaceFinder.ofSurfaceType('CYLINDER')`, `inDirection`, `parallelTo`, `containsPoint`, `atDistance`, `measureArea`, `measureVolume`, `measureDistanceBetween`, `measureShape*Properties` (`node_modules/replicad/dist/replicad.d.ts`). For OpenSCAD meshes: cluster faces by normal and fit cylinders, inward rays for walls (the printability code has them), Betti numbers from the Euler characteristic.
- B-rep feature-recognition nets (UV-Net MIT, AAGNet MIT, ~99% on MFCAD++) are trained on machining features and need B-rep input; rule-based recognition on the attributed adjacency graph is simpler and enough for holes, bosses and pockets.

## Ranked tools

1. **`fit_view` / camera-matched `compare`.** Returns the fitted camera with confidence, silhouette IoU, mean and 95th-percentile contour distance (px and mm), width bands in the fitted camera, and an overlay (red photo-only, blue model-only). Uses `captureViews({ silhouette: true })` at 256 px in a worker; a few hundred renders, ~1–3 s **[estimate]**.
2. **Robust photo masks** (Apple Vision, BiRefNet-lite, SAM 2.1).
3. **Annotated renders (Set-of-Mark for CAD):** flat-colour ID renders with numbered labels and a legend, optional dimension callouts and an mm grid, the same label and colour per part in every view and in the photo overlay. Draw in the capture path, not `stage.overlays`.
4. **`expect` assertions in `model_part`** (CADTests-style), see `cad_code_and_craft.md`.
5. **`compare_parts`:** after `fit_view`, project each part's or group's bounds into the photo as SAM prompts; return per-part mask IoU, top and bottom height as a share of total height, width and centroid offset in mm.
6. **`trace_outline`:** trace the aligned photo mask, fit splines, convert to mm in the chosen plane, return control points ready for `profileBody` and per-band deviation from the model's outline.
7. **`check_interfaces`:** coaxial holes (≤ 0.2 mm), pocket clearance around catalog bodies, horn patterns on the joint axis, engagement ≥ 1.5×d.
8. **`probe`:** for points, rays or a grid cell in a view: which part owns the surface, normal, wall thickness, nearest other part and gap; checks the feature inventory's "feature on part X" claims by ray-casting.
9. **`shape_cues`:** normal and depth difference maps (shadow vs geometry).
10. **Resolution policy:** 2,576 px caps for Claude 4.7+, larger renders, and a crop parameter on `look` and `view_image` that re-crops the original file.
11. **Review protocol** (prompt and harness): pairwise, decomposed, numerically confirmed.
12. **`scale_from_reference`:** segment a visible catalog part or known object, measure it in the fitted camera, derive mm per px with an error band.
13. **Joint multi-photo fit** with a text "cognitive map" (VSI-Bench +10 on relative distance).
14. **Orientation prior** (optional, mostly redundant with the grid search).
15. **Pseudo-3D reference from image-to-3D** (experimental; see `generative_3d_and_products.md`).

## Unverified and open

- No benchmark measures VLM shadow-vs-geometry confusion, and no paper measures camera fitting as an agent tool; tools 1, 5, 6, 8 and 9 are inferences from adjacent evidence. Validate each on the bench (Memo drawing IoU, G1 photos-only) beyond the ±3-point noise.
- Platform support not confirmed: SAM 2 on MPS, MoGe and DA3 on MPS, the SAM 3 MLX port, current Apple Vision SDK details.
- Read the full licence texts before shipping SAM 3, VGGT-1B-Commercial and Depth Pro weights.
