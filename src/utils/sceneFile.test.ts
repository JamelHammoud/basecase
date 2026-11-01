import { describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from './sceneFile';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#ffffff',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
  ...extra,
});

const project = {
  printer: 'my-printer-123',
  material: 'PLA',
  infillPct: 20,
  prints: [{ id: 'print-1' }],
  policies: [{ id: 'walk' }],
  buildGuide: { id: 'guide', pages: 3, steps: 2, generatedAt: '', fingerprint: '' },
  joints: [],
} as unknown as ProjectSettings;

const encode = (text: string) => new TextEncoder().encode(text);

describe('scene files', () => {
  it('round-trips a scene and leaves out what belongs to the sender', async () => {
    const shared = sharedScene({
      name: 'Gripper',
      globalGoal: 'Pick up a mug',
      parts: [part('base'), part('photo', { kind: 'image_plane', imageDataUrl: 'data:image/png;base64,AA' })],
      annotations: [],
      project,
      chatId: 'chat-1',
    });
    const bytes = await encodeSceneFile(shared);
    const scene = await decodeSceneFile(bytes);

    expect(bytes[0]).toBe(0x1f);
    expect(scene.name).toBe('Gripper');
    expect(scene.parts.map((p) => p.id)).toEqual(['base', 'photo']);
    expect(scene.parts[1].imageDataUrl).toBe('data:image/png;base64,AA');
    expect(scene.project?.joints).toEqual([]);
    expect(scene.project).not.toHaveProperty('prints');
    expect(scene.project).not.toHaveProperty('policies');
    expect(scene.project).not.toHaveProperty('buildGuide');
    expect(scene).not.toHaveProperty('chatId');
  });

  it('opens uncompressed files and drops images that point at the web', async () => {
    const file = {
      format: 'basecase-scene',
      version: 1,
      scene: { name: 'Arm', parts: [part('photo', { imageDataUrl: 'https://example.com/pixel.png' })] },
    };
    const scene = await decodeSceneFile(encode(JSON.stringify(file)));

    expect(scene.parts[0]).not.toHaveProperty('imageDataUrl');
    expect(scene.annotations).toEqual([]);
  });

  it('refuses files that aren’t scenes or come from a newer app', async () => {
    await expect(decodeSceneFile(encode('{"hello":1}'))).rejects.toThrow('Not a Basecase scene.');
    await expect(decodeSceneFile(encode('not json'))).rejects.toThrow('Not a Basecase scene.');
    await expect(
      decodeSceneFile(encode(JSON.stringify({ format: 'basecase-scene', version: 99, scene: { parts: [] } }))),
    ).rejects.toThrow('newer Basecase');
    await expect(
      decodeSceneFile(encode(JSON.stringify({ format: 'basecase-scene', version: 1, scene: { parts: [{ id: 1 }] } }))),
    ).rejects.toThrow('damaged');
  });
});
