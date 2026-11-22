import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { SceneLibrary } from '../electron/library/sceneLibrary.mjs';
import type { SavedSceneRecord } from '../src/types/robotics';
import { workflowProbeScript } from '../tools/perf/workflowProbes.mjs';

export async function workflowBackend(page: Page, record: SavedSceneRecord) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-agent-workflow-'));
  const store = new SceneLibrary({ scenesDir: dir, cacheFile: path.join(dir, '.summaries.json') });
  const responses = new Map<string, { result?: unknown; error?: string }>();
  let finish = () => {};
  let workspaceId = '';
  let stopReason = 'end_turn';
  let ending = false;
  const finishStream = () => {
    ending = true;
    finish();
  };
  const waitForFinish = () =>
    ending
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          finish = resolve;
        });

  store.save(record);
  await page.addInitScript({ content: workflowProbeScript() });
  await page.addInitScript((id: string) => {
    localStorage.setItem('open-scenes', JSON.stringify({ ids: [id], tabIds: ['main'], active: 0 }));
  }, record.id);
  await page.route('**/api/bridge/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const replies: Record<string, () => unknown> = {
      scenes: () => store.list(),
      scene: () => store.get(new URL(route.request().url()).searchParams.get('id') ?? record.id),
      'save-scene': () => store.save(body),
      'save-scene-preview': () => store.savePreview(body),
      'acp-cancel': () => {
        stopReason = 'cancelled';
        finishStream();

        return {};
      },
      'agent-respond': () => {
        responses.set(body.requestId, body);

        return { ok: true };
      },
    };

    if (name === 'acp-prompt') {
      workspaceId = body.workspaceId;
      stopReason = 'end_turn';
      await waitForFinish();

      return route.fulfill({ json: { stopReason, models: [] } });
    }

    if (!replies[name!]) return route.fallback();

    return route.fulfill({ json: replies[name!]() });
  });

  return {
    responses,
    workspace: () => workspaceId,
    finish: finishStream,
    saved: () => store.get(record.id) as SavedSceneRecord,
    reopen: () =>
      new SceneLibrary({ scenesDir: dir, cacheFile: path.join(dir, '.summaries.json') }).get(
        record.id,
      ) as SavedSceneRecord,
    close: () => {
      finishStream();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
