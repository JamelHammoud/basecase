import { BasecaseBackendService } from './backend-service.mjs';

const withBase64Files = (got) => ({
  ...got,
  files: Object.fromEntries(Object.entries(got.files).map(([k, v]) => [k, Buffer.from(v).toString('base64')])),
});

const searchParam = (url, name) => new URL(url, 'http://x').searchParams.get(name);

function getRoutes(backend) {
  return [
    ['/acp-status', (url) => backend.getAcpStatus(searchParam(url, 'workspace') ?? undefined)],
    ['/images', () => backend.listUploadedImages()],
    ['/models', () => backend.listModels()],
    ['/train-status', () => backend.trainStatus()],
    ['/simready-status', () => backend.simreadyStatus()],
    ['/policy?', (url) => backend.getPolicy(searchParam(url, 'id'))],
    ['/purchases', () => backend.listPurchases()],
    ['/chats', () => backend.listConversations()],
    ['/chat?', (url) => backend.getConversation(searchParam(url, 'id'))],
    ['/scenes', () => backend.listScenes()],
    ['/scene?', (url) => backend.getScene(searchParam(url, 'id'))],
  ];
}

function postRoutes(backend) {
  return [
    ['/acp-connect', (p) => backend.connectAcpAgent(p.agentCommand)],
    ['/acp-authenticate', (p) => backend.authenticateAcpAgent(p.methodId)],
    ['/acp-api-key', (p) => backend.setAgentApiKey(p.key)],
    ['/acp-prompt', (p) => backend.sendAcpPrompt(p)],
    ['/acp-steer', (p) => backend.steerAcpPrompt(p)],
    ['/acp-resume', (p) => backend.resumeAcpConversation(p.sessionId, p.workspaceId)],
    ['/train-start', (p) => backend.trainStart(p)],
    ['/simready-fetch', async (p) => withBase64Files(await backend.simreadyFetch(p))],
    ['/simready-file', (p) => ({ data: backend.simreadyFile(p)?.toString('base64') ?? null })],
    ['/train-stop', (p) => backend.trainStop(p.workspaceId)],
    ['/policy-delete', (p) => backend.deletePolicy(p.id)],
    ['/purchase-save', (p) => backend.savePurchase(p)],
    ['/chat-save', (p) => backend.saveConversation(p)],
    ['/chat-delete', (p) => backend.deleteConversation(p.id)],
    ['/acp-cancel', (p) => backend.cancelAcpPrompt(p.workspaceId)],
    ['/acp-new-conversation', (p) => backend.newAcpConversation(p.workspaceId)],
    ['/acp-close-workspace', (p) => backend.closeWorkspace(p.workspaceId)],
    ['/acp-live-runs', (p) => backend.liveAcpRuns(p.workspaceId)],
    ['/acp-forget-run', (p) => backend.forgetAcpRun(p.workspaceId)],
    ['/agent-call', async (p) => (await backend.requestRenderer(p.kind, p.payload ?? {}, 180000, p.workspaceId)) ?? {}],
    ['/agent-respond', (p) => backend.resolveAgentRequest(p)],
    ['/upload-image', (p) => backend.saveUploadedImage(p)],
    ['/save-evidence-file', (p) => backend.saveEvidenceFile(p)],
    ['/save-model', (p) => backend.saveModel(p)],
    ['/delete-model', (p) => backend.deleteModel(p.modelId)],
    ['/save-scene-preview', (p) => backend.saveScenePreview(p)],
    ['/save-scene', (p) => backend.saveScene(p)],
    ['/delete-scene', (p) => backend.deleteScene(p.sceneId)],
  ];
}

const findRoute = (routes, url) => routes.find(([prefix]) => url.startsWith(prefix))?.[1];

function handleGet({ routes, url, res, next }) {
  res.setHeader('Content-Type', 'application/json');

  const route = findRoute(routes, url);

  if (!route) {
    next();

    return;
  }

  res.end(JSON.stringify(route(url)));
}

async function respondToPost({ routes, url, body, res }) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const payload = body ? JSON.parse(body) : {};
    const route = findRoute(routes, url);

    if (!route) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Unknown bridge endpoint' }));

      return;
    }

    res.end(JSON.stringify(await route(payload)));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
}

function handlePost({ routes, url, req, res }) {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', () => respondToPost({ routes, url, body, res }));
}

function eventsMiddleware(backend) {
  let agentStarted = false;

  return (req, res) => {
    if (!agentStarted) {
      agentStarted = true;
      backend.connectAcpAgent().catch(() => {});
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'acp-status', status: backend.getAcpStatus() })}\n\n`);

    const unsubscribe = backend.onEvent((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  };
}

function bridgeMiddleware(backend) {
  const gets = getRoutes(backend);
  const posts = postRoutes(backend);

  return (req, res, next) => {
    const url = req.url || '/';

    if (req.method === 'GET') handleGet({ routes: gets, url, res, next });
    else if (req.method === 'POST') handlePost({ routes: posts, url, req, res });
    else next();
  };
}

function installBridge(server) {
  const backend = new BasecaseBackendService(process.cwd());
  const stopAgent = () => backend.disconnectAcpAgent();

  server.httpServer?.once('close', stopAgent);
  process.once('exit', stopAgent);
  server.middlewares.use('/api/events', eventsMiddleware(backend));
  server.middlewares.use('/api/bridge', bridgeMiddleware(backend));
}

export function bridgeMiddlewarePlugin() {
  return {
    name: 'acp-and-library-bridge-middleware',
    configureServer: installBridge,
    configurePreviewServer: installBridge,
  };
}
