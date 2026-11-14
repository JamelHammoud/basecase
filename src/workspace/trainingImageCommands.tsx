import type { Command } from '../components/CommandPalette';
import { PhotoIcon } from '../design-system';
import type { WorkspaceCore } from './useWorkspaceCore';

export const trainingImageCommands = ({ trainingImages }: WorkspaceCore): Command[] =>
  trainingImages.canMake
    ? [
        {
          id: 'training-images-make',
          group: 'Simulate',
          label: 'Make Training Images',
          icon: <PhotoIcon />,
          keywords: 'images frames synthetic dataset vision labels coco yolo cameras classes',
          run: () => trainingImages.open(),
        },
      ]
    : [];
