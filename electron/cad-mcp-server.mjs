#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  buildGuide,
  checkPrintability,
  slicePlates,
  getBom,
  setBuild,
  simulate,
  trainPolicy,
  trainingStatus,
  verifyDesign,
} from './cad-mcp/buildTools.mjs';
import { checkAssembly } from './cad-mcp/assemblyTools.mjs';
import { compare } from './cad-mcp/compareTool.mjs';
import { craftReview } from './cad-mcp/craftReview.mjs';
import { fitView } from './cad-mcp/fitViewTool.mjs';
import { photoScale } from './cad-mcp/photoScaleTool.mjs';
import { scoreFit } from './cad-mcp/scoreFitTool.mjs';
import { traceOutline } from './cad-mcp/traceTool.mjs';
import { sizeActuators, sweepDesign } from './cad-mcp/costTools.mjs';
import { listEvidence, readEvidence } from './cad-mcp/evidenceTools.mjs';
import { createGuidePusher, getGuide } from './cad-mcp/guideTools.mjs';
import { checkScene, look } from './cad-mcp/inspectTools.mjs';
import { fasten, getPorts, mate } from './cad-mcp/portTools.mjs';
import { findRecipes } from './cad-mcp/recipeTools.mjs';
import { animate, defineJoints, getRig, importRobot, pose, retargetMotion } from './cad-mcp/robotTools.mjs';
import { modelPart } from './cad-mcp/modelPart.mjs';
import { checkInterfaces, defineSkeleton, setInterfaces } from './cad-mcp/planTools.mjs';
import {
  addParts,
  deleteParts,
  findInSceneTool,
  findParts,
  getPartCode,
  getScene,
  mirrorParts,
  setStatus,
  updateParts,
} from './cad-mcp/sceneTools.mjs';
import { NO_WEB, withToolCall } from './cad-mcp/shared.mjs';
import { findObjects, insertObject } from './cad-mcp/simreadyTools.mjs';
import { checkSkeleton, findImages, findRobotDescription, robotSkeleton, viewImage } from './cad-mcp/webTools.mjs';
import { warmUp } from './cad-kernel/client.mjs';

const TOOLS = [
  defineSkeleton,
  setInterfaces,
  checkInterfaces,
  getScene,
  findInSceneTool,
  modelPart,
  getPartCode,
  addParts,
  updateParts,
  deleteParts,
  mirrorParts,
  getPorts,
  mate,
  fasten,
  look,
  findParts,
  findRecipes,
  compare,
  fitView,
  traceOutline,
  photoScale,
  scoreFit,
  robotSkeleton,
  findRobotDescription,
  checkSkeleton,
  listEvidence,
  readEvidence,
  findImages,
  viewImage,
  checkScene,
  craftReview,
  checkAssembly,
  defineJoints,
  getRig,
  pose,
  animate,
  retargetMotion,
  importRobot,
  findObjects,
  insertObject,
  simulate,
  trainPolicy,
  trainingStatus,
  verifyDesign,
  getBom,
  sizeActuators,
  sweepDesign,
  checkPrintability,
  slicePlates,
  setBuild,
  buildGuide,
  setStatus,
  getGuide,
];

const server = new McpServer(
  { name: 'robotics_cad', version: '3.0.0' },
  { instructions: 'Tools for the Basecase CAD scene. The design instructions are in the system prompt.' },
);
const pushGuides = createGuidePusher();

for (const tool of TOOLS.filter((t) => !(NO_WEB && t.web))) {
  server.registerTool(tool.name, tool.config, async (args, extra) =>
    pushGuides(tool.name, args, await withToolCall(extra, () => tool.handler(args, extra))),
  );
}

await server.connect(new StdioServerTransport());
warmUp();
