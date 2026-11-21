import { useEffect } from 'react';
import { confirmAction, DeleteIcon, ErrorBoundary, IconButton, Modal, Spinner, TracePlot } from '../../design-system';
import type { ProjectSettings, ScenePart } from '../../types/robotics';
import { PowerReplayFields } from './PowerReplayFields';
import { PowerReplayResult } from './PowerReplayResult';
import { setPowerReplayOpen, usePowerReplayOpen } from './powerReplayDialog';
import { usePowerReplay } from './usePowerReplay';

interface Props {
  active: boolean;
  sceneId: string;
  parts: ScenePart[];
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  onSelectParts: (ids: string[]) => void;
}

const isBusy = (replay: ReturnType<typeof usePowerReplay>) => replay.running || !(replay.loaded || replay.error);

function deleteReplayAction(props: Props, running: boolean) {
  if (!props.project.powerReplay) return null;

  return (
    <IconButton
      title="Delete"
      variant="danger"
      icon={<DeleteIcon />}
      disabled={running}
      onClick={() =>
        confirmAction({
          title: 'Delete current replay?',
          onConfirm: () => props.onChangeProject({ powerReplay: undefined }),
        })
      }
    />
  );
}

function ReplayBody(props: Props) {
  const replay = usePowerReplay(props);
  const { loaded, error, running } = replay;
  const busy = isBusy(replay);
  const retained = props.project.powerReplay;
  const trace = loaded?.inspection.trace;
  const close = () => {
    replay.cancel();
    setPowerReplayOpen(null);
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title="Current replay"
      maxWidth="max-w-[640px]"
      headerActions={busy && <Spinner />}
      footerStart={deleteReplayAction(props, running)}
      action={{
        label: retained ? 'Compare' : 'Replay',
        disabled: running || !loaded?.applicable,
        onClick: () => void replay.run(),
      }}
    >
      <div className="space-y-4" aria-busy={busy}>
        {error && (
          <p role="alert" className="text-[13px] text-red-400">
            {error}
          </p>
        )}
        {loaded && !loaded.applicable && (
          <p role="status" className="text-[13px] text-white/60">
            Historical evidence. Electrical inputs changed.
          </p>
        )}
        {trace && (
          <>
            <p className="text-[13px] text-white/60">
              Modeled current averaged over {Number((trace.windowS * 1000).toPrecision(8))} ms. Shorter brownouts and
              switching transients remain unknown.
            </p>
            {!retained && (
              <TracePlot
                traces={trace.channels.map((channel) => ({
                  id: channel.jointId,
                  values: channel.amps,
                  x: channel.amps.map((_, index) => index * trace.windowS),
                  tone: 'primary',
                }))}
                units={{ x: 's', y: 'A' }}
              />
            )}
          </>
        )}
        {loaded && retained && (
          <PowerReplayResult {...retained} parts={props.parts} onSelectParts={props.onSelectParts} />
        )}
        {loaded && (
          <fieldset disabled={running || !loaded.applicable}>
            <PowerReplayFields
              declarations={loaded.form}
              cables={loaded.inspection.cables}
              loads={loaded.inspection.loads}
              onChange={replay.setForm}
            />
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

export function PowerReplayInspection(props: Props) {
  const open = usePowerReplayOpen(props.sceneId);

  useEffect(() => {
    if (open && !props.active) setPowerReplayOpen(null);
  }, [open, props.active]);

  return open && props.active ? (
    <ErrorBoundary region="Current replay" onClose={() => setPowerReplayOpen(null)}>
      <ReplayBody {...props} />
    </ErrorBoundary>
  ) : null;
}
