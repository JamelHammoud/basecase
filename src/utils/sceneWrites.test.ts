import { describe, expect, it } from 'vitest';
import { queueSceneWrite, sceneWritten } from './sceneWrites';

describe('queueSceneWrite', () => {
  it('runs a scene’s writes in order and lets a read wait for them', async () => {
    const order: string[] = [];
    let finish = () => {};
    const slow = new Promise<void>((resolve) => {
      finish = resolve;
    });

    void queueSceneWrite('copy', async () => {
      await slow;
      order.push('saved');
    });

    const deleted = queueSceneWrite('copy', async () => {
      order.push('deleted');
    });
    const read = sceneWritten('copy').then(() => order.push('read'));

    finish();
    await Promise.all([deleted, read]);

    expect(order).toEqual(['saved', 'deleted', 'read']);
  });

  it('runs the next write after one fails', async () => {
    await expect(queueSceneWrite('a', () => Promise.reject(new Error('disk')))).rejects.toThrow('disk');
    await expect(queueSceneWrite('a', async () => 'saved')).resolves.toBe('saved');
  });
});
