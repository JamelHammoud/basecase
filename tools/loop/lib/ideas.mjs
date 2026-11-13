import { issues } from './github.mjs';

export const IDEA = 'loop:idea';

const TAKEN_LABELS = [IDEA, 'loop:next', 'loop:building'];

export const titleKey = (title) => title.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');

export const takenTitles = () => TAKEN_LABELS.flatMap((label) => issues(label)).map((issue) => issue.title);
