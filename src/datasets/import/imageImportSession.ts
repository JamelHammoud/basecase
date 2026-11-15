import { frameHash, frameSetHash, type FrameSet, type ImageClass } from '../../vision/frameSet';
import { manifestOf } from '../../vision/frameSetStoreTypes';
import { linkFrameClasses } from '../../vision/matchImageClasses';

export interface ImageImportContext {
  caseId: string | null;
  sceneId: string | null;
  objects: Array<{ id: string; name: string }>;
}

export interface ImageImportSummary {
  name: string;
  frames: number;
  classes: ImageClass[];
}

export class ImageImportSession {
  private set: FrameSet | null = null;
  private next = 0;

  load(set: FrameSet | null): ImageImportSummary | undefined {
    this.set = set;
    this.next = 0;

    return set ? { name: set.name, frames: set.frames.length, classes: set.classes } : undefined;
  }

  async prepare(context: ImageImportContext) {
    if (!this.set) throw new Error('Import the files again.');

    const set = linkFrameClasses(
      {
        ...this.set,
        caseId: context.caseId,
        sceneId: context.sceneId,
        createdAt: new Date().toISOString(),
      },
      context.objects,
    );

    const frames = new Map<string, FrameSet['frames'][number]>();

    for (const frame of set.frames) {
      const id = await frameHash(frame);

      frames.set(id, { ...frame, id });
    }

    set.frames = [...frames.values()];

    const hash = await frameSetHash(set);

    set.id = `frames-${hash}`;
    this.set = set;
    this.next = 0;

    return { manifest: manifestOf(set), hash };
  }

  take() {
    if (!this.set || this.next >= this.set.frames.length) throw new Error('Import the files again.');

    return this.set.frames[this.next++];
  }
}
