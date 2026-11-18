import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { SimInputs, SceneModelOptions } from './useSimulation';
import { preparedWorldItems } from '../cases/fixtureCollision';
import { preparedCalibratedModel } from './calibratedModel';
import { NO_GUESTS, withGuests, type SimGuests } from './simGuests';
import type { SimModel, WorldItem } from './mjcfTypes';
import type { SelfContactSetting, SelfContactSettings } from './selfContact';

export function useSceneModel({ parts, project, rig, pose, viewportRef, restDeltas }: SimInputs) {
  const inputsRef = useRef({ parts, project, rig, pose, restDeltas });
  const [worldParts, setWorldParts] = useState<WorldItem[]>([]);
  const worldRef = useRef<WorldItem[]>(worldParts);
  const [guests, setGuests] = useState<SimGuests>(NO_GUESTS);
  const guestsRef = useRef<SimGuests>(guests);
  const preparations = useRef(new Set<AbortController>());

  useLayoutEffect(() => {
    const previous = inputsRef.current;

    if (previous.parts !== parts || previous.project !== project || previous.pose !== pose)
      preparations.current.forEach((controller) => controller.abort());

    inputsRef.current = { parts, project, rig, pose, restDeltas };
  });

  useEffect(() => () => preparations.current.forEach((controller) => controller.abort()), []);

  const buildModel = useCallback(
    async (options?: SceneModelOptions): Promise<SimModel> => {
      const vp = viewportRef.current;

      if (!vp) throw new Error('The canvas isn’t ready.');

      const controller = new AbortController();

      preparations.current.add(controller);

      try {
        await vp.meshesReady();

        const current = inputsRef.current;
        const [measures, posedFloor] = await Promise.all([
          vp.measureParts(),
          vp.posedFloor(undefined, current.restDeltas),
        ]);

        const input = withGuests(
          {
            parts: current.parts,
            rig: current.rig,
            project: options?.withoutBody ? { ...current.project, bodyCalibrations: undefined } : current.project,
            pose: current.pose,
            measures,
            partTriangles: vp.partTriangles,
            posedFloor,
            world: options?.alone ? [] : await preparedWorldItems(worldRef.current),
            ...(options?.pin ? { fixedBase: { [options.pin]: true } } : {}),
          },
          options?.alone ? NO_GUESTS : guestsRef.current,
        );

        return await preparedCalibratedModel(input, options?.calibrations ?? current.project.servoCalibrations, {
          signal: AbortSignal.any([controller.signal, ...(options?.signal ? [options.signal] : [])]),
          current: () =>
            inputsRef.current.parts === current.parts &&
            inputsRef.current.project === current.project &&
            inputsRef.current.pose === current.pose,
        });
      } finally {
        preparations.current.delete(controller);
      }
    },
    [viewportRef],
  );

  const setWorldItems = (items: WorldItem[], cast: SimGuests) => {
    worldRef.current = items;
    guestsRef.current = cast;
    setWorldParts(items);
    setGuests(cast);
  };

  return {
    cancelPreparation: () => preparations.current.forEach((controller) => controller.abort()),
    inputsRef,
    buildModel,
    worldParts,
    guestParts: guests.parts,
    setWorldItems,
    worldNow: () => ({ items: worldRef.current, guests: guestsRef.current }),
  };
}

export function useStopOnEdit({
  parts,
  joints,
  selfContact,
  modelRef,
  stop,
}: {
  parts: ScenePart[];
  joints: ProjectSettings['joints'];
  selfContact: ProjectSettings['selfContact'];
  modelRef: React.RefObject<SimModel | null>;
  stop: () => void;
}) {
  const sceneKey = useRef({ parts, joints, selfContact });

  useEffect(() => {
    const prev = sceneKey.current;

    sceneKey.current = { parts, joints, selfContact };

    if (prev.parts !== parts || prev.joints !== joints || prev.selfContact !== selfContact) stop();
  }, [parts, joints, selfContact, modelRef, stop]);

  return (settings: SelfContactSettings) => {
    sceneKey.current = { ...sceneKey.current, selfContact: settings };
  };
}

export function useContactSettings({
  input,
  inputsRef,
  stop,
  noteContactEdit,
}: {
  input: SimInputs;
  inputsRef: RefObject<ReturnType<typeof useSceneModel>['inputsRef']['current']>;
  stop: () => void;
  noteContactEdit: (settings: SelfContactSettings) => void;
}) {
  'use memo';

  return {
    selfContact: input.project.selfContact ?? {},
    configureSelfContact: (robot: string, setting: SelfContactSetting) => {
      const wanted = robot.trim().toLowerCase();
      const target = input.rig.robots.find(
        (candidate) => candidate.key.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted,
      );

      if (!target) throw new Error('Choose a robot in this scene.');

      const settings = { ...inputsRef.current.project.selfContact, [target.key]: setting };

      stop();
      noteContactEdit(settings);

      const next = input.onSelfContact?.(settings) ?? { ...inputsRef.current.project, selfContact: settings };

      inputsRef.current = { ...inputsRef.current, project: next };
    },
  };
}
