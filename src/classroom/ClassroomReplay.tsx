import { inspectSubmission } from './inspection';
import { useEffect, useState } from 'react';
import { Modal } from '../design-system';
import { GalleryScene } from '../gallery/GalleryScene';
import { errorMessage } from '../utils/errorMessage';
import type { Assignment } from './envelope';
import { ClassroomGrader } from './grading';
import type { SubmissionTile } from './storage';

type Replay = Awaited<ReturnType<ClassroomGrader['replay']>>;

export function ClassroomReplay({
  assignment,
  tile,
  onClose,
}: {
  assignment: Assignment;
  tile: SubmissionTile;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Replay | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const grader = new ClassroomGrader();
    let live = true;

    void grader
      .replay(assignment, tile.submission, tile.result?.runs?.worstSeed ?? 1)
      .then((result) => {
        if (live) setLoaded(result);
      })
      .catch((failure) => {
        if (live) setError(errorMessage(failure));
      });

    return () => {
      live = false;
      grader.cancel();
    };
  }, [assignment, tile]);

  return (
    <Modal isOpen onClose={onClose} title={tile.submission.name} maxWidth="max-w-6xl">
      <div className="relative h-[70vh]">
        {loaded && (
          <GalleryScene
            embedded
            bundle={loaded.bundle}
            Console={null}
            replay={loaded.replay}
            onOpenScene={() => inspectSubmission(assignment, tile, (failure) => setError(errorMessage(failure)))}
          />
        )}
        {error && (
          <p role="alert" className="p-3 text-[13px] text-white/60">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
