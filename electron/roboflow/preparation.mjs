import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { projectOfLink } from './link.mjs';

export const UNREADABLE_REPLY = 'Roboflow returned an unreadable reply. Import the dataset again.';

export class ExportIdentity {
  secret = randomBytes(32);

  sign(source) {
    return createHmac('sha256', this.secret).update(JSON.stringify(source)).digest('hex');
  }

  create({ workspace, project, version }) {
    const source = { workspace, project, version, format: 'coco' };

    return { ...source, signature: this.sign(source) };
  }

  validate(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).sort().join(',') !== 'format,project,signature,version,workspace'
    )
      throw new Error(UNREADABLE_REPLY);

    const { workspace, project, version, format, signature } = value;

    if (
      typeof workspace !== 'string' ||
      typeof project !== 'string' ||
      !Number.isInteger(version) ||
      format !== 'coco' ||
      typeof signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new Error(UNREADABLE_REPLY);

    const source = projectOfLink(`https://app.roboflow.com/${workspace}/${project}/${version}`);
    const expected = this.create(source);

    if (
      source.workspace !== workspace ||
      source.project !== project ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected.signature))
    )
      throw new Error(UNREADABLE_REPLY);

    return source;
  }
}

export function exportPending(reply, status) {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) throw new Error(UNREADABLE_REPLY);

  const { progress, ready } = reply;

  if (
    'progress' in reply &&
    (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 100)
  )
    throw new Error(UNREADABLE_REPLY);

  if ('ready' in reply && typeof ready !== 'boolean') throw new Error(UNREADABLE_REPLY);

  return status === 202 || ready === false || (progress !== undefined && !reply.export?.link);
}
