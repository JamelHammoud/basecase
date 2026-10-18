import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { synthesizeCustomModelFromRequest } from './acp-3d-model.mjs';

let sessionCounter = 1;
const sessions = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function promptText(prompt) {
  let rawText = '';

  for (const block of prompt || []) {
    if (block.type === 'text' && typeof block.text === 'string') {
      rawText += block.text + '\n';
    }
  }

  return rawText;
}

function structuredPayloadOf(rawText) {
  try {
    const jsonMatch = rawText.match(/__ACP_3D_PAYLOAD_START__([\s\S]*?)__ACP_3D_PAYLOAD_END__/);

    if (jsonMatch) return JSON.parse(jsonMatch[1]);
  } catch {}

  return null;
}

function analysisCopy(structuredPayload) {
  if (structuredPayload?.imageDataUrl) {
    return {
      thought: `Analyzing uploaded 2D reference image "${structuredPayload.imageName || 'reference.png'}", extracting outer silhouette contour, internal hole loops, and mechanical extrusion features...`,
      title: `Tracing 2D silhouette & holes from ${structuredPayload.imageName || 'image'}`,
    };
  }

  return {
    thought: `Interpreting robotics 3D modeling request and synthesizing parametric part geometry...`,
    title: 'Synthesizing 3D parametric geometry',
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

  async cancel(_params) {}

  async prompt(params) {
    const { sessionId, prompt } = params;
    const session = sessions.get(sessionId) || { cwd: process.cwd() };

    const rawText = promptText(prompt);
    const structuredPayload = structuredPayloadOf(rawText);
    const analysis = analysisCopy(structuredPayload);

    const toolCallId1 = `tc-analyze-${Date.now()}`;

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: {
          type: 'text',
          text: analysis.thought,
        },
      },
    });

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: toolCallId1,
        title: analysis.title,
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

    const modelDef = synthesizeCustomModelFromRequest(
      structuredPayload || {
        modelName: rawText.slice(0, 36).trim() || 'Generated Robotics Part',
        promptText: rawText,
      },
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

export const agentConnection = new AgentSideConnection((conn) => new Robotics3DAcpAgent(conn), stream);
