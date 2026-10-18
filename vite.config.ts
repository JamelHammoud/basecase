import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BasecaseBackendService } from './electron/backend-service.mjs';

export default defineConfig({
  server: {
    // Saved scenes, models and AI briefs are app data — don't reload the page when they change
    watch: { ignored: ['**/library/**', '**/ai-reference/**'] },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'acp-and-library-bridge-middleware',
      configureServer(server) {
        const backend = new BasecaseBackendService(process.cwd());
        // Connect lazily: only a browser tab using the SSE stream needs this backend's agent
        let agentStarted = false;

        // SSE stream for real-time ACP & file watcher events when running in web mode
        server.middlewares.use('/api/events', (req, res) => {
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

          const unsubscribe = backend.onEvent((event: unknown) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          });

          req.on('close', () => {
            unsubscribe();
          });
        });

        server.middlewares.use('/api/bridge', (req, res, next) => {
          const url = req.url || '/';

          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            if (url.startsWith('/acp-status')) {
              const workspaceId = new URL(url, 'http://x').searchParams.get('workspace') ?? undefined;
              res.end(JSON.stringify(backend.getAcpStatus(workspaceId)));
              return;
            }
            if (url.startsWith('/images')) {
              res.end(JSON.stringify(backend.listUploadedImages()));
              return;
            }
            if (url.startsWith('/models')) {
              res.end(JSON.stringify(backend.listModels()));
              return;
            }
            if (url.startsWith('/purchases')) {
              res.end(JSON.stringify(backend.listPurchases()));
              return;
            }
            if (url.startsWith('/chats')) {
              res.end(JSON.stringify(backend.listConversations()));
              return;
            }
            if (url.startsWith('/chat?')) {
              const id = new URL(url, 'http://x').searchParams.get('id');
              res.end(JSON.stringify(backend.getConversation(id)));
              return;
            }
            if (url.startsWith('/scenes')) {
              res.end(JSON.stringify(backend.listScenes()));
              return;
            }
            next();
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json');
              try {
                const payload = body ? JSON.parse(body) : {};
                if (url.startsWith('/acp-connect')) {
                  const status = await backend.connectAcpAgent(payload.agentCommand);
                  res.end(JSON.stringify(status));
                  return;
                }
                if (url.startsWith('/acp-prompt')) {
                  const result = await backend.sendAcpPrompt(payload);
                  res.end(JSON.stringify(result));
                  return;
                }
                if (url.startsWith('/acp-steer')) {
                  res.end(JSON.stringify(await backend.steerAcpPrompt(payload)));
                  return;
                }
                if (url.startsWith('/acp-resume')) {
                  res.end(JSON.stringify(await backend.resumeAcpConversation(payload.sessionId, payload.workspaceId)));
                  return;
                }
                if (url.startsWith('/purchase-save')) {
                  res.end(JSON.stringify(backend.savePurchase(payload)));
                  return;
                }
                if (url.startsWith('/chat-save')) {
                  res.end(JSON.stringify(backend.saveConversation(payload)));
                  return;
                }
                if (url.startsWith('/chat-delete')) {
                  res.end(JSON.stringify(backend.deleteConversation(payload.id)));
                  return;
                }
                if (url.startsWith('/acp-cancel')) {
                  res.end(JSON.stringify(await backend.cancelAcpPrompt(payload.workspaceId)));
                  return;
                }
                if (url.startsWith('/acp-new-conversation')) {
                  res.end(JSON.stringify(await backend.newAcpConversation(payload.workspaceId)));
                  return;
                }
                if (url.startsWith('/acp-close-workspace')) {
                  res.end(JSON.stringify(await backend.closeWorkspace(payload.workspaceId)));
                  return;
                }
                // Dev only: replay a CAD-tool request against the open tab (same path the MCP server uses)
                if (url.startsWith('/agent-call')) {
                  const result = await backend.requestRenderer(payload.kind, payload.payload ?? {}, 180000, payload.workspaceId);
                  res.end(JSON.stringify(result ?? {}));
                  return;
                }
                if (url.startsWith('/agent-respond')) {
                  res.end(JSON.stringify(backend.resolveAgentRequest(payload)));
                  return;
                }
                if (url.startsWith('/upload-image')) {
                  const rec = backend.saveUploadedImage(payload);
                  res.end(JSON.stringify(rec));
                  return;
                }
                if (url.startsWith('/save-evidence-file')) {
                  res.end(JSON.stringify(backend.saveEvidenceFile(payload)));
                  return;
                }
                if (url.startsWith('/save-model')) {
                  const rec = backend.saveModel(payload);
                  res.end(JSON.stringify(rec));
                  return;
                }
                if (url.startsWith('/delete-model')) {
                  const list = backend.deleteModel(payload.modelId);
                  res.end(JSON.stringify(list));
                  return;
                }
                if (url.startsWith('/save-scene')) {
                  const rec = backend.saveScene(payload);
                  res.end(JSON.stringify(rec));
                  return;
                }
                if (url.startsWith('/delete-scene')) {
                  const list = backend.deleteScene(payload.sceneId);
                  res.end(JSON.stringify(list));
                  return;
                }
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Unknown bridge endpoint' }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
            return;
          }

          next();
        });
      },
    },
  ],
});
