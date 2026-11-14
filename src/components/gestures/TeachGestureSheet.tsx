import { useState } from 'react';
import { isBuiltinGesture } from '../../cameras/gestures/builtinGestures';
import { canTeach, EXAMPLES_PER_GESTURE, untaught, type CaseGesture } from '../../cases/gestures';
import { CameraIcon, Modal, TextInput } from '../../design-system';
import { TEACH_GESTURE } from './teachGestureStore';
import { useTeachGesture } from './useTeachGesture';

interface TeachGestureSheetProps {
  gestures: readonly CaseGesture[] | undefined;
  onTaught: (gesture: CaseGesture) => void;
  onClose: () => void;
}

const asName = (typed: string) =>
  typed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const NAME = /^[a-z][a-z0-9-]*$/;

function Progress({ taught }: { taught: number }) {
  return (
    <div className="flex justify-center gap-[8px]">
      {Array.from({ length: EXAMPLES_PER_GESTURE }, (_, i) => (
        <span key={i} className={`w-[8px] h-[8px] rounded-full ${i < taught ? 'bg-figma-blue' : 'bg-white/20'}`} />
      ))}
    </div>
  );
}

export function TeachGestureSheet({ gestures, onTaught, onClose }: TeachGestureSheetProps) {
  const [typed, setTyped] = useState(() => untaught(gestures)[0]?.name ?? '');
  const name = asName(typed);
  const ready = NAME.test(name) && !isBuiltinGesture(name) && canTeach(gestures, name);
  const teach = useTeachGesture((gesture) => {
    onTaught(gesture);
    onClose();
  });
  const naming = teach.phase === 'name';

  const submit = () => {
    if (ready && naming) teach.start(name);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={TEACH_GESTURE}
      icon={<CameraIcon className="w-4 h-4" />}
      maxWidth="max-w-[420px]"
      action={naming ? { label: 'Record', disabled: !ready, onClick: submit } : undefined}
    >
      <div data-testid="teach-gesture" data-phase={teach.phase} data-taught={teach.taught}>
        {naming ? (
          <TextInput
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            aria-label="Name"
            placeholder="e.g. salute"
          />
        ) : (
          <div className="flex flex-col items-center gap-[16px] py-[8px]">
            <span className="h-[64px] flex items-center text-[48px] font-semibold tabular-nums text-white">
              {teach.phase === 'recording' ? (
                <span className="w-[24px] h-[24px] rounded-full bg-figma-blue animate-pulse" />
              ) : (
                teach.count
              )}
            </span>
            <Progress taught={teach.taught} />
          </div>
        )}
      </div>
    </Modal>
  );
}
