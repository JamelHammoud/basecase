import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { CAD_AGENT_INSTRUCTIONS } from './cad-agent-prompt.mjs';
import { Trainer } from './trainer.mjs';

/** Claude Code over ACP (uses the local Claude login). The legacy offline agent stays available. */
export const CLAUDE_AGENT_COMMAND = 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js';
export const LEGACY_AGENT_COMMAND = 'node electron/acp-3d-agent.mjs';

/** Tools the CAD agent may use without asking; everything else is declined. */
const SAFE_TOOL_PATTERN = /robotics_cad|TodoWrite|WebSearch|WebFetch/i;

/** Images sent inline with one message (folders go through read_evidence instead) */
const MAX_PROMPT_IMAGES = 20;

/** Scene tab that callers without a workspace id (bench, parts generator) talk to */
export const DEFAULT_WORKSPACE = 'main';

/** Workspace ids travel in bridge URLs, so keep them to URL-safe characters */
const safeWorkspace = (id) => String(id || DEFAULT_WORKSPACE).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_WORKSPACE;

/**
 * Environment for the agent process. When the app itself is launched from inside a
 * Claude Code session, that session's host-auth variables would hijack the agent's
 * login; drop them so Claude Code uses the user's own credentials.
 */
function agentEnv() {
  const env = { ...process.env };
  const hosted = !!(env.CLAUDE_CODE_HOST_SESSION_ID || env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH);
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key === 'CLAUDE_PID' || key === 'CLAUDE_EFFORT' || /^CLAUDE_(CODE|AGENT_SDK|PREVIEW)_/.test(key)) {
      delete env[key];
    }
  }
  if (hosted) delete env.ANTHROPIC_BASE_URL;
  return env;
}

/** Resolve "node" to the Node binary that launched us (Electron's PATH can be minimal). */
function resolveCommand(command) {
  const parts = command.trim().split(/\s+/);
  if (parts[0] === 'node' && process.env.npm_node_execpath) parts[0] = process.env.npm_node_execpath;
  return parts;
}

export class BasecaseBackendService {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.libraryDir = path.join(workspaceRoot, 'library');
    this.uploadsDir = path.join(this.libraryDir, 'uploads');
    this.modelsDir = path.join(this.libraryDir, 'models');
    this.scenesDir = path.join(this.libraryDir, 'scenes');
    this.conversationsDir = path.join(this.libraryDir, 'conversations');
    // Folders and files the user attaches as evidence; the agent reads them with read_evidence
    this.evidenceDir = path.join(this.libraryDir, 'evidence');
    // Every image sent in the chat, saved as ref-N so the agent's compare tool can show it beside a render
    this.referencesDir = path.join(this.libraryDir, 'references');
    // Benchmark switch: design from the given references only (no web tools)
    this.offline = process.env.STUDIO_AGENT_OFFLINE === '1';
    this.aiRefDir = path.join(workspaceRoot, 'ai-reference');

    this.ensureDirectories();

    this.agentCommand = CLAUDE_AGENT_COMMAND;
    this.childProcess = null;
    this.acpConnection = null;
    // One ACP session per open scene tab (workspace id → session id), all on one agent process
    this.sessions = new Map();
    this.acpAgentInfo = { name: 'Basecase Offline Agent', version: '1.0.0' };
    this.acpProtocolVersion = PROTOCOL_VERSION;
    this.acpConnected = false;
    this.acpError = null;
    this.eventListeners = new Set();

    // Local bridge the CAD MCP server calls; requests are forwarded to the renderer
    this.pendingAgentRequests = new Map();
    this.bridgeToken = crypto.randomBytes(12).toString('hex');
    this.bridgeUrl = null;
    this.bridgeReady = this.startAgentBridge();

    this.setupFileWatchers();

    // Policy training (MuJoCo + PyTorch through uv), one job per scene tab
    this.trainer = new Trainer(this.libraryDir, (event) => this.emitEvent(event));
  }

  // ==================== Training ====================

  trainStatus() {
    return this.trainer.status();
  }

  trainStart(payload) {
    return this.trainer.start(payload);
  }

  trainStop(workspaceId) {
    return this.trainer.stop(workspaceId);
  }

  getPolicy(id) {
    return this.trainer.getPolicy(id);
  }

  deletePolicy(id) {
    return this.trainer.deletePolicy(id);
  }

  ensureDirectories() {
    for (const dir of [this.libraryDir, this.uploadsDir, this.modelsDir, this.scenesDir, this.aiRefDir, this.conversationsDir, this.evidenceDir, this.referencesDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  setupFileWatchers() {
    try {
      fs.watch(this.modelsDir, () => {
        this.emitEvent({ type: 'library-models-changed', models: this.listModels() });
      });
      fs.watch(this.scenesDir, () => {
        this.emitEvent({ type: 'library-scenes-changed', scenes: this.listScenes() });
      });
    } catch {
      // Ignore watcher errors on platforms where fs.watch is unavailable
    }
  }

  onEvent(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  emitEvent(event) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener error
      }
    }
  }

  // ==================== Agent ↔ canvas bridge ====================

  /**
   * HTTP server on 127.0.0.1 with a per-launch token. The CAD MCP server (spawned by
   * Claude Code) posts scene operations here; we forward them to the renderer and wait
   * for its answer so the agent sees real results (and screenshots).
   */
  startAgentBridge() {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        // /<token>/w/<workspace>/agent/<kind>; the older /<token>/agent/<kind> means the default tab
        const m = new RegExp(`^/${this.bridgeToken}/(?:w/([a-zA-Z0-9_-]+)/)?agent/([a-z_]+)$`).exec(req.url ?? '');
        if (req.method !== 'POST' || !m) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        const workspaceId = m[1] ?? DEFAULT_WORKSPACE;
        const kind = m[2];
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 80_000_000) req.destroy();
        });
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const payload = body ? JSON.parse(body) : {};
            if (kind === 'status') {
              this.emitEvent({ type: 'agent-status', workspaceId, status: String(payload.status || '') });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            const timeout = kind === 'apply' || kind === 'animate' || kind === 'simulate' ? 180000 : kind === 'import_robot' || kind === 'retarget' ? 300000 : 60000;
            const result = await this.requestRenderer(kind, payload, timeout, workspaceId);
            res.end(JSON.stringify(result ?? { ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err?.message ?? err) }));
          }
        });
      });
      server.on('error', (err) => {
        this.acpError = `Agent bridge failed: ${err.message}`;
        resolve(null);
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        this.bridgeUrl = `http://127.0.0.1:${port}/${this.bridgeToken}`;
        resolve(this.bridgeUrl);
      });
      server.unref();
      this.bridgeServer = server;
    });
  }

  /** Asks the scene tab `workspaceId` (or, without one, the tab in front) to run a CAD request */
  requestRenderer(kind, payload, timeoutMs = 60000, workspaceId) {
    if (this.eventListeners.size === 0) {
      return Promise.reject(new Error('The app window is not open.'));
    }
    const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAgentRequests.delete(requestId);
        reject(new Error(`The app did not answer "${kind}" in time.`));
      }, timeoutMs);
      this.pendingAgentRequests.set(requestId, { resolve, reject, timer });
      this.emitEvent({ type: 'agent-request', requestId, kind, payload, workspaceId });
    });
  }

  resolveAgentRequest({ requestId, result, error }) {
    const pending = this.pendingAgentRequests.get(requestId);
    if (!pending) return { ok: false };
    clearTimeout(pending.timer);
    this.pendingAgentRequests.delete(requestId);
    if (error) pending.reject(new Error(String(error)));
    else pending.resolve(result);
    return { ok: true };
  }

  // ==================== ACP (Agent Client Protocol) Connection ====================

  isClaudeAgent() {
    return /claude-(agent|code)-acp/.test(this.agentCommand);
  }

  async connectAcpAgent(customCommand) {
    if (customCommand && typeof customCommand === 'string' && customCommand.trim()) {
      this.agentCommand = customCommand.trim();
    }

    this.disconnectAcpAgent();
    await this.bridgeReady;

    try {
      const [cmd, ...args] = resolveCommand(this.agentCommand);

      const child = spawn(cmd, args, {
        cwd: this.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: agentEnv(),
      });

      this.childProcess = child;

      child.stderr.on('data', (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) this.emitEvent({ type: 'acp-stderr', text: msg });
      });

      child.on('error', (err) => {
        this.acpError = `Couldn't start the agent: ${err.message}`;
      });

      child.on('exit', (code) => {
        if (this.childProcess === child) {
          this.acpConnected = false;
          this.sessions.clear();
          this.emitEvent({ type: 'acp-status', status: this.getAcpStatus(), exitCode: code });
        }
      });

      const toAgentWritable = Writable.toWeb(child.stdin);
      const fromAgentReadable = Readable.toWeb(child.stdout);
      const stream = ndJsonStream(toAgentWritable, fromAgentReadable);

      const clientHandler = {
        // Only CAD tools, the to-do list and web lookups are allowed; everything else is declined.
        requestPermission: async (params) => {
          const call = params.toolCall ?? {};
          const label = `${call._meta?.claudeCode?.toolName ?? ''} ${call.title ?? ''} ${call.kind ?? ''}`;
          const options = params.options ?? [];
          const safe = SAFE_TOOL_PATTERN.test(label) || call.kind === 'fetch' || call.kind === 'think';
          const choice = safe
            ? options.find((o) => o.kind === 'allow_once') ?? options.find((o) => String(o.kind).startsWith('allow'))
            : options.find((o) => o.kind === 'reject_once') ?? options.find((o) => String(o.kind).startsWith('reject'));
          if (!safe) this.emitEvent({ type: 'agent-blocked', workspaceId: this.workspaceOf(params.sessionId), title: call.title ?? 'Tool' });
          if (!choice) return { outcome: { outcome: 'cancelled' } };
          return { outcome: { outcome: 'selected', optionId: choice.optionId } };
        },
        sessionUpdate: async (params) => {
          this.emitEvent({
            type: 'acp-session-update',
            sessionId: params.sessionId,
            workspaceId: this.workspaceOf(params.sessionId),
            update: params.update,
          });
        },
        readTextFile: async (params) => {
          const targetPath = path.resolve(this.workspaceRoot, params.path);
          if (!targetPath.startsWith(this.workspaceRoot)) throw new Error('Outside workspace');
          return { content: fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : '' };
        },
        writeTextFile: async (params) => {
          // Writes are confined to the app's library folder
          const targetPath = path.resolve(this.workspaceRoot, params.path);
          if (!targetPath.startsWith(this.libraryDir)) throw new Error('Writes are limited to library/');
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, params.content, 'utf-8');
          this.emitEvent({
            type: 'acp-file-written',
            path: targetPath,
            models: this.listModels(),
            scenes: this.listScenes(),
          });
          return {};
        },
      };

      const connection = new ClientSideConnection(() => clientHandler, stream);
      this.acpConnection = connection;

      const initRes = await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
        },
        clientInfo: { name: 'Basecase', version: '2.0.0' },
      });

      this.acpProtocolVersion = initRes.protocolVersion;
      if (initRes.agentInfo) this.acpAgentInfo = initRes.agentInfo;

      this.acpConnected = true;
      this.acpError = null;
      // The first tab's session starts with the agent, so its first message doesn't wait for it
      await this.createAcpSession(DEFAULT_WORKSPACE);

      const status = this.getAcpStatus();
      this.emitEvent({ type: 'acp-status', status });
      return status;
    } catch (err) {
      this.acpConnected = false;
      this.acpError = String(err?.message ?? err);
      const status = this.getAcpStatus();
      this.emitEvent({ type: 'acp-status', status });
      return status;
    }
  }

  /** Shared session params: the CAD MCP server and, for Claude, the CAD instructions and tool policy */
  sessionParams(workspaceId = DEFAULT_WORKSPACE) {
    const [nodeCmd] = resolveCommand('node');
    const params = {
      cwd: this.workspaceRoot,
      mcpServers: this.bridgeUrl
        ? [
            {
              name: 'robotics_cad',
              command: nodeCmd,
              args: [path.join(this.workspaceRoot, 'electron', 'cad-mcp-server.mjs')],
              env: [
                // Each tab's MCP server talks to its own scene
                { name: 'CAD_BRIDGE_URL', value: `${this.bridgeUrl}/w/${safeWorkspace(workspaceId)}` },
                { name: 'CAD_EVIDENCE_DIR', value: this.evidenceDir },
                { name: 'CAD_REFERENCES_DIR', value: this.referencesDir },
                ...(this.offline ? [{ name: 'CAD_NO_WEB', value: '1' }] : []),
              ],
            },
          ]
        : [],
    };
    if (this.isClaudeAgent()) {
      const web = this.offline ? [] : ['WebSearch', 'WebFetch'];
      params._meta = {
        systemPrompt: {
          append: this.offline
            ? `${CAD_AGENT_INSTRUCTIONS}\n\nWeb tools are off in this session: design from the user's references and your own knowledge.`
            : CAD_AGENT_INSTRUCTIONS,
        },
        claudeCode: {
          options: {
            // No file, shell or edit tools: the agent works only through the CAD tools
            tools: ['TodoWrite', ...web],
            // Stream readable reasoning summaries so the user can follow along
            thinking: { type: 'adaptive', display: 'summarized' },
            allowedTools: ['mcp__robotics_cad', 'TodoWrite', ...web],
          },
        },
      };
    }
    return params;
  }

  /** The scene tab a session belongs to */
  workspaceOf(sessionId) {
    for (const [ws, id] of this.sessions) if (id === sessionId) return ws;
    return undefined;
  }

  bindSession(workspaceId, sessionId) {
    const ws = safeWorkspace(workspaceId);
    // A conversation lives in one tab at a time
    for (const [other, id] of this.sessions) if (id === sessionId && other !== ws) this.sessions.delete(other);
    this.sessions.set(ws, sessionId);
    this.emitEvent({ type: 'acp-session', workspaceId: ws, sessionId });
  }

  /** New conversation for one scene tab, with the CAD MCP server and instructions attached. */
  async createAcpSession(workspaceId = DEFAULT_WORKSPACE) {
    const sessionRes = await this.acpConnection.newSession(this.sessionParams(workspaceId));
    this.bindSession(workspaceId, sessionRes.sessionId);
    return sessionRes.sessionId;
  }

  /** The tab's session, connecting and creating one on first use */
  async ensureSession(workspaceId = DEFAULT_WORKSPACE) {
    if (!this.acpConnected || !this.acpConnection) await this.connectAcpAgent();
    if (!this.acpConnection) throw new Error(this.acpError || 'The agent is not connected');
    return this.sessions.get(safeWorkspace(workspaceId)) ?? (await this.createAcpSession(workspaceId));
  }

  /** Continue a past conversation in a tab (Claude keeps its context; nothing is replayed) */
  async resumeAcpConversation(sessionId, workspaceId = DEFAULT_WORKSPACE) {
    if (!this.acpConnection) await this.connectAcpAgent();
    if (!this.acpConnection) throw new Error(this.acpError || 'The agent is not connected');
    const previous = this.sessions.get(safeWorkspace(workspaceId));
    try {
      await this.acpConnection.resumeSession({ sessionId, ...this.sessionParams(workspaceId) });
      this.bindSession(workspaceId, sessionId);
    } catch {
      // Agent can't resume this one (e.g. offline agent): start fresh, transcript stays visible
      await this.createAcpSession(workspaceId);
    }
    if (previous && previous !== this.sessions.get(safeWorkspace(workspaceId))) this.closeSessionQuietly(previous);
    return this.getAcpStatus(workspaceId);
  }

  /** Ends a session the tab no longer uses, so its Claude process and tools shut down */
  closeSessionQuietly(sessionId) {
    if (!this.acpConnection || [...this.sessions.values()].includes(sessionId)) return;
    this.acpConnection.closeSession?.({ sessionId }).catch(() => {});
  }

  /** A scene tab closed: stop its run and end its session */
  async closeWorkspace(workspaceId) {
    const ws = safeWorkspace(workspaceId);
    const sessionId = this.sessions.get(ws);
    if (!sessionId) return { ok: true };
    this.sessions.delete(ws);
    if (this.acpConnection) {
      await this.acpConnection.cancel({ sessionId }).catch(() => {});
      this.closeSessionQuietly(sessionId);
    }
    return { ok: true };
  }

  // ==================== Agent conversations ====================

  listConversations() {
    this.ensureDirectories();
    return fs
      .readdirSync(this.conversationsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const c = JSON.parse(fs.readFileSync(path.join(this.conversationsDir, f), 'utf-8'));
          return { id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages?.length ?? 0 };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  getConversation(id) {
    const file = path.join(this.conversationsDir, `${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
  }

  saveConversation(conv) {
    this.ensureDirectories();
    const id = String(conv.id).replace(/[^a-zA-Z0-9_-]/g, '');
    fs.writeFileSync(
      path.join(this.conversationsDir, `${id}.json`),
      JSON.stringify({ ...conv, id, updatedAt: new Date().toISOString() }),
      'utf-8'
    );
    return this.listConversations();
  }

  // ==================== Purchase records (dated price checks) ====================

  /**
   * What the user saw when they checked a part's Amazon listing, keyed by catalog key
   * ("component:<id>", "hardware:<type>|<size>|…", "supply:<id>"). App-wide: one check of an
   * STS3215 serves every scene. Prices are never fetched or guessed; a person records them.
   */
  listPurchases() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.libraryDir, 'purchases.json'), 'utf-8'));
    } catch {
      return {};
    }
  }

  savePurchase({ key, record }) {
    if (!key || typeof key !== 'string') throw new Error('Missing purchase key');
    const all = this.listPurchases();
    if (record) all[key] = { ...record, checkedAt: record.checkedAt || new Date().toLocaleDateString('en-CA') };
    else delete all[key];
    fs.writeFileSync(path.join(this.libraryDir, 'purchases.json'), JSON.stringify(all, null, 2), 'utf-8');
    return all;
  }

  deleteConversation(id) {
    const file = path.join(this.conversationsDir, `${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return this.listConversations();
  }

  async newAcpConversation(workspaceId = DEFAULT_WORKSPACE) {
    if (!this.acpConnection) await this.connectAcpAgent();
    if (!this.acpConnection) return this.getAcpStatus(workspaceId);
    const previous = this.sessions.get(safeWorkspace(workspaceId));
    await this.createAcpSession(workspaceId);
    if (previous) this.closeSessionQuietly(previous);
    return this.getAcpStatus(workspaceId);
  }

  async cancelAcpPrompt(workspaceId = DEFAULT_WORKSPACE) {
    const sessionId = this.sessions.get(safeWorkspace(workspaceId));
    if (this.acpConnection && sessionId) {
      await this.acpConnection.cancel({ sessionId });
    }
    return { ok: true };
  }

  disconnectAcpAgent() {
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch {
        // ignore
      }
      this.childProcess = null;
    }
    this.acpConnection = null;
    this.sessions.clear();
    this.acpConnected = false;
  }

  /** Connection state; sessionId is the given tab's conversation */
  getAcpStatus(workspaceId = DEFAULT_WORKSPACE) {
    return {
      connected: this.acpConnected,
      sessionId: this.sessions.get(safeWorkspace(workspaceId)) ?? null,
      agentName: this.acpAgentInfo?.title || this.acpAgentInfo?.name || 'Agent',
      agentCommand: this.agentCommand,
      protocolVersion: this.acpProtocolVersion,
      error: this.acpError || undefined,
    };
  }

  /** ACP prompt blocks for a user message: inline images, then the text with evidence listings */
  buildPromptBlocks(payload) {
    if (!this.isClaudeAgent()) {
      return [
        {
          type: 'text',
          text:
            `${payload.promptText || 'Convert reference image into 3D robotics model'}\n` +
            `__ACP_3D_PAYLOAD_START__${JSON.stringify(payload)}__ACP_3D_PAYLOAD_END__`,
        },
      ];
    }
    const blocks = [];
    const urls = Array.isArray(payload.imageDataUrls) && payload.imageDataUrls.length
      ? payload.imageDataUrls
      : payload.imageDataUrl
        ? [payload.imageDataUrl]
        : [];
    let imageCount = 0;
    const refNames = [];
    for (const url of urls.slice(0, MAX_PROMPT_IMAGES)) {
      const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url || '');
      if (m) {
        blocks.push({ type: 'image', mimeType: m[1], data: m[2] });
        imageCount++;
        const name = this.saveReferenceImage(m[1], m[2]);
        if (name) refNames.push(name);
      }
    }
    const folders = (Array.isArray(payload.evidenceFolders) ? payload.evidenceFolders : [])
      .map((f) => this.describeEvidenceFolder(f.id))
      .filter(Boolean);
    const lines = [
      payload.promptText?.trim() ||
        (imageCount || folders.length
          ? `Build a part-based CAD model of what is in ${imageCount + folders.length > 1 ? 'these references' : 'this reference'}.`
          : ''),
    ];
    if (imageCount > 1) lines.push(`(${imageCount} reference images of the same object, from different angles or details.)`);
    if (refNames.length) {
      lines.push(`(Saved as ${refNames.join(', ')}, in the order shown. compare puts one beside a render of your model.)`);
    }
    if (payload.targetHeightMm) lines.push(`Target overall height: about ${payload.targetHeightMm} mm.`);
    if (folders.length) {
      lines.push(
        '',
        'The user attached evidence files. Study ALL of them with read_evidence before you plan: every image, every text file and every mesh summary.',
        ...folders
      );
    }
    blocks.push({ type: 'text', text: lines.filter((l) => l !== undefined && l !== null).join('\n').trim() });
    return blocks;
  }

  /** Saves a chat image as the next ref-N (numbering continues across sessions, so names stay unique) */
  saveReferenceImage(mime, base64) {
    try {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] ?? 'png';
      if (this.nextReference === undefined) {
        const used = fs.readdirSync(this.referencesDir).map((f) => Number(/^ref-(\d+)\./.exec(f)?.[1] ?? 0));
        this.nextReference = Math.max(0, ...used) + 1;
      }
      const name = `ref-${this.nextReference++}`;
      fs.writeFileSync(path.join(this.referencesDir, `${name}.${ext}`), Buffer.from(base64, 'base64'));
      return name;
    } catch {
      return null;
    }
  }

  async sendAcpPrompt(payload) {
    const sessionId = await this.ensureSession(payload.workspaceId);
    const res = await this.acpConnection.prompt({
      sessionId,
      prompt: this.buildPromptBlocks(payload),
    });

    return {
      stopReason: res.stopReason,
      sessionId,
      models: this.listModels(),
      scenes: this.listScenes(),
    };
  }

  /**
   * Steer the running turn: Claude Code reads the message between steps without stopping.
   * Returns { outcome: 'injected' }, or 'promptRequired' / 'unsupported' when the caller
   * should send it as a normal prompt once the current run ends.
   */
  async steerAcpPrompt(payload) {
    const sessionId = this.sessions.get(safeWorkspace(payload.workspaceId));
    if (!this.acpConnection || !sessionId || !this.isClaudeAgent()) return { outcome: 'unsupported' };
    try {
      const res = await this.acpConnection.extMethod('_session/steering', {
        sessionId,
        prompt: this.buildPromptBlocks(payload),
        _meta: { steering: { idleBehavior: 'promptRequired' } },
      });
      return { outcome: res?.outcome === 'injected' ? 'injected' : 'promptRequired' };
    } catch {
      return { outcome: 'unsupported' };
    }
  }

  // ==================== Evidence (attached folders and files) ====================

  /** Stores one attached file under library/evidence/<folderId>/<relPath> */
  saveEvidenceFile({ folderId, folderName, relPath, dataUrl, text }) {
    const id = String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) throw new Error('Missing evidence folder id');
    const root = path.join(this.evidenceDir, id);
    const rel = String(relPath || 'file')
      .split(/[\\/]+/)
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .map((seg) => seg.replace(/[^\w .()+@-]/g, '_').slice(0, 120))
      .join('/');
    const target = path.join(root, rel);
    if (!target.startsWith(root + path.sep)) throw new Error('Bad evidence path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(path.join(root, '.folder.json'))) {
      fs.writeFileSync(path.join(root, '.folder.json'), JSON.stringify({ id, name: folderName || id, createdAt: new Date().toISOString() }));
    }
    const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl || '');
    if (m) fs.writeFileSync(target, Buffer.from(m[2], 'base64'));
    else fs.writeFileSync(target, String(text ?? ''), 'utf-8');
    return { ok: true, path: `${id}/${rel}` };
  }

  /** Files in one evidence folder, as paths read_evidence accepts */
  listEvidenceFiles(folderId) {
    const id = String(folderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const root = path.join(this.evidenceDir, id);
    if (!id || !fs.existsSync(root)) return null;
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push({ path: `${id}/${path.relative(root, full).split(path.sep).join('/')}`, bytes: fs.statSync(full).size });
      }
    };
    walk(root);
    let name = id;
    try {
      name = JSON.parse(fs.readFileSync(path.join(root, '.folder.json'), 'utf-8')).name || id;
    } catch {
      // no metadata
    }
    return { id, name, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  }

  /** Prompt text listing a folder's files for the agent */
  describeEvidenceFolder(folderId) {
    const folder = this.listEvidenceFiles(folderId);
    if (!folder) return null;
    const kind = (p) => (/\.(png|jpe?g|webp|gif)$/i.test(p) ? 'image' : /\.mesh\.txt$/i.test(p) ? 'mesh summary' : 'text');
    const counts = {};
    for (const f of folder.files) counts[kind(f.path)] = (counts[kind(f.path)] || 0) + 1;
    const summary = Object.entries(counts)
      .map(([k, n]) => `${n} ${n > 1 ? { image: 'images', text: 'text files', 'mesh summary': 'mesh summaries' }[k] : k === 'text' ? 'text file' : k}`)
      .join(', ');
    const shown = folder.files.slice(0, 400);
    return [
      `Evidence folder "${folder.name}" (${summary}):`,
      ...shown.map((f) => `- ${f.path} (${kind(f.path)}, ${Math.max(1, Math.round(f.bytes / 1024))} KB)`),
      ...(folder.files.length > shown.length ? [`- …and ${folder.files.length - shown.length} more (list_evidence shows all)`] : []),
    ].join('\n');
  }

  // ==================== Reference Images Library ====================

  saveUploadedImage({ name, dataUrl, width, height }) {
    this.ensureDirectories();
    const id = `img-${Date.now().toString(36)}`;
    const safeName = (name || 'reference.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${id}-${safeName}`;
    const filePath = path.join(this.uploadsDir, fileName);

    const base64Match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (base64Match) {
      fs.writeFileSync(filePath, Buffer.from(base64Match[2], 'base64'));
    }

    const metaPath = path.join(this.uploadsDir, `${id}.meta.json`);
    const record = {
      id,
      name: name || 'Reference Image',
      filePath,
      dataUrl,
      uploadedAt: new Date().toISOString(),
      width,
      height,
    };
    fs.writeFileSync(metaPath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  }

  listUploadedImages() {
    this.ensureDirectories();
    const files = fs.readdirSync(this.uploadsDir).filter((f) => f.endsWith('.meta.json'));
    const records = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.uploadsDir, file), 'utf-8');
        records.push(JSON.parse(raw));
      } catch {
        // skip invalid meta
      }
    }
    return records.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  }

  // ==================== Individual 3D Models Library ====================

  listModels() {
    this.ensureDirectories();
    const files = fs.readdirSync(this.modelsDir).filter((f) => f.endsWith('.json'));
    const models = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.modelsDir, file), 'utf-8');
        models.push(JSON.parse(raw));
      } catch {
        // skip malformed json
      }
    }
    return models.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  saveModel(modelDef) {
    this.ensureDirectories();
    const id = modelDef.id || `model-${Date.now().toString(36)}`;
    const record = {
      ...modelDef,
      id,
      createdAt: modelDef.createdAt || new Date().toISOString(),
    };
    const filePath = path.join(this.modelsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return record;
  }

  deleteModel(modelId) {
    const filePath = path.join(this.modelsDir, `${modelId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return this.listModels();
  }

  // ==================== Saved 3D Scenes Library ====================

  listScenes() {
    this.ensureDirectories();
    const files = fs.readdirSync(this.scenesDir).filter((f) => f.endsWith('.json'));
    const scenes = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.scenesDir, file), 'utf-8');
        scenes.push(JSON.parse(raw));
      } catch {
        // skip
      }
    }
    return scenes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  saveScene(scenePayload) {
    this.ensureDirectories();
    const id =
      scenePayload.id ||
      scenePayload.name
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') ||
      `scene-${Date.now().toString(36)}`;

    const record = {
      id,
      name: scenePayload.name || 'Untitled Robotics Scene',
      globalGoal: scenePayload.globalGoal || '',
      // Background rewrites (data upgrades) keep the scene's place in the Library
      updatedAt: scenePayload.keepUpdatedAt && scenePayload.updatedAt ? scenePayload.updatedAt : new Date().toISOString(),
      partCount: Array.isArray(scenePayload.parts) ? scenePayload.parts.length : 0,
      thumbnailDataUrl: scenePayload.thumbnailDataUrl,
      parts: scenePayload.parts || [],
      referenceImages: scenePayload.referenceImages || [],
      annotations: scenePayload.annotations || [],
      project: scenePayload.project,
    };

    const filePath = path.join(this.scenesDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');

    // Also update ai-reference/ so the workspace AI agent can always inspect the latest saved scene
    if (scenePayload.spec) {
      fs.writeFileSync(
        path.join(this.aiRefDir, 'design-spec.json'),
        JSON.stringify(scenePayload.spec, null, 2),
        'utf-8'
      );
    }
    if (scenePayload.markdown) {
      fs.writeFileSync(path.join(this.aiRefDir, 'DESIGN_BRIEF.md'), scenePayload.markdown, 'utf-8');
    }
    if (scenePayload.thumbnailDataUrl) {
      const m = scenePayload.thumbnailDataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (m) {
        fs.writeFileSync(path.join(this.aiRefDir, 'preview.png'), Buffer.from(m[1], 'base64'));
      }
    }

    return record;
  }

  deleteScene(sceneId) {
    const filePath = path.join(this.scenesDir, `${sceneId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return this.listScenes();
  }
}
