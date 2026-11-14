import { useState } from 'react';

export function useDesignSliced(sliced: Record<string, number>, fitTestOpen: boolean): Record<string, number> {
  const [design, setDesign] = useState({ key: JSON.stringify(sliced), sliced });
  const key = JSON.stringify(sliced);

  if (!fitTestOpen && key !== design.key) setDesign({ key, sliced });

  return fitTestOpen ? design.sliced : sliced;
}
