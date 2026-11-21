import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildStorage } from '../kit/buildStorage';
import { memoryBuildStorage } from '../kit/buildStorage.fixtures';
import { localBuilds } from '../kit/buildRecords';
import { localBuildPhotos } from '../kit/buildPhotos';
import { freezeBuildKit } from '../kit/frozenKit';
import { kitFixture } from '../kit/kit.fixtures';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';
import { generatedPhoto, installPhotoDecoder } from '../kit/photoImage.fixtures';
import * as picker from '../utils/pickFiles';
import type { Session } from './buildAlongSession';
import type { ShowToast } from './types';
import { useBuildPhotos } from './useBuildPhotos';

beforeEach(installPhotoDecoder);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountedPhotos(session: Session, showToast: ShowToast) {
  let controls!: ReturnType<typeof useBuildPhotos>;

  function Host() {
    controls = useBuildPhotos(session, showToast);

    return null;
  }

  renderToStaticMarkup(createElement(Host));

  return controls;
}

it('captures the chooser destination before scene, build and step selection change', async () => {
  const storage = memoryBuildStorage();

  vi.spyOn(buildStorage, 'get').mockImplementation(storage.get);
  vi.spyOn(buildStorage, 'update').mockImplementation(storage.update);

  const job = kitFixture();
  const triangles = fixtureTriangles(job.parts);
  const content = await freezeBuildKit({
    job,
    meshes: Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)])),
  });
  const a = await localBuilds.create('First', content);
  const b = await localBuilds.create('Second', content);
  const session = { frozen: { record: a }, index: 0 } as Session;
  let picked!: (files: File[]) => void;
  const showToast = vi.fn();

  vi.spyOn(picker, 'pickFiles').mockImplementation(
    () =>
      new Promise((resolve) => {
        picked = resolve;
      }),
  );

  const controls = mountedPhotos(session, showToast);
  const pending = controls.importPhotos();

  session.frozen!.record = b;
  session.index = 1;
  picked([new File([await generatedPhoto()], 'wheel.png', { lastModified: 1 })]);
  await pending;
  expect(await localBuildPhotos.list({ build: a.id, kit: a.kit, step: 0 })).toHaveLength(1);
  expect(await localBuildPhotos.list({ build: b.id, kit: b.kit, step: 1 })).toEqual([]);
  expect((await localBuilds.open(a.id)).record).toEqual(a);
  expect((await localBuilds.open(b.id)).record).toEqual(b);
  expect(showToast).not.toHaveBeenCalled();
});

it('cancels a pending chooser without preparing or attaching its eventual file', async () => {
  const record = { id: 'cancelled', kit: 'a'.repeat(64) };
  const session = { frozen: { record }, index: 0 } as Session;
  let picked!: (files: File[]) => void;
  const showToast = vi.fn();
  const attach = vi.spyOn(localBuildPhotos, 'attach');

  vi.spyOn(picker, 'pickFiles').mockImplementation(
    () =>
      new Promise((resolve) => {
        picked = resolve;
      }),
  );

  const controls = mountedPhotos(session, showToast);
  const pending = controls.importPhotos();

  controls.cancel();
  picked([new File([await generatedPhoto()], 'cancelled.png')]);
  await pending;
  expect(attach).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});
