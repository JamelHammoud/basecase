import React, { useMemo, useState } from 'react';
import { Footprints } from 'lucide-react';
import { Button, Modal, Select, Switch } from '../design-system';
import type { RobotAnimation } from '../types/robotics';
import { isMovable, prettyJointName, type Rig } from '../utils/kinematics';
import type { PointOf } from '../utils/animation';
import {
  KEYPOINTS,
  KEYPOINT_LABELS,
  autoMapBones,
  autoMapRobot,
  parseBvh,
  retarget,
  type Keypoint,
} from '../utils/mocap';

const SHOWN: Keypoint[] = KEYPOINTS.filter((k) => /Shoulder|Elbow|Wrist|Hip|Knee|Ankle/.test(k) || k === 'head');

type KeypointMap = Partial<Record<Keypoint, string>>;

type Option = { value: string; label: string };

function worstMissSummary(errors: Partial<Record<Keypoint, number>>) {
  const worst = Object.entries(errors).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];

  if (!worst || (worst[1] ?? 0) <= 25) return '';

  return ` · ${KEYPOINT_LABELS[worst[0] as Keypoint].toLowerCase()} off by ${Math.round(worst[1]!)} mm`;
}

const MappingGrid: React.FC<{
  boneOptions: Option[];
  jointOptions: Option[];
  bones: KeypointMap;
  autoBones: KeypointMap;
  joints: KeypointMap;
  autoJoints: KeypointMap;
  onBone: (k: Keypoint, value: string) => void;
  onJoint: (k: Keypoint, value: string) => void;
}> = ({ boneOptions, jointOptions, bones, autoBones, joints, autoJoints, onBone, onJoint }) => (
  <div>
    <div className="grid grid-cols-[110px_1fr_1fr] gap-x-3 gap-y-1.5 items-center">
      <span />
      <span className="text-[12px] font-medium text-white/45">Motion</span>
      <span className="text-[12px] font-medium text-white/45">Robot</span>
      {SHOWN.map((k) => (
        <React.Fragment key={k}>
          <span className="text-[13px] text-white/70">{KEYPOINT_LABELS[k]}</span>
          <Select
            aria-label={`${KEYPOINT_LABELS[k]} bone`}
            options={boneOptions}
            value={bones[k] ?? autoBones[k] ?? ''}
            onChange={(e) => onBone(k, e.target.value)}
          />
          {k === 'head' ? (
            <span className="text-[12.5px] text-white/40">Neck joints</span>
          ) : (
            <Select
              aria-label={`${KEYPOINT_LABELS[k]} joint`}
              options={jointOptions}
              value={joints[k] ?? autoJoints[k] ?? ''}
              onChange={(e) => onJoint(k, e.target.value)}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
);

export const RetargetSheet: React.FC<{
  source: { name: string; text: string } | null;
  rig: Rig;
  pointOf: PointOf;
  onClose: () => void;
  onCreate: (anim: RobotAnimation, summary: string) => void;
}> = ({ source, rig, pointOf, onClose, onCreate }) => {
  const mocap = useMemo(() => {
    if (!source) return null;

    try {
      return parseBvh(source.text, source.name.replace(/\.bvh$/i, ''));
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [source]);
  const autoBones = useMemo(() => (mocap && typeof mocap !== 'string' ? autoMapBones(mocap) : {}), [mocap]);
  const autoJoints = useMemo(() => autoMapRobot(rig), [rig]);
  const [bones, setBones] = useState<KeypointMap>({});
  const [joints, setJoints] = useState<KeypointMap>({});
  const [inPlace, setInPlace] = useState(false);
  const [loop, setLoop] = useState(false);
  const [fps, setFps] = useState('30');
  const [error, setError] = useState<string | null>(null);

  const movable = rig.joints.filter(isMovable);
  const boneOptions =
    typeof mocap === 'object' && mocap
      ? [{ value: '', label: 'None' }, ...mocap.bones.map((b) => ({ value: b, label: b }))]
      : [];
  const jointOptions = [
    { value: '', label: 'None' },
    ...movable.map((j) => ({ value: j.id, label: prettyJointName(j.name) })),
  ];

  const create = () => {
    if (!mocap || typeof mocap === 'string') return;

    const res = retarget(mocap, rig, pointOf, {
      bones: { ...autoBones, ...bones },
      joints: { ...autoJoints, ...joints },
      fps: Number(fps),
      inPlace,
      loop,
      name: mocap.name,
    });

    if (typeof res === 'string') {
      setError(res);

      return;
    }

    onCreate(res.animation, worstMissSummary(res.error));
  };

  const info =
    mocap && typeof mocap !== 'string' ? `${mocap.bones.length} bones · ${mocap.duration.toFixed(1)} s` : undefined;

  return (
    <Modal
      isOpen={!!source}
      onClose={onClose}
      title={typeof mocap === 'object' && mocap ? `Retarget ${mocap.name}` : 'Retarget Motion'}
      subtitle={info}
      icon={<Footprints className="w-4 h-4" />}
      maxWidth="max-w-[560px]"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!mocap || typeof mocap === 'string'} onClick={create}>
            Create Animation
          </Button>
        </div>
      }
    >
      {typeof mocap === 'string' ? (
        <p className="text-[13px] text-red-400">Couldn’t read that BVH file: {mocap}</p>
      ) : (
        <div className="space-y-4">
          <MappingGrid
            boneOptions={boneOptions}
            jointOptions={jointOptions}
            bones={bones}
            autoBones={autoBones}
            joints={joints}
            autoJoints={autoJoints}
            onBone={(k, value) => setBones((b) => ({ ...b, [k]: value || undefined }))}
            onJoint={(k, value) => setJoints((j) => ({ ...j, [k]: value || undefined }))}
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Switch label="In place" checked={inPlace} onChange={setInPlace} />
            <Switch label="Loop" checked={loop} onChange={setLoop} />
            <div className="col-span-2 grid grid-cols-[110px_1fr] items-center gap-3 pt-1">
              <span className="text-[13px] text-white/70">Frame rate</span>
              <Select
                aria-label="Frame rate"
                options={[
                  { value: '24', label: '24 fps' },
                  { value: '30', label: '30 fps' },
                  { value: '60', label: '60 fps' },
                ]}
                value={fps}
                onChange={(e) => setFps(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-[13px] text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
};
