import { describe, expect, it } from 'vitest';
import { gameLogic, knockGame } from '../cases/fixtureGames';
import { newRoutine } from '../routines/edit';
import { routinesView, writeRoutines } from './caseLogicRoutines';

const scene = () => {
  const own = newRoutine({ id: 'own', name: 'Greeting', mover: 'legs' });
  const kase = knockGame({ seconds: 5, target: 2 });

  return { routines: [own], cases: [kase, { ...kase, id: 'plain', logic: undefined }] };
};

describe('a Case’s logic in the Routines view', () => {
  it('lists after the scene’s Routines, and a Routine of its id in the scene hides it', () => {
    const project = scene();

    expect(routinesView(project).map((r) => r.id)).toEqual(['own', 'knock-score']);
    expect(routinesView({ ...project, routines: [...project.routines, gameLogic(9)] }).map((r) => r.id)).toEqual([
      'own',
      'knock-score',
    ]);
  });

  it('writes an edit back into its Case, and other Routines into the scene', () => {
    const project = scene();
    const [own, logic] = routinesView(project);
    const renamed = { ...logic, name: 'Points' };
    const written = writeRoutines(project, [own, renamed]);

    expect(written.routines).toEqual([own]);
    expect(written.cases[0].logic).toEqual(renamed);
    expect(written.cases[1]).toBe(project.cases[1]);
  });

  it('drops a Case’s logic when it is removed from the view', () => {
    const project = scene();
    const written = writeRoutines(project, []);

    expect(written.routines).toBeUndefined();
    expect('logic' in written.cases[0]).toBe(false);
  });
});
