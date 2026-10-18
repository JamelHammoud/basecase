import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { agentEnv, resolveCommand } from './agentProcess.mjs';
import { createClientHandler } from './acpClientHandler.mjs';
import { CLAUDE_AGENT_COMMAND, DEFAULT_WORKSPACE, safeWorkspace } from './constants.mjs';
import { buildSessionParams } from './sessionParams.mjs';

const hasCustomCommand = (command) => command && typeof command === 'string' && command.trim();

export class AcpAgent {
  constructor({ paths, workspaceRoot, offline, bridge, emit, libraryState, promptBlocks }) {
    this.paths = paths;
    this.workspaceRoot = workspaceRoot;
    this.offline = offline;
    this.bridge = bridge;
    this.emit = emit;
    this.libraryState = libraryState;
    this.promptBlocks = promptBlocks;
    this.command = CLAUDE_AGENT_COMMAND;
    this.childProcess = null;
    this.connection = null;
    this.sessions = new Map();
    this.agentInfo = { name: 'Basecase Offline Agent', version: '1.0.0' };
    this.protocolVersion = PROTOCOL_VERSION;
    this.connected = false;
    this.error = null;
  }

  isClaude() {
    return /claude-(agent|code)-acp/.test(this.command);
  }

  spawnChild() {
    const [cmd, ...args] = resolveCommand(this.command);
    const child = spawn(cmd, args, { cwd: this.workspaceRoot, stdio: ['pipe', 'pipe', 'pipe'], env: agentEnv() });

    this.childProcess = child;
    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();

      if (msg) this.emit({ type: 'acp-stderr', text: msg });
    });
    child.on('error', (err) => {
      this.error = `Couldn't start the agent: ${err.message}`;
    });
    child.on('exit', (code) => {
      if (this.childProcess !== child) return;

      this.connected = false;
      this.sessions.clear();
      this.emit({ type: 'acp-status', status: this.status(), exitCode: code });
    });

    return child;
  }

  openConnection(child) {
    const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
    const clientHandler = createClientHandler({
      workspaceRoot: this.workspaceRoot,
      libraryDir: this.paths.libraryDir,
      emit: this.emit,
      workspaceOf: (sessionId) => this.workspaceOf(sessionId),
      libraryState: this.libraryState,
    });

    return new ClientSideConnection(() => clientHandler, stream);
  }

  async initialize(connection) {
    const initRes = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
      clientInfo: { name: 'Basecase', version: '2.0.0' },
    });

    this.protocolVersion = initRes.protocolVersion;

    if (initRes.agentInfo) this.agentInfo = initRes.agentInfo;
  }

  async connect(customCommand) {
    if (hasCustomCommand(customCommand)) this.command = customCommand.trim();

    this.disconnect();
    await this.bridge.ready;

    try {
      const connection = this.openConnection(this.spawnChild());

      this.connection = connection;
      await this.initialize(connection);
      this.connected = true;
      this.error = null;
      await this.createSession(DEFAULT_WORKSPACE);
    } catch (err) {
      this.connected = false;
      this.error = String(err?.message ?? err);
    }

    const status = this.status();

    this.emit({ type: 'acp-status', status });

    return status;
  }

  sessionParams(workspaceId = DEFAULT_WORKSPACE) {
    return buildSessionParams(
      {
        workspaceRoot: this.workspaceRoot,
        bridgeUrl: this.bridge.url,
        evidenceDir: this.paths.evidenceDir,
        referencesDir: this.paths.referencesDir,
        offline: this.offline,
        isClaude: this.isClaude(),
      },
      workspaceId,
    );
  }

  workspaceOf(sessionId) {
    for (const [ws, id] of this.sessions) if (id === sessionId) return ws;

    return undefined;
  }

  bindSession(workspaceId, sessionId) {
    const ws = safeWorkspace(workspaceId);

    for (const [other, id] of this.sessions) if (id === sessionId && other !== ws) this.sessions.delete(other);

    this.sessions.set(ws, sessionId);
    this.emit({ type: 'acp-session', workspaceId: ws, sessionId });
  }

  sessionOf(workspaceId) {
    return this.sessions.get(safeWorkspace(workspaceId));
  }

  async createSession(workspaceId = DEFAULT_WORKSPACE) {
    const sessionRes = await this.connection.newSession(this.sessionParams(workspaceId));

    this.bindSession(workspaceId, sessionRes.sessionId);

    return sessionRes.sessionId;
  }

  requireConnection() {
    if (!this.connection) throw new Error(this.error || 'The agent is not connected');
  }

  async ensureSession(workspaceId = DEFAULT_WORKSPACE) {
    if (!this.connected || !this.connection) await this.connect();

    this.requireConnection();

    return this.sessionOf(workspaceId) ?? (await this.createSession(workspaceId));
  }

  async resume(sessionId, workspaceId = DEFAULT_WORKSPACE) {
    if (!this.connection) await this.connect();

    this.requireConnection();

    const previous = this.sessionOf(workspaceId);

    try {
      await this.connection.resumeSession({ sessionId, ...this.sessionParams(workspaceId) });
      this.bindSession(workspaceId, sessionId);
    } catch {
      await this.createSession(workspaceId);
    }

    if (previous && previous !== this.sessionOf(workspaceId)) this.closeSessionQuietly(previous);

    return this.status(workspaceId);
  }

  closeSessionQuietly(sessionId) {
    if (!this.connection || [...this.sessions.values()].includes(sessionId)) return;

    this.connection.closeSession?.({ sessionId }).catch(() => {});
  }

  async closeWorkspace(workspaceId) {
    const ws = safeWorkspace(workspaceId);
    const sessionId = this.sessions.get(ws);

    if (!sessionId) return { ok: true };

    this.sessions.delete(ws);

    if (this.connection) {
      await this.connection.cancel({ sessionId }).catch(() => {});
      this.closeSessionQuietly(sessionId);
    }

    return { ok: true };
  }

  async newConversation(workspaceId = DEFAULT_WORKSPACE) {
    if (!this.connection) await this.connect();

    if (!this.connection) return this.status(workspaceId);

    const previous = this.sessionOf(workspaceId);

    await this.createSession(workspaceId);

    if (previous) this.closeSessionQuietly(previous);

    return this.status(workspaceId);
  }

  async cancel(workspaceId = DEFAULT_WORKSPACE) {
    const sessionId = this.sessionOf(workspaceId);

    if (this.connection && sessionId) {
      await this.connection.cancel({ sessionId });
    }

    return { ok: true };
  }

  disconnect() {
    if (this.childProcess) {
      try {
        this.childProcess.kill();
      } catch {}

      this.childProcess = null;
    }

    this.connection = null;
    this.sessions.clear();
    this.connected = false;
  }

  status(workspaceId = DEFAULT_WORKSPACE) {
    return {
      connected: this.connected,
      sessionId: this.sessionOf(workspaceId) ?? null,
      agentName: this.agentInfo?.title || this.agentInfo?.name || 'Agent',
      agentCommand: this.command,
      protocolVersion: this.protocolVersion,
      error: this.error || undefined,
    };
  }

  async sendPrompt(payload) {
    const sessionId = await this.ensureSession(payload.workspaceId);
    const res = await this.connection.prompt({ sessionId, prompt: this.promptBlocks(payload) });

    return { stopReason: res.stopReason, sessionId, ...this.libraryState() };
  }

  async steer(payload) {
    const sessionId = this.sessionOf(payload.workspaceId);

    if (!this.connection || !sessionId || !this.isClaude()) return { outcome: 'unsupported' };

    try {
      const res = await this.connection.extMethod('_session/steering', {
        sessionId,
        prompt: this.promptBlocks(payload),
        _meta: { steering: { idleBehavior: 'promptRequired' } },
      });

      return { outcome: res?.outcome === 'injected' ? 'injected' : 'promptRequired' };
    } catch {
      return { outcome: 'unsupported' };
    }
  }
}
