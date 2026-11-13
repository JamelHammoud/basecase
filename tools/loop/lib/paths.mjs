import os from 'node:os';
import path from 'node:path';

export const LOOP_DIR = process.env.BASECASE_LOOP_DIR || path.join(os.homedir(), '.basecase-loop');
export const HOME_CHECKOUT = path.join(LOOP_DIR, 'home');
export const WORKTREES = path.join(LOOP_DIR, 'worktrees');
export const LOGS = path.join(LOOP_DIR, 'logs');
export const LOCKS = path.join(LOOP_DIR, 'locks');
export const BRIEFS = path.join(import.meta.dirname, '..', 'briefs');
export const OWNER_LOGIN = 'JamelHammoud';
