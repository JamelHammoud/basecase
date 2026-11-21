import { it } from 'vitest';
import { boardRoutingWalkthrough } from './boardRoutingWalkthrough';

it('routes a declared rover board through the Inspector and restores the route with undo and redo', { retry: 0 }, () =>
  boardRoutingWalkthrough(),
);
