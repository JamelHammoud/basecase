import { it } from 'vitest';
import { routedBoardWalkthrough } from './boardRoutedWalkthrough';

it(
  'imports a routed KiCad derivative through the Inspector and downloads checked fabrication files',
  { retry: 0 },
  () => routedBoardWalkthrough(),
);
