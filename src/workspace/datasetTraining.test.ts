import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { newDataset } from '../datasets/datasetFile';
import { useWorkspaceDatasets, type Datasets } from './useDatasets';

function trainingActions() {
  const visionTrain = vi.fn();
  const triesTrain = vi.fn();
  const openCase = vi.fn();
  const onNoCase = vi.fn();
  let actions: Datasets | undefined;

  function Harness() {
    actions = useWorkspaceDatasets({
      view: { datasets: [] } as unknown as Parameters<typeof useWorkspaceDatasets>[0]['view'],
      cases: {
        active: null,
        cases: [{ id: 'case' }],
        open: openCase,
        fromTries: { train: triesTrain },
      } as unknown as Parameters<typeof useWorkspaceDatasets>[0]['cases'],
      vision: { train: visionTrain } as unknown as Parameters<typeof useWorkspaceDatasets>[0]['vision'],
      showToast: vi.fn(),
    });

    return null;
  }

  renderToString(createElement(Harness));

  return { actions: actions!, visionTrain, triesTrain, openCase, onNoCase };
}

describe('dataset Train dispatch', () => {
  it.each([{ members: [] }, { members: ['try'] }])(
    'trains image-only and mixed selections without opening a Case (%j)',
    ({ members }) => {
      const fixture = trainingActions();
      const dataset = newDataset({
        id: 'images',
        name: 'Cups',
        task: 'Find cups',
        at: 'now',
        members,
        caseId: 'case',
        imageMembers: [{ frameSetId: 'images', frameIds: ['frame'], hash: 'a'.repeat(64) }],
      });

      fixture.actions.train(dataset, fixture.onNoCase);
      expect(fixture.visionTrain).toHaveBeenCalledWith(dataset);
      expect(fixture.triesTrain).not.toHaveBeenCalled();
      expect(fixture.openCase).not.toHaveBeenCalled();
      expect(fixture.onNoCase).not.toHaveBeenCalled();
    },
  );

  it('keeps the existing Case requirement for a dataset without images', () => {
    const fixture = trainingActions();
    const dataset = newDataset({ id: 'tries', name: 'Pick', task: 'Pick a cup', at: 'now', members: ['try'] });

    fixture.actions.train(dataset, fixture.onNoCase);
    expect(fixture.visionTrain).not.toHaveBeenCalled();
    expect(fixture.onNoCase).toHaveBeenCalledOnce();
  });
});
