import { useEffect, useEffectEvent, useRef } from 'react';
import type { ScenePart } from '../types/robotics';
import { needsRobotUpgrade, upgradeRobots, type RobotUpgrade } from '../utils/robotImport';
import { resolveRobotSource } from '../utils/robotUpgrade';
import { patchJoints, upgradeDoc } from './docHistory';
import { listNames } from './helpers';
import type { ShowToast } from './types';
import type { SceneDocument } from './useSceneDocument';

export function useRobotUpgrade(docs: SceneDocument, showToast: ShowToast) {
  const { parts, partsRef, projectRef, docRef } = docs;
  const upgradingRef = useRef(false);
  const missingRef = useRef(new Set<string>());

  const applyUpgrade = (up: RobotUpgrade | null) => {
    up?.missingIds.forEach((id) => missingRef.current.add(id));

    if (up?.missing.length)
      showToast(`Insert ${listNames(up.missing)} again from Robots to get the maker’s masses and joint limits`);

    if (!up || (!up.parts.size && !up.joints.size)) return;

    docs.writeDoc(upgradeDoc(docRef.current, up));

    if (up.joints.size) docs.updateProjectNow((p) => ({ ...p, joints: patchJoints(up, p.joints) }));

    if (up.upgraded.length) showToast(`Updated ${listNames(up.upgraded)} with the maker’s masses and joint limits`);
  };

  const startUpgrade = useEffectEvent((current: ScenePart[]) => {
    if (upgradingRef.current || !needsRobotUpgrade(current, missingRef.current)) return;

    upgradingRef.current = true;
    void upgradeRobots(partsRef.current, projectRef.current.joints ?? [], resolveRobotSource, missingRef.current)
      .then(applyUpgrade)
      .finally(() => {
        upgradingRef.current = false;
      });
  });

  useEffect(() => {
    startUpgrade(parts);
  }, [parts]);
}
