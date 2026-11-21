import { useState } from 'react';
import { errorMessage } from '../utils/errorMessage';

export function useVersionActivity() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const perform = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setProblem('');

    try {
      await operation();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return { busy, problem, perform };
}
