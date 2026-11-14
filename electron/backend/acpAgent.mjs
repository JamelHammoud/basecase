import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { agentEnv, anchorArgs, resolveCommand } from './agentProcess.mjs';
import { createClientHandler } from './acpClientHandler.mjs';
import { NOT_CONNECTED, agentFailure, plainAgentError } from './agentFailure.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { agentCwd, agentKindOf, agentProcessArgs, agentProcessEnv } from './agentProfiles.mjs';
import { AgentKeys } from './agentKeys.mjs';
import { AgentRuntimes } from './agentRuntimes.mjs';
import { acceptsApiKey, isAuthError, loadAgentCommand, saveAgentCommand, signInMethods } from './agentSelection.mjs';
import { CLAUDE_AGENT_COMMAND, DEFAULT_WORKSPACE, LANE_SEPARATOR, safeWorkspace } from './constants.mjs';
import { ModelControl } from './modelControl.mjs';
import { LiveRuns } from './liveRuns.mjs';
import { buildSessionParams } from './sessionParams.mjs';
import { SessionModels } from './sessionModels.mjs';

const hasCustomCommand = (command) => command && typeof command === 'string' && command.trim();

export class AcpAgent {
  constructor({ paths, workspaceRoot, offline, bridge, emit, libraryState, promptBlocks, secrets }) {
    this.paths = paths;
    this.workspaceRoot = workspaceRoot;
    this.offline = offline;
    this.bridge = bridge;
    this.emit = emit;
    this.libraryState = libraryState;
    this.promptBlocks = promptBlocks;
    this.command = loadAgentCommand(paths.libraryDir) ?? CLAUDE_AGENT_COMMAND;
    this.childProcess = null;
    this.connection = null;
    this.sessions = new Map();
    this.runs = new LiveRuns();
    this.models = new SessionModels();
    this.control = new ModelControl({ models: this.models, connection: () => this.connection, emit });
    this.authMethods = [];
    this.keys = new AgentKeys({ dir: path.join(paths.libraryDir, 'agent-config'), secrets });
    this.runtimes = new AgentRuntimes({ root: workspaceRoot, dir: path.join(paths.libraryDir, 'agents') });
    this.download = null;
    this.signIn = null;
    this.steering = false;
    this.agentInfo = { name: 'Basecase Offline Agent', version: '1.0.0' };
    this.protocolVersion = PROTOCOL_VERSION;
    this.connected = false;
    this.connecting = false;
    this.attempts = 0;
    this.pending = null;
    this.error = null;
  }

  kind() {
    return agentKindOf(this.command);
  }

  isClaude() {
    return this.kind() === 'claude';
  }

  cwd() {
    return agentCwd(this.kind(), { workspaceRoot: this.workspaceRoot, libraryDir: this.paths.libraryDir });
  }

  processEnv() {
    const env = agentEnv();
    const extra = agentProcessEnv(this.kind(), {
      offline: this.offline,
      env,
      libraryDir: this.paths.libraryDir,
      apiKey: this.keys.get(this.kind()),
    });

    return { ...env, ...extra };
  }

  spawnChild(runtime) {
    const [cmd, ...args] = resolveCommand(this.command);
    const cwd = this.cwd();

    fs.mkdirSync(cwd, { recursive: true });

    const child = spawn(
      cmd,
      [...anchorArgs(args.map(runtime.arg), this.workspaceRoot), ...agentProcessArgs(this.kind())],
      {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...this.processEnv(), ...runtime.env },
      },
    );

    this.childProcess = child;
    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();

      if (msg) this.emit({ type: 'acp-stderr', text: msg });
    });
    child.on('error', (err) => {
      this.error = `Couldn’t start the agent: ${err.message}`;
    });
    child.on('exit', (code) => {
      if (this.childProcess !== child) return;

      this.connected = false;
      this.sessions.clear();
      this.models.clear();
      this.emit({ type: 'acp-status', status: this.status(), exitCode: code });
    });

    return child;
  }

  openConnection(child) {
    const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
    const clientHandler = createClientHandler({
      libraryDir: this.paths.libraryDir,
      emit: (event) => {
        if (event.type === 'acp-session-update') this.runs.note(event.workspaceId, event.update);

        this.emit(event);
      },
      workspaceOf: (sessionId) => this.workspaceOf(sessionId),
      libraryState: this.libraryState,
    });

    return new ClientSideConnection(() => clientHandler, stream);
  }

  async initialize(connection) {
    const initRes = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: true },
      },
      clientInfo: { name: 'Basecase', version: '2.0.0' },
    });

    this.protocolVersion = initRes.protocolVersion;
    this.authMethods = initRes.authMethods ?? [];
    this.steering = this.isClaude() || initRes._meta?.steering?.supported === true;

    if (initRes.agentInfo) this.agentInfo = initRes.agentInfo;
  }

  async startFirstSession() {
    try {
      await this.control.startLearning(await this.createSession(DEFAULT_WORKSPACE));
      this.signIn = null;
    } catch (err) {
      const signIn = this.signInFor(err);

      if (!signIn) throw err;

      this.signIn = signIn;
    }
  }

  signInFor(err) {
    const methods = signInMethods(this.authMethods);
    const apiKey = acceptsApiKey(this.authMethods);

    if (!isAuthError(err) || (!methods.length && !apiKey)) return null;

    return { methods, apiKey, message: String(err?.message ?? '') };
  }

  noteSignIn(err) {
    const signIn = this.signInFor(err);

    if (!signIn || this.signIn || !this.connected) return;

    this.signIn = signIn;
    this.emit({ type: 'acp-status', status: this.status() });
  }

  async authenticate(methodId) {
    this.requireConnection();

    try {
      await this.connection.authenticate({ methodId });
      await this.startFirstSession();
      this.error = null;
    } catch (err) {
      this.error = String(err?.message ?? err);
    }

    const status = this.status();

    this.emit({ type: 'acp-status', status });

    return status;
  }

  setApiKey(key) {
    this.keys.set(this.kind(), key);

    return this.connect();
  }

  connect(customCommand) {
    this.pending = this.openAgent(customCommand);

    return this.pending;
  }

  async openAgent(customCommand) {
    const attempt = ++this.attempts;

    if (hasCustomCommand(customCommand) && customCommand.trim() !== this.command) {
      this.command = customCommand.trim();
      saveAgentCommand(this.paths.libraryDir, this.command);
    }

    this.disconnect();
    this.models.reset();
    this.agentInfo = { name: 'Agent', version: '' };
    this.signIn = null;
    this.connecting = true;
    await this.bridge.ready;

    try {
      const runtime = await this.runtimes.ensure(this.kind(), (progress) => this.noteDownload(progress));

      this.download = null;

      const connection = this.openConnection(this.spawnChild(runtime));

      this.connection = connection;
      await this.initialize(connection);
      this.connected = true;
      this.error = null;
      await this.startFirstSession();
    } catch (err) {
      this.connected = false;
      this.download = null;
      this.error = agentFailure(err, this.status().agentName);
    }

    if (attempt === this.attempts) this.connecting = false;

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
        kind: this.kind(),
        cwd: this.cwd(),
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

    this.models.record(sessionRes.sessionId, sessionRes);
    this.bindSession(workspaceId, sessionRes.sessionId);

    return sessionRes.sessionId;
  }

  requireConnection() {
    if (!this.connection) throw new Error(this.error || 'The agent is not connected');
  }

  async ensureSession(workspaceId = DEFAULT_WORKSPACE) {
    await this.pending;

    if (!this.connected || !this.connection) await this.connect();

    if (!this.connected || !this.connection) throw new Error(NOT_CONNECTED);

    if (this.signIn) throw new Error(`Sign in to ${this.status().agentName} from the Agent tab.`);

    return this.sessionOf(workspaceId) ?? (await this.createSession(workspaceId));
  }

  async resume(sessionId, workspaceId = DEFAULT_WORKSPACE) {
    await this.pending;

    if (!this.connection) await this.connect();

    this.requireConnection();

    const previous = this.sessionOf(workspaceId);

    try {
      const resumed = await this.connection.resumeSession({ sessionId, ...this.sessionParams(workspaceId) });

      this.models.forget(sessionId);
      this.models.record(sessionId, resumed);
      this.bindSession(workspaceId, sessionId);
    } catch {
      await this.createSession(workspaceId);
    }

    if (previous && previous !== this.sessionOf(workspaceId)) this.closeSessionQuietly(previous);

    return this.status(workspaceId);
  }

  closeSessionQuietly(sessionId) {
    if (!this.connection || [...this.sessions.values()].includes(sessionId)) return;

    this.models.forget(sessionId);
    this.connection.closeSession?.({ sessionId }).catch(() => {});
  }

  lanesOf(workspaceId) {
    const ws = safeWorkspace(workspaceId);

    if (ws.includes(LANE_SEPARATOR)) return [ws];

    return [...this.sessions.keys()].filter((key) => key === ws || key.startsWith(ws + LANE_SEPARATOR));
  }

  async closeWorkspace(workspaceId) {
    await Promise.all(this.lanesOf(workspaceId).map((key) => this.closeLane(key)));

    return { ok: true };
  }

  async closeLane(key) {
    const sessionId = this.sessions.get(key);

    if (!sessionId) return;

    this.sessions.delete(key);
    this.runs.forget(key);

    if (!this.connection) return;

    await this.connection.cancel({ sessionId }).catch(() => {});
    this.closeSessionQuietly(sessionId);
  }

  async newConversation(workspaceId = DEFAULT_WORKSPACE) {
    await this.pending;

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
    this.models.clear();
    this.connected = false;
  }

  noteDownload({ name, received, total }) {
    const percent = total ? Math.floor((received / total) * 100) : 0;

    if (this.download?.name === name && this.download.percent === percent) return;

    this.download = { name, percent };
    this.emit({ type: 'acp-status', status: this.status() });
  }

  status(workspaceId = DEFAULT_WORKSPACE) {
    return {
      connected: this.connected,
      connecting: this.connecting,
      sessionId: this.sessionOf(workspaceId) ?? null,
      agentName: this.agentInfo?.title || this.agentInfo?.name || 'Agent',
      agentCommand: this.command,
      agentKind: this.kind(),
      protocolVersion: this.protocolVersion,
      models: this.models.available,
      defaultModel: this.models.defaultModel,
      defaultEffort: this.models.defaultEffort,
      signIn: this.signIn ?? undefined,
      download: this.download ?? undefined,
      error: this.error || undefined,
    };
  }

  async sendPrompt(payload) {
    try {
      return await this.runPrompt(payload);
    } catch (err) {
      this.noteSignIn(err);

      throw plainAgentError(err, this.status().agentName);
    }
  }

  async runPrompt(payload) {
    const sessionId = await this.ensureSession(payload.workspaceId);
    const key = safeWorkspace(payload.workspaceId);

    await this.control.apply(sessionId, payload);
    this.runs.start(key, { sessionId, run: payload.run });

    try {
      const res = await this.connection.prompt({ sessionId, prompt: this.promptBlocks(payload) });

      this.endRun(key, { stopReason: res.stopReason });

      return {
        stopReason: res.stopReason,
        sessionId,
        usage: res.usage ?? undefined,
        model: this.models.modelOf(sessionId),
        effort: this.models.effortOf(sessionId),
        modelUsage: res._meta?.quota?.model_usage,
        ...this.libraryState(),
      };
    } catch (err) {
      this.endRun(key, { error: agentFailure(err, this.status().agentName) });

      throw err;
    }
  }

  endRun(key, result) {
    this.runs.finish(key, result);
    this.emit({ type: 'acp-run-end', workspaceId: key, ...result });
  }

  liveRuns(workspaceId) {
    const ws = safeWorkspace(workspaceId);

    this.bridge.replay(ws);

    return this.runs.ofWorkspace(ws);
  }

  forgetRun(key) {
    this.runs.forget(safeWorkspace(key));

    return { ok: true };
  }

  async steer(payload) {
    const sessionId = this.sessionOf(payload.workspaceId);

    if (!this.connection || !sessionId || !this.steering) return { outcome: 'unsupported' };

    try {
      const res = await this.connection.extMethod('_session/steering', {
        sessionId,
        prompt: this.promptBlocks(payload),
        _meta: { steering: { idleBehavior: 'promptRequired' } },
      });

      const injected = res?.outcome === 'injected';

      if (injected) this.runs.steer(safeWorkspace(payload.workspaceId), payload.run?.messages);

      return { outcome: injected ? 'injected' : 'promptRequired' };
    } catch {
      return { outcome: 'unsupported' };
    }
  }
}
