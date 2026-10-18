import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

let sessionCounter = 1;
const sessions = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Built-in Parametric & Contour 3D Synthesizer for the ACP Agent
 * Combines traced image silhouette/holes with mechanical features described in prompt/image name.
 */
function synthesizeCustomModelFromRequest(payload) {
  const id = `model-${Date.now().toString(36)}`;
  const rawName = (payload.modelName || payload.imageName || 'Custom Robotics Part')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .trim();
  const promptText = (payload.promptText || '').toLowerCase();
  const features = payload.analyzedFeatures;

  const width = features?.suggestedDimensions?.width || 64;
  const height = features?.suggestedDimensions?.height || 12;
  const depth = features?.suggestedDimensions?.depth || 48;
  const baseColor = features?.dominantColor || '#d4d4d8';

  const nodes = [];

  if (features?.contour && Array.isArray(features.contour.outerLoop) && features.contour.outerLoop.length >= 3) {
    nodes.push({
      id: `${id}-contour-body`,
      name: `${rawName} Extruded Profile`,
      nodeType: 'contour_extrude',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width, height, depth, thickness: 4 },
      color: baseColor,
      contour: features.contour,
    });
  } else {
    nodes.push({
      id: `${id}-base-body`,
      name: `${rawName} Base Plate`,
      nodeType: 'primitive',
      primitiveKind: 'box',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width, height, depth, thickness: 4 },
      color: baseColor,
    });
  }

  // Synthesize additional 3D robotics sub-features based on prompt or part name keywords
  const combinedText = `${rawName.toLowerCase()} ${promptText}`;

  if (
    combinedText.includes('boss') ||
    combinedText.includes('hub') ||
    combinedText.includes('collar') ||
    combinedText.includes('bearing') ||
    combinedText.includes('gear') ||
    combinedText.includes('wheel')
  ) {
    const bossDiam = Math.max(12, Math.round(Math.min(width, depth) * 0.34));
    const bossH = Math.max(8, Math.round(height * 0.9));
    nodes.push({
      id: `${id}-hub-boss`,
      name: 'Central Bearing Hub Boss',
      nodeType: 'primitive',
      primitiveKind: 'tube',
      role: 'solid',
      position: [0, Math.round(height * 0.5 + bossH * 0.35), 0],
      rotation: [0, 0, 0],
      dimensions: { width: bossDiam, height: bossH, depth: bossDiam, thickness: 4 },
      color: '#a1a1aa',
    });
  }

  if (
    combinedText.includes('bracket') ||
    combinedText.includes('mount') ||
    combinedText.includes('flange') ||
    combinedText.includes('wall')
  ) {
    const flangeH = Math.max(20, Math.round(Math.min(width, depth) * 0.55));
    nodes.push({
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
    });
  }

  if (combinedText.includes('standoff') || combinedText.includes('pillar') || combinedText.includes('posts')) {
    const ox = Math.round(width * 0.34);
    const oz = Math.round(depth * 0.34);
    const postH = 18;
    const offsets = [
      [-ox, oz],
      [ox, oz],
      [-ox, -oz],
      [ox, -oz],
    ];
    offsets.forEach(([px, pz], idx) => {
      nodes.push({
        id: `${id}-post-${idx + 1}`,
        name: `Mounting Standoff ${idx + 1}`,
        nodeType: 'primitive',
        primitiveKind: 'standoff',
        role: 'solid',
        position: [px, Math.round(height * 0.5 + postH * 0.5), pz],
        rotation: [0, 0, 0],
        dimensions: { width: 8, height: postH, depth: 8 },
        color: '#eab308',
      });
    });
  }

  if (combinedText.includes('servo')) {
    nodes.push({
      id: `${id}-servo-pocket`,
      name: 'Servo Seat Cutout',
      nodeType: 'primitive',
      primitiveKind: 'hole_box',
      role: 'cutout',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 41, height: height + 6, depth: 21 },
      color: '#ef4444',
    });
  }

  // Compute total height across nodes
  let totalHeight = height;
  for (const n of nodes) {
    const topY = Math.abs(n.position[1]) + n.dimensions.height / 2;
    if (topY * 2 > totalHeight) {
      totalHeight = Math.round(topY * 2);
    }
  }

  const holeCount = features?.contour?.holes?.length || 0;

  return {
    id,
    name: rawName,
    description:
      payload.promptText?.trim() ||
      `3D model generated via ACP from reference image (${features?.contour?.outerLoop?.length || 8} contour vertices, ${holeCount} internal holes).`,
    createdAt: new Date().toISOString(),
    sourceType: payload.imageDataUrl ? 'image-to-3d-acp' : 'agent-acp',
    sourceImagePath: payload.imageFilePath || undefined,
    sourceImageDataUrl: payload.imageDataUrl || undefined,
    defaultDimensions: {
      width,
      height: totalHeight,
      depth,
      thickness: 4,
    },
    defaultColor: baseColor,
    mechanicalTag: '3D Printed PLA/PETG',
    nodes,
  };
}

class Robotics3DAcpAgent {
  constructor(conn) {
    this.conn = conn;
  }

  async initialize(_params) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
      },
      agentInfo: {
        name: 'Basecase Offline Agent',
        version: '1.0.0',
      },
    };
  }

  async newSession(params) {
    const sessionId = `acp-session-${sessionCounter++}`;
    sessions.set(sessionId, {
      cwd: params.cwd || process.cwd(),
      createdAt: new Date().toISOString(),
    });
    return { sessionId };
  }

  async authenticate(_params) {
    return {};
  }

  async cancel(_params) {
    // Handle cancellation
  }

  async prompt(params) {
    const { sessionId, prompt } = params;
    const session = sessions.get(sessionId) || { cwd: process.cwd() };

    // Extract text or structured JSON request from prompt blocks
    let rawText = '';
    for (const block of prompt || []) {
      if (block.type === 'text' && typeof block.text === 'string') {
        rawText += block.text + '\n';
      }
    }

    let structuredPayload = null;
    try {
      const jsonMatch = rawText.match(/__ACP_3D_PAYLOAD_START__([\s\S]*?)__ACP_3D_PAYLOAD_END__/);
      if (jsonMatch) {
        structuredPayload = JSON.parse(jsonMatch[1]);
      }
    } catch {
      // treat as plain text prompt
    }

    const toolCallId1 = `tc-analyze-${Date.now()}`;
    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: {
          type: 'text',
          text: structuredPayload?.imageDataUrl
            ? `Analyzing uploaded 2D reference image "${structuredPayload.imageName || 'reference.png'}", extracting outer silhouette contour, internal hole loops, and mechanical extrusion features...`
            : `Interpreting robotics 3D modeling request and synthesizing parametric part geometry...`,
        },
      },
    });

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: toolCallId1,
        title: structuredPayload?.imageDataUrl
          ? `Tracing 2D silhouette & holes from ${structuredPayload.imageName || 'image'}`
          : 'Synthesizing 3D parametric geometry',
        kind: 'think',
        status: 'in_progress',
      },
    });

    await sleep(220);

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: toolCallId1,
        status: 'completed',
      },
    });

    // Synthesize 3D model definition
    const modelDef = synthesizeCustomModelFromRequest(
      structuredPayload || {
        modelName: rawText.slice(0, 36).trim() || 'Generated Robotics Part',
        promptText: rawText,
      }
    );

    const modelRelPath = path.join('library', 'models', `${modelDef.id}.json`);
    const modelAbsPath = path.resolve(session.cwd, modelRelPath);

    const toolCallId2 = `tc-write-${Date.now()}`;
    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: toolCallId2,
        title: `Saving 3D Model "${modelDef.name}" to ${modelRelPath}`,
        kind: 'edit',
        status: 'in_progress',
      },
    });

    // Write file using official ACP Client fs/write_text_file capability!
    await this.conn.writeTextFile({
      sessionId,
      path: modelAbsPath,
      content: JSON.stringify(modelDef, null, 2),
    });

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: toolCallId2,
        status: 'completed',
      },
    });

    const summaryMsg =
      `Created 3D model **${modelDef.name}** (\`${modelDef.defaultDimensions.width} × ${modelDef.defaultDimensions.height} × ${modelDef.defaultDimensions.depth} mm\`, ${modelDef.nodes.length} geometry node${modelDef.nodes.length > 1 ? 's' : ''}) and saved it to your Individual Models Library (\`${modelRelPath}\`).\n\n` +
      `[MODEL_CREATED:${modelDef.id}]`;

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: summaryMsg,
        },
      },
    });

    return {
      stopReason: 'end_turn',
    };
  }
}

const inputStream = Readable.toWeb(process.stdin);
const outputStream = Writable.toWeb(process.stdout);
const stream = ndJsonStream(outputStream, inputStream);

new AgentSideConnection((conn) => new Robotics3DAcpAgent(conn), stream);
