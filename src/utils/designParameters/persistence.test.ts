import { describe, expect, it } from 'vitest';
import { parameterRover } from './assemblies.fixtures';
import { validateParameterRecords, parameterDesignStatus, rememberParameterDesign } from './verification';
import { decodeSceneFile, encodeSceneFile } from '../sceneFile';
import { copyToClipboard, takePaste } from '../../workspace/partsClipboard';
import { refuseParameterTransfer } from './transfers';
import { parameterFindings } from '../../readiness/designParameters';

function boundScene() {
  const scene = parameterRover();

  return {
    ...scene,
    project: { ...scene.project!, designParameters: [{ name: 'width', unit: 'mm' as const, value: 160 }] },
    parts: scene.parts.map((part) =>
      part.id === 'deck'
        ? {
            ...part,
            dimensionBindings: [{ kind: 'cad' as const, target: 'width', unit: 'mm' as const, expression: 'width' }],
          }
        : part,
    ),
  };
}

describe('parameter records at scene and transfer boundaries', () => {
  it('validates saved bindings before native reopening and never treats retained geometry as verified', async () => {
    const scene = boundScene();

    rememberParameterDesign(scene.parts, scene.project.designParameters);
    expect(parameterDesignStatus(scene.parts, scene.project.designParameters).state).toBe('current');

    const reopened = await decodeSceneFile(await encodeSceneFile(scene));

    expect(parameterDesignStatus(reopened.parts, reopened.project!.designParameters).state).toBe('pending');
    expect(parameterFindings(reopened.parts, reopened.project!.designParameters)).toHaveLength(1);
    expect(JSON.stringify(reopened.parts)).toBe(JSON.stringify(scene.parts));
  });

  it.each(['missing', 'width.constructor', 'width + 1 deg', '('.repeat(257)])(
    'refuses malformed saved binding %s',
    async (expression) => {
      const scene = boundScene();

      scene.parts[0].dimensionBindings![0].expression = expression;
      await expect(decodeSceneFile(await encodeSceneFile(scene))).rejects.toThrow();
      expect(() => validateParameterRecords(scene.parts, scene.project.designParameters)).toThrow();
    },
  );

  it('preserves local clipboard sharing and refuses external names and Library capture even when the other scene has matching names', () => {
    const scene = boundScene();

    copyToClipboard(scene.parts, 'first:scene', false, scene.project.designParameters);
    expect(takePaste('first:scene', scene.project.designParameters)![0].dimensionBindings).toEqual(
      scene.parts[0].dimensionBindings,
    );
    expect(() => takePaste('first:scene', structuredClone(scene.project.designParameters))).toThrow(
      /Copy the parts again/,
    );
    expect(() => takePaste('second:scene')).toThrow(/another scene/);
    expect(() => refuseParameterTransfer(scene.parts)).toThrow(/Library/);
  });
});
