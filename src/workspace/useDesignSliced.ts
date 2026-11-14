import { useState } from 'react';

export function useDesignSliced(sliced: Record<string, number>, fitTestOpen: boolean): Record<string, number> {
  const key = JSON.stringify(sliced);
  const [design, setDesign] = useState({ key, sliced });

  if (!fitTestOpen && key !== design.key) setDesign({ key, sliced });

  return design.sliced;
}
