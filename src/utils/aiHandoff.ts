import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { buildPartGroup } from '../three/buildPartMesh';
import { ProjectSummaryForAI, SceneAnnotation, ScenePart } from '../types/robotics';
import { hardwareName } from '../data/hardware';
import { COMPONENT_BY_ID } from '../data/components';

export function annotationWorldPosition(a: SceneAnnotation, parts: ScenePart[]): [number, number, number] {
  const part = a.partId ? parts.find((p) => p.id === a.partId) : undefined;

  if (part && a.offset) {
    return [part.position[0] + a.offset[0], part.position[1] + a.offset[1], part.position[2] + a.offset[2]];
  }

  return a.position;
}

interface BoxBounds {
  min: [number, number, number];
  max: [number, number, number];
}

function getApproxBounds(part: ScenePart): BoxBounds {
  const halfW = part.dimensions.width / 2;
  const halfH = part.dimensions.height / 2;
  const halfD = part.dimensions.depth / 2;

  return {
    min: [part.position[0] - halfW, part.position[1] - halfH, part.position[2] - halfD],
    max: [part.position[0] + halfW, part.position[1] + halfH, part.position[2] + halfD],
  };
}

function boxesOverlapOrTouch(a: BoxBounds, b: BoxBounds, toleranceMm = 4): boolean {
  return (
    a.min[0] - toleranceMm <= b.max[0] &&
    a.max[0] + toleranceMm >= b.min[0] &&
    a.min[1] - toleranceMm <= b.max[1] &&
    a.max[1] + toleranceMm >= b.min[1] &&
    a.min[2] - toleranceMm <= b.max[2] &&
    a.max[2] + toleranceMm >= b.min[2]
  );
}

function contactRelation(a: ScenePart, b: ScenePart): string {
  const dy = Math.round(b.position[1] - a.position[1]);

  if (Math.abs(dy) <= 4) return `ADJACENT / MATING PARTS: "${a.name}" and "${b.name}" touch or intersect laterally.`;

  const upper = dy > 0 ? b : a;
  const lower = dy > 0 ? a : b;

  return `ASSEMBLY CONTACT: "${upper.name}" (${upper.mechanicalTag || upper.kind}) mounts onto / stacks above "${lower.name}" (${lower.mechanicalTag || lower.kind}).`;
}

const cutoutRelation = (cut: ScenePart, solid: ScenePart) =>
  `BOOLEAN CUTOUT: "${cut.name}" (${cut.kind}, ${cut.dimensions.width}×${cut.dimensions.height}×${cut.dimensions.depth}mm) cuts into solid "${solid.name}" near (${cut.position.join(', ')})mm.`;

function describeRelation(a: ScenePart, b: ScenePart): string {
  if (a.role === 'cutout' && b.role === 'solid') return cutoutRelation(a, b);

  if (b.role === 'cutout' && a.role === 'solid') return cutoutRelation(b, a);

  if (a.role !== 'reference' && b.role !== 'reference') return contactRelation(a, b);

  const axisPart = a.role === 'reference' ? a : b;
  const targetPart = a.role === 'reference' ? b : a;

  return `ALIGNMENT / PIVOT AXIS: "${axisPart.name}" passes through "${targetPart.name}" — align joint/bore along rotation (${axisPart.rotation.join('°, ')}°).`;
}

export function inferSpatialRelationships(parts: ScenePart[]): string[] {
  const visibleParts = parts.filter((p) => p.visible && p.kind !== 'image_plane');
  const bounds = visibleParts.map(getApproxBounds);
  const relations: string[] = [];

  for (let i = 0; i < visibleParts.length; i++) {
    for (let j = i + 1; j < visibleParts.length; j++) {
      if (boxesOverlapOrTouch(bounds[i], bounds[j], 5))
        relations.push(describeRelation(visibleParts[i], visibleParts[j]));
    }
  }

  return relations;
}

function envelope(parts: ScenePart[]): ProjectSummaryForAI['boundingBoxMm'] {
  if (!parts.length) return { width: 0, height: 0, depth: 0 };

  const all = parts.map(getApproxBounds);
  const span = (k: number) =>
    Math.round(
      all.reduce((m, b) => Math.max(m, b.max[k]), -Infinity) - all.reduce((m, b) => Math.min(m, b.min[k]), Infinity),
    );

  return { width: span(0), height: span(1), depth: span(2) };
}

function buildSpec(
  projectName: string,
  globalDesignGoal: string,
  parts: ScenePart[],
  annotations: SceneAnnotation[],
): ProjectSummaryForAI {
  const visibleParts = parts.filter((p) => p.visible && p.kind !== 'image_plane');

  return {
    projectName,
    globalDesignGoal,
    units: 'mm',
    timestamp: new Date().toISOString(),
    boundingBoxMm: envelope(visibleParts),
    parts: visibleParts.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      role: p.role,
      mechanicalTag: p.mechanicalTag || '3D Printed PLA/PETG',
      positionMm: {
        x: Math.round(p.position[0] * 10) / 10,
        y: Math.round(p.position[1] * 10) / 10,
        z: Math.round(p.position[2] * 10) / 10,
      },
      rotationDeg: {
        x: Math.round(p.rotation[0]),
        y: Math.round(p.rotation[1]),
        z: Math.round(p.rotation[2]),
      },
      dimensionsMm: p.dimensions,
      aiNote: p.note,
    })),
    spatialRelationships: inferSpatialRelationships(visibleParts),
    annotations: annotations.map((a) => {
      const [x, y, z] = annotationWorldPosition(a, parts);

      return {
        id: a.id,
        positionMm: { x: Math.round(x), y: Math.round(y), z: Math.round(z) },
        attachedPart: parts.find((p) => p.id === a.partId)?.name,
        comments: a.comments.map((c) => c.text),
      };
    }),
  };
}

function referencePhotoLines(referenceImages: ScenePart[]): string[] {
  if (!referenceImages.length) return [];

  const photos = referenceImages
    .map(
      (r) =>
        `${r.name} at (${Math.round(r.position[0])}, ${Math.round(r.position[1])}, ${Math.round(r.position[2])}) mm, ${r.dimensions.width} × ${r.dimensions.height} mm${r.note ? ` — ${r.note}` : ''}`,
    )
    .join('; ');

  return [`- **Reference Photos (not parts):** ${photos}`];
}

function partType(p: ScenePart): string {
  if (p.hardware) return `${p.hardware.type} ${p.hardware.size}${p.hardware.length ? `×${p.hardware.length}` : ''}`;

  return p.componentId ? `component ${p.componentId}` : p.kind;
}

function partRow(p: ScenePart, idx: number): string {
  const dimStr = `${p.dimensions.width} × ${p.dimensions.height} × ${p.dimensions.depth}${
    p.dimensions.thickness ? ` (t=${p.dimensions.thickness})` : ''
  }`;
  const posStr = `(${Math.round(p.position[0])}, ${Math.round(p.position[1])}, ${Math.round(p.position[2])})`;
  const rotStr = `(${Math.round(p.rotation[0])}°, ${Math.round(p.rotation[1])}°, ${Math.round(p.rotation[2])}°)`;

  return `| ${idx + 1} | **${p.name}** | \`${partType(p)}\` | \`${p.role.toUpperCase()}\` | ${p.mechanicalTag || '-'} | \`${dimStr}\` | \`${posStr}\` | \`${rotStr}\` | ${p.note || '_None_'} |`;
}

function hardwareBomLines(parts: ScenePart[]): string[] {
  const bom = new Map<string, number>();

  for (const p of parts)
    if (p.hardware) bom.set(hardwareName(p.hardware), (bom.get(hardwareName(p.hardware)) ?? 0) + 1);

  if (bom.size === 0) return [];

  return [
    ``,
    `### Hardware (bill of materials)`,
    ``,
    ...[...bom.entries()].sort().map(([name, count]) => `- ${count} × ${name}`),
    ``,
    `Model clearance holes, counterbores, nut traps and insert holes from each hardware part's note (ISO 273 medium clearance + 0.2 mm for printing).`,
  ];
}

function componentBomLines(parts: ScenePart[]): string[] {
  const comps = new Map<string, number>();

  for (const p of parts) if (p.componentId) comps.set(p.componentId, (comps.get(p.componentId) ?? 0) + 1);

  if (comps.size === 0) return [];

  const lines = [...comps].flatMap(([id, count]) => {
    const c = COMPONENT_BY_ID[id];

    if (!c) return [];

    const buy = c.links.amazon ? ` · [Amazon](${c.links.amazon.url})` : '';
    const sheet = c.links.datasheet ? ` · [Datasheet](${c.links.datasheet})` : '';

    return [`- ${count} × **${c.name}** (${c.manufacturer} ${c.mpn})${buy}${sheet}`, `  - ${c.mounting}`];
  });

  return [
    ``,
    `### Components (bill of materials)`,
    ``,
    ...lines,
    ``,
    `These parts are exact (manufacturer CAD). Never resize them; size mounts, pockets and clearances around them.`,
  ];
}

function cadSourceLines(parts: ScenePart[]): string[] {
  const cadParts = parts.filter((p) => p.kind === 'cad_part' && p.cad);

  if (!cadParts.length) return [];

  return [
    ``,
    `## 3b. CAD Source (per part)`,
    ``,
    `Each part below was designed as code in its own local frame (Z up, mm). Position/rotation in the table place that frame. OpenSCAD parts use BOSL2 and \`robotics.scad\`; replicad parts are OpenCascade (JavaScript).`,
    ...cadParts.flatMap((p) => [
      ``,
      `### ${p.name} (\`${p.id}\`, ${p.cad!.language})`,
      ``,
      '```' + (p.cad!.language === 'openscad' ? 'openscad' : 'js'),
      p.cad!.code.trim(),
      '```',
    ]),
  ];
}

function annotationLines(openNotes: SceneAnnotation[], parts: ScenePart[]): string[] {
  if (openNotes.length === 0) return [`- None.`];

  return openNotes.flatMap((a, idx) => {
    const [x, y, z] = annotationWorldPosition(a, parts);
    const part = parts.find((p) => p.id === a.partId);

    return [
      `${idx + 1}. At \`(${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}) mm\`${part ? ` on **${part.name}**` : ''}: ${a.comments[0].text}`,
      ...a.comments.slice(1).map((reply) => `   - ${reply.text}`),
    ];
  });
}

export function buildAIHandoffPayload(
  projectName: string,
  globalDesignGoal: string,
  parts: ScenePart[],
  annotations: SceneAnnotation[] = [],
): { spec: ProjectSummaryForAI; markdown: string } {
  const openNotes = annotations.filter((a) => !a.resolved && a.comments.length > 0);
  const referenceImages = parts.filter((p) => p.visible && p.kind === 'image_plane');
  const visibleParts = parts.filter((p) => p.visible && p.kind !== 'image_plane');
  const spec = buildSpec(projectName, globalDesignGoal, parts, openNotes);
  const { boundingBoxMm, spatialRelationships } = spec;

  const mdLines: string[] = [
    `# Robotics Concept Spec: ${projectName}`,
    ``,
    `> **Saved from Basecase** — Reference this file (\`ai-reference/DESIGN_BRIEF.md\` & \`ai-reference/design-spec.json\`) and \`ai-reference/preview.webp\` to generate production-ready CAD (OpenSCAD / Build123d / CadQuery / STEP / STL).`,
    ``,
    `## 1. High-Level Design Intent`,
    globalDesignGoal || '_No global note provided; see individual part annotations below._',
    ``,
    `- **Overall Envelope (Bounding Box):** \`${boundingBoxMm.width} mm (W) × ${boundingBoxMm.height} mm (H) × ${boundingBoxMm.depth} mm (D)\``,
    `- **Coordinate System:** \`1 unit = 1 mm\`, \`Y-up\` (Ground workplane is \`Y = 0\`), \`X = Left/Right\`, \`Z = Front/Back\``,
    `- **Active Parts Count:** ${visibleParts.length}`,
    ...referencePhotoLines(referenceImages),
    ``,
    `## 2. Parts & Mechanical Breakdown`,
    ``,
    `| # | Part Name | Type / Primitive | Role | Fabrication / COTS | Size (W × H × D mm) | Center (X, Y, Z mm) | Rotation (X, Y, Z°) | AI Engineering Note |`,
    `|---|-----------|------------------|------|--------------------|---------------------|---------------------|---------------------|---------------------|`,
    ...visibleParts.map(partRow),
    ...hardwareBomLines(visibleParts),
    ...componentBomLines(visibleParts),
    ``,
    `## 3. Inferred Spatial & Mechanical Relationships`,
    ``,
    ...(spatialRelationships.length === 0
      ? [`- Parts are positioned independently without direct bounding-box overlap.`]
      : spatialRelationships.map((rel) => `- ${rel}`)),
    ...cadSourceLines(visibleParts),
    ``,
    `## 4. Annotations (Pinned in 3D)`,
    ``,
    ...annotationLines(openNotes, parts),
    ``,
    `## 5. Instructions for AI Engineer`,
    `- **Custom 3D Printed Parts:** Combine overlapping/mating \`3D Printed PLA/PETG\` solids, add fillets/chamfers, and subtract all \`CUTOUT\` parts and COTS mounting clearances (e.g. +0.25mm tolerance around servos/motors/bearings).`,
    `- **Off-the-Shelf (COTS) Components:** Treat parts tagged \`Off-the-shelf COTS\` as reference keep-out volumes and generate matching screw bosses/mounting holes on adjacent structural brackets.`,
  ];

  return {
    spec,
    markdown: mdLines.join('\n'),
  };
}

export function sceneToStl(parts: ScenePart[]): DataView {
  const exportScene = new THREE.Scene();
  const rootGroup = new THREE.Group();

  rootGroup.rotation.x = Math.PI / 2;

  for (const part of parts) {
    if (!part.visible || part.role !== 'solid') continue;

    const g = buildPartGroup(part, false);
    const toRemove: THREE.Object3D[] = [];

    g.traverse((child) => {
      if (child instanceof THREE.LineSegments) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((c) => c.parent?.remove(c));
    rootGroup.add(g);
  }

  exportScene.add(rootGroup);
  exportScene.updateMatrixWorld(true);

  return new STLExporter().parse(exportScene, { binary: true });
}

export function exportSceneToSTL(parts: ScenePart[], filename = 'robotics-concept.stl') {
  const result = sceneToStl(parts);
  const blob = new Blob([result.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
