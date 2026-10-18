const hasOutline = (features) =>
  features?.contour && Array.isArray(features.contour.outerLoop) && features.contour.outerLoop.length >= 3;

function bodyNode({ id, rawName, features, width, height, depth, baseColor }) {
  if (hasOutline(features)) {
    return {
      id: `${id}-contour-body`,
      name: `${rawName} Extruded Profile`,
      nodeType: 'contour_extrude',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width, height, depth, thickness: 4 },
      color: baseColor,
      contour: features.contour,
    };
  }

  return {
    id: `${id}-base-body`,
    name: `${rawName} Base Plate`,
    nodeType: 'primitive',
    primitiveKind: 'box',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width, height, depth, thickness: 4 },
    color: baseColor,
  };
}

function hubNodes({ id, width, height, depth }) {
  const bossDiam = Math.max(12, Math.round(Math.min(width, depth) * 0.34));
  const bossH = Math.max(8, Math.round(height * 0.9));

  return [
    {
      id: `${id}-hub-boss`,
      name: 'Central Bearing Hub Boss',
      nodeType: 'primitive',
      primitiveKind: 'tube',
      role: 'solid',
      position: [0, Math.round(height * 0.5 + bossH * 0.35), 0],
      rotation: [0, 0, 0],
      dimensions: { width: bossDiam, height: bossH, depth: bossDiam, thickness: 4 },
      color: '#a1a1aa',
    },
  ];
}

function flangeNodes({ id, width, height, depth, baseColor }) {
  const flangeH = Math.max(20, Math.round(Math.min(width, depth) * 0.55));

  return [
    {
      id: `${id}-riser-flange`,
      name: 'Vertical Mounting Flange',
      nodeType: 'primitive',
      primitiveKind: 'l_bracket',
      role: 'solid',
      position: [0, Math.round(height * 0.5 + flangeH * 0.45), 0],
      rotation: [0, 0, 0],
      dimensions: {
        width: Math.round(width * 0.65),
        height: flangeH,
        depth: Math.round(depth * 0.55),
        thickness: 4,
      },
      color: baseColor,
    },
  ];
}

function standoffNodes({ id, width, height, depth }) {
  const ox = Math.round(width * 0.34);
  const oz = Math.round(depth * 0.34);
  const postH = 18;
  const offsets = [
    [-ox, oz],
    [ox, oz],
    [-ox, -oz],
    [ox, -oz],
  ];

  return offsets.map(([px, pz], idx) => ({
    id: `${id}-post-${idx + 1}`,
    name: `Mounting Standoff ${idx + 1}`,
    nodeType: 'primitive',
    primitiveKind: 'standoff',
    role: 'solid',
    position: [px, Math.round(height * 0.5 + postH * 0.5), pz],
    rotation: [0, 0, 0],
    dimensions: { width: 8, height: postH, depth: 8 },
    color: '#eab308',
  }));
}

function servoNodes({ id, height }) {
  return [
    {
      id: `${id}-servo-pocket`,
      name: 'Servo Seat Cutout',
      nodeType: 'primitive',
      primitiveKind: 'hole_box',
      role: 'cutout',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 41, height: height + 6, depth: 21 },
      color: '#ef4444',
    },
  ];
}

const KEYWORD_FEATURES = [
  { words: ['boss', 'hub', 'collar', 'bearing', 'gear', 'wheel'], nodes: hubNodes },
  { words: ['bracket', 'mount', 'flange', 'wall'], nodes: flangeNodes },
  { words: ['standoff', 'pillar', 'posts'], nodes: standoffNodes },
  { words: ['servo'], nodes: servoNodes },
];

function overallHeight(nodes, height) {
  let totalHeight = height;

  for (const n of nodes) {
    const topY = Math.abs(n.position[1]) + n.dimensions.height / 2;

    if (topY * 2 > totalHeight) {
      totalHeight = Math.round(topY * 2);
    }
  }

  return totalHeight;
}

function modelContext(payload) {
  const features = payload.analyzedFeatures;
  const dims = features?.suggestedDimensions;

  return {
    id: `model-${Date.now().toString(36)}`,
    rawName: (payload.modelName || payload.imageName || 'Custom Robotics Part').replace(/\.[a-zA-Z0-9]+$/, '').trim(),
    features,
    width: dims?.width || 64,
    height: dims?.height || 12,
    depth: dims?.depth || 48,
    baseColor: features?.dominantColor || '#d4d4d8',
  };
}

function modelDescription(payload, features) {
  const holeCount = features?.contour?.holes?.length || 0;

  return (
    payload.promptText?.trim() ||
    `3D model generated via ACP from reference image (${features?.contour?.outerLoop?.length || 8} contour vertices, ${holeCount} internal holes).`
  );
}

function modelSource(payload) {
  return {
    sourceType: payload.imageDataUrl ? 'image-to-3d-acp' : 'agent-acp',
    sourceImagePath: payload.imageFilePath || undefined,
    sourceImageDataUrl: payload.imageDataUrl || undefined,
  };
}

export function synthesizeCustomModelFromRequest(payload) {
  const ctx = modelContext(payload);
  const combinedText = `${ctx.rawName.toLowerCase()} ${(payload.promptText || '').toLowerCase()}`;
  const nodes = [
    bodyNode(ctx),
    ...KEYWORD_FEATURES.filter((f) => f.words.some((w) => combinedText.includes(w))).flatMap((f) => f.nodes(ctx)),
  ];

  return {
    id: ctx.id,
    name: ctx.rawName,
    description: modelDescription(payload, ctx.features),
    createdAt: new Date().toISOString(),
    ...modelSource(payload),
    defaultDimensions: {
      width: ctx.width,
      height: overallHeight(nodes, ctx.height),
      depth: ctx.depth,
      thickness: 4,
    },
    defaultColor: ctx.baseColor,
    mechanicalTag: '3D Printed PLA/PETG',
    nodes,
  };
}
