import { useRef, useState } from 'react';
import type { GalleryBundle } from '../gallery/galleryBundle';
import { hubBridge } from '../hub/hubBridge';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';

interface LeagueEntryOptions {
  bundle: () => Promise<GalleryBundle>;
  showToast: ShowToast;
  openAccounts: () => void;
}

export function useLeagueEntry({ bundle, showToast, openAccounts }: LeagueEntryOptions) {
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const busy = useRef(false);

  const enter = async (link: string) => {
    if (busy.current) return;

    busy.current = true;
    setEntering(true);
    setProblem(null);

    try {
      const { leagueBoardSource } = await import('../leagues/boardSource');
      const source = leagueBoardSource(/^https?:|^\//.test(link) ? link : `https://${link}`);

      if (!source) throw new Error('Use a League link with a pinned Hub revision.');

      const { fetchLeagueBoard } = await import('../leagues/boardLoader');
      const board = await fetchLeagueBoard(source);

      if (!(await hubBridge.signedIn())) {
        openAccounts();

        return;
      }

      const { enterLeague } = await import('./enterLeague');

      const submitted = await enterLeague({ bundle: await bundle(), manifest: board.manifest });
      const submissionLink = `https://huggingface.co/datasets/${submitted.repo}/tree/${submitted.revision}`;

      setReceipt(submissionLink);
      await navigator.clipboard.writeText(submissionLink);
      showToast('Link copied');
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      busy.current = false;
      setEntering(false);
    }
  };

  return {
    open,
    entering,
    problem,
    receipt,
    show: () => {
      setProblem(null);
      setReceipt(null);
      setOpen(true);
    },
    close: () => setOpen(false),
    enter: (link: string) => void enter(link),
  };
}

export type LeagueEntryControl = ReturnType<typeof useLeagueEntry>;
