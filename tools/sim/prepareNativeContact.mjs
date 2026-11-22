import { pathToFileURL } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { closeNativeContactReplays, prepareNativeContactReplay } from './nativeContactReplay.mjs';

export async function prepareNativeContact() {
  const mj = await loadMujoco();
  const version = mj.mj_versionString();

  try {
    await prepareNativeContactReplay(version);
    console.log(`Prepared native MuJoCo ${version}`);
  } finally {
    await closeNativeContactReplays();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareNativeContact();
