import { useState } from 'react';
import type { SimModel } from './mjcfTypes';
import type { PhysicsScales } from './physicsScales';
import type { SimRequest } from './sim.worker';

interface ScaledModel {
  model: SimModel | null;
  scales: PhysicsScales | null;
}

export function usePhysics(
  model: SimModel | null,
  modelRef: React.RefObject<SimModel | null>,
  send: (msg: SimRequest) => void,
) {
  const [scaled, setScaled] = useState<ScaledModel>({ model: null, scales: null });

  return {
    physics: scaled.model && scaled.model === model ? scaled.scales : null,
    setPhysics: (scales: PhysicsScales | null) => {
      setScaled({ model: modelRef.current, scales });
      send({ type: 'physics', scales });
    },
  };
}
