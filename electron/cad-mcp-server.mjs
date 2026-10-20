#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CAD_AGENT_INSTRUCTIONS } from './cad-agent-prompt.mjs';
import {
  checkPrintability,
  getBom,
  setBuild,
  simulate,
  trainPolicy,
  trainingStatus,
  verifyDesign,
} from './cad-mcp/buildTools.mjs';
import { compare } from './cad-mcp/compareTool.mjs';
import { listEvidence, readEvidence } from './cad-mcp/evidenceTools.mjs';
import { checkScene, look } from './cad-mcp/inspectTools.mjs';
import { animate, defineJoints, getRig, importRobot, pose, retargetMotion } from './cad-mcp/robotTools.mjs';
import {
  addParts,
  deleteParts,
  findParts,
  getPartCode,
  getScene,
  mirrorParts,
  modelPart,
  setStatus,
  updateParts,
} from './cad-mcp/sceneTools.mjs';
import { NO_WEB, withToolCall } from './cad-mcp/shared.mjs';
import { checkSkeleton, findImages, findRobotDescription, robotSkeleton, viewImage } from './cad-mcp/webTools.mjs';
import { warmUp } from './cad-kernel/client.mjs';

const TOOLS = [
  getScene,
  modelPart,
  getPartCode,
  addParts,
  updateParts,
  deleteParts,
  mirrorParts,
  look,
  findParts,
  compare,
  robotSkeleton,
  findRobotDescription,
  checkSkeleton,
  listEvidence,
  readEvidence,
  findImages,
  viewImage,
  checkScene,
  defineJoints,
  getRig,
  pose,
  animate,
  retargetMotion,
  importRobot,
  simulate,
  trainPolicy,
  trainingStatus,
  verifyDesign,
  getBom,
  checkPrintability,
  setBuild,
  setStatus,
];

const server = new McpServer({ name: 'robotics_cad', version: '3.0.0' }, { instructions: CAD_AGENT_INSTRUCTIONS });

for (const tool of TOOLS.filter((t) => !(NO_WEB && t.web))) {
  server.registerTool(tool.name, tool.config, (args, extra) => withToolCall(extra, () => tool.handler(args, extra)));
}

await server.connect(new StdioServerTransport());
warmUp();
